const bcrypt = require('bcryptjs');
const pool = require('./pool');
require('dotenv').config();

async function seed() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'change-this-password';
  const name = process.env.ADMIN_NAME || 'مدير النظام';

  const existing = await pool.query('SELECT id FROM users WHERE username=$1', [username]);
  if (existing.rows.length) {
    console.log('حساب المدير موجود مسبقاً، لم يتم إنشاء حساب جديد.');
    await pool.end();
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (name, username, password_hash, role, active)
     VALUES ($1,$2,$3,'admin',true)`,
    [name, username, hash]
  );
  console.log(`تم إنشاء حساب المدير: ${username}`);
  console.log('سجّل الدخول فوراً وغيّر كلمة المرور من إعدادات المستخدمين.');
  await pool.end();
}

seed().catch(err => {
  console.error('فشل إنشاء حساب المدير:', err);
  process.exit(1);
});
