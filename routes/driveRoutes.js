const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authenticate, requireRole } = require('./authMiddleware');
const { logEvent } = require('../services/auditLogger');
const { evaluateEligibility, determineCategory } = require('../services/policyEngine');

// GET /api/drives - List drives
router.get('/', authenticate, (req, res) => {
  const { status, category } = req.query;
  let query = 'SELECT * FROM drives WHERE 1=1';
  const params = [];

  if (status && status !== 'All') {
    query += ' AND status = ?';
    params.push(status);
  }
  if (category && category !== 'All') {
    query += ' AND category = ?';
    params.push(category);
  }

  query += ' ORDER BY drive_date ASC';
  const drives = db.prepare(query).all(...params);

  // Parse JSON eligible courses
  const formattedDrives = drives.map(d => {
    let courses = [];
    try {
      courses = JSON.parse(d.eligible_courses);
    } catch {
      courses = [d.eligible_courses];
    }
    return { ...d, eligible_courses: courses };
  });

  return res.json({ drives: formattedDrives });
});

// GET /api/drives/:id - Drive details + applicants / attendance
router.get('/:id', authenticate, (req, res) => {
  const driveId = parseInt(req.params.id, 10);
  const drive = db.prepare('SELECT * FROM drives WHERE id = ?').get(driveId);
  if (!drive) {
    return res.status(404).json({ error: 'Drive not found.' });
  }

  let courses = [];
  try {
    courses = JSON.parse(drive.eligible_courses);
  } catch {
    courses = [drive.eligible_courses];
  }

  // Attendance records
  const attendance = db.prepare(`
    SELECT a.*, s.student_name, s.placement_id, s.course, s.email_id
    FROM recruitment_attendance a
    JOIN students s ON a.student_id = s.id
    WHERE a.drive_id = ?
    ORDER BY a.id DESC
  `).all(driveId);

  // Offers issued from this drive
  const driveOffers = db.prepare(`
    SELECT o.*, s.student_name, s.placement_id, s.course
    FROM offers o
    JOIN students s ON o.student_id = s.id
    WHERE o.drive_id = ?
    ORDER BY o.id DESC
  `).all(driveId);

  return res.json({
    drive: { ...drive, eligible_courses: courses },
    attendance,
    offers: driveOffers
  });
});

// POST /api/drives - Create new recruitment drive
router.post('/', authenticate, requireRole(['admin', 'officer', 'recruiter']), (req, res) => {
  const {
    company_name, job_title, offer_type, stipend_amount, ctc_lpa,
    eligible_courses, min_cgpa, deadline_hours, drive_date, location, description
  } = req.body;

  if (!company_name || !job_title || !offer_type || !drive_date) {
    return res.status(400).json({ error: 'Company name, title, offer type, and drive date are required.' });
  }

  const ctc = parseFloat(ctc_lpa) || 0;
  const stipend = parseFloat(stipend_amount) || 0;
  const category = determineCategory(ctc);

  const coursesJson = Array.isArray(eligible_courses)
    ? JSON.stringify(eligible_courses)
    : (typeof eligible_courses === 'string' && eligible_courses.startsWith('[') ? eligible_courses : JSON.stringify([eligible_courses || 'M.Tech. CS']));

  const stmt = db.prepare(`
    INSERT INTO drives (
      company_name, job_title, category, offer_type, stipend_amount, ctc_lpa,
      eligible_courses, min_cgpa, deadline_hours, drive_date, location, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    company_name,
    job_title,
    category,
    offer_type,
    stipend,
    ctc,
    coursesJson,
    parseFloat(min_cgpa) || 6.5,
    parseInt(deadline_hours, 10) || 24,
    drive_date,
    location || 'NFSU Gandhinagar Campus',
    description || ''
  );

  const newDrive = db.prepare('SELECT * FROM drives WHERE id = ?').get(info.lastInsertRowid);

  logEvent({
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: 'CREATE_RECRUITMENT_DRIVE',
    entityType: 'DRIVE',
    entityId: String(info.lastInsertRowid),
    afterState: newDrive,
    ipAddress: req.ip || '127.0.0.1'
  });

  return res.status(201).json({
    message: 'Recruitment drive published successfully.',
    drive: newDrive
  });
});

// POST /api/drives/:id/record-attendance - Mark student attendance & auto-enforce 3-drive ban on absenteeism
router.post('/:id/record-attendance', authenticate, requireRole(['admin', 'officer']), (req, res) => {
  const driveId = parseInt(req.params.id, 10);
  const { student_id, activity_type, attended, excused, notes } = req.body;

  if (!student_id || !activity_type) {
    return res.status(400).json({ error: 'Student ID and activity type are required.' });
  }

  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(student_id);
  const drive = db.prepare('SELECT * FROM drives WHERE id = ?').get(driveId);
  if (!student || !drive) {
    return res.status(404).json({ error: 'Student or drive record not found.' });
  }

  const isAttended = attended === true || attended === 1 || attended === '1';
  const isExcused = excused === true || excused === 1 || excused === '1';

  // Insert attendance entry
  const insertAttendance = db.prepare(`
    INSERT INTO recruitment_attendance (drive_id, student_id, activity_type, attended, excused, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertAttendance.run(driveId, student_id, activity_type, isAttended ? 1 : 0, isExcused ? 1 : 0, notes || null);

  // If unexcused absence, automatically enforce the 3-drive absenteeism ban per Section 3.2
  let penaltyApplied = false;
  if (!isAttended && !isExcused) {
    db.prepare('UPDATE students SET absent_drives_penalty = 3, updated_at = datetime("now", "localtime") WHERE id = ?').run(student_id);
    penaltyApplied = true;

    // Log policy violation event
    logEvent({
      actorUsername: req.user.username,
      actorRole: req.user.role,
      action: 'POLICY_VIOLATION_ABSENTEEISM',
      entityType: 'STUDENT',
      entityId: String(student_id),
      afterState: {
        violation: 'Recruitment Activity Absenteeism',
        activity: activity_type,
        company: drive.company_name,
        actionTaken: 'Enforced 3-drive exclusion penalty (NFSU Policy Clause 3.2)'
      },
      ipAddress: req.ip || '127.0.0.1'
    });
  }

  return res.json({
    message: isAttended
      ? 'Attendance recorded successfully.'
      : penaltyApplied
        ? 'Absenteeism recorded. Policy penalty applied: Student excluded from the next 3 recruitment drives.'
        : 'Absence recorded as excused. No disciplinary penalty applied.',
    penaltyApplied
  });
});

// GET /api/drives/:id/check-candidate/:studentId - Evaluate policy eligibility for a specific student
router.get('/:id/check-candidate/:studentId', authenticate, (req, res) => {
  const driveId = parseInt(req.params.id, 10);
  const studentId = parseInt(req.params.studentId, 10);

  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  const drive = db.prepare('SELECT * FROM drives WHERE id = ?').get(driveId);

  if (!student || !drive) {
    return res.status(404).json({ error: 'Drive or student not found.' });
  }

  // Check if student has an approved exception
  const approvedException = db.prepare(`
    SELECT id FROM policy_exceptions 
    WHERE student_id = ? AND status = 'Approved'
  `).get(studentId);

  const evaluation = evaluateEligibility(student, drive, { hasApprovedException: !!approvedException });

  return res.json({
    student: {
      id: student.id,
      placementId: student.placement_id,
      name: student.student_name,
      course: student.course,
      currentCompany: student.current_company,
      currentCategory: student.current_category,
      currentCtc: student.current_ctc,
      absentDrivesPenalty: student.absent_drives_penalty
    },
    drive: {
      id: drive.id,
      company: drive.company_name,
      category: drive.category,
      offerType: drive.offer_type,
      ctc: drive.ctc_lpa
    },
    evaluation
  });
});

module.exports = router;
