const express = require('express');
const { pool } = require('../db/db');

const router = express.Router();

const DEFAULT_TERMS = `يقر الطرف الثاني (المشتري) بمعاينة السيارة معاينة تامة ونافية للجهالة، وقبولها بحالتها الراهنة وقت التوقيع.
تُعتبر السيارة مباعة بيعًا باتًا من تاريخ توقيع هذا العقد، ولا يحق لأي من الطرفين الرجوع عنه إلا باتفاق مكتوب بينهما.
يلتزم الطرف الثاني بنقل ملكية السيارة رسميًا خلال مدة أقصاها سبعة (7) أيام من تاريخ هذا العقد.
جميع المخالفات المرورية والرسوم والالتزامات المستحقة على السيارة بعد تاريخ توقيع هذا العقد تكون على عاتق الطرف الثاني.
لا يتحمل الطرف الأول أي مسؤولية عن أي التزامات مالية أو قانونية تخص السيارة تنشأ بعد تاريخ التوقيع.
يقر الطرف الثاني باستلام كامل مستندات ومفاتيح السيارة عند التوقيع على هذا العقد.
هذا العقد ملزم لطرفيه، وفي حال نشوء أي نزاع يُحتكم إلى الأنظمة المعمول بها في المملكة العربية السعودية.`;

router.get('/new', (req, res) => {
  res.render('contracts/new', { error: null, defaultTerms: DEFAULT_TERMS });
});

router.post('/', async (req, res) => {
  const {
    car_id, customer_name, customer_id_number, customer_nationality,
    customer_phone, customer_address, final_price, payment_method, terms_text
  } = req.body;

  if (!car_id || !customer_name || !customer_name.trim()) {
    return res.render('contracts/new', {
      error: 'الرجاء البحث عن السيارة وإدخال اسم العميل.',
      defaultTerms: terms_text || DEFAULT_TERMS
    });
  }

  const carCheck = await pool.query(`SELECT * FROM cars WHERE id = $1 AND status = 'available'`, [car_id]);
  if (carCheck.rows.length === 0) {
    return res.render('contracts/new', {
      error: 'السيارة غير متاحة أو تم بيعها بالفعل. الرجاء البحث مرة أخرى.',
      defaultTerms: terms_text || DEFAULT_TERMS
    });
  }

  const counterResult = await pool.query(
    `UPDATE contract_counter SET value = value + 1 WHERE id = 1 RETURNING value`
  );
  const contractNumber = 'CS-' + String(counterResult.rows[0].value).padStart(4, '0');

  const inserted = await pool.query(
    `INSERT INTO contracts
      (contract_number, car_id, customer_name, customer_id_number, customer_nationality,
       customer_phone, customer_address, final_price, payment_method, terms_text,
       status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11)
     RETURNING id`,
    [
      contractNumber, car_id, customer_name.trim(), customer_id_number, customer_nationality,
      customer_phone, customer_address, final_price || null, payment_method,
      terms_text || DEFAULT_TERMS, req.session.user.id
    ]
  );

  res.redirect(`/contracts/${inserted.rows[0].id}`);
});

router.get('/', async (req, res) => {
  const isAdmin = req.session.user.role === 'admin';
  const statusFilter = req.query.status || '';

  let query = `
    SELECT c.*, u.full_name AS created_by_name, cars.chassis, cars.make, cars.model
    FROM contracts c
    JOIN users u ON u.id = c.created_by
    JOIN cars ON cars.id = c.car_id
  `;
  const params = [];
  const conditions = [];

  if (!isAdmin) {
    params.push(req.session.user.id);
    conditions.push(`c.created_by = $${params.length}`);
  }
  if (statusFilter) {
    params.push(statusFilter);
    conditions.push(`c.status = $${params.length}`);
  }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY c.created_at DESC';

  const { rows } = await pool.query(query, params);
  res.render('contracts/list', { contracts: rows, statusFilter, isAdmin });
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, u.full_name AS created_by_name, appr.full_name AS approved_by_name,
            cars.chassis, cars.make, cars.model, cars.year, cars.color, cars.plate
     FROM contracts c
     JOIN users u ON u.id = c.created_by
     LEFT JOIN users appr ON appr.id = c.approved_by
     JOIN cars ON cars.id = c.car_id
     WHERE c.id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).render('error', { message: 'العقد غير موجود.' });

  const contract = rows[0];
  const isAdmin = req.session.user.role === 'admin';
  if (!isAdmin && contract.created_by !== req.session.user.id) {
    return res.status(403).render('error', { message: 'لا تملك صلاحية عرض هذا العقد.' });
  }

  res.render('contracts/show', { contract, isAdmin });
});

router.post('/:id/approve', async (req, res) => {
  if (req.session.user.role !== 'admin') {
    return res.status(403).render('error', { message: 'اعتماد العقود متاح للمدير فقط.' });
  }
  const { rows } = await pool.query('SELECT * FROM contracts WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).render('error', { message: 'العقد غير موجود.' });
  const contract = rows[0];
  if (contract.status !== 'pending') {
    return res.redirect(`/contracts/${req.params.id}`);
  }

  const carRows = await pool.query('SELECT status FROM cars WHERE id = $1', [contract.car_id]);
  if (carRows.rows[0] && carRows.rows[0].status !== 'available') {
    return res.status(409).render('error', {
      message: 'تعذر الاعتماد: هذه السيارة تم بيعها بالفعل ضمن عقد آخر معتمد. الرجاء رفض هذا العقد بدلاً من ذلك.'
    });
  }

  await pool.query(
    `UPDATE contracts SET status = 'approved', approved_by = $1, approved_at = now() WHERE id = $2`,
    [req.session.user.id, req.params.id]
  );
  await pool.query(`UPDATE cars SET status = 'sold' WHERE id = $1`, [contract.car_id]);

  res.redirect(`/contracts/${req.params.id}`);
});

router.post('/:id/reject', async (req, res) => {
  if (req.session.user.role !== 'admin') {
    return res.status(403).render('error', { message: 'رفض العقود متاح للمدير فقط.' });
  }
  await pool.query(
    `UPDATE contracts SET status = 'rejected', approved_by = $1, approved_at = now(), rejection_reason = $2
     WHERE id = $3 AND status = 'pending'`,
    [req.session.user.id, req.body.reason || null, req.params.id]
  );
  res.redirect(`/contracts/${req.params.id}`);
});

router.get('/:id/print', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, cars.chassis, cars.make, cars.model, cars.year, cars.color, cars.plate,
            u.full_name AS employee_name
     FROM contracts c
     JOIN cars ON cars.id = c.car_id
     JOIN users u ON u.id = c.created_by
     WHERE c.id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).render('error', { message: 'العقد غير موجود.' });

  const contract = rows[0];
  if (contract.status !== 'approved') {
    return res.status(403).render('error', {
      message: 'لا يمكن طباعة هذا العقد قبل اعتماده من المدير.'
    });
  }

  const settingsResult = await pool.query('SELECT * FROM company_settings WHERE id = 1');
  const settings = settingsResult.rows[0] || {};

  res.render('contracts/print', { contract, settings });
});

module.exports = router;
