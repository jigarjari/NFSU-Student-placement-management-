const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authenticate, requireRole } = require('./authMiddleware');
const { logEvent } = require('../services/auditLogger');
const { determineCategory, computeIdBlockStatus } = require('../services/policyEngine');

function maskMobile(mobile, role) {
  if (role === 'admin' || role === 'officer') return mobile;
  if (!mobile) return 'N/A';
  // Mask middle digits: e.g. +91 98*** **210
  return mobile.replace(/(\+?\d{2,3}[\s-]?)?(\d{2})\d{4,6}(\d{2,4})/, '$1$2*** ***$3');
}

// GET /api/students - List students with search and course filter
router.get('/', authenticate, (req, res) => {
  const { course, status, search, showArchived } = req.query;
  const user = req.user;

  // Security: Students are restricted from listing all students!
  if (user.role === 'student') {
    return res.status(403).json({
      error: 'Access Denied: Students are not authorized to view the comprehensive student directory.'
    });
  }

  let query = 'SELECT * FROM students WHERE 1=1';
  const params = [];

  // Course Coordinator scoping
  if (user.role === 'coordinator' && user.courseScope) {
    query += ' AND course = ?';
    params.push(user.courseScope);
  } else if (course && course !== 'All') {
    query += ' AND course = ?';
    params.push(course);
  }

  if (status && status !== 'All') {
    query += ' AND placement_status = ?';
    params.push(status);
  }

  if (showArchived === 'true') {
    query += ' AND is_archived = 1';
  } else {
    query += ' AND is_archived = 0';
  }

  if (search) {
    query += ' AND (student_name LIKE ? OR placement_id LIKE ? OR email_id LIKE ? OR current_company LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  query += ' ORDER BY id DESC';

  const rows = db.prepare(query).all(...params);

  // Apply privacy & confidentiality masking based on role + ID Block status
  const maskedRows = rows.map(r => ({
    ...r,
    id_block_status: computeIdBlockStatus(r),
    mobile_number: maskMobile(r.mobile_number, user.role),
    current_ctc: (user.role === 'recruiter') ? 'Restricted' : r.current_ctc,
    current_stipend: (user.role === 'recruiter') ? 'Restricted' : r.current_stipend
  }));

  return res.json({
    total: maskedRows.length,
    students: maskedRows
  });
});

// GET /api/students/:id - Get single student record (with IDOR protection)
router.get('/:id', authenticate, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const user = req.user;

  // IDOR Protection: If student, must match their own studentId
  if (user.role === 'student' && user.studentId !== studentId) {
    logEvent({
      actorUsername: user.username,
      actorRole: user.role,
      action: 'SECURITY_ALERT_IDOR_ATTEMPT',
      entityType: 'STUDENT',
      entityId: String(studentId),
      afterState: { attemptedAccessToStudentId: studentId, actualStudentId: user.studentId },
      ipAddress: req.ip || '127.0.0.1'
    });

    return res.status(403).json({
      error: 'IDOR Protection: Access Denied. You cannot access another student’s confidential record.'
    });
  }

  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) {
    return res.status(404).json({ error: 'Student record not found.' });
  }

  // Course coordinator scoping check
  if (user.role === 'coordinator' && user.courseScope && student.course !== user.courseScope) {
    return res.status(403).json({
      error: `Access Denied: You are course coordinator for ${user.courseScope}. Cannot view ${student.course}.`
    });
  }

  return res.json({
    student: {
      ...student,
      id_block_status: computeIdBlockStatus(student),
      mobile_number: maskMobile(student.mobile_number, user.role)
    }
  });
});

// GET /api/students/:id/history - Get placement history and multi-offer events
router.get('/:id/history', authenticate, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const user = req.user;

  // IDOR Protection
  if (user.role === 'student' && user.studentId !== studentId) {
    return res.status(403).json({ error: 'Access Denied: Unauthorized to view history of other students.' });
  }

  const history = db.prepare('SELECT * FROM placement_history WHERE student_id = ? ORDER BY id DESC').all(studentId);
  const offers = db.prepare('SELECT * FROM offers WHERE student_id = ? ORDER BY id DESC').all(studentId);
  const attendance = db.prepare(`
    SELECT a.*, d.company_name, d.drive_date 
    FROM recruitment_attendance a
    JOIN drives d ON a.drive_id = d.id
    WHERE a.student_id = ?
    ORDER BY a.id DESC
  `).all(studentId);

  return res.json({
    history,
    offers,
    attendance
  });
});

// POST /api/students - Create new student
router.post('/', authenticate, requireRole(['admin', 'officer', 'coordinator']), (req, res) => {
  const {
    placement_id, student_name, mobile_number, email_id, course, batch, cgpa,
    registration_status, eligibility_status, remarks
  } = req.body;

  if (!placement_id || !student_name || !mobile_number || !email_id || !course || !batch) {
    return res.status(400).json({ error: 'All core fields (Placement ID, Name, Mobile, Email, Course, Batch) are required.' });
  }

  // Coordinator can only add students to their own course
  if (req.user.role === 'coordinator' && req.user.courseScope && course !== req.user.courseScope) {
    return res.status(403).json({ error: `You can only add students enrolled in ${req.user.courseScope}.` });
  }

  // Check unique Placement ID
  const existing = db.prepare('SELECT id FROM students WHERE placement_id = ?').get(placement_id);
  if (existing) {
    return res.status(409).json({ error: `Placement ID '${placement_id}' already exists. Duplicates are rejected.` });
  }

  const stmt = db.prepare(`
    INSERT INTO students (
      placement_id, student_name, mobile_number, email_id, course, batch, cgpa,
      registration_status, eligibility_status, placement_status, remarks
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Unplaced', ?)
  `);

  try {
    const info = stmt.run(
      placement_id,
      student_name,
      mobile_number,
      email_id,
      course,
      batch,
      parseFloat(cgpa) || 8.0,
      registration_status || 'Registered',
      eligibility_status || 'Eligible',
      remarks || null
    );

    const newStudent = db.prepare('SELECT * FROM students WHERE id = ?').get(info.lastInsertRowid);

    logEvent({
      actorUsername: req.user.username,
      actorRole: req.user.role,
      action: 'CREATE_STUDENT',
      entityType: 'STUDENT',
      entityId: String(info.lastInsertRowid),
      afterState: newStudent,
      ipAddress: req.ip || '127.0.0.1'
    });

    return res.status(201).json({
      message: 'Student record created successfully.',
      student: newStudent
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PUT /api/students/:id - Update student record
router.put('/:id', authenticate, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const user = req.user;

  // Security Challenge Defense: Student CANNOT change placement status, CTC, company, or switching data!
  if (user.role === 'student') {
    return res.status(403).json({
      error: 'Security Policy Violation: Students are strictly prohibited from modifying student profile records or placement data.'
    });
  }

  if (!['admin', 'officer', 'coordinator'].includes(user.role)) {
    return res.status(403).json({ error: 'Unauthorized to modify student records.' });
  }

  const existing = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!existing) {
    return res.status(404).json({ error: 'Student record not found.' });
  }

  if (user.role === 'coordinator' && user.courseScope && existing.course !== user.courseScope) {
    return res.status(403).json({ error: `Cannot update student outside your assigned course (${user.courseScope}).` });
  }

  const {
    student_name, mobile_number, email_id, course, batch, cgpa,
    registration_status, eligibility_status, remarks,
    placement_status, current_company, current_offer_type, current_category,
    current_stipend, current_ctc, ppo_status, offer_acceptance, joining_status, noc_status,
    absent_drives_penalty
  } = req.body;

  // Coordinators cannot modify placement compensation or package details (only Admins/Officers)
  const isOfficerOrAdmin = ['admin', 'officer'].includes(user.role);

  const updatedName = student_name !== undefined ? student_name : existing.student_name;
  const updatedMobile = mobile_number !== undefined ? mobile_number : existing.mobile_number;
  const updatedEmail = email_id !== undefined ? email_id : existing.email_id;
  const updatedCourse = course !== undefined ? course : existing.course;
  const updatedBatch = batch !== undefined ? batch : existing.batch;
  const updatedCgpa = cgpa !== undefined ? parseFloat(cgpa) : existing.cgpa;
  const updatedReg = registration_status !== undefined ? registration_status : existing.registration_status;
  const updatedElig = eligibility_status !== undefined ? eligibility_status : existing.eligibility_status;
  const updatedRemarks = remarks !== undefined ? remarks : existing.remarks;

  // Placement fields
  const updatedPlacementStatus = isOfficerOrAdmin && placement_status !== undefined ? placement_status : existing.placement_status;
  const updatedCompany = isOfficerOrAdmin && current_company !== undefined ? current_company : existing.current_company;
  const updatedOfferType = isOfficerOrAdmin && current_offer_type !== undefined ? current_offer_type : existing.current_offer_type;
  const updatedCtc = isOfficerOrAdmin && current_ctc !== undefined ? parseFloat(current_ctc) : existing.current_ctc;
  const updatedStipend = isOfficerOrAdmin && current_stipend !== undefined ? parseFloat(current_stipend) : existing.current_stipend;
  const updatedCategory = isOfficerOrAdmin
    ? (current_category !== undefined ? current_category : (updatedCtc > 0 ? determineCategory(updatedCtc) : null))
    : existing.current_category;
  const updatedPpo = isOfficerOrAdmin && ppo_status !== undefined ? ppo_status : existing.ppo_status;
  const updatedAcceptance = isOfficerOrAdmin && offer_acceptance !== undefined ? offer_acceptance : existing.offer_acceptance;
  const updatedJoining = isOfficerOrAdmin && joining_status !== undefined ? joining_status : existing.joining_status;
  const updatedNoc = isOfficerOrAdmin && noc_status !== undefined ? noc_status : existing.noc_status;
  const updatedPenalty = isOfficerOrAdmin && absent_drives_penalty !== undefined ? parseInt(absent_drives_penalty, 10) : existing.absent_drives_penalty;

  const stmt = db.prepare(`
    UPDATE students SET
      student_name = ?, mobile_number = ?, email_id = ?, course = ?, batch = ?, cgpa = ?,
      registration_status = ?, eligibility_status = ?, remarks = ?,
      placement_status = ?, current_company = ?, current_offer_type = ?, current_category = ?,
      current_stipend = ?, current_ctc = ?, ppo_status = ?, offer_acceptance = ?,
      joining_status = ?, noc_status = ?, absent_drives_penalty = ?,
      updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `);

  stmt.run(
    updatedName, updatedMobile, updatedEmail, updatedCourse, updatedBatch, updatedCgpa,
    updatedReg, updatedElig, updatedRemarks,
    updatedPlacementStatus, updatedCompany, updatedOfferType, updatedCategory,
    updatedStipend, updatedCtc, updatedPpo, updatedAcceptance,
    updatedJoining, updatedNoc, updatedPenalty,
    studentId
  );

  const updatedRecord = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);

  logEvent({
    actorUsername: user.username,
    actorRole: user.role,
    action: 'UPDATE_STUDENT',
    entityType: 'STUDENT',
    entityId: String(studentId),
    beforeState: existing,
    afterState: updatedRecord,
    ipAddress: req.ip || '127.0.0.1'
  });

  return res.json({
    message: 'Student record updated successfully.',
    student: updatedRecord
  });
});

// POST /api/students/:id/archive - Controlled Archive/Restore
router.post('/:id/archive', authenticate, requireRole(['admin', 'officer']), (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const { archive } = req.body; // true to archive, false to restore
  const shouldArchive = archive !== false ? 1 : 0;

  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) {
    return res.status(404).json({ error: 'Student not found.' });
  }

  db.prepare('UPDATE students SET is_archived = ?, updated_at = datetime("now", "localtime") WHERE id = ?').run(shouldArchive, studentId);

  logEvent({
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: shouldArchive ? 'ARCHIVE_STUDENT' : 'RESTORE_STUDENT',
    entityType: 'STUDENT',
    entityId: String(studentId),
    beforeState: { is_archived: student.is_archived },
    afterState: { is_archived: shouldArchive },
    ipAddress: req.ip || '127.0.0.1'
  });

  return res.json({
    message: shouldArchive ? 'Student record successfully archived.' : 'Student record successfully restored.'
  });
});

// DELETE /api/students/:id - Controlled hard delete (Admin only with full audit)
router.delete('/:id', authenticate, requireRole(['admin']), (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) {
    return res.status(404).json({ error: 'Student not found.' });
  }

  db.prepare('DELETE FROM students WHERE id = ?').run(studentId);

  logEvent({
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: 'DELETE_STUDENT_PERMANENT',
    entityType: 'STUDENT',
    entityId: String(studentId),
    beforeState: student,
    afterState: null,
    ipAddress: req.ip || '127.0.0.1'
  });

  return res.json({ message: 'Student permanently deleted from database with audit record.' });
});

// POST /api/students/import-csv - Controlled CSV Bulk Import
router.post('/import-csv', authenticate, requireRole(['admin', 'officer']), (req, res) => {
  const { csvText } = req.body;
  if (!csvText || typeof csvText !== 'string') {
    return res.status(400).json({ error: 'CSV text content is required.' });
  }

  const lines = csvText.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    return res.status(400).json({ error: 'CSV must contain at least a header row and one data row.' });
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const requiredHeaders = ['placement_id', 'student_name', 'email_id', 'course', 'batch'];
  for (const reqH of requiredHeaders) {
    if (!headers.includes(reqH)) {
      return res.status(400).json({ error: `Missing required column in CSV: '${reqH}'` });
    }
  }

  const insertStmt = db.prepare(`
    INSERT INTO students (
      placement_id, student_name, mobile_number, email_id, course, batch, cgpa,
      registration_status, eligibility_status, placement_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Registered', 'Eligible', 'Unplaced')
  `);

  let importedCount = 0;
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    const rowObj = {};
    headers.forEach((h, idx) => { rowObj[h] = cols[idx] || ''; });

    const placementId = rowObj['placement_id'];
    const name = rowObj['student_name'];
    const email = rowObj['email_id'];
    const course = rowObj['course'];
    const batch = rowObj['batch'];
    const mobile = rowObj['mobile_number'] || '+91 99999 00000';
    const cgpa = parseFloat(rowObj['cgpa']) || 7.5;

    // Check duplicate
    const exists = db.prepare('SELECT id FROM students WHERE placement_id = ? OR email_id = ?').get(placementId, email);
    if (exists) {
      errors.push(`Row ${i + 1}: Duplicate placement_id '${placementId}' or email '${email}' skipped.`);
      continue;
    }

    try {
      insertStmt.run(placementId, name, mobile, email, course, batch, cgpa);
      importedCount++;
    } catch (err) {
      errors.push(`Row ${i + 1}: ${err.message}`);
    }
  }

  logEvent({
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: 'CSV_IMPORT_STUDENTS',
    entityType: 'STUDENT_BATCH',
    entityId: `imported_${importedCount}`,
    afterState: { importedCount, errorCount: errors.length, errors },
    ipAddress: req.ip || '127.0.0.1'
  });

  return res.json({
    message: `CSV import completed: ${importedCount} records successfully imported.`,
    importedCount,
    errors
  });
});

// GET /api/students/export-csv - Secure & Audited CSV Export
router.get('/export-csv', authenticate, requireRole(['admin', 'officer', 'coordinator']), (req, res) => {
  const { course } = req.query;
  const user = req.user;

  let query = 'SELECT * FROM students WHERE is_archived = 0';
  const params = [];
  if (user.role === 'coordinator' && user.courseScope) {
    query += ' AND course = ?';
    params.push(user.courseScope);
  } else if (course && course !== 'All') {
    query += ' AND course = ?';
    params.push(course);
  }

  const rows = db.prepare(query).all(...params);

  // Build CSV
  const header = [
    'Placement ID', 'Student Name', 'Mobile Number', 'Email ID', 'Course', 'Batch', 'CGPA',
    'Registration Status', 'Eligibility Status', 'Placement Status', 'Company', 'Offer Type',
    'Category', 'Internship Stipend (INR)', 'FTE Package (LPA)', 'PPO Status', 'Offer Acceptance',
    'Joining Status', 'NOC Status', 'Absenteeism Penalty Drives'
  ];

  const csvRows = [header.join(',')];
  rows.forEach(r => {
    const line = [
      `"${r.placement_id}"`,
      `"${r.student_name}"`,
      `"${maskMobile(r.mobile_number, user.role)}"`,
      `"${r.email_id}"`,
      `"${r.course}"`,
      `"${r.batch}"`,
      r.cgpa,
      `"${r.registration_status}"`,
      `"${r.eligibility_status}"`,
      `"${r.placement_status}"`,
      `"${r.current_company || 'N/A'}"`,
      `"${r.current_offer_type || 'N/A'}"`,
      `"${r.current_category || 'N/A'}"`,
      r.current_stipend || 0,
      r.current_ctc || 0,
      `"${r.ppo_status}"`,
      `"${r.offer_acceptance}"`,
      `"${r.joining_status}"`,
      `"${r.noc_status}"`,
      r.absent_drives_penalty || 0
    ];
    csvRows.push(line.join(','));
  });

  // Log export in tamper-evident audit log
  logEvent({
    actorUsername: user.username,
    actorRole: user.role,
    action: 'EXPORT_STUDENT_DATA_CSV',
    entityType: 'RECORDS_EXPORT',
    entityId: `exported_${rows.length}`,
    afterState: { rowCount: rows.length, courseFilter: course || 'All', userRole: user.role },
    ipAddress: req.ip || '127.0.0.1'
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="NFSU_Placement_Records_${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(csvRows.join('\r\n'));
});

module.exports = router;
