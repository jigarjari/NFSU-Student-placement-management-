# NFSU Student Placement Management System (Session 2026–27)
### Centralized, Secure & Policy-Driven Web Application

> **National Forensic Sciences University (NFSU)**  
> *An Institution of National Importance under Ministry of Home Affairs, Government of India*

---

## 📌 Overview

This centralized, secure, policy-driven web application is built for the **Placement Cell of NFSU** to manage recruitment activity in accordance with the **Student Placement Guidelines for the 2026–27 Placement Session**. 

The system automates policy enforcement, eliminates manual data-entry discrepancies, flags policy conflicts, prevents unauthorized modifications, and produces reliable, course-wise placement statistics. Due to the sensitive nature of compensation packages and personal contact data, cybersecurity, privacy-by-design, and tamper-evident audit logging are core architectural foundations.

---

## 🎓 Programmes Covered
1. **M.Tech. Computer Science** (`M.Tech. CS`)
2. **M.Tech. Artificial Intelligence and Data Science** (`M.Tech. AIDS`)
3. **B.Tech.–M.Tech. Computer Science and Engineering** (`B.Tech.-M.Tech. CS`)
4. **M.Sc. Computer Science** (`M.Sc. CS`)
5. **M.Sc. Digital Forensics and Information Security** (`M.Sc. DFIS`)

---

## ⚡ Core Features & Deliverables

1. **Student Database Management**:
   - Course-wise filtering across all 5 programmes.
   - Authorized CRUD + controlled archiving/restoration.
   - Placement history preservation (events & offers timeline, not overwriting).
   - Controlled CSV bulk import with schema validation & role-masked CSV export.
   - Reject duplicate Placement IDs.

2. **NFSU Placement Policy Automation Engine (Section 3.2)**:
   - **Category A+ ($\ge$ ₹16 LPA)**: No-switching rule enforced; selected students are locked out from further placement drives.
   - **Category A (₹10–16 LPA)**: Upgrades permitted **only to Category A+ companies** ($\ge$ ₹16 LPA).
   - **Category B (₹6–10 LPA)**: Upgrades permitted **only where target package $\ge 1.5 \times$ current package**.
   - **Category C (Below ₹6 LPA)**: Upgrades allowed to higher categories (B, A, A+). Lateral C-to-C switches blocked.
   - **Offer-Type Rules**:
     - *Internship only (I)*: Cannot apply for another internship-only role; FTE and I+F remain open.
     - *FTE only (F)*: Cannot apply for another FTE-only role; internships remain open.
     - *Internship + PPO/FTE (I+F)*: Placement process frozen across all organizations.
   - **Interactive Policy Simulator**: Test any candidate and target offer with instant real-time verdicts (`ALLOWED`, `BLOCKED`, `REFERRED FOR REVIEW`) with specific policy clauses cited.

3. **Recruitment, Attendance & Offers**:
   - Attendance tracking across Pre-Placement Talks (PPT), Online Assessments, Technical Interviews, and HR Interviews.
   - **3-Drive Absenteeism Ban**: Unexcused recruitment absence triggers an automatic 3-drive exclusion penalty.
   - **Emergency Exception Appeals**: Student petitions reviewed by Placement Admin to grant medical/emergency waivers.
   - **24-Hour Acceptance Window**: Real-time animated countdown timers on active offers.
   - Institutional NOC Request and PPO Conversion workflows.

4. **Executive Dashboard & Reporting (Section 3.3)**:
   - Accurate statistical engine separating annual FTE CTC (LPA) from monthly internship stipends (₹/mo).
   - Exact mathematical **median FTE CTC**, highest CTC, average CTC, and placement rate %.
   - Unique placed students counted separately from total volume of offers received.
   - Course-wise outcomes breakdown across all 5 programmes.

5. **Tamper-Evident SHA-256 Audit Trail**:
   - Every sensitive action is linked in a continuous SHA-256 hash chain:  
     $$\text{Hash}_i = \text{SHA-256}(\text{Hash}_{i-1} \parallel \text{Timestamp} \parallel \text{Actor} \parallel \text{Action} \parallel \text{Entity} \parallel \text{Diff} \parallel \text{IP})$$
   - Real-time cryptographic chain integrity verification tool.
   - Forensic Tamper Demonstration to show out-of-band manipulation detection.

6. **Automated Security & Policy Test Lab (Deliverable 7)**:
   - Built-in test runner executing 18 automated test cases covering switching rules, offer types, absenteeism bans, IDOR attacks, privilege escalation, SQL injection, ID block conditions, and cryptographic integrity.
   - **Pass Rate: 18 / 18 Passed (100%)**.

7. **Encrypted Backup & Recovery**:
   - AES-256-CBC encrypted database snapshots with tested restoration procedures.

---

## 🔑 Login Credentials & Mandatory 2FA Flow

> **Mandatory Two-Factor Authentication (2FA):** Every sign-in requires institutional credentials (Step 1) followed by a 6-digit cryptographic Email OTP verification (Step 2). For evaluation convenience, the dispatched 6-digit OTP code is prominently displayed in the on-screen Institutional Email Dispatcher notification banner as well as logged to the console. Direct entry without 2FA validation is strictly blocked.

| Role / Persona | Username | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **👑 Placement Administrator** | `admin` | `Admin@NFSU2026` | Full administrative access, audit logs, policy config, backups |
| **📋 Placement Officer** | `officer` | `Officer@NFSU2026` | Student database, post drives, issue offers, attendance logging |
| **🔍 Coordinator (DFIS)** | `coord_dfis` | `Coord@NFSU2026` | Scoped to M.Sc. Digital Forensics and Information Security |
| **💻 Coordinator (CS)** | `coord_cs` | `Coord@NFSU2026` | Scoped to M.Tech. Computer Science |
| **🏢 Google Recruiter** | `recruiter_google` | `Recruiter@NFSU2026` | Post recruitment drives, view applicant shortlists |
| **🎓 Student (A+ Tier)** | `student_aplus` | `Student@NFSU2026` | Devashish Sen (Google ₹24 LPA offer - A+ locked) |
| **🎓 Student (B Tier)** | `student_b` | `Student@NFSU2026` | Rohan K. Joshi (KPMG ₹7.5 LPA offer - 1.5x rule active) |
| **🎓 Student (Unplaced)** | `student_unplaced` | `Student@NFSU2026` | Tanvi Saxena (Pending Cisco offer with 24h timer) |
| **⚠️ Student (Flagged)** | `student_absent` | `Student@NFSU2026` | Vikramaditya Rao (Excluded from next 3 drives under Clause 3.2) |

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v18+ or v22 LTS recommended)
- Git

### Installation
```bash
# Clone the repository
git clone https://github.com/jigarjari/NFSU-Student-placement-management-.git

# Navigate into the project directory
cd NFSU-Student-placement-management-

# Install dependencies
npm install

# Seed the database with realistic candidates, drives, and audit logs
npm run seed

# Start the application
npm start
# or: npm run dev
```

### Accessing the Portal
Open your web browser and navigate to:
```
http://localhost:3000
```

---

## 📁 Repository Structure

```
NFSU-Student-placement-management-/
├── db/
│   ├── database.js          # SQLite schema initialization with parameterized queries
│   └── seed.js              # Realistic seed data across all 5 programmes
├── services/
│   ├── policyEngine.js      # NFSU 2026-27 Policy Engine (Switching, categories, I/F/I+F)
│   ├── auditLogger.js       # Tamper-evident SHA-256 hash-chained audit logging service
│   └── statisticsService.js # Accurate median, average, highest CTC, and separated stipends
├── routes/
│   ├── authMiddleware.js    # JWT & RBAC authorization middleware
│   ├── authRoutes.js        # Login, MFA verification, session checks
│   ├── studentRoutes.js     # Student CRUD, course filtering, IDOR protection, CSV import/export
│   ├── driveRoutes.js       # Recruitment drives & 3-drive absenteeism ban enforcement
│   ├── offerRoutes.js       # Offer management, 24-hr countdown deadlines, PPO, NOC
│   ├── policyRoutes.js      # Policy simulator & emergency exception reviews
│   ├── analyticsRoutes.js   # Programme-wise and university placement statistics
│   ├── auditRoutes.js       # SHA-256 audit ledger & forensic tamper simulation
│   ├── testRoutes.js        # Automated security & policy test runner (13 test cases)
│   └── backupRoutes.js      # AES-256 encrypted backup and restore validator
├── public/
│   ├── index.html           # Institutional NFSU single-page application
│   ├── css/
│   │   ├── styles.css       # NFSU institutional design system & theme tokens
│   │   └── components.css   # Tables, KPI cards, countdown timers, badges
│   └── js/
│       ├── api.js           # API client with JWT handling
│       ├── auth.js          # Auth manager & role-based UI views
│       ├── dashboard.js     # Analytics and course breakdown charts
│       ├── students.js      # Student registry table & history inspector
│       ├── drives.js        # Drives cards & attendance recorder
│       ├── offers.js        # Offers table with 24-hr countdown ticker
│       ├── policy.js        # Policy simulator widget
│       ├── audit.js         # Cryptographic audit inspector
│       ├── securityLab.js   # Automated test suite controller
│       └── app.js           # Main application coordinator
├── docs/
│   └── TECHNICAL_DOCUMENTATION.md # Detailed architecture, schema diagrams, and security specs
├── package.json
└── README.md
```

---

## 📄 Documentation
For detailed architectural documentation, ER diagrams, cybersecurity controls, and test suite breakdowns, refer to:
- [`docs/TECHNICAL_DOCUMENTATION.md`](docs/TECHNICAL_DOCUMENTATION.md)
