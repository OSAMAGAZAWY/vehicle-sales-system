function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user || req.session.user.role !== role) {
      return res.status(403).render('error', {
        message: 'لا تملك صلاحية الوصول لهذه الصفحة.'
      });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
