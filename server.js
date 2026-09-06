require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const { initDb } = require('./db/db');
const { requireAuth, requireRole } = require('./middleware/auth');

const setupRoutes = require('./routes/setup');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const carRoutes = require('./routes/cars');
const contractRoutes = require('./routes/contracts');
const settingsRoutes = require('./routes/settings');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me-please',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 hours
}));

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.currentPath = req.path;
  next();
});

app.use('/setup', setupRoutes);
app.use('/', authRoutes);

app.get('/', requireAuth, (req, res) => res.redirect('/contracts'));

app.use('/users', requireAuth, requireRole('admin'), userRoutes);
app.use('/cars', requireAuth, carRoutes);
app.use('/contracts', requireAuth, contractRoutes);
app.use('/settings', requireAuth, requireRole('admin'), settingsRoutes);

app.use((req, res) => {
  res.status(404).render('error', { message: 'الصفحة غير موجودة.' });
});

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('❌ Failed to initialize database', err);
    process.exit(1);
  });
