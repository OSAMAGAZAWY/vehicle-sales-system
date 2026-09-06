const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db/db');

const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  if (rows[0].count > 0) {
    return res.render('setup', { alreadyDone: true, error: null });
  }
  res.render('setup', { alreadyDone: false, error: null });
});

router.post('/', async (req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  if (rows[0].count > 0) {
    return res.render('setup', { alreadyDone: true, error: null });
  }

  const { token, username, password, full_name } = req.body;

  if (token !== process.env.SETUP_TOKEN) {
    return res.render('setup', { alreadyDone: false, error: 'رمز الإعداد (Setup Token) غير صحيح.' });
  }
  if (!username || !password || !full_name) {
    return res.render('setup', { alreadyDone: false, error: 'الرجاء تعبئة جميع الحقول.' });
  }

  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role, active)
     VALUES ($1, $2, $3, 'admin', true)`,
    [username.trim(), hash, full_name.trim()]
  );

  res.redirect('/login');
});

module.exports = router;
