const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

const roleLabels = {
  admin: 'مدير النظام',
  sales_rep: 'مندوب مبيعات',
  branch_supervisor: 'مشرف فرع',
  sales_manager: 'مدير مبيعات',
  accountant: 'محاسب'
};

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'أدخل اسم المستخدم وكلمة المرور' });
  }
  const result = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
  const user = result.rows[0];
  if (!user || !user.active) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة أو الحساب معطّل' });
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

  const token = jwt.sign(
    { id: user.id, name: user.name, username: user.username, role: user.role, branch: user.branch },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  await pool.query(
    `INSERT INTO audit_log (user_id, action, details) VALUES ($1,'login',$2)`,
    [user.id, JSON.stringify({ username })]
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, username: user.username, role: user.role, roleLabel: roleLabels[user.role], branch: user.branch }
  });
});

router.get('/me', verifyToken, (req, res) => {
  res.json({ user: { ...req.user, roleLabel: roleLabels[req.user.role] } });
});

router.post('/change-password', verifyToken, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل' });
  }
  const result = await pool.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
  const user = result.rows[0];
  const ok = await bcrypt.compare(oldPassword, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
