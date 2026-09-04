const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken, requireRole('admin', 'sales_manager'));

router.get('/', async (req, res) => {
  const saleId = req.query.saleId;
  let sql = `SELECT al.*, u.name AS user_name FROM audit_log al LEFT JOIN users u ON u.id = al.user_id`;
  const params = [];
  if (saleId) {
    sql += ` WHERE al.sale_id=$1`;
    params.push(saleId);
  }
  sql += ' ORDER BY al.id DESC LIMIT 500';
  const result = await pool.query(sql, params);
  res.json(result.rows);
});

module.exports = router;
