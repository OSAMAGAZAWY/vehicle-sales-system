const express = require('express');
const { pool } = require('../db/db');

const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM company_settings WHERE id = 1');
  res.render('settings/edit', { settings: rows[0] || {}, saved: false });
});

router.post('/', async (req, res) => {
  const { company_name, cr_number, vat_number, phone, address, branch } = req.body;
  await pool.query(
    `UPDATE company_settings SET
       company_name = $1, cr_number = $2, vat_number = $3,
       phone = $4, address = $5, branch = $6, updated_at = now()
     WHERE id = 1`,
    [company_name, cr_number, vat_number, phone, address, branch]
  );
  const { rows } = await pool.query('SELECT * FROM company_settings WHERE id = 1');
  res.render('settings/edit', { settings: rows[0], saved: true });
});

module.exports = router;
