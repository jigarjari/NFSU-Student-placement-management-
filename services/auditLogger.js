const crypto = require('node:crypto');
const { db } = require('../db/database');

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

function getLatestHash() {
  const row = db.prepare('SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1').get();
  return row ? row.hash : GENESIS_HASH;
}

function calculateHash(prevHash, timestamp, actorUsername, actorRole, action, entityType, entityId, beforeState, afterState, ipAddress) {
  const payload = [
    prevHash,
    timestamp,
    actorUsername || 'SYSTEM',
    actorRole || 'SYSTEM',
    action,
    entityType,
    entityId || '',
    typeof beforeState === 'object' ? JSON.stringify(beforeState) : (beforeState || ''),
    typeof afterState === 'object' ? JSON.stringify(afterState) : (afterState || ''),
    ipAddress || '127.0.0.1'
  ].join('|');

  return crypto.createHash('sha256').update(payload).digest('hex');
}

function logEvent({
  actorUsername = 'SYSTEM',
  actorRole = 'SYSTEM',
  action,
  entityType,
  entityId = null,
  beforeState = null,
  afterState = null,
  ipAddress = '127.0.0.1'
}) {
  try {
    const timestamp = new Date().toISOString();
    const prevHash = getLatestHash();
    
    const beforeStr = beforeState ? (typeof beforeState === 'object' ? JSON.stringify(beforeState) : String(beforeState)) : null;
    const afterStr = afterState ? (typeof afterState === 'object' ? JSON.stringify(afterState) : String(afterState)) : null;

    const hash = calculateHash(
      prevHash,
      timestamp,
      actorUsername,
      actorRole,
      action,
      entityType,
      entityId,
      beforeStr,
      afterStr,
      ipAddress
    );

    const stmt = db.prepare(`
      INSERT INTO audit_logs (
        timestamp, actor_username, actor_role, action, entity_type, entity_id,
        before_state, after_state, ip_address, prev_hash, hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      timestamp,
      actorUsername,
      actorRole,
      action,
      entityType,
      entityId ? String(entityId) : null,
      beforeStr,
      afterStr,
      ipAddress,
      prevHash,
      hash
    );

    return { success: true, hash, prevHash, timestamp };
  } catch (err) {
    console.error('Failed to log audit event:', err);
    return { success: false, error: err.message };
  }
}

function verifyAuditIntegrity() {
  const rows = db.prepare('SELECT * FROM audit_logs ORDER BY id ASC').all();
  if (rows.length === 0) {
    return {
      isValid: true,
      totalRecords: 0,
      message: 'Audit log is currently empty. Integrity check passed.'
    };
  }

  let expectedPrevHash = GENESIS_HASH;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    
    // Check previous hash linkage
    if (r.prev_hash !== expectedPrevHash) {
      return {
        isValid: false,
        brokenAtId: r.id,
        recordIndex: i,
        reason: `Hash link mismatch at record #${r.id}. Expected prev_hash '${expectedPrevHash}', found '${r.prev_hash}'`,
        compromisedRecord: r
      };
    }

    // Recalculate hash of current record
    const recomputedHash = calculateHash(
      r.prev_hash,
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

    if (recomputedHash !== r.hash) {
      return {
        isValid: false,
        brokenAtId: r.id,
        recordIndex: i,
        reason: `Cryptographic checksum tamper detected at record #${r.id}. Data payload was modified.`,
        compromisedRecord: r
      };
    }

    expectedPrevHash = r.hash;
  }

  return {
    isValid: true,
    totalRecords: rows.length,
    lastHash: expectedPrevHash,
    message: `All ${rows.length} audit records verified against cryptographic SHA-256 chain. Zero tampering detected.`
  };
}

module.exports = {
  logEvent,
  verifyAuditIntegrity,
  calculateHash
};
