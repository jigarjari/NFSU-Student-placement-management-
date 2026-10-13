const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authenticate, requireRole } = require('./authMiddleware');
const { logEvent } = require('../services/auditLogger');
const { evaluateEligibility, determineCategory } = require('../services/policyEngine');

// GET /api/offers - List all offers
router.get('/', authenticate, (req, res) => {
  const user = req.user;
  let query = `
    SELECT o.*, s.student_name, s.placement_id, s.course, s.mobile_number
    FROM offers o
    JOIN students s ON o.student_id = s.id
    WHERE 1=1
  `;
  const params = [];

  if (user.role === 'student') {
    query += ' AND o.student_id = ?';
    params.push(user.studentId);
  } else if (user.role === 'coordinator' && user.courseScope) {
    query += ' AND s.course = ?';
    params.push(user.courseScope);
  }

  query += ' ORDER BY o.id DESC';
  const offers = db.prepare(query).all(...params);

  // Check 24-hr deadline expiration in real time
  const now = new Date();
  const processedOffers = offers.map(o => {
    const expiresAt = new Date(o.expires_at);
    let status = o.offer_status;
    let isExpired = false;
    let remainingMs = expiresAt - now;

    if (status === 'Pending' && remainingMs <= 0) {
      status = 'Expired';
      isExpired = true;
      // Update in DB lazily
      db.prepare('UPDATE offers SET offer_status = "Expired" WHERE id = ?').run(o.id);
    }

    return {
      ...o,
      offer_status: status,
      isExpired,
      remainingMinutes: Math.max(0, Math.floor(remainingMs / (1000 * 60)))
    };
  });

  return res.json({ offers: processedOffers });
});

// POST /api/offers - Issue new offer (with Policy Enforcement!)
router.post('/', authenticate, requireRole(['admin', 'officer', 'recruiter']), (req, res) => {
  const {
    student_id, drive_id, company_name, offer_type, stipend_amount, ctc_lpa,
    is_off_campus, deadline_hours, ppo_status, remarks, overridePolicy
  } = req.body;

  if (!student_id || !company_name || !offer_type) {
    return res.status(400).json({ error: 'Student ID, company name, and offer type (I, F, I+F) are required.' });
  }

  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(student_id);
  if (!student) {
    return res.status(404).json({ error: 'Student record not found.' });
  }

  const ctc = parseFloat(ctc_lpa) || 0;
  const stipend = parseFloat(stipend_amount) || 0;
  const category = determineCategory(ctc);

  const targetOffer = {
    category,
    offer_type,
    ctc_lpa: ctc,
    stipend_amount: stipend
  };

  // Evaluate NFSU Policy Switching Rules
  const policyCheck = evaluateEligibility(student, targetOffer);

  if (policyCheck.status === 'BLOCKED' && !overridePolicy) {
    logEvent({
      actorUsername: req.user.username,
      actorRole: req.user.role,
      action: 'POLICY_BLOCKED_OFFER_ATTEMPT',
      entityType: 'OFFER',
      entityId: `student_${student_id}`,
      afterState: { targetCompany: company_name, reason: policyCheck.reason, violations: policyCheck.violations },
      ipAddress: req.ip || '127.0.0.1'
    });

    return res.status(400).json({
      error: 'Placement Policy Violation: Cannot issue offer under current guidelines.',
      policyCheck
    });
  }

  const hours = parseInt(deadline_hours, 10) || 24;
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + hours * 60 * 60 * 1000);

  const insertStmt = db.prepare(`
    INSERT INTO offers (
      student_id, drive_id, company_name, offer_type, category,
      stipend_amount, ctc_lpa, is_off_campus, offer_status,
      issued_at, expires_at, ppo_status, remarks
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?)
  `);

  const info = insertStmt.run(
    student_id,
    drive_id || null,
    company_name,
    offer_type,
    category,
    stipend,
    ctc,
    is_off_campus ? 1 : 0,
    issuedAt.toISOString(),
    expiresAt.toISOString(),
    ppo_status || 'Not applicable',
    remarks || (overridePolicy ? `Admin Policy Override: ${policyCheck.reason}` : null)
  );

  // Preserve history: record in placement_history
  db.prepare(`
    INSERT INTO placement_history (student_id, event_type, event_details, company_name, ctc_lpa, stipend_amount, actor_username)
    VALUES (?, 'OFFER_RECEIVED', ?, ?, ?, ?, ?)
  `).run(
    student_id,
    `Received ${offer_type} offer from ${company_name} in Category ${category} (₹${ctc} LPA / ₹${stipend} stipend). Deadline: ${hours}h.`,
    company_name,
    ctc,
    stipend,
    req.user.username
  );

  logEvent({
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: 'OFFER_ISSUED',
    entityType: 'OFFER',
    entityId: String(info.lastInsertRowid),
    afterState: { studentId: student_id, company: company_name, category, ctc, expiresAt },
    ipAddress: req.ip || '127.0.0.1'
  });

  return res.status(201).json({
    message: 'Offer issued successfully with 24h decision window initialized.',
    offerId: info.lastInsertRowid,
    expiresAt: expiresAt.toISOString(),
    policyCheck
  });
});

// POST /api/offers/:id/accept - Student or Officer accepts offer
router.post('/:id/accept', authenticate, (req, res) => {
  const offerId = parseInt(req.params.id, 10);
  const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(offerId);
  if (!offer) {
    return res.status(404).json({ error: 'Offer not found.' });
  }

  // IDOR check: If student, must be their own offer
  if (req.user.role === 'student' && req.user.studentId !== offer.student_id) {
    return res.status(403).json({ error: 'IDOR Protection: You cannot accept an offer belonging to another student.' });
  }

  // Check 24-hr deadline
  const now = new Date();
  if (new Date(offer.expires_at) < now) {
    db.prepare('UPDATE offers SET offer_status = "Expired" WHERE id = ?').run(offerId);
    return res.status(400).json({
      error: 'Offer Acceptance Deadline Expired. The 24-hour institutional acceptance window has passed.'
    });
  }

  // Update offer
  db.prepare(`
    UPDATE offers SET offer_status = 'Accepted', decision_date = datetime('now', 'localtime')
    WHERE id = ?
  `).run(offerId);

  // Determine new student placement_status
  let newPlacementStatus = 'Unplaced';
  if (offer.offer_type === 'I') newPlacementStatus = 'Internship only';
  else if (offer.offer_type === 'F') newPlacementStatus = 'FTE only';
  else if (offer.offer_type === 'I+F') newPlacementStatus = 'Internship + PPO/FTE';

  // Update student placement profile
  db.prepare(`
    UPDATE students SET
      placement_status = ?,
      current_company = ?,
      current_offer_type = ?,
      current_category = ?,
      current_stipend = ?,
      current_ctc = ?,
      offer_acceptance = 'Accepted',
      joining_status = 'Pending',
      updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(
    newPlacementStatus,
    offer.company_name,
    offer.offer_type,
    offer.category,
    offer.stipend_amount,
    offer.ctc_lpa,
    offer.student_id
  );

  // Record in placement history
  db.prepare(`
    INSERT INTO placement_history (student_id, event_type, event_details, company_name, ctc_lpa, stipend_amount, actor_username)
    VALUES (?, 'OFFER_ACCEPTED', ?, ?, ?, ?, ?)
  `).run(
    offer.student_id,
    `Accepted offer from ${offer.company_name} (Category ${offer.category}, ${offer.offer_type}, ₹${offer.ctc_lpa} LPA).`,
    offer.company_name,
    offer.ctc_lpa,
    offer.stipend_amount,
    req.user.username
  );

  logEvent({
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: 'OFFER_ACCEPTED',
    entityType: 'OFFER',
    entityId: String(offerId),
    afterState: { studentId: offer.student_id, company: offer.company_name, ctc: offer.ctc_lpa },
    ipAddress: req.ip || '127.0.0.1'
  });

  return res.json({
    message: `Offer from ${offer.company_name} accepted successfully. Student placement status updated to '${newPlacementStatus}'.`
  });
});

// POST /api/offers/:id/decline - Student or Officer declines offer
router.post('/:id/decline', authenticate, (req, res) => {
  const offerId = parseInt(req.params.id, 10);
  const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(offerId);
  if (!offer) {
    return res.status(404).json({ error: 'Offer not found.' });
  }

  if (req.user.role === 'student' && req.user.studentId !== offer.student_id) {
    return res.status(403).json({ error: 'Unauthorized to decline this offer.' });
  }

  db.prepare(`
    UPDATE offers SET offer_status = 'Declined', decision_date = datetime('now', 'localtime')
    WHERE id = ?
  `).run(offerId);

  db.prepare(`
    INSERT INTO placement_history (student_id, event_type, event_details, company_name, ctc_lpa, stipend_amount, actor_username)
    VALUES (?, 'OFFER_DECLINED', ?, ?, ?, ?, ?)
  `).run(
    offer.student_id,
    `Declined offer from ${offer.company_name}.`,
    offer.company_name,
    offer.ctc_lpa,
    offer.stipend_amount,
    req.user.username
  );

  logEvent({
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: 'OFFER_DECLINED',
    entityType: 'OFFER',
    entityId: String(offerId),
    afterState: { studentId: offer.student_id, company: offer.company_name },
    ipAddress: req.ip || '127.0.0.1'
  });

  return res.json({ message: 'Offer marked as declined.' });
});

// POST /api/offers/request-noc - Student requests NOC for internship / joining
router.post('/request-noc', authenticate, (req, res) => {
  const user = req.user;
  const studentId = user.role === 'student' ? user.studentId : req.body.student_id;

  if (!studentId) {
    return res.status(400).json({ error: 'Student ID required.' });
  }

  db.prepare('UPDATE students SET noc_status = "Requested", updated_at = datetime("now", "localtime") WHERE id = ?').run(studentId);

  db.prepare(`
    INSERT INTO placement_history (student_id, event_type, event_details, actor_username)
    VALUES (?, 'NOC_REQUESTED', 'Student requested institutional No Objection Certificate (NOC).', ?)
  `).run(studentId, user.username);

  logEvent({
    actorUsername: user.username,
    actorRole: user.role,
    action: 'NOC_STATUS_CHANGE',
    entityType: 'STUDENT',
    entityId: String(studentId),
    afterState: { noc_status: 'Requested' },
    ipAddress: req.ip || '127.0.0.1'
  });

  return res.json({ message: 'NOC request submitted for Placement Cell approval.' });
});

// POST /api/offers/update-noc - Officer/Admin approves or rejects NOC
router.post('/update-noc', authenticate, requireRole(['admin', 'officer']), (req, res) => {
  const { student_id, noc_status } = req.body;
  if (!student_id || !['Approved', 'Rejected'].includes(noc_status)) {
    return res.status(400).json({ error: 'Student ID and valid NOC status (Approved, Rejected) required.' });
  }

  db.prepare('UPDATE students SET noc_status = ?, updated_at = datetime("now", "localtime") WHERE id = ?').run(noc_status, student_id);

  logEvent({
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: 'NOC_DECISION',
    entityType: 'STUDENT',
    entityId: String(student_id),
    afterState: { noc_status },
    ipAddress: req.ip || '127.0.0.1'
  });

  return res.json({ message: `NOC status updated to '${noc_status}'.` });
});

module.exports = router;
