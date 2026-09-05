require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const salesRoutes = require('./routes/sales');
const auditRoutes = require('./routes/audit');
const companyRoutes = require('./routes/company');
const vehiclesRoutes = require('./routes/vehicles');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/vehicles', vehiclesRoutes);

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// معالج أخطاء عام
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'حدث خطأ في الخادم' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
