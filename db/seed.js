const bcrypt = require('bcryptjs');
const { db } = require('./database');
const { logEvent } = require('../services/auditLogger');

function seedDatabase() {
  console.log('Seeding NFSU Placement Management System database...');

  // Clear existing data in correct foreign key order
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec(`
    DELETE FROM policy_exceptions;
    DELETE FROM recruitment_attendance;
    DELETE FROM placement_history;
    DELETE FROM offers;
    DELETE FROM drives;
    DELETE FROM users;
    DELETE FROM students;
    DELETE FROM audit_logs;
  `);
  db.exec('PRAGMA foreign_keys = ON;');

  const salt = bcrypt.genSaltSync(10);
  const adminPasswordHash = bcrypt.hashSync('Admin@NFSU2026', salt);
  const officerPasswordHash = bcrypt.hashSync('Officer@NFSU2026', salt);
  const coordPasswordHash = bcrypt.hashSync('Coord@NFSU2026', salt);
  const recruiterPasswordHash = bcrypt.hashSync('Recruiter@NFSU2026', salt);
  const studentPasswordHash = bcrypt.hashSync('Student@NFSU2026', salt);

  // 1. Insert Base Students across all 5 programmes
  const studentsList = [
    // M.Sc. Digital Forensics and Information Security (M.Sc. DFIS)
    {
      placement_id: 'NFSU26-DFIS-001',
      student_name: 'Aarav V. Sharma',
      mobile_number: '+91 98765 43210',
      email_id: 'aarav.sharma@nfsu.ac.in',
      course: 'M.Sc. DFIS',
      batch: '2025–2027',
      cgpa: 9.3,
      registration_status: 'Registered',
      eligibility_status: 'Eligible',
      placement_status: 'FTE only',
      current_company: 'Palo Alto Networks',
      current_offer_type: 'F',
      current_category: 'A+',
      current_stipend: 0,
      current_ctc: 18.5,
      ppo_status: 'Not applicable',
      offer_acceptance: 'Accepted',
      joining_status: 'Pending',
      noc_status: 'Approved',
      absent_drives_penalty: 0,
      remarks: 'Selected through on-campus cyber forensics assessment.'
    },
    {
      placement_id: 'NFSU26-DFIS-002',
      student_name: 'Priya N. Patel',
      mobile_number: '+91 98234 56789',
      email_id: 'priya.patel@nfsu.ac.in',
      course: 'M.Sc. DFIS',
      batch: '2025–2027',
      cgpa: 8.8,
      registration_status: 'Registered',
      eligibility_status: 'Eligible',
      placement_status: 'Internship only',
      current_company: 'CrowdStrike',
      current_offer_type: 'I',
      current_category: 'A',
      current_stipend: 45000,
      current_ctc: 12.0,
      ppo_status: 'Pending',
      offer_acceptance: 'Accepted',
      joining_status: 'Pending',
      noc_status: 'Approved',
      absent_drives_penalty: 0,
      remarks: 'Holding 6-month DFIR internship with PPO consideration.'
    },
    {
      placement_id: 'NFSU26-DFIS-003',
      student_name: 'Rohan K. Joshi',
      mobile_number: '+91 97123 45678',
      email_id: 'rohan.joshi@nfsu.ac.in',
      course: 'M.Sc. DFIS',
      batch: '2025–2027',
      cgpa: 7.9,
      registration_status: 'Registered',
      eligibility_status: 'Eligible',
      placement_status: 'FTE only',
      current_company: 'KPMG Cyber Risk',
      current_offer_type: 'F',
      current_category: 'B',
      current_stipend: 0,
      current_ctc: 7.5,
      ppo_status: 'Not applicable',
      offer_acceptance: 'Accepted',
      joining_status: 'Pending',
      noc_status: 'Not applicable',
      absent_drives_penalty: 0,
      remarks: 'Placed in Category B. Eligible for switching to offers >= 11.25 LPA (1.5x rule).'
    },
    {
      placement_id: 'NFSU26-DFIS-004',
      student_name: 'Meera S. Desai',
      mobile_number: '+91 96321 85296',
      email_id: 'meera.desai@nfsu.ac.in',
      course: 'M.Sc. DFIS',
      batch: '2025–2027',
      cgpa: 8.2,
      registration_status: 'Registered',
      eligibility_status: 'Eligible',
      placement_status: 'Unplaced',
      current_company: null,
      current_offer_type: null,
      current_category: null,
      current_stipend: 0,
      current_ctc: 0,
      ppo_status: 'Not applicable',
      offer_acceptance: 'Pending',
      joining_status: 'Pending',
      noc_status: 'Not applicable',
      absent_drives_penalty: 0,
      remarks: 'Actively participating in forensics security drives.'
    },
    {
      placement_id: 'NFSU26-DFIS-005',
      student_name: 'Vikramaditya Rao',
      mobile_number: '+91 95123 78945',
      email_id: 'vikram.rao@nfsu.ac.in',
      course: 'M.Sc. DFIS',
      batch: '2025–2027',
      cgpa: 7.4,
      registration_status: 'Registered',
      eligibility_status: 'Eligible',
      placement_status: 'Unplaced',
      current_company: null,
      current_offer_type: null,
      current_category: null,
      current_stipend: 0,
      current_ctc: 0,
      ppo_status: 'Not applicable',
      offer_acceptance: 'Pending',
      joining_status: 'Pending',
      noc_status: 'Not applicable',
      absent_drives_penalty: 3, // Flagged for absenteeism
      remarks: 'Flagged for absenteeism in Cisco Pre-Placement Talk. Excluded from next 3 drives.'
    },

    // M.Tech. Computer Science (M.Tech. CS)
    {
      placement_id: 'NFSU26-CS-001',
      student_name: 'Devashish Sen',
      mobile_number: '+91 98450 11223',
      email_id: 'devashish.sen@nfsu.ac.in',
      course: 'M.Tech. CS',
      batch: '2025–2027',
      cgpa: 9.6,
      registration_status: 'Registered',
      eligibility_status: 'Eligible',
      placement_status: 'Internship + PPO/FTE',
      current_company: 'Google Cloud India',
      current_offer_type: 'I+F',
      current_category: 'A+',
      current_stipend: 110000,
      current_ctc: 24.0,
      ppo_status: 'Accepted',
      offer_acceptance: 'Accepted',
      joining_status: 'Joined',
      noc_status: 'Approved',
      absent_drives_penalty: 0,
      remarks: 'Locked in Category A+ with I+F. Out of placement process.'
    },
    {
      placement_id: 'NFSU26-CS-002',
      student_name: 'Ananya Roy',
      mobile_number: '+91 98310 99887',
      email_id: 'ananya.roy@nfsu.ac.in',
      course: 'M.Tech. CS',
      batch: '2025–2027',
      cgpa: 8.7,
      registration_status: 'Registered',
      eligibility_status: 'Eligible',
      placement_status: 'FTE only',
      current_company: 'Oracle Financial Services',
      current_offer_type: 'F',
      current_category: 'A',
      current_stipend: 0,
      current_ctc: 13.5,
      ppo_status: 'Not applicable',
      offer_acceptance: 'Accepted',
      joining_status: 'Pending',
      noc_status: 'Approved',
      absent_drives_penalty: 0,
      remarks: 'Category A offer. Allowed switching ONLY to Category A+ (>= 16 LPA).'
    },
    {
      placement_id: 'NFSU26-CS-003',
      student_name: 'Kabir Mehta',
      mobile_number: '+91 97410 44332',
      email_id: 'kabir.mehta@nfsu.ac.in',
      course: 'M.Tech. CS',
      batch: '2025–2027',
      cgpa: 7.8,
      registration_status: 'Registered',
      eligibility_status: 'Eligible',
      placement_status: 'FTE only',
      current_company: 'Tata Consultancy Services',
      current_offer_type: 'F',
      current_category: 'B',
      current_stipend: 0,
      current_ctc: 7.0,
      ppo_status: 'Not applicable',
      offer_acceptance: 'Accepted',
      joining_status: 'Pending',
      noc_status: 'Not applicable',
      absent_drives_penalty: 0,
      remarks: 'Category B offer. Switching allowed if new package >= 10.5 LPA (1.5x rule).'
    },
    {
      placement_id: 'NFSU26-CS-004',
      student_name: 'Tanvi Saxena',
      mobile_number: '+91 99887 76655',
      email_id: 'tanvi.saxena@nfsu.ac.in',
      course: 'M.Tech. CS',
      batch: '2025–2027',
      cgpa: 8.4,
      registration_status: 'Registered',
      eligibility_status: 'Eligible',
      placement_status: 'Unplaced',
      current_company: null,
      current_offer_type: null,
      current_category: null,
      current_stipend: 0,
      current_ctc: 0,
      ppo_status: 'Not applicable',
      offer_acceptance: 'Pending',
      joining_status: 'Pending',
      noc_status: 'Not applicable',
      absent_drives_penalty: 0,
      remarks: 'Shortlisted for Microsoft Online Assessment.'
    },

    // M.Tech. Artificial Intelligence and Data Science (M.Tech. AIDS)
    {
      placement_id: 'NFSU26-AIDS-001',
      student_name: 'Arjun N. Varma',
      mobile_number: '+91 98980 12345',
      email_id: 'arjun.varma@nfsu.ac.in',
      course: 'M.Tech. AIDS',
      batch: '2025–2027',
      cgpa: 9.2,
      registration_status: 'Registered',
      eligibility_status: 'Eligible',
      placement_status: 'FTE only',
      current_company: 'Microsoft Research & Cloud',
      current_offer_type: 'F',
      current_category: 'A+',
      current_stipend: 0,
      current_ctc: 21.0,
      ppo_status: 'Not applicable',
      offer_acceptance: 'Accepted',
      joining_status: 'Pending',
      noc_status: 'Approved',
      absent_drives_penalty: 0,
      remarks: 'Category A+ FTE Offer. Placement completed.'
    },
    {
      placement_id: 'NFSU26-AIDS-002',
      student_name: 'Shruti Bhattacharya',
      mobile_number: '+91 98770 54321',
      email_id: 'shruti.bhatt@nfsu.ac.in',
      course: 'M.Tech. AIDS',
      batch: '2025–2027',
      cgpa: 8.5,
      registration_status: 'Registered',
      eligibility_status: 'Eligible',
      placement_status: 'Internship only',
      current_company: 'Qualcomm AI Labs',
      current_offer_type: 'I',
      current_category: 'A',
      current_stipend: 50000,
      current_ctc: 11.8,
      ppo_status: 'Offered',
      offer_acceptance: 'Accepted',
      joining_status: 'Pending',
      noc_status: 'Approved',
      absent_drives_penalty: 0,
      remarks: 'Received PPO offer. Evaluation under progress.'
    },
    {
      placement_id: 'NFSU26-AIDS-003',
      student_name: 'Nikhil R. Nair',
      mobile_number: '+91 97230 65498',
      email_id: 'nikhil.nair@nfsu.ac.in',
      course: 'M.Tech. AIDS',
      batch: '2025–2027',
      cgpa: 7.2,
      registration_status: 'Registered',
      eligibility_status: 'Pending verification',
      placement_status: 'Unplaced',
      current_company: null,
      current_offer_type: null,
      current_category: null,
      current_stipend: 0,
      current_ctc: 0,
      ppo_status: 'Not applicable',
      offer_acceptance: 'Pending',
      joining_status: 'Pending',
      noc_status: 'Not applicable',
      absent_drives_penalty: 0,
      remarks: 'Course coordinator verification pending for 3rd semester credit backlogs.'
    },
    {
      placement_id: 'NFSU26-AIDS-004',
      student_name: 'Deepika Iyer',
      mobile_number: '+91 96540 12389',
      email_id: 'deepika.iyer@nfsu.ac.in',
      course: 'M.Tech. AIDS',
      batch: '2025–2027',
      cgpa: 8.1,
      registration_status: 'Registered',
      eligibility_status: 'Eligible',
      placement_status: 'FTE only',
      current_company: 'Larsen & Toubro Infotech',
      current_offer_type: 'F',
      current_category: 'B',
      current_stipend: 0,
      current_ctc: 8.5,
      ppo_status: 'Not applicable',
      offer_acceptance: 'Accepted',
      joining_status: 'Pending',
      noc_status: 'Not applicable',
      absent_drives_penalty: 0,
      remarks: 'Category B. Requires >= 12.75 LPA to switch.'
    },

    // B.Tech.–M.Tech. Computer Science and Engineering (CS)
    {
      placement_id: 'NFSU26-BTMT-001',
      student_name: 'Siddharth M. Kapoor',
      mobile_number: '+91 98111 22334',
      email_id: 'siddharth.kapoor@nfsu.ac.in',
      course: 'B.Tech.-M.Tech. CS',
      batch: '2022–2027',
      cgpa: 9.5,
      registration_status: 'Registered',
      eligibility_status: 'Eligible',
      placement_status: 'Internship + PPO/FTE',
      current_company: 'Amazon Web Services',
      current_offer_type: 'I+F',
      current_category: 'A+',
      current_stipend: 90000,
      current_ctc: 22.5,
      ppo_status: 'Accepted',
      offer_acceptance: 'Accepted',
      joining_status: 'Joined',
      noc_status: 'Approved',
      absent_drives_penalty: 0,
      remarks: '5-year integrated programme dual degree. A+ tier locked.'
    },
    {
      placement_id: 'NFSU26-BTMT-002',
      student_name: 'Bhavna K. Menon',
      mobile_number: '+91 98222 33445',
      email_id: 'bhavna.menon@nfsu.ac.in',
      course: 'B.Tech.-M.Tech. CS',
      batch: '2022–2027',
      cgpa: 8.9,
      registration_status: 'Registered',
      eligibility_status: 'Eligible',
      placement_status: 'FTE only',
      current_company: 'Cisco Systems',
      current_offer_type: 'F',
      current_category: 'A',
      current_stipend: 0,
      current_ctc: 14.2,
      ppo_status: 'Not applicable',
      offer_acceptance: 'Accepted',
      joining_status: 'Pending',
      noc_status: 'Approved',
      absent_drives_penalty: 0,
      remarks: 'Holds Cisco A-tier. May switch to A+ drives only.'
    },
    {
      placement_id: 'NFSU26-BTMT-003',
      student_name: 'Yashwardhan Chawla',
      mobile_number: '+91 98333 44556',
      email_id: 'yash.chawla@nfsu.ac.in',
      course: 'B.Tech.-M.Tech. CS',
      batch: '2022–2027',
      cgpa: 7.6,
      registration_status: 'Registered',
      eligibility_status: 'Eligible',
      placement_status: 'Internship only',
      current_company: 'CyberX Forensics Lab',
      current_offer_type: 'I',
      current_category: 'C',
      current_stipend: 25000,
      current_ctc: 4.8,
      ppo_status: 'Pending',
      offer_acceptance: 'Accepted',
      joining_status: 'Pending',
      noc_status: 'Approved',
      absent_drives_penalty: 0,
      remarks: 'Holds Category C internship. Eligible for Category B, A, or A+ upgrades.'
    },
    {
      placement_id: 'NFSU26-BTMT-004',
      student_name: 'Kavita Sundaram',
      mobile_number: '+91 98444 55667',
      email_id: 'kavita.s@nfsu.ac.in',
      course: 'B.Tech.-M.Tech. CS',
      batch: '2022–2027',
      cgpa: 8.0,
      registration_status: 'Deregistered',
      eligibility_status: 'Ineligible',
      placement_status: 'Unplaced',
      current_company: null,
      current_offer_type: null,
      current_category: null,
      current_stipend: 0,
      current_ctc: 0,
      ppo_status: 'Not applicable',
      offer_acceptance: 'Pending',
      joining_status: 'Pending',
      noc_status: 'Not applicable',
      absent_drives_penalty: 0,
      remarks: 'Opted for Higher Studies / Ph.D. abroad; voluntarily deregistered from campus placements.'
    },

    // M.Sc. Computer Science (M.Sc. CS)
    {
      placement_id: 'NFSU26-MSCS-001',
      student_name: 'Manish G. Pillai',
      mobile_number: '+91 98555 66778',
      email_id: 'manish.pillai@nfsu.ac.in',
      course: 'M.Sc. CS',
      batch: '2025–2027',
      cgpa: 9.1,
      registration_status: 'Registered',
      eligibility_status: 'Eligible',
      placement_status: 'FTE only',
      current_company: 'Quick Heal Technologies',
      current_offer_type: 'F',
      current_category: 'A',
      current_stipend: 0,
      current_ctc: 11.5,
      ppo_status: 'Not applicable',
      offer_acceptance: 'Accepted',
      joining_status: 'Pending',
      noc_status: 'Approved',
      absent_drives_penalty: 0,
      remarks: 'A-tier placement. Switching allowed to A+ only.'
    },
    {
      placement_id: 'NFSU26-MSCS-002',
      student_name: 'Ritika S. Ghosh',
      mobile_number: '+91 98666 77889',
      email_id: 'ritika.ghosh@nfsu.ac.in',
      course: 'M.Sc. CS',
      batch: '2025–2027',
      cgpa: 8.3,
      registration_status: 'Registered',
      eligibility_status: 'Eligible',
      placement_status: 'FTE only',
      current_company: 'Wipro Digital Security',
      current_offer_type: 'F',
      current_category: 'B',
      current_stipend: 0,
      current_ctc: 6.5,
      ppo_status: 'Not applicable',
      offer_acceptance: 'Accepted',
      joining_status: 'Pending',
      noc_status: 'Not applicable',
      absent_drives_penalty: 0,
      remarks: 'Category B. Eligible for switching to drives >= 9.75 LPA (1.5x rule).'
    },
    {
      placement_id: 'NFSU26-MSCS-003',
      student_name: 'Faizan Ahmed',
      mobile_number: '+91 98777 88990',
      email_id: 'faizan.ahmed@nfsu.ac.in',
      course: 'M.Sc. CS',
      batch: '2025–2027',
      cgpa: 7.7,
      registration_status: 'Registered',
      eligibility_status: 'Eligible',
      placement_status: 'Unplaced',
      current_company: null,
      current_offer_type: null,
      current_category: null,
      current_stipend: 0,
      current_ctc: 0,
      ppo_status: 'Not applicable',
      offer_acceptance: 'Pending',
      joining_status: 'Pending',
      noc_status: 'Not applicable',
      absent_drives_penalty: 0,
      remarks: 'Pending interview with Cyber Security consultancy.'
    },
    {
      placement_id: 'NFSU26-MSCS-004',
      student_name: 'Shweta Tiwari',
      mobile_number: '+91 98888 99001',
      email_id: 'shweta.tiwari@nfsu.ac.in',
      course: 'M.Sc. CS',
      batch: '2025–2027',
      cgpa: 6.3,
      registration_status: 'Not registered',
      eligibility_status: 'Ineligible',
      placement_status: 'Unplaced',
      current_company: null,
      current_offer_type: null,
      current_category: null,
      current_stipend: 0,
      current_ctc: 0,
      ppo_status: 'Not applicable',
      offer_acceptance: 'Pending',
      joining_status: 'Pending',
      noc_status: 'Not applicable',
      absent_drives_penalty: 0,
      remarks: 'Registration fee and institutional placement form not submitted.'
    }
  ];

  const studentInsert = db.prepare(`
    INSERT INTO students (
      placement_id, student_name, mobile_number, email_id, course, batch, cgpa,
      registration_status, eligibility_status, placement_status,
      current_company, current_offer_type, current_category, current_stipend, current_ctc,
      ppo_status, offer_acceptance, joining_status, noc_status, absent_drives_penalty,
      remarks
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?
    )
  `);

  studentsList.forEach(s => {
    studentInsert.run(
      s.placement_id, s.student_name, s.mobile_number, s.email_id, s.course, s.batch, s.cgpa,
      s.registration_status, s.eligibility_status, s.placement_status,
      s.current_company, s.current_offer_type, s.current_category, s.current_stipend, s.current_ctc,
      s.ppo_status, s.offer_acceptance, s.joining_status, s.noc_status, s.absent_drives_penalty,
      s.remarks
    );
  });

  console.log(`Inserted ${studentsList.length} students across all 5 NFSU courses.`);

  // 2. Insert User Accounts for RBAC
  const userInsert = db.prepare(`
    INSERT INTO users (username, password_hash, full_name, email, role, course_scope, student_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Placement Administrator
  userInsert.run('admin', adminPasswordHash, 'Dr. Rajesh Verma (Head Placement)', 'placement.admin@nfsu.ac.in', 'admin', null, null);

  // Placement Officer
  userInsert.run('officer', officerPasswordHash, 'Mr. Amit Saxena (Placement Officer)', 'amit.saxena@nfsu.ac.in', 'officer', null, null);

  // Course Coordinators
  userInsert.run('coord_cs', coordPasswordHash, 'Prof. Sunita Kulkarni (CS Coordinator)', 'coord.cs@nfsu.ac.in', 'coordinator', 'M.Tech. CS', null);
  userInsert.run('coord_dfis', coordPasswordHash, 'Dr. Hiren Trivedi (DFIS Coordinator)', 'coord.dfis@nfsu.ac.in', 'coordinator', 'M.Sc. DFIS', null);

  // Recruiters
  userInsert.run('recruiter_google', recruiterPasswordHash, 'Google Campus Talent Acquisition', 'campus@google.com', 'recruiter', null, null);
  userInsert.run('recruiter_paloalto', recruiterPasswordHash, 'Palo Alto Networks University Team', 'university@paloaltonetworks.com', 'recruiter', null, null);

  // Student Accounts linked to Student IDs
  const studentAarav = db.prepare("SELECT id FROM students WHERE placement_id = 'NFSU26-DFIS-001'").get();
  const studentRohan = db.prepare("SELECT id FROM students WHERE placement_id = 'NFSU26-DFIS-003'").get();
  const studentDevashish = db.prepare("SELECT id FROM students WHERE placement_id = 'NFSU26-CS-001'").get();
  const studentTanvi = db.prepare("SELECT id FROM students WHERE placement_id = 'NFSU26-CS-004'").get();
  const studentVikram = db.prepare("SELECT id FROM students WHERE placement_id = 'NFSU26-DFIS-005'").get();

  userInsert.run('student_aplus', studentPasswordHash, 'Devashish Sen (Student A+)', 'devashish.sen@nfsu.ac.in', 'student', null, studentDevashish.id);
  userInsert.run('student_b', studentPasswordHash, 'Rohan K. Joshi (Student B)', 'rohan.joshi@nfsu.ac.in', 'student', null, studentRohan.id);
  userInsert.run('student_unplaced', studentPasswordHash, 'Tanvi Saxena (Student Unplaced)', 'tanvi.saxena@nfsu.ac.in', 'student', null, studentTanvi.id);
  userInsert.run('student_absent', studentPasswordHash, 'Vikramaditya Rao (Student Flagged)', 'vikram.rao@nfsu.ac.in', 'student', null, studentVikram.id);

  console.log('Inserted RBAC users: admin, officer, coordinators, recruiters, and students.');

  // 3. Insert Recruitment Drives
  const drivesList = [
    {
      company_name: 'Google Cloud India',
      job_title: 'Cloud Security & Software Engineer',
      category: 'A+',
      offer_type: 'I+F',
      stipend_amount: 110000,
      ctc_lpa: 24.0,
      eligible_courses: JSON.stringify(['M.Tech. CS', 'M.Tech. AIDS', 'B.Tech.-M.Tech. CS', 'M.Sc. DFIS']),
      min_cgpa: 8.5,
      deadline_hours: 24,
      drive_date: '2026-10-18',
      location: 'Virtual / Bangalore Hub',
      status: 'Open',
      description: 'Tier A+ Cloud Security and Core Infrastructure engineering role.'
    },
    {
      company_name: 'Microsoft Cyber Defense',
      job_title: 'Security Operations & AI Engineer',
      category: 'A+',
      offer_type: 'F',
      stipend_amount: 0,
      ctc_lpa: 21.0,
      eligible_courses: JSON.stringify(['M.Tech. CS', 'M.Tech. AIDS', 'B.Tech.-M.Tech. CS']),
      min_cgpa: 8.0,
      deadline_hours: 24,
      drive_date: '2026-10-22',
      location: 'Hyderabad Campus',
      status: 'Upcoming',
      description: 'High-scale defense telemetry and threat intelligence tooling.'
    },
    {
      company_name: 'Palo Alto Networks',
      job_title: 'Threat Intelligence & DFIR Specialist',
      category: 'A+',
      offer_type: 'F',
      stipend_amount: 0,
      ctc_lpa: 18.5,
      eligible_courses: JSON.stringify(['M.Sc. DFIS', 'M.Tech. CS', 'M.Tech. AIDS']),
      min_cgpa: 7.5,
      deadline_hours: 24,
      drive_date: '2026-10-10',
      location: 'Bangalore Hub',
      status: 'Completed',
      description: 'Unit 42 Forensics and Threat Research division.'
    },
    {
      company_name: 'Cisco Systems',
      job_title: 'Network Security Analyst',
      category: 'A',
      offer_type: 'F',
      stipend_amount: 0,
      ctc_lpa: 14.2,
      eligible_courses: JSON.stringify(['M.Tech. CS', 'M.Tech. AIDS', 'B.Tech.-M.Tech. CS', 'M.Sc. CS', 'M.Sc. DFIS']),
      min_cgpa: 7.0,
      deadline_hours: 24,
      drive_date: '2026-10-14',
      location: 'NFSU Gandhinagar Campus',
      status: 'Open',
      description: 'Zero Trust architecture and SOC monitoring engineering.'
    },
    {
      company_name: 'Oracle Financial Services',
      job_title: 'Backend Database Engineer',
      category: 'A',
      offer_type: 'F',
      stipend_amount: 0,
      ctc_lpa: 13.5,
      eligible_courses: JSON.stringify(['M.Tech. CS', 'M.Sc. CS']),
      min_cgpa: 7.5,
      deadline_hours: 24,
      drive_date: '2026-10-08',
      location: 'Pune Tech Center',
      status: 'Completed',
      description: 'Banking transaction security and fault-tolerant distributed DBs.'
    },
    {
      company_name: 'Qualcomm AI Labs',
      job_title: 'Edge AI Research Intern',
      category: 'A',
      offer_type: 'I',
      stipend_amount: 50000,
      ctc_lpa: 11.8,
      eligible_courses: JSON.stringify(['M.Tech. AIDS', 'M.Tech. CS']),
      min_cgpa: 8.0,
      deadline_hours: 24,
      drive_date: '2026-10-12',
      location: 'Bangalore',
      status: 'Completed',
      description: 'On-device neural accelerators and embedded computer vision.'
    },
    {
      company_name: 'Larsen & Toubro Infotech',
      job_title: 'Information Security Engineer',
      category: 'B',
      offer_type: 'F',
      stipend_amount: 0,
      ctc_lpa: 8.5,
      eligible_courses: JSON.stringify(['M.Tech. CS', 'M.Tech. AIDS', 'M.Sc. DFIS', 'M.Sc. CS']),
      min_cgpa: 6.5,
      deadline_hours: 24,
      drive_date: '2026-10-25',
      location: 'Mumbai',
      status: 'Upcoming',
      description: 'Enterprise penetration testing and security auditing.'
    },
    {
      company_name: 'KPMG Cyber Risk Advisory',
      job_title: 'Forensics Advisory Associate',
      category: 'B',
      offer_type: 'F',
      stipend_amount: 0,
      ctc_lpa: 7.5,
      eligible_courses: JSON.stringify(['M.Sc. DFIS', 'M.Sc. CS']),
      min_cgpa: 6.5,
      deadline_hours: 24,
      drive_date: '2026-10-05',
      location: 'Gurugram',
      status: 'Completed',
      description: 'Financial fraud investigation and digital incident triage.'
    },
    {
      company_name: 'CyberX Forensics Lab',
      job_title: 'Digital Evidence Examiner Intern',
      category: 'C',
      offer_type: 'I',
      stipend_amount: 25000,
      ctc_lpa: 4.8,
      eligible_courses: JSON.stringify(['M.Sc. DFIS', 'B.Tech.-M.Tech. CS', 'M.Sc. CS']),
      min_cgpa: 6.0,
      deadline_hours: 24,
      drive_date: '2026-09-28',
      location: 'Gandhinagar',
      status: 'Completed',
      description: 'Disk imaging, mobile forensics extraction and autopsy analysis.'
    }
  ];

  const driveInsert = db.prepare(`
    INSERT INTO drives (
      company_name, job_title, category, offer_type, stipend_amount, ctc_lpa,
      eligible_courses, min_cgpa, deadline_hours, drive_date, location, status, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  drivesList.forEach(d => {
    driveInsert.run(
      d.company_name, d.job_title, d.category, d.offer_type, d.stipend_amount, d.ctc_lpa,
      d.eligible_courses, d.min_cgpa, d.deadline_hours, d.drive_date, d.location, d.status, d.description
    );
  });

  console.log(`Inserted ${drivesList.length} recruitment drives across categories A+, A, B, and C.`);

  // 4. Insert Initial Offers preserving history
  const allDrives = db.prepare('SELECT * FROM drives').all();
  const paloAltoDrive = allDrives.find(d => d.company_name.includes('Palo Alto'));
  const googleDrive = allDrives.find(d => d.company_name.includes('Google'));
  const kpmgDrive = allDrives.find(d => d.company_name.includes('KPMG'));
  const ciscoDrive = allDrives.find(d => d.company_name.includes('Cisco'));

  const offerInsert = db.prepare(`
    INSERT INTO offers (
      student_id, drive_id, company_name, offer_type, category, stipend_amount, ctc_lpa,
      is_off_campus, offer_status, issued_at, expires_at, decision_date, ppo_status, remarks
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date();
  const pastDate = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const future24h = new Date(Date.now() + 18 * 3600 * 1000).toISOString(); // 18 hours left in 24h deadline!

  // Aarav offer (Palo Alto)
  offerInsert.run(
    studentAarav.id, paloAltoDrive.id, 'Palo Alto Networks', 'F', 'A+', 0, 18.5,
    0, 'Accepted', pastDate, pastDate, pastDate, 'Not applicable', 'Accepted within 24 hours of release.'
  );

  // Devashish offer (Google)
  offerInsert.run(
    studentDevashish.id, googleDrive.id, 'Google Cloud India', 'I+F', 'A+', 110000, 24.0,
    0, 'Accepted', pastDate, pastDate, pastDate, 'Accepted', 'Dual internship + FTE offer confirmed.'
  );

  // Rohan offer (KPMG)
  offerInsert.run(
    studentRohan.id, kpmgDrive.id, 'KPMG Cyber Risk Advisory', 'F', 'B', 0, 7.5,
    0, 'Accepted', pastDate, pastDate, pastDate, 'Not applicable', 'Offer accepted. Eligible for B 1.5x switching.'
  );

  // Pending offer for Tanvi (Simulating active 24h countdown!)
  offerInsert.run(
    studentTanvi.id, ciscoDrive.id, 'Cisco Systems', 'F', 'A', 0, 14.2,
    0, 'Pending', now.toISOString(), future24h, null, 'Not applicable', 'Active offer pending student decision within 24 hours.'
  );

  // 5. Insert Attendance Records (including absenteeism flag)
  const attendanceInsert = db.prepare(`
    INSERT INTO recruitment_attendance (drive_id, student_id, activity_type, attended, excused, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  attendanceInsert.run(ciscoDrive.id, studentDevashish.id, 'Pre-Placement Talk', 1, 0, 'Attended');
  attendanceInsert.run(ciscoDrive.id, studentAarav.id, 'Pre-Placement Talk', 1, 0, 'Attended');
  attendanceInsert.run(ciscoDrive.id, studentRohan.id, 'Pre-Placement Talk', 1, 0, 'Attended');
  // Vikram was absent without excuse:
  attendanceInsert.run(ciscoDrive.id, studentVikram.id, 'Pre-Placement Talk', 0, 0, 'Absent without notification. Policy Clause 3.2 invoked.');

  // 6. Insert Policy Exception for Vikram
  const exceptionInsert = db.prepare(`
    INSERT INTO policy_exceptions (student_id, drive_id, exception_type, reason, status, reviewed_by, review_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  exceptionInsert.run(
    studentVikram.id, ciscoDrive.id, 'ABSENTEEISM',
    'Had severe typhoid fever; medical certificate submitted from NFSU Health Centre.',
    'Pending', null, 'Under review by Placement Administrator.'
  );

  // 7. Seed Initial Tamper-Evident Audit Logs
  logEvent({
    actorUsername: 'admin',
    actorRole: 'admin',
    action: 'SYSTEM_INITIALIZATION',
    entityType: 'SYSTEM',
    entityId: 'ROOT',
    afterState: { message: 'NFSU Placement Portal 2026-27 schema & seed records initialized.' },
    ipAddress: '127.0.0.1'
  });

  logEvent({
    actorUsername: 'officer',
    actorRole: 'officer',
    action: 'RECORD_OFFER',
    entityType: 'OFFER',
    entityId: '1',
    afterState: { student: 'Aarav V. Sharma', company: 'Palo Alto Networks', ctc: 18.5, category: 'A+' },
    ipAddress: '10.0.4.15'
  });

  logEvent({
    actorUsername: 'officer',
    actorRole: 'officer',
    action: 'RECORD_OFFER',
    entityType: 'OFFER',
    entityId: '2',
    afterState: { student: 'Devashish Sen', company: 'Google Cloud India', ctc: 24.0, category: 'A+' },
    ipAddress: '10.0.4.15'
  });

  logEvent({
    actorUsername: 'officer',
    actorRole: 'officer',
    action: 'ATTENDANCE_FLAG',
    entityType: 'STUDENT',
    entityId: String(studentVikram.id),
    afterState: { violation: 'ABSENTEEISM', penalty: '3 drives ban', drive: 'Cisco Systems' },
    ipAddress: '10.0.4.15'
  });

  console.log('Cryptographic audit trail initialized with SHA-256 hash chaining.');
}

if (require.main === module) {
  seedDatabase();
  console.log('Database seeding finished successfully.');
}

module.exports = { seedDatabase };
