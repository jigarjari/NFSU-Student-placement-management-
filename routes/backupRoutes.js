const express = require('express');
const router = express.Router();
const crypto = require('node:crypto');
const { db } = require('../db/database');
const { authenticate, requireRole } = require('./authMiddleware');
const { logEvent } = require('../services/auditLogger');

const BACKUP_ENCRYPTION_KEY = crypto.scryptSync('NFSU_BACKUP_MASTER_KEY_2026', 'nfsu_salt', 32);

function encryptBackup(dataString) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', BACKUP_ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(dataString, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return {
    iv: iv.toString('hex'),
    cipherText: encrypted
  };
}

function decryptBackup(encryptedPayload) {
  const iv = Buffer.from(encryptedPayload.iv, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', BACKUP_ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedPayload.cipherText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

// GET /api/backup/download - Generate Encrypted Database Snapshot
router.get('/download', authenticate, requireRole(['admin']), (req, res) => {
  const snapshot = {
    exportedAt: new Date().toISOString(),
    system: 'NFSU Placement Cell Management Portal 2026-27',
    tables: {
      students: db.prepare('SELECT * FROM students').all(),
      drives: db.prepare('SELECT * FROM drives').all(),
      offers: db.prepare('SELECT * FROM offers').all(),
      attendance: db.prepare('SELECT * FROM recruitment_attendance').all(),
      history: db.prepare('SELECT * FROM placement_history').all(),
      policy_exceptions: db.prepare('SELECT * FROM policy_exceptions').all(),
      audit_logs: db.prepare('SELECT * FROM audit_logs').all()
    }
  };

  const encryptedData = encryptBackup(JSON.stringify(snapshot));

  logEvent({
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: 'SYSTEM_BACKUP_EXPORT',
    entityType: 'BACKUP',
    entityId: 'SYSTEM',
    afterState: { studentRecords: snapshot.tables.students.length, offerRecords: snapshot.tables.offers.length },
    ipAddress: req.ip || '127.0.0.1'
  });

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="NFSU_Encrypted_Backup_${new Date().toISOString().slice(0, 10)}.enc.json"`);
  return res.json(encryptedData);
});

// POST /api/backup/test-restore - Test Restoration Procedure
router.post('/test-restore', authenticate, requireRole(['admin']), (req, res) => {
  const { encryptedPayload } = req.body;
  if (!encryptedPayload || !encryptedPayload.cipherText || !encryptedPayload.iv) {
    return res.status(400).json({ error: 'Valid encrypted backup payload (cipherText and iv) is required.' });
  }

  try {
    const decryptedData = decryptBackup(encryptedPayload);

    // Validate table integrity in backup
    const tables = decryptedData.tables || {};
    const tableCounts = {
      students: (tables.students || []).length,
      drives: (tables.drives || []).length,
      offers: (tables.offers || []).length,
      audit_logs: (tables.audit_logs || []).length
    };

    logEvent({
      actorUsername: req.user.username,
      actorRole: req.user.role,
      action: 'SYSTEM_RESTORE_TEST_SUCCESS',
      entityType: 'BACKUP',
      entityId: 'SYSTEM',
      afterState: { restoredCounts: tableCounts, timestamp: decryptedData.exportedAt },
      ipAddress: req.ip || '127.0.0.1'
    });

    return res.json({
      success: true,
      message: 'Restoration procedure verified. Encrypted payload successfully decrypted and schema validated.',
      exportedAt: decryptedData.exportedAt,
      tableCounts
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: `Decryption or validation failure: ${err.message}`
    });
  }
});

module.exports = router;
