const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken);

const STAGE_ORDER = ['new', 'supervisor', 'manager', 'accounting'];
const NEXT_STATUS = { supervisor: 'supervisor', manager: 'manager', accounting: 'accounting' };
const APPROVER_ROLE_FOR_STAGE = {
  new: 'branch_supervisor',       // من يعتمد وهي بحالة "new" -> مشرف الفرع
  supervisor: 'sales_manager',    // من يعتمد وهي بحالة "supervisor" -> مدير المبيعات
  manager: 'accountant'           // من يعتمد وهي بحالة "manager" -> المحاسب
};
const STAGE_NAME_FOR_STATUS = { new: 'supervisor', supervisor: 'manager', manager: 'accounting' };

async function nextSaleNumber() {
  const year = new Date().getFullYear();
  const result = await pool.query(
    `SELECT COUNT(*)::int AS c FROM sales WHERE sale_number LIKE $1`,
    [`SALE-${year}-%`]
  );
  const num = String(result.rows[0].c + 1).padStart(5, '0');
  return `SALE-${year}-${num}`;
}

async function logAudit(userId, saleId, action, details) {
  await pool.query(
    `INSERT INTO audit_log (user_id, sale_id, action, details) VALUES ($1,$2,$3,$4)`,
    [userId, saleId, action, details ? JSON.stringify(details) : null]
  );
}

// إنشاء مبايعة جديدة - مندوب المبيعات فقط
router.post('/', requireRole('sales_rep'), async (req, res) => {
  const b = req.body || {};
  const required = ['customer_name', 'customer_id', 'customer_phone', 'make', 'model', 'vin'];
  for (const f of required) {
    if (!b[f]) return res.status(400).json({ error: `الحقل مطلوب: ${f}` });
  }
  const price = Number(b.price) || 0;
  const discount = Number(b.discount) || 0;
  const tax = Number(b.tax) || 0;
  const deposit = Number(b.deposit) || 0;
  const paid = Number(b.paid) || 0;
  const gross = Math.max(0, price - discount) + tax;
  const remaining = Math.max(0, gross - paid);
  const saleNumber = await nextSaleNumber();

  const result = await pool.query(
    `INSERT INTO sales (sale_number, customer_name, customer_id, customer_phone, customer_address, customer_email,
      make, trim, model, year, color, plate, vin, odometer, location,
      price, discount, tax, deposit, paid, gross, remaining, payment_method, financier, delivery_date,
      condition_notes, notes, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,'new',$28)
     RETURNING *`,
    [saleNumber, b.customer_name, b.customer_id, b.customer_phone, b.customer_address || null, b.customer_email || null,
     b.make, b.trim || null, b.model, b.year || null, b.color || null, b.plate || null, b.vin, b.odometer || null, b.location || null,
     price, discount, tax, deposit, paid, gross, remaining, b.payment_method || 'POS', b.financier || null, b.delivery_date || null,
     b.condition_notes || null, b.notes || null, req.user.id]
  );
  const sale = result.rows[0];
  await logAudit(req.user.id, sale.id, 'create', { sale_number: sale.sale_number });
  res.status(201).json(sale);
});

// قائمة المبايعات (مع بحث بسيط) - كل الأدوار تشوف الكل، المندوب يشوف مبايعاته فقط
router.get('/', async (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  let sql = `SELECT s.*, u.name AS created_by_name FROM sales s JOIN users u ON u.id = s.created_by`;
  const params = [];
  const conditions = [];

  if (req.user.role === 'sales_rep') {
    conditions.push(`s.created_by = $${params.length + 1}`);
    params.push(req.user.id);
  }
  if (q) {
    conditions.push(`(LOWER(s.sale_number) LIKE $${params.length + 1} OR LOWER(s.customer_name) LIKE $${params.length + 1} OR LOWER(s.vin) LIKE $${params.length + 1})`);
    params.push(`%${q}%`);
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY s.id DESC';

  const result = await pool.query(sql, params);
  res.json(result.rows);
});

// تفاصيل مبايعة + الاعتمادات
router.get('/:id', async (req, res) => {
  const saleResult = await pool.query(
    `SELECT s.*, u.name AS created_by_name FROM sales s JOIN users u ON u.id = s.created_by WHERE s.id=$1`,
    [req.params.id]
  );
  const sale = saleResult.rows[0];
  if (!sale) return res.status(404).json({ error: 'المبايعة غير موجودة' });
  if (req.user.role === 'sales_rep' && sale.created_by !== req.user.id) {
    return res.status(403).json({ error: 'لا تملك صلاحية عرض هذه المبايعة' });
  }
  const approvalsResult = await pool.query(
    `SELECT a.*, u.name AS user_name FROM approvals a JOIN users u ON u.id = a.user_id WHERE sale_id=$1 ORDER BY a.id`,
    [req.params.id]
  );
  res.json({ ...sale, approvals: approvalsResult.rows });
});

// اعتماد مرحلة
router.post('/:id/approve', async (req, res) => {
  const saleResult = await pool.query('SELECT * FROM sales WHERE id=$1', [req.params.id]);
  const sale = saleResult.rows[0];
  if (!sale) return res.status(404).json({ error: 'المبايعة غير موجودة' });
  if (sale.status === 'accounting' || sale.status === 'rejected') {
    return res.status(400).json({ error: 'لا يمكن اعتماد مبايعة مكتملة أو مرفوضة' });
  }
  const requiredRole = APPROVER_ROLE_FOR_STAGE[sale.status];
  if (req.user.role !== requiredRole) {
    return res.status(403).json({ error: 'هذه المرحلة ليست من صلاحيتك حالياً' });
  }
  const stage = STAGE_NAME_FOR_STATUS[sale.status];
  const newStatus = NEXT_STATUS[stage];

  await pool.query('UPDATE sales SET status=$1, updated_at=now() WHERE id=$2', [newStatus, sale.id]);
  await pool.query(
    `INSERT INTO approvals (sale_id, stage, action, user_id, note) VALUES ($1,$2,'approve',$3,$4)`,
    [sale.id, stage, req.user.id, req.body?.note || null]
  );
  await logAudit(req.user.id, sale.id, 'approve', { stage, newStatus });

  const updated = await pool.query('SELECT * FROM sales WHERE id=$1', [sale.id]);
  res.json(updated.rows[0]);
});

// رفض / إرجاع للمندوب
router.post('/:id/reject', async (req, res) => {
  const { reason } = req.body || {};
  if (!reason) return res.status(400).json({ error: 'يجب كتابة سبب الإرجاع' });

  const saleResult = await pool.query('SELECT * FROM sales WHERE id=$1', [req.params.id]);
  const sale = saleResult.rows[0];
  if (!sale) return res.status(404).json({ error: 'المبايعة غير موجودة' });
  if (sale.status === 'accounting' || sale.status === 'rejected') {
    return res.status(400).json({ error: 'لا يمكن رفض مبايعة مكتملة أو مرفوضة مسبقاً' });
  }
  const requiredRole = APPROVER_ROLE_FOR_STAGE[sale.status];
  if (req.user.role !== requiredRole) {
    return res.status(403).json({ error: 'هذه المرحلة ليست من صلاحيتك حالياً' });
  }
  const stage = STAGE_NAME_FOR_STATUS[sale.status];

  await pool.query('UPDATE sales SET status=$1, reject_reason=$2, updated_at=now() WHERE id=$3', ['rejected', reason, sale.id]);
  await pool.query(
    `INSERT INTO approvals (sale_id, stage, action, user_id, note) VALUES ($1,$2,'reject',$3,$4)`,
    [sale.id, stage, req.user.id, reason]
  );
  await logAudit(req.user.id, sale.id, 'reject', { stage, reason });

  const updated = await pool.query('SELECT * FROM sales WHERE id=$1', [sale.id]);
  res.json(updated.rows[0]);
});

// إعادة إرسال مبايعة مرفوضة من المندوب بعد التعديل
router.post('/:id/resubmit', requireRole('sales_rep'), async (req, res) => {
  const saleResult = await pool.query('SELECT * FROM sales WHERE id=$1', [req.params.id]);
  const sale = saleResult.rows[0];
  if (!sale) return res.status(404).json({ error: 'المبايعة غير موجودة' });
  if (sale.created_by !== req.user.id) return res.status(403).json({ error: 'لا تملك صلاحية تعديل هذه المبايعة' });
  if (sale.status !== 'rejected') return res.status(400).json({ error: 'يمكن إعادة الإرسال فقط للمبايعات المرفوضة' });

  const b = req.body || {};
  const price = Number(b.price ?? sale.price);
  const discount = Number(b.discount ?? sale.discount);
  const tax = Number(b.tax ?? sale.tax);
  const paid = Number(b.paid ?? sale.paid);
  const gross = Math.max(0, price - discount) + tax;
  const remaining = Math.max(0, gross - paid);

  await pool.query(
    `UPDATE sales SET customer_name=$1, customer_id=$2, customer_phone=$3, customer_address=$4, customer_email=$5,
     make=$6, trim=$7, model=$8, year=$9, color=$10, plate=$11, vin=$12, odometer=$13, location=$14,
     price=$15, discount=$16, tax=$17, deposit=$18, paid=$19, gross=$20, remaining=$21, payment_method=$22,
     financier=$23, delivery_date=$24, condition_notes=$25, notes=$26, status='new', reject_reason=NULL, updated_at=now()
     WHERE id=$27`,
    [b.customer_name ?? sale.customer_name, b.customer_id ?? sale.customer_id, b.customer_phone ?? sale.customer_phone,
     b.customer_address ?? sale.customer_address, b.customer_email ?? sale.customer_email,
     b.make ?? sale.make, b.trim ?? sale.trim, b.model ?? sale.model, b.year ?? sale.year, b.color ?? sale.color,
     b.plate ?? sale.plate, b.vin ?? sale.vin, b.odometer ?? sale.odometer, b.location ?? sale.location,
     price, discount, tax, Number(b.deposit ?? sale.deposit), paid, gross, remaining,
     b.payment_method ?? sale.payment_method, b.financier ?? sale.financier, b.delivery_date ?? sale.delivery_date,
     b.condition_notes ?? sale.condition_notes, b.notes ?? sale.notes, sale.id]
  );
  await logAudit(req.user.id, sale.id, 'resubmit', null);
  const updated = await pool.query('SELECT * FROM sales WHERE id=$1', [sale.id]);
  res.json(updated.rows[0]);
});

// إحصائيات لوحة التحكم
router.get('/stats/summary', async (req, res) => {
  const scopeSql = req.user.role === 'sales_rep' ? 'WHERE created_by=$1' : '';
  const params = req.user.role === 'sales_rep' ? [req.user.id] : [];
  const result = await pool.query(
    `SELECT status, COUNT(*)::int AS c FROM sales ${scopeSql} GROUP BY status`, params
  );
  const counts = { new: 0, supervisor: 0, manager: 0, accounting: 0, rejected: 0 };
  result.rows.forEach(r => { counts[r.status] = r.c; });
  res.json(counts);
});

module.exports = router;
