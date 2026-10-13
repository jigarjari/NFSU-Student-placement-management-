const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = path.join(__dirname, 'placement_system.db');

// Initialize SQLite database
const db = new DatabaseSync(DB_PATH);

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON;');

function initSchema() {
  db.exec(`
    -- Users table for Authentication & RBAC
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'officer', 'coordinator', 'recruiter', 'student')),
      course_scope TEXT DEFAULT NULL,
      student_id INTEGER DEFAULT NULL,
      mfa_enabled INTEGER DEFAULT 1,
      mfa_secret TEXT DEFAULT 'NFSU-AUTH-2026',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE SET NULL
    );

    -- Students table
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      placement_id TEXT UNIQUE NOT NULL,
      student_name TEXT NOT NULL,
      mobile_number TEXT NOT NULL,
      email_id TEXT UNIQUE NOT NULL,
      course TEXT NOT NULL CHECK(course IN (
        'M.Tech. CS',
        'M.Tech. AIDS',
        'B.Tech.-M.Tech. CS',
        'M.Sc. CS',
        'M.Sc. DFIS'
      )),
      batch TEXT NOT NULL,
      cgpa REAL DEFAULT 8.0,
      registration_status TEXT NOT NULL DEFAULT 'Registered' CHECK(registration_status IN ('Registered', 'Deregistered', 'Not registered')),
      eligibility_status TEXT NOT NULL DEFAULT 'Eligible' CHECK(eligibility_status IN ('Eligible', 'Ineligible', 'Pending verification')),
      placement_status TEXT NOT NULL DEFAULT 'Unplaced' CHECK(placement_status IN ('Unplaced', 'Internship only', 'FTE only', 'Internship + PPO/FTE')),
      current_company TEXT DEFAULT NULL,
      current_offer_type TEXT DEFAULT NULL CHECK(current_offer_type IS NULL OR current_offer_type IN ('I', 'F', 'I+F')),
      current_category TEXT DEFAULT NULL CHECK(current_category IS NULL OR current_category IN ('A+', 'A', 'B', 'C')),
      current_stipend REAL DEFAULT 0,
      current_ctc REAL DEFAULT 0,
      ppo_status TEXT DEFAULT 'Not applicable' CHECK(ppo_status IN ('Not applicable', 'Pending', 'Offered', 'Accepted', 'Declined')),
      offer_acceptance TEXT DEFAULT 'Pending' CHECK(offer_acceptance IN ('Pending', 'Accepted', 'Declined', 'Expired')),
      joining_status TEXT DEFAULT 'Pending' CHECK(joining_status IN ('Pending', 'Joined', 'Not joined')),
      noc_status TEXT DEFAULT 'Not applicable' CHECK(noc_status IN ('Not applicable', 'Requested', 'Approved', 'Rejected')),
      absent_drives_penalty INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
      remarks TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- Recruitment Drives table
    CREATE TABLE IF NOT EXISTS drives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      job_title TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('A+', 'A', 'B', 'C')),
      offer_type TEXT NOT NULL CHECK(offer_type IN ('I', 'F', 'I+F')),
      stipend_amount REAL DEFAULT 0,
      ctc_lpa REAL DEFAULT 0,
      eligible_courses TEXT NOT NULL, -- JSON array string, e.g. ["M.Tech. CS","M.Sc. DFIS"]
      min_cgpa REAL DEFAULT 6.5,
      deadline_hours INTEGER DEFAULT 24,
      drive_date TEXT NOT NULL,
      location TEXT DEFAULT 'NFSU Gandhinagar / Virtual',
      status TEXT DEFAULT 'Open' CHECK(status IN ('Upcoming', 'Open', 'Completed', 'Closed')),
      description TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- Attendance & Recruitment Activities table
    CREATE TABLE IF NOT EXISTS recruitment_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drive_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      activity_type TEXT NOT NULL CHECK(activity_type IN ('Pre-Placement Talk', 'Online Test', 'Technical Interview', 'HR Interview')),
      attended INTEGER NOT NULL DEFAULT 1, -- 1: Present, 0: Absent
      excused INTEGER DEFAULT 0, -- 1 if emergency exception granted
      notes TEXT DEFAULT NULL,
      recorded_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(drive_id) REFERENCES drives(id) ON DELETE CASCADE,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    -- Offers table (Preserves multi-offer history)
    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      drive_id INTEGER DEFAULT NULL,
      company_name TEXT NOT NULL,
      offer_type TEXT NOT NULL CHECK(offer_type IN ('I', 'F', 'I+F')),
      category TEXT NOT NULL CHECK(category IN ('A+', 'A', 'B', 'C')),
      stipend_amount REAL DEFAULT 0,
      ctc_lpa REAL DEFAULT 0,
      is_off_campus INTEGER DEFAULT 0,
      offer_status TEXT DEFAULT 'Pending' CHECK(offer_status IN ('Pending', 'Accepted', 'Declined', 'Expired')),
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      decision_date TEXT DEFAULT NULL,
      ppo_status TEXT DEFAULT 'Not applicable',
      remarks TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY(drive_id) REFERENCES drives(id) ON DELETE SET NULL
    );

    -- Placement Events & Audit History
    CREATE TABLE IF NOT EXISTS placement_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      event_details TEXT NOT NULL,
      company_name TEXT DEFAULT NULL,
      ctc_lpa REAL DEFAULT 0,
      stipend_amount REAL DEFAULT 0,
      actor_username TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    -- Tamper-Evident Audit Log with Cryptographic Hash Chaining
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      actor_username TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      before_state TEXT,
      after_state TEXT,
      ip_address TEXT,
      prev_hash TEXT NOT NULL,
      hash TEXT NOT NULL
    );

    -- Emergency Exceptions for Absenteeism & Special Reviews
    CREATE TABLE IF NOT EXISTS policy_exceptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      drive_id INTEGER DEFAULT NULL,
      exception_type TEXT NOT NULL DEFAULT 'ABSENTEEISM',
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Rejected')),
      reviewed_by TEXT DEFAULT NULL,
      review_notes TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    -- Indexes for high-performance and integrity
    CREATE INDEX IF NOT EXISTS idx_students_placement_id ON students(placement_id);
    CREATE INDEX IF NOT EXISTS idx_students_course ON students(course);
    CREATE INDEX IF NOT EXISTS idx_students_placement_status ON students(placement_status);
    CREATE INDEX IF NOT EXISTS idx_offers_student_id ON offers(student_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_student_drive ON recruitment_attendance(student_id, drive_id);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
  `);
}

initSchema();

module.exports = {
  db,
  initSchema
};
