const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authenticate, requireRole } = require('./authMiddleware');
const {
  evaluateEligibility,
  getPolicyConfig,
  updatePolicyConfig,
  determineCategory
} = require('../services/policyEngine');
const { logEvent } = require('../services/auditLogger');

// GET /api/policy/config - Get current policy configuration
router.get('/config', authenticate, (req, res) => {
  return res.json({ config: getPolicyConfig() });
});

// PUT /api/policy/config - Admin updates policy configuration
router.put('/config', authenticate, requireRole(['admin']), (req, res) => {
  const oldConfig = getPolicyConfig();
  const newConfig = updatePolicyConfig(req.body);

  logEvent({
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: 'UPDATE_POLICY_CONFIG',
    entityType: 'POLICY_CONFIG',
    entityId: 'SYSTEM',
    beforeState: oldConfig,
    afterState: newConfig,
    ipAddress: req.ip || '127.0.0.1'
  });

  return res.json({
    message: 'Placement policy parameters updated successfully.',
    config: newConfig
  });
});

// POST /api/policy/simulate - Interactive Policy Rule Engine Simulator
router.post('/simulate', authenticate, (req, res) => {
  const { studentId, customStudent, targetOffer } = req.body;

  let student = null;
  if (studentId) {
    student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  } else if (customStudent) {
    student = customStudent;
  }

  if (!student) {
    return res.status(400).json({ error: 'Either studentId or customStudent attributes must be provided.' });
  }

  if (!targetOffer || !targetOffer.offer_type) {
    return res.status(400).json({ error: 'Target offer details (offer_type, ctc_lpa / stipend) are required.' });
  }

  // Derive target category if not specified
  if (!targetOffer.category && targetOffer.ctc_lpa !== undefined) {
    targetOffer.category = determineCategory(targetOffer.ctc_lpa);
  }

  // Check if approved exception exists for student
  let hasApprovedException = false;
  if (student.id) {
    const exc = db.prepare("SELECT id FROM policy_exceptions WHERE student_id = ? AND status = 'Approved'").get(student.id);
    hasApprovedException = !!exc;
  }

  const evaluation = evaluateEligibility(student, targetOffer, { hasApprovedException });

  return res.json({
    studentEvaluated: {
      placementId: student.placement_id,
      name: student.student_name,
      course: student.course,
      currentCompany: student.current_company,
      currentCategory: student.current_category,
      currentCtc: student.current_ctc,
      currentOfferType: student.current_offer_type,
      registrationStatus: student.registration_status,
      eligibilityStatus: student.eligibility_status,
      absentDrivesPenalty: student.absent_drives_penalty
    },
    targetOffer,
    evaluation
  });
});

// GET /api/policy/exceptions - List all emergency exceptions
router.get('/exceptions', authenticate, (req, res) => {
  const user = req.user;
  let query = `
    SELECT e.*, s.student_name, s.placement_id, s.course, d.company_name as drive_company
    FROM policy_exceptions e
    JOIN students s ON e.student_id = s.id
    LEFT JOIN drives d ON e.drive_id = d.id
    WHERE 1=1
  `;
  const params = [];

  if (user.role === 'student') {
    query += ' AND e.student_id = ?';
    params.push(user.studentId);
  }

  query += ' ORDER BY e.id DESC';
  const exceptions = db.prepare(query).all(...params);

  return res.json({ exceptions });
});

// POST /api/policy/exceptions - Submit an emergency exception (e.g. for absenteeism appeal)
router.post('/exceptions', authenticate, (req, res) => {
  const user = req.user;
  const studentId = user.role === 'student' ? user.studentId : req.body.student_id;
  const { drive_id, exception_type, reason } = req.body;

  if (!studentId || !reason) {
    return res.status(400).json({ error: 'Student ID and justification reason are required.' });
  }

  const stmt = db.prepare(`
    INSERT INTO policy_exceptions (student_id, drive_id, exception_type, reason, status)
    VALUES (?, ?, ?, ?, 'Pending')
  `);

  const info = stmt.run(
    studentId,
    drive_id || null,
    exception_type || 'ABSENTEEISM',
    reason
  );

  logEvent({
    actorUsername: user.username,
    actorRole: user.role,
    action: 'SUBMIT_POLICY_EXCEPTION',
    entityType: 'POLICY_EXCEPTION',
    entityId: String(info.lastInsertRowid),
    afterState: { studentId, exceptionType: exception_type, reason },
    ipAddress: req.ip || '127.0.0.1'
  });

  return res.status(201).json({
    message: 'Emergency exception petition submitted for Placement Cell authorized review.',
    exceptionId: info.lastInsertRowid
  });
});

// POST /api/policy/exceptions/:id/review - Placement Admin reviews and approves/rejects
router.post('/exceptions/:id/review', authenticate, requireRole(['admin']), (req, res) => {
  const exceptionId = parseInt(req.params.id, 10);
  const { status, review_notes } = req.body;

  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be Approved or Rejected.' });
  }

  const exc = db.prepare('SELECT * FROM policy_exceptions WHERE id = ?').get(exceptionId);
  if (!exc) {
    return res.status(404).json({ error: 'Exception request not found.' });
  }

  db.prepare(`
    UPDATE policy_exceptions SET
      status = ?,
      reviewed_by = ?,
      review_notes = ?,
      updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(status, req.user.username, review_notes || null, exceptionId);

  // If approved and was absenteeism penalty, reset the student's absent_drives_penalty to 0!
  if (status === 'Approved' && exc.exception_type === 'ABSENTEEISM') {
    db.prepare('UPDATE students SET absent_drives_penalty = 0 WHERE id = ?').run(exc.student_id);

    db.prepare(`
      INSERT INTO placement_history (student_id, event_type, event_details, actor_username)
      VALUES (?, 'EXCEPTION_APPLIED', 'Approved emergency exception: 3-drive absenteeism ban cleared.', ?)
    `).run(exc.student_id, req.user.username);
  }

  logEvent({
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: 'REVIEW_POLICY_EXCEPTION',
    entityType: 'POLICY_EXCEPTION',
    entityId: String(exceptionId),
    afterState: { status, reviewNotes: review_notes, studentId: exc.student_id },
    ipAddress: req.ip || '127.0.0.1'
  });

  return res.json({
    message: `Exception petition marked as '${status}'. Student records updated accordingly.`
  });
});

module.exports = router;
