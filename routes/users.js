const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db/db');

const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, username, full_name, role, active, created_at FROM users ORDER BY created_at DESC'
  );
  res.render('users/list', { users: rows, error: null });
});

router.post('/', async (req, res) => {
  const { username, password, full_name, role } = req.body;

  if (!username || !password || !full_name || !['admin', 'sales'].includes(role)) {
    const { rows } = await pool.query(
      'SELECT id, username, full_name, role, active, created_at FROM users ORDER BY created_at DESC'
    );
    return res.render('users/list', { users: rows, error: 'الرجاء تعبئة جميع الحقول بشكل صحيح.' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role, active)
       VALUES ($1, $2, $3, $4, true)`,
      [username.trim(), hash, full_name.trim(), role]
    );
    res.redirect('/users');
  } catch (err) {
    const { rows } = await pool.query(
      'SELECT id, username, full_name, role, active, created_at FROM users ORDER BY created_at DESC'
    );
    const msg = err.code === '23505' ? 'اسم المستخدم موجود بالفعل.' : 'حدث خطأ أثناء إنشاء المستخدم.';
    res.render('users/list', { users: rows, error: msg });
  }
});

router.post('/:id/toggle-active', async (req, res) => {
  await pool.query('UPDATE users SET active = NOT active WHERE id = $1', [req.params.id]);
  res.redirect('/users');
});

module.exports = router;
