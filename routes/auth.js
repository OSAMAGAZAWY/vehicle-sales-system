const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db/db');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE username = $1 AND active = true',
    [(username || '').trim()]
  );

  if (rows.length === 0) {
    return res.render('login', { error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
  }

  const user = rows[0];
  const match = await bcrypt.compare(password || '', user.password_hash);
  if (!match) {
    return res.render('login', { error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role
  };

  res.redirect('/');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
