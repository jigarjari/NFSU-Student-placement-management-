const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db/database');
const { JWT_SECRET, authenticate } = require('./authMiddleware');
const { logEvent } = require('../services/auditLogger');

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
      courseScope: user.course_scope,
      studentId: user.student_id
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password, mfaCode } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  // Prepared parameterized query protects against SQL injection
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const isPasswordValid = bcrypt.compareSync(password, user.password_hash);
  if (!isPasswordValid) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  // Optional MFA check
  if (user.mfa_enabled && !mfaCode) {
    return res.json({
      requireMfa: true,
      username: user.username,
      message: 'MFA required. Enter your 6-digit authenticator code (Demo MFA code: 123456).'
    });
  }

  if (user.mfa_enabled && mfaCode && mfaCode !== '123456') {
    return res.status(401).json({ error: 'Invalid MFA verification code.' });
  }

  const token = generateToken(user);

  logEvent({
    actorUsername: user.username,
    actorRole: user.role,
    action: 'USER_LOGIN_SUCCESS',
    entityType: 'AUTH',
    entityId: String(user.id),
    afterState: { role: user.role, mfaVerified: !!user.mfa_enabled },
    ipAddress: req.ip || req.connection.remoteAddress
  });

  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      courseScope: user.course_scope,
      studentId: user.student_id
    }
  });
});

// POST /api/auth/switch-demo-role
// Enables reviewers and administrators to test all RBAC roles seamlessly
router.post('/switch-demo-role', (req, res) => {
  const { roleOrUsername } = req.body;
  if (!roleOrUsername) {
    return res.status(400).json({ error: 'Missing target role or username.' });
  }

  let user = db.prepare('SELECT * FROM users WHERE username = ?').get(roleOrUsername);
  if (!user) {
    user = db.prepare('SELECT * FROM users WHERE role = ? LIMIT 1').get(roleOrUsername);
  }

  if (!user) {
    return res.status(404).json({ error: `Demo user for '${roleOrUsername}' not found.` });
  }

  const token = generateToken(user);

  logEvent({
    actorUsername: user.username,
    actorRole: user.role,
    action: 'DEMO_ROLE_SWITCH',
    entityType: 'AUTH',
    entityId: String(user.id),
    afterState: { switchedTo: user.username, role: user.role },
    ipAddress: req.ip || '127.0.0.1'
  });

  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      courseScope: user.course_scope,
      studentId: user.student_id
    }
  });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  let studentData = null;
  if (req.user.studentId) {
    studentData = db.prepare('SELECT * FROM students WHERE id = ?').get(req.user.studentId);
  }
  return res.json({
    user: req.user,
    student: studentData
  });
});

module.exports = router;
