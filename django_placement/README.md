# NFSU Student Placement Management System (Policy-Driven Django Monolith)

[![Django](https://img.shields.io/badge/Django-5.2-green.svg)](https://www.djangoproject.com/)
[![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3-purple.svg)](https://getbootstrap.com/)
[![Security](https://img.shields.io/badge/RBAC-Enforced-red.svg)]()
[![Audit](https://img.shields.io/badge/Audit_Trail-SHA--256_Chained-blue.svg)]()
[![Tests](https://img.shields.io/badge/Tests-19%2F19_Passed_(100%25)-brightgreen.svg)]()

A complete, enterprise-grade, policy-driven **NFSU Student Placement Management System** architected for the National Forensic Sciences University (NFSU). Built with a secure Django monolithic architecture, responsive Bootstrap 5 interface, server-side Role-Based Access Control (RBAC), cryptographic audit trail, and centralized Placement Eligibility Engine enforcing institutional placement guidelines (Clause 3.2).

---

## 1. System Architecture & Directory Structure

```
django_placement/
├── config/                  # Project configuration, settings, root URL router
│   ├── settings.py          # Security settings, dual SQLite/MySQL engine, RBAC context processors
│   ├── urls.py              # Central routing for all domain apps & media
│   └── wsgi.py
├── accounts/                # Authentication, UserProfile, RBAC decorators, rate-limiting & lockouts
│   ├── models.py            # UserProfile with 5 mandatory roles & auto-lockout tracker
│   ├── forms.py             # Secure forms with CSRF, password validation
│   ├── decorators.py        # @role_required decorator returning 403 on forbidden access
│   ├── views.py             # Sign in, sign out, provisioning, status toggles
│   └── tests.py             # Auth & RBAC test suite
├── academics/               # Schools, Courses, Student Academic Records
│   ├── models.py            # Department, Course, StudentAcademicRecord (CGPA, backlogs, penalties)
│   ├── views.py             # Course Coordinator scoped record verification
│   └── urls.py
├── companies/               # Corporate partner directory & verification workflow
│   ├── models.py            # Company, RecruiterMembership (anti-IDOR company associations)
│   ├── views.py             # Placement Officer company approval & recruiter portals
│   └── urls.py
├── placements/              # Placement drives, policy calibration, eligibility engine
│   ├── models.py            # PlacementPolicy, PlacementDrive (Tiers A+, A, B, C), DriveAuthorization
│   ├── services.py          # PlacementEligibilityEngine evaluating Clause 3.2 rules
│   ├── views.py             # Drive creation, review, and publication
│   └── tests.py             # Policy & workflow automated test suite
├── applications/            # Student application pipeline & offer lifecycle
│   ├── models.py            # Application (unique constraint), Interview, Offer (24h deadline)
│   ├── views.py             # Apply, candidate review, interview scheduling, offer response
│   └── urls.py
├── auditlog/                # Cryptographic security event logging
│   ├── models.py            # AuditLog with SHA-256 hash chaining (blockchain-style tamper detection)
│   ├── services.py          # log_security_event() and verify_audit_integrity()
│   ├── views.py             # Audit trail inspection & tamper validation console
│   └── urls.py
├── dashboard/               # Role-specific consoles & institutional reporting
│   ├── views.py             # Dashboards for Admin, Officer, Coordinator, Recruiter, Student + CSV export
│   └── urls.py
├── templates/               # Responsive university-branded Bootstrap 5 templates
│   ├── base.html            # Top banner, responsive navbar, role badges, alerts, footer
│   ├── accounts/            # login.html, user_list.html, create_user.html, profile.html
│   ├── dashboard/           # admin, officer, coordinator, recruiter, student dashboards & reports
│   ├── placements/          # drive_list.html, drive_detail.html, create_drive.html, policy_config.html
│   ├── academics/           # student_records.html, verify_student.html
│   ├── companies/           # company_list.html, company_detail.html
│   ├── applications/        # my_applications.html, applicant_list.html, respond_offer.html
│   └── auditlog/            # audit_list.html (tamper verification UI)
├── requirements.txt         # Production dependencies (Django, PyMySQL, python-dotenv)
├── .env.example             # Environment template for production MySQL / SQLite
└── manage.py
```

---

## 2. Mandatory User Roles & Evaluation Credentials

The system provides 5 distinct application personas pre-seeded for immediate evaluation:

| Role | Username | Password | Profile / Scenario Description |
|---|---|---|---|
| **Admin** | `admin` | `Admin@NFSU2026!` | Prof. Dr. Vikram S. Mehta. Full system governance, policy calibration, account management, audit review. |
| **Placement Officer** | `officer` | `Officer@NFSU2026!` | Dr. Ananya Sharma. Company approval, drive publication, recruitment results, university reports. |
| **Course Coordinator** | `coord_dfis` | `Coord@NFSU2026!` | Dr. Rajeshwar Patel. Scoped strictly to M.Sc. DFIS students. Verifies academic credentials. |
| **Recruiter** | `recruiter_google` | `Recruiter@NFSU2026!` | Sarah Jenkins (Google). Scoped to Google drives. Candidate shortlisting, scheduling, offers. |
| **Student (Tier A+)** | `student_aplus` | `Student@NFSU2026!` | Aarav Sharma (CGPA 9.20). Placed at Microsoft (₹22 LPA). **Locked from further drives (Clause 3.2.1)**. |
| **Student (Tier B)** | `student_b` | `Student@NFSU2026!` | Pooja Patel (CGPA 8.40). Placed in Tier B (₹7 LPA). **Eligible only for >= 1.5x CTC (Clause 3.2.2)**. |
| **Student (Unplaced)** | `student_unplaced` | `Student@NFSU2026!` | Rohan Verma (CGPA 8.00, 0 backlogs). **Eligible to apply for Google drive (Min CGPA 7.0)**. |
| **Student (Ineligible)** | `student_ineligible` | `Student@NFSU2026!` | Neha Joshi (CGPA 6.00). **Denied eligibility for Google drive with clear explanation**. |
| **Student (Disciplined)** | `student_absent` | `Student@NFSU2026!` | Kunal Mehra (CGPA 8.10). **Banned from 2 upcoming drives for unexcused interview absence**. |

---

## 3. Mandatory Permission Matrix

| Feature | Admin | Placement Officer | Coordinator | Recruiter | Student |
|---|---|---|---|---|---|
| **Manage users & roles** | Full | No (403) | No (403) | No (403) | No (403) |
| **Configure placement policy** | Full | View | View | No (403) | No (403) |
| **Manage companies** | Full | Approve / Manage | View | Own Company Only | No (403) |
| **Create / Publish drives** | Full | Approve & Publish | No (403) | Submit Request | No (403) |
| **Verify student records** | Full | Yes | Assigned Courses Only | No (403) | Own Profile |
| **View eligible candidates** | Full | Yes | Assigned Courses Only | Own Drives Only | Own Eligibility |
| **Submit application** | No | No | No | No | Yes |
| **Shortlist candidates** | No | Yes | No | Own Drives Only | No |
| **Schedule interviews** | Full | Yes | View | Own Drives Only | View Own |
| **Issue placement offers** | Full | Yes | View | Own Drives Only | Respond (24h) |
| **Download CSV reports** | Full | Placement Reports | Assigned Courses | No | No |
| **Cryptographic audit logs** | Full + Verify | Limited | No (403) | No (403) | No (403) |

---

## 4. Quickstart: Installation & Execution (Windows 11 PowerShell)

### Prerequisites
- Python 3.11+ installed and accessible via PATH.
- Git.

### Step 1: Open PowerShell and Navigate to the Project
```powershell
cd "e:\Coding Event\django_placement"
```

### Step 2: Activate the Virtual Environment
```powershell
..\venv\Scripts\Activate.ps1
```
*(Or create a new venv: `python -m venv venv; .\venv\Scripts\Activate.ps1; pip install -r requirements.txt`)*

### Step 3: Run Database Migrations
```powershell
python manage.py migrate
```

### Step 4: Seed Realistic Evaluation Data
```powershell
python manage.py seed_nfsu_data
```

### Step 5: Run the Automated Test Suite (19 Tests)
```powershell
python manage.py test
```
*Expected Output:* `Ran 19 tests in ~48s ... OK (100% Passed)`.

### Step 6: Start the Development Server
```powershell
python manage.py runserver 127.0.0.1:8000
```
Open your browser at: **[http://127.0.0.1:8000](http://127.0.0.1:8000)**.

---

## 5. Five-Minute Final Demonstration Script

### Act 1: Authentication & Institutional RBAC
1. Open `http://127.0.0.1:8000/accounts/login/`.
2. Notice the pre-rendered Evaluation Credentials table and lockout notification.
3. Attempt 5 incorrect logins for an account to demonstrate rate-limiting auto-lockout.
4. Sign in as `admin` / `Admin@NFSU2026!`.
5. Navigate to **User Management** (`/accounts/users/`), provision a new user, or toggle status.

### Act 2: Placement Officer Approvals & Drive Publishing
1. Sign in as `officer` / `Officer@NFSU2026!`.
2. On the **Placement Officer Console** (`/dashboard/officer/`), view the pending approvals queue.
3. Open **Companies** (`/companies/`) -> click on *CyberX Forensic Solutions* (Pending) -> click **Approve Registration**.
4. Open **Placement Drives** (`/placements/`) -> verify published drives or create a new campus drive.

### Act 3: Centralized Policy Evaluation (CGPA 8.0 vs 6.0)
1. Sign in as `student_unplaced` (CGPA 8.00). Open the Google Drive (Min CGPA 7.00).
   - The Policy Engine displays a green banner: `Eligible under NFSU Placement Policy`.
   - Click **Apply for this Drive**. The application is registered successfully.
   - Attempt to click Apply again -> system blocks duplicate submission with audit warning.
2. Sign in as `student_ineligible` (CGPA 6.00). Open the same Google Drive:
   - The Policy Engine displays a red banner: `Ineligible: Student CGPA (6.00) is below required threshold of 7.00`.
   - The Apply button is disabled. Attempting a direct POST triggers server-side rejection.

### Act 4: Clause 3.2 Advanced Placement Rules (Tier A+ & Tier B 1.5x)
1. Sign in as `student_aplus` (Placed in Tier A+ at ₹22 LPA):
   - Open any active drive.
   - Result: Blocked under Clause 3.2.1: `Category A+ offer holders are completely out of the campus placement process`.
2. Sign in as `student_b` (Placed in Tier B at ₹7 LPA):
   - Open Cisco Drive (₹9.5 LPA): Blocked under Clause 3.2.2 because ₹9.5 LPA < 1.5 * ₹7.0 = ₹10.5 LPA.
   - Open Google Drive (₹18.0 LPA): Eligible because ₹18.0 LPA >= ₹10.5 LPA!
   - Review pending offer: Student receives notice of mandatory 24-hour acceptance window.

### Act 5: Course Coordinator Scoping & Verification
1. Sign in as `coord_dfis` / `Coord@NFSU2026!`.
2. The Coordinator Console displays only M.Sc. DFIS students.
3. Review an unverified student -> click **Review & Verify** -> approve credentials.
4. Attempt to access a student record belonging to an unassigned department -> server returns **403 Forbidden**.

### Act 6: Recruiter Candidate Pipeline & IDOR Defense
1. Sign in as `recruiter_google` / `Recruiter@NFSU2026!`.
2. The recruiter sees only Google drives and candidates.
3. Change application status to *Shortlisted* or schedule an interview round.
4. Attempt to change the URL to view a Cisco drive -> server detects cross-company IDOR and blocks with **403 Forbidden**.

### Act 7: Tamper-Evident SHA-256 Audit Trail
1. Sign in as `admin`.
2. Open **Audit Trail** (`/auditlog/`).
3. Click **Verify Cryptographic Chain** button:
   - Evaluates all sequential hashes from genesis anchor forward.
   - Displays: `Cryptographic Integrity Verified (100% Tamper-Free)`.
4. Click **Export Audit CSV** to download a verifiable compliance report.

---

## 6. Automated Test Suite Verification

The automated test suite runs in an isolated SQLite memory database:

```powershell
python manage.py test
```

### Test Coverage Summary:
- `test_valid_login`: Successful authentication and session establishment.
- `test_invalid_login`: Rejection with security error.
- `test_account_lockout_after_five_failed_attempts`: 15-minute temporary lockout after 5 consecutive failures.
- `test_anonymous_access_redirects_to_login`: Anonymous users prevented from accessing private routes.
- `test_unauthorized_access_to_admin_dashboard_returns_403`: Role checks return 403 on unprivileged requests.
- `test_privilege_escalation_blocked_on_user_provisioning`: Non-admin users cannot provision accounts.
- `test_eligible_student_passes_policy_evaluation`: CGPA 8.0 student passes 7.0 threshold.
- `test_ineligible_student_fails_with_clear_reason`: CGPA 6.0 student rejected with understandable explanation.
- `test_tier_a_plus_placement_freeze_clause_3_2_1`: Tier A+ placed student locked from further drives.
- `test_tier_b_1_5x_multiplier_clause_3_2_2`: Tier B 1.50x upgrade rule verified.
- `test_absenteeism_ban_blocks_application`: Unexcused interview absence ban enforced.
- `test_successful_application_submission`: Application stored with policy version anchor.
- `test_duplicate_application_prevention`: Rejects second application for the same drive.
- `test_application_after_deadline_rejected`: Post-deadline submissions rejected.
- `test_recruiter_cross_company_idor_blocked_with_403`: Cross-company IDOR blocked.
- `test_coordinator_unassigned_course_access_blocked_with_403`: Coordinator scoped strictly to assigned programmes.
- `test_policy_change_by_non_admin_blocked`: Placement Officer prohibited from altering global policies.
- `test_cryptographic_audit_trail_integrity`: SHA-256 blockchain hash chaining verified.
- `test_file_upload_validation_rejects_non_pdf`: Malicious/executable uploads blocked; only PDF allowed.

---

## 7. Production MySQL Configuration

To switch from the default development SQLite database to a production MySQL / MariaDB (or XAMPP) server:

1. Create a database in MySQL:
   ```sql
   CREATE DATABASE nfsu_placement CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
2. In `.env`:
   ```ini
   DB_ENGINE=mysql
   DB_NAME=nfsu_placement
   DB_USER=root
   DB_PASSWORD=your_password
   DB_HOST=127.0.0.1
   DB_PORT=3306
   ```
3. Run migrations on MySQL:
   ```powershell
   python manage.py migrate
   python manage.py seed_nfsu_data
   ```

---

## 8. Cryptographic Tamper-Resistance Architecture

Each entry in `AuditLog` stores:
- `prev_hash`: The SHA-256 hash of the immediately preceding audit record.
- `current_hash`: `SHA256(prev_hash | timestamp | actor | role | action | target | outcome | ip | details)`.

If any row in the database is manually modified or deleted via direct database manipulation, the hash chain breaks from that row forward. The `verify_audit_integrity()` service detects the exact record ID where tampering occurred.

---

&copy; 2026 National Forensic Sciences University (NFSU). Training & Placement Directorate.
