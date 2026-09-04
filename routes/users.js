const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken, requireRole('admin'));

// قائمة المستخدمين
router.get('/', async (req, res) => {
  const result = await pool.query(
    `SELECT id, name, username, role, branch, active, created_at FROM users ORDER BY id`
  );
  res.json(result.rows);
});

// إنشاء مستخدم جديد (مندوب / مشرف / مدير / محاسب)
router.post('/', async (req, res) => {
  const { name, username, password, role, branch } = req.body || {};
  const validRoles = ['sales_rep', 'branch_supervisor', 'sales_manager', 'accountant', 'admin'];
  if (!name || !username || !password || !validRoles.includes(role)) {
    return res.status(400).json({ error: 'بيانات ناقصة أو دور غير صحيح' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
  }
  const exists = await pool.query('SELECT id FROM users WHERE username=$1', [username]);
  if (exists.rows.length) return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });

  const hash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO users (name, username, password_hash, role, branch, active)
     VALUES ($1,$2,$3,$4,$5,true) RETURNING id, name, username, role, branch, active`,
    [name, username, hash, role, branch || null]
  );
  res.status(201).json(result.rows[0]);
});

// تفعيل / تعطيل مستخدم
router.patch('/:id/active', async (req, res) => {
  const { active } = req.body || {};
  await pool.query('UPDATE users SET active=$1 WHERE id=$2', [!!active, req.params.id]);
  res.json({ ok: true });
});

// إعادة تعيين كلمة مرور مستخدم (بواسطة المدير)
router.post('/:id/reset-password', async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
