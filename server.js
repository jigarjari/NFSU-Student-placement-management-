const express = require('express');
const path = require('node:path');
const cors = require('cors');

// Initialize database schema
require('./db/database');

const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const driveRoutes = require('./routes/driveRoutes');
const offerRoutes = require('./routes/offerRoutes');
const policyRoutes = require('./routes/policyRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const auditRoutes = require('./routes/auditRoutes');
const testRoutes = require('./routes/testRoutes');
const backupRoutes = require('./routes/backupRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Headers & Hardening
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' https: data: 'unsafe-inline' 'unsafe-eval'; img-src 'self' data: https:; font-src 'self' https: data:;"
  );
  next();
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/drives', driveRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/policy', policyRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/backup', backupRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    system: 'NFSU Placement Management System 2026-27',
    timestamp: new Date().toISOString()
  });
});

// Single Page Application fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(` NFSU Placement Management System 2026–27 is LIVE`);
    console.log(` Server running on http://localhost:${PORT}`);
    console.log(`================================================================`);
  });
}

module.exports = app;
