const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { pool } = require('../db/db');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const TEMPLATE_HEADERS = ['رقم الهيكل', 'الماركة', 'الموديل', 'سنة الصنع', 'اللون', 'رقم اللوحة', 'السعر', 'ملاحظات'];

const HEADER_MAP = {
  'رقم الهيكل': 'chassis', 'chassis': 'chassis', 'vin': 'chassis',
  'الماركة': 'make', 'make': 'make',
  'الموديل': 'model', 'model': 'model',
  'سنة الصنع': 'year', 'year': 'year',
  'اللون': 'color', 'color': 'color',
  'رقم اللوحة': 'plate', 'plate': 'plate',
  'السعر': 'price', 'price': 'price',
  'ملاحظات': 'notes', 'notes': 'notes'
};
const FALLBACK_ORDER = ['chassis', 'make', 'model', 'year', 'color', 'plate', 'price', 'notes'];

router.get('/', async (req, res) => {
  const q = (req.query.q || '').trim();
  let rows;
  if (q) {
    const result = await pool.query(
      `SELECT * FROM cars WHERE chassis ILIKE '%' || $1 ORDER BY created_at DESC`,
      [q]
    );
    rows = result.rows;
  } else {
    const result = await pool.query('SELECT * FROM cars ORDER BY created_at DESC LIMIT 200');
    rows = result.rows;
  }
  res.render('cars/list', { cars: rows, q, error: null });
});

router.get('/new', (req, res) => {
  res.render('cars/new', { error: null });
});

router.post('/', async (req, res) => {
  const { chassis, make, model, year, color, plate, price, notes } = req.body;
  if (!chassis || !chassis.trim()) {
    return res.render('cars/new', { error: 'الرجاء إدخال رقم الهيكل.' });
  }
  try {
    await pool.query(
      `INSERT INTO cars (chassis, make, model, year, color, plate, price, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [chassis.trim(), make, model, year, color, plate, price || null, notes, req.session.user.id]
    );
    res.redirect('/cars');
  } catch (err) {
    const msg = err.code === '23505' ? 'رقم الهيكل هذا مضاف مسبقًا في المخزون.' : 'حدث خطأ أثناء إضافة السيارة.';
    res.render('cars/new', { error: msg });
  }
});

// API used by the "new contract" page to search a car by the last digits of the chassis
router.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 3) return res.json({ car: null });
  const { rows } = await pool.query(
    `SELECT * FROM cars WHERE chassis ILIKE '%' || $1 AND status = 'available' ORDER BY created_at DESC LIMIT 1`,
    [q]
  );
  res.json({ car: rows[0] || null });
});

router.get('/template', (req, res) => {
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'مخزون السيارات');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="car-inventory-template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    const { rows } = await pool.query('SELECT * FROM cars ORDER BY created_at DESC LIMIT 200');
    return res.render('cars/list', { cars: rows, q: '', error: 'الرجاء اختيار ملف إكسل أولاً.' });
  }

  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (raw.length < 2) throw new Error('empty');

    const headerRow = raw[0].map(h => String(h).trim().toLowerCase());
    let fieldOrder = headerRow.map(h => HEADER_MAP[h] || HEADER_MAP[String(h)] || null);
    if (fieldOrder.filter(Boolean).length < 2) {
      // headers not recognized - fall back to fixed column order
      fieldOrder = FALLBACK_ORDER;
    }

    let inserted = 0, skipped = 0;
    for (let i = 1; i < raw.length; i++) {
      const row = raw[i];
      if (!row || row.every(c => String(c).trim() === '')) continue;

      const record = {};
      fieldOrder.forEach((field, idx) => {
        if (field) record[field] = row[idx] !== undefined ? String(row[idx]).trim() : '';
      });

      if (!record.chassis) { skipped++; continue; }

      await pool.query(
        `INSERT INTO cars (chassis, make, model, year, color, plate, price, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (chassis) DO UPDATE SET
           make = EXCLUDED.make, model = EXCLUDED.model, year = EXCLUDED.year,
           color = EXCLUDED.color, plate = EXCLUDED.plate, price = EXCLUDED.price,
           notes = EXCLUDED.notes`,
        [
          record.chassis, record.make || null, record.model || null, record.year || null,
          record.color || null, record.plate || null,
          record.price ? record.price.replace(/[^\d.]/g, '') || null : null,
          record.notes || null, req.session.user.id
        ]
      );
      inserted++;
    }

    const { rows } = await pool.query('SELECT * FROM cars ORDER BY created_at DESC LIMIT 200');
    res.render('cars/list', {
      cars: rows, q: '',
      error: null,
      message: `تم استيراد ${inserted} سيارة بنجاح${skipped ? ` (تم تجاهل ${skipped} صف بدون رقم هيكل)` : ''}.`
    });
  } catch (err) {
    const { rows } = await pool.query('SELECT * FROM cars ORDER BY created_at DESC LIMIT 200');
    res.render('cars/list', { cars: rows, q: '', error: 'تعذرت قراءة الملف. تأكد أنه بصيغة Excel صحيحة وبنفس أعمدة القالب.' });
  }
});

router.post('/:id/delete', async (req, res) => {
  if (req.session.user.role !== 'admin') {
    return res.status(403).render('error', { message: 'حذف السيارات متاح للمدير فقط.' });
  }
  await pool.query('DELETE FROM cars WHERE id = $1', [req.params.id]);
  res.redirect('/cars');
});

module.exports = router;
