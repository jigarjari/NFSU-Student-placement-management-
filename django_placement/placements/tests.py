from decimal import Decimal
from datetime import timedelta
from django.test import TestCase, Client
from django.contrib.auth.models import User
from django.utils import timezone
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile

from accounts.models import UserProfile, UserRole
from academics.models import Department, Course, StudentAcademicRecord, VerificationStatus, PlacementStatus, CategoryTier
from companies.models import Company, CompanyApprovalStatus, RecruiterMembership
from placements.models import PlacementPolicy, PlacementDrive, DriveStatus, OfferType
from placements.services import PlacementEligibilityEngine
from applications.models import Application, ApplicationStatus
from auditlog.models import AuditLog
from auditlog.services import verify_audit_integrity


class PlacementPolicyAndWorkflowTests(TestCase):
    def setUp(self):
        self.client = Client()

        # Policy
        self.policy = PlacementPolicy.objects.create(
            version="2026-TEST.v1",
            tier_a_plus_min=Decimal('16.00'),
            tier_a_min=Decimal('10.00'),
            tier_b_min=Decimal('6.00'),
            tier_b_switching_multiplier=Decimal('1.50'),
            absenteeism_penalty_drives=3,
            offer_acceptance_window_hours=24,
            is_active=True
        )

        # Department & Courses
        self.dept = Department.objects.create(name="Cyber Security", code="CS")
        self.coord_user = User.objects.create_user(username='coord_cs', password='Pass123!')
        UserProfile.objects.create(user=self.coord_user, role=UserRole.COORDINATOR)
        
        self.course_dfis = Course.objects.create(name="M.Sc. DFIS", code="MSC_DFIS", department=self.dept, coordinator=self.coord_user)
        self.course_other = Course.objects.create(name="Other Course", code="OTHER", department=self.dept)

        # Companies
        self.company_a = Company.objects.create(name="Alpha Corp", contact_email="hr@alpha.com", approval_status=CompanyApprovalStatus.APPROVED)
        self.company_b = Company.objects.create(name="Beta Corp", contact_email="hr@beta.com", approval_status=CompanyApprovalStatus.APPROVED)

        # Recruiter for Company A
        self.recruiter_a = User.objects.create_user(username='recruiter_a', password='Pass123!')
        UserProfile.objects.create(user=self.recruiter_a, role=UserRole.RECRUITER)
        RecruiterMembership.objects.create(user=self.recruiter_a, company=self.company_a)

        # Placement Drives
        self.drive_alpha = PlacementDrive.objects.create(
            company=self.company_a,
            job_title="Security Analyst",
            offer_type=OfferType.FTE,
            category=CategoryTier.A_PLUS,
            ctc_lpa=Decimal('18.00'),
            min_cgpa=Decimal('7.00'),
            max_active_backlogs=0,
            deadline=timezone.now() + timedelta(days=5),
            drive_date=(timezone.now() + timedelta(days=7)).date(),
            status=DriveStatus.PUBLISHED,
            created_by=self.recruiter_a
        )
        self.drive_alpha.eligible_courses.set([self.course_dfis])

        self.drive_beta = PlacementDrive.objects.create(
            company=self.company_b,
            job_title="Junior PenTester",
            offer_type=OfferType.FTE,
            category=CategoryTier.B,
            ctc_lpa=Decimal('8.00'),
            min_cgpa=Decimal('6.00'),
            max_active_backlogs=0,
            deadline=timezone.now() + timedelta(days=5),
            drive_date=(timezone.now() + timedelta(days=7)).date(),
            status=DriveStatus.PUBLISHED,
            created_by=self.coord_user
        )
        self.drive_beta.eligible_courses.set([self.course_dfis])

        # Students
        # Student 1: CGPA 8.0, 0 backlogs, verified (Should be ELIGIBLE for drive_alpha)
        self.s1_user = User.objects.create_user(username='student_8', password='StudentPass123!')
        UserProfile.objects.create(user=self.s1_user, role=UserRole.STUDENT)
        self.s1_record = StudentAcademicRecord.objects.create(
            user=self.s1_user, enrollment_number="S001", course=self.course_dfis,
            cgpa=Decimal('8.00'), active_backlogs=0, verification_status=VerificationStatus.VERIFIED
        )

        # Student 2: CGPA 6.0, verified (Should be INELIGIBLE for drive_alpha requiring 7.0)
        self.s2_user = User.objects.create_user(username='student_6', password='StudentPass123!')
        UserProfile.objects.create(user=self.s2_user, role=UserRole.STUDENT)
        self.s2_record = StudentAcademicRecord.objects.create(
            user=self.s2_user, enrollment_number="S002", course=self.course_dfis,
            cgpa=Decimal('6.00'), active_backlogs=0, verification_status=VerificationStatus.VERIFIED
        )

        # Student 3: Tier A+ placed student (Frozen under Clause 3.2.1)
        self.s3_user = User.objects.create_user(username='student_placed_aplus', password='StudentPass123!')
        UserProfile.objects.create(user=self.s3_user, role=UserRole.STUDENT)
        self.s3_record = StudentAcademicRecord.objects.create(
            user=self.s3_user, enrollment_number="S003", course=self.course_dfis,
            cgpa=Decimal('9.00'), active_backlogs=0, verification_status=VerificationStatus.VERIFIED,
            current_placement_status=PlacementStatus.PLACED_FTE, current_tier=CategoryTier.A_PLUS,
            current_ctc=Decimal('20.00')
        )

        # Student 4: Tier B placed student at 7 LPA
        self.s4_user = User.objects.create_user(username='student_placed_b', password='StudentPass123!')
        UserProfile.objects.create(user=self.s4_user, role=UserRole.STUDENT)
        self.s4_record = StudentAcademicRecord.objects.create(
            user=self.s4_user, enrollment_number="S004", course=self.course_dfis,
            cgpa=Decimal('8.50'), active_backlogs=0, verification_status=VerificationStatus.VERIFIED,
            current_placement_status=PlacementStatus.PLACED_FTE, current_tier=CategoryTier.B,
            current_ctc=Decimal('7.00')
        )

        # Student 5: Banned due to interview absenteeism
        self.s5_user = User.objects.create_user(username='student_absentee', password='StudentPass123!')
        UserProfile.objects.create(user=self.s5_user, role=UserRole.STUDENT)
        self.s5_record = StudentAcademicRecord.objects.create(
            user=self.s5_user, enrollment_number="S005", course=self.course_dfis,
            cgpa=Decimal('8.50'), active_backlogs=0, verification_status=VerificationStatus.VERIFIED,
            absent_penalty_drives=2
        )

    def test_eligible_student_passes_policy_evaluation(self):
        """Scenario 3: Student with CGPA 8.0 passes policy requiring minimum 7.0."""
        eval_res = PlacementEligibilityEngine.evaluate(self.s1_record, self.drive_alpha)
        self.assertTrue(eval_res['is_eligible'])
        self.assertIn('criteria', eval_res['reason'].lower())

    def test_ineligible_student_fails_with_clear_reason(self):
        """Scenario 4: Student with CGPA 6.0 denied with understandable reason."""
        eval_res = PlacementEligibilityEngine.evaluate(self.s2_record, self.drive_alpha)
        self.assertFalse(eval_res['is_eligible'])
        self.assertIn('cgpa', eval_res['reason'].lower())

    def test_tier_a_plus_placement_freeze_clause_3_2_1(self):
        """Students placed in Tier A+ are locked from further placement drives."""
        eval_res = PlacementEligibilityEngine.evaluate(self.s3_record, self.drive_alpha)
        self.assertFalse(eval_res['is_eligible'])
        self.assertIn('Category A+', eval_res['reason'])

    def test_tier_b_1_5x_multiplier_clause_3_2_2(self):
        """Tier B placed student can upgrade to 18 LPA (>= 1.5*7=10.5), but not 8 LPA (< 10.5)."""
        # Drive Alpha is 18 LPA: 18.0 >= 10.5 -> ELIGIBLE
        eval_alpha = PlacementEligibilityEngine.evaluate(self.s4_record, self.drive_alpha)
        self.assertTrue(eval_alpha['is_eligible'])

        # Drive Beta is 8 LPA: 8.0 < 10.5 -> INELIGIBLE
        eval_beta = PlacementEligibilityEngine.evaluate(self.s4_record, self.drive_beta)
        self.assertFalse(eval_beta['is_eligible'])
        self.assertIn('1.50x', eval_beta['reason'])

    def test_absenteeism_ban_blocks_application(self):
        """Student with active absenteeism penalties cannot apply."""
        eval_res = PlacementEligibilityEngine.evaluate(self.s5_record, self.drive_alpha)
        self.assertFalse(eval_res['is_eligible'])
        self.assertIn('absence', eval_res['reason'].lower())

    def test_successful_application_submission(self):
        """Scenario 5: Eligible student applies successfully."""
        self.client.login(username='student_8', password='StudentPass123!')
        response = self.client.post(reverse('applications:apply_drive', args=[self.drive_alpha.id]))
        self.assertEqual(response.status_code, 302)
        self.assertTrue(Application.objects.filter(student=self.s1_user, drive=self.drive_alpha).exists())

    def test_duplicate_application_prevention(self):
        """Scenario 6: System prevents duplicate application for the same drive."""
        Application.objects.create(student=self.s1_user, drive=self.drive_alpha)
        self.client.login(username='student_8', password='StudentPass123!')
        response = self.client.post(reverse('applications:apply_drive', args=[self.drive_alpha.id]))
        # Should redirect with warning message, keeping single application count
        self.assertEqual(Application.objects.filter(student=self.s1_user, drive=self.drive_alpha).count(), 1)

    def test_application_after_deadline_rejected(self):
        """Application submission after drive deadline is strictly rejected."""
        self.drive_alpha.deadline = timezone.now() - timedelta(hours=1)
        self.drive_alpha.save()

        eval_res = PlacementEligibilityEngine.evaluate(self.s1_record, self.drive_alpha)
        self.assertFalse(eval_res['is_eligible'])
        self.assertIn('deadline', eval_res['reason'].lower())

    def test_recruiter_cross_company_idor_blocked_with_403(self):
        """Recruiter attempting to view another company's drive details receives 403 Forbidden."""
        self.client.login(username='recruiter_a', password='Pass123!')
        response = self.client.get(reverse('placements:drive_detail', args=[self.drive_beta.id]))
        self.assertEqual(response.status_code, 403)

    def test_coordinator_unassigned_course_access_blocked_with_403(self):
        """Coordinator attempting to verify a student of an unassigned course receives 403 Forbidden."""
        # Create student in other course
        other_student = User.objects.create_user(username='other_student', password='Pass123!')
        UserProfile.objects.create(user=other_student, role=UserRole.STUDENT)
        other_rec = StudentAcademicRecord.objects.create(
            user=other_student, enrollment_number="OTH001", course=self.course_other,
            cgpa=Decimal('7.50'), verification_status=VerificationStatus.UNVERIFIED
        )

        self.client.login(username='coord_cs', password='Pass123!')
        response = self.client.get(reverse('academics:verify_student', args=[other_rec.id]))
        self.assertEqual(response.status_code, 403)

    def test_policy_change_by_non_admin_blocked(self):
        """Placement Officer cannot modify global system placement policies."""
        officer = User.objects.create_user(username='officer_temp', password='Pass123!')
        UserProfile.objects.create(user=officer, role=UserRole.OFFICER)

        self.client.login(username='officer_temp', password='Pass123!')
        response = self.client.post(reverse('placements:policy_config'), {
            'title': 'Hacked Policy',
            'version': 'hacked',
            'tier_a_plus_min': '5.00'
        })
        self.assertEqual(response.status_code, 403)

    def test_cryptographic_audit_trail_integrity(self):
        """Verify that security events are logged with valid SHA-256 hash chains."""
        integrity = verify_audit_integrity()
        self.assertTrue(integrity['valid'])

    def test_file_upload_validation_rejects_non_pdf(self):
        """Resume upload rejects non-PDF extensions with security block."""
        self.client.login(username='student_8', password='StudentPass123!')
        bad_file = SimpleUploadedFile("malware.exe", b"malicious binary payload", content_type="application/octet-stream")
        response = self.client.post(reverse('academics:upload_resume'), {'resume': bad_file})
        self.assertEqual(response.status_code, 302)
        # Verify the record still has no resume
        self.s1_record.refresh_from_db()
        self.assertFalse(bool(self.s1_record.resume))
