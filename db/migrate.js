const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('تم إنشاء/تحديث جداول قاعدة البيانات بنجاح.');
  await pool.end();
}

migrate().catch(err => {
  console.error('فشل تنفيذ المخطط:', err);
  process.exit(1);
});
