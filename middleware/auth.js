const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const header = req.headers['authorization'];
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'مطلوب تسجيل الدخول' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, name, role, username }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'جلسة غير صالحة، الرجاء تسجيل الدخول من جديد' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'لا تملك صلاحية تنفيذ هذا الإجراء' });
    }
    next();
  };
}

module.exports = { verifyToken, requireRole };
