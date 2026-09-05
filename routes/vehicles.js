const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// رفع الملفات – 20MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

router.use(verifyToken);

/* ============================
   1) بحث برقم الهيكل
============================ */
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 3) return res.json([]);

  const result = await pool.query(
    `SELECT * FROM vehicles WHERE vin ILIKE $1 ORDER BY updated_at DESC LIMIT 15`,
    [`%${q}%`]
  );

  res.json(result.rows);
});

/* ============================
   2) عرض المخزون كامل
============================ */
router.get('/', requireRole('admin'), async (req, res) => {
  const result = await pool.query('SELECT * FROM vehicles ORDER BY updated_at DESC LIMIT 500');
  res.json(result.rows);
});

/* ============================
   3) تحميل نموذج إكسل
============================ */
router.get('/template', requireRole('admin'), (req, res) => {
  const headers = ['vin', 'make', 'trim', 'model', 'year', 'color', 'plate', 'odometer', 'location', 'price'];
  const example = ['1HGCM82633A004352', 'تويوتا', 'GLX', 'كامري', '2024', 'أبيض', 'أ ب ج 1234', '0', 'المعرض الرئيسي', '95000'];

  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'vehicles');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Disposition', 'attachment; filename="vehicles_template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

/* ============================
   4) استيراد ملف إكسل
============================ */
router.post('/import', requireRole('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'لم يتم إرفاق ملف' });

  let rows;
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  } catch (e) {
    return res.status(400).json({ error: 'تعذّرت قراءة الملف، تأكد أنه ملف Excel صحيح' });
  }

  let inserted = 0, skipped = 0;

  for (const row of rows) {
    const vin = String(row.vin || row.VIN || '').trim();
    if (!vin) { skipped++; continue; }

    try {
      await pool.query(
        `INSERT INTO vehicles (vin, make, trim, model, year, color, plate, odometer, location, price, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
         ON CONFLICT (vin) DO UPDATE SET
           make=$2, trim=$3, model=$4, year=$5, color=$6, plate=$7,
           odometer=$8, location=$9, price=$10, updated_at=now()`,
        [
          vin,
          row.make || '',
          row.trim || '',
          row.model || '',
          String(row.year || ''),
          row.color || '',
          row.plate || '',
          String(row.odometer || ''),
          row.location || '',
          Number(row.price) || 0
        ]
      );
      inserted++;
    } catch (e) {
      console.error(e);
      skipped++;
    }
  }

  res.json({ ok: true, inserted, skipped, total: rows.length });
});

/* ============================
   5) إضافة سيارة واحدة
============================ */
router.post('/add', requireRole('admin'), async (req, res) => {
  const {
    vin, make, trim, model, year,
    color, plate, odometer, location, price
  } = req.body || {};

  if (!vin || !make || !model) {
    return res.status(400).json({ error: 'رقم الهيكل، الشركة، والموديل مطلوبة' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO vehicles (vin, make, trim, model, year, color, plate, odometer, location, price, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
       ON CONFLICT (vin) DO UPDATE SET
         make=$2, trim=$3, model=$4, year=$5, color=$6, plate=$7,
         odometer=$8, location=$9, price=$10, updated_at=now()
       RETURNING *`,
      [
        vin.trim(),
        make || '',
        trim || '',
        model || '',
        String(year || ''),
        color || '',
        plate || '',
        String(odometer || ''),
        location || '',
        Number(price) || 0
      ]
    );

    res.json({ ok: true, vehicle: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'خطأ أثناء حفظ السيارة' });
  }
});

/* ============================
   6) إضافة مجموعة سيارات دفعة واحدة
============================ */
router.post('/bulk', requireRole('admin'), async (req, res) => {
  const vehicles = req.body || [];

  if (!Array.isArray(vehicles) || vehicles.length === 0) {
    return res.status(400).json({ error: 'يجب إرسال قائمة سيارات' });
  }

  let inserted = 0;
  let skipped = 0;

  for (const v of vehicles) {
    const vin = String(v.vin || '').trim();
    if (!vin || !v.make || !v.model) {
      skipped++;
      continue;
    }

    try {
      await pool.query(
        `INSERT INTO vehicles (vin, make, trim, model, year, color, plate, odometer, location, price, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
         ON CONFLICT (vin) DO UPDATE SET
           make=$2, trim=$3, model=$4, year=$5, color=$6, plate=$7,
           odometer=$8, location=$9, price=$10, updated_at=now()`,
        [
          vin,
          v.make || '',
          v.trim || '',
          v.model || '',
          String(v.year || ''),
          v.color || '',
          v.plate || '',
          String(v.odometer || ''),
          v.location || '',
          Number(v.price) || 0
        ]
      );
      inserted++;
    } catch (e) {
      console.error(e);
      skipped++;
    }
  }

  res.json({ ok: true, inserted, skipped, total: vehicles.length });
});

module.exports = router;
