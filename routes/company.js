const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken);

// أي مستخدم مسجّل دخول يقدر يقرأ بيانات الشركة (تظهر في العقد)
router.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM company_settings WHERE id=1');
  res.json(result.rows[0] || {});
});

// التعديل لمدير النظام فقط
router.patch('/', requireRole('admin'), async (req, res) => {
  const { company_name, cr_number, tax_number, address, phone } = req.body || {};
  if (!company_name) return res.status(400).json({ error: 'اسم المنشأة مطلوب' });
  const result = await pool.query(
    `UPDATE company_settings SET company_name=$1, cr_number=$2, tax_number=$3, address=$4, phone=$5, updated_at=now()
     WHERE id=1 RETURNING *`,
    [company_name, cr_number || null, tax_number || null, address || null, phone || null]
  );
  res.json(result.rows[0]);
});

module.exports = router;
