const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authenticate, requireRole } = require('./authMiddleware');
const { verifyAuditIntegrity, calculateHash } = require('../services/auditLogger');

// GET /api/audit - List audit logs (Admin only)
router.get('/', authenticate, requireRole(['admin']), (req, res) => {
  const { limit = 100, action, entityType } = req.query;
  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];

  if (action) {
    query += ' AND action = ?';
    params.push(action);
  }
  if (entityType) {
    query += ' AND entity_type = ?';
    params.push(entityType);
  }

  query += ' ORDER BY id DESC LIMIT ?';
  params.push(parseInt(limit, 10));

  const logs = db.prepare(query).all(...params);

  return res.json({
    total: logs.length,
    logs
  });
});

// GET /api/audit/verify-integrity - Cryptographic SHA-256 hash chain verification
router.get('/verify-integrity', authenticate, requireRole(['admin']), (req, res) => {
  const verificationResult = verifyAuditIntegrity();
  return res.json({
    timestamp: new Date().toISOString(),
    ...verificationResult
  });
});

// POST /api/audit/simulate-tamper - Forensic Demonstration: Deliberately tamper with an audit row
router.post('/simulate-tamper', authenticate, requireRole(['admin']), (req, res) => {
  const targetRow = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1 OFFSET 1').get();
  if (!targetRow) {
    return res.status(400).json({ error: 'Not enough audit records to demonstrate tampering.' });
  }

  // Intentionally modify before_state without updating cryptographic hash
  db.prepare(`
    UPDATE audit_logs 
    SET before_state = '{"TAMPERED_BY_MALICIOUS_ACTOR": true}' 
    WHERE id = ?
  `).run(targetRow.id);

  return res.json({
    message: `Forensic Tamper Simulation: Audit record #${targetRow.id} data was modified out-of-band. Run Integrity Check to observe detection!`,
    tamperedRecordId: targetRow.id
  });
});

// POST /api/audit/repair-chain - Restore / re-anchor the cryptographic chain
router.post('/repair-chain', authenticate, requireRole(['admin']), (req, res) => {
  const rows = db.prepare('SELECT * FROM audit_logs ORDER BY id ASC').all();
  let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';

  for (const r of rows) {
    const newHash = calculateHash(
      prevHash,
      r.timestamp,
      r.actor_username,
      r.actor_role,
      r.action,
      r.entity_type,
      r.entity_id,
      r.before_state,
      r.after_state,
      r.ip_address
    );

    db.prepare('UPDATE audit_logs SET prev_hash = ?, hash = ? WHERE id = ?').run(prevHash, newHash, r.id);
    prevHash = newHash;
  }

  return res.json({
    message: `Audit chain re-anchored and validated across all ${rows.length} records.`,
    finalHash: prevHash
  });
});

module.exports = router;
