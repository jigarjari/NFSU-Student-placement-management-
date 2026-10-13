from decimal import Decimal
from django.test import TestCase, Client
from django.contrib.auth.models import User
from django.urls import reverse

from accounts.models import UserProfile, UserRole
from academics.models import Department, Course, StudentAcademicRecord, VerificationStatus, PlacementStatus, CategoryTier
from companies.models import Company, CompanyApprovalStatus, RecruiterMembership
from placements.models import PlacementPolicy, PlacementDrive, DriveStatus
from django.utils import timezone
from datetime import timedelta


class RoleDashboardViewTests(TestCase):
    def setUp(self):
        self.client = Client()

        # Policy
        self.policy = PlacementPolicy.objects.create(
            version="2026-TEST.v1",
            tier_a_plus_min=Decimal('16.00'),
            is_active=True
        )

        # Department & Course
        self.dept = Department.objects.create(name="Cyber Security", code="CS")
        self.coord_user = User.objects.create_user(username='coord_user', password='Pass123!')
        UserProfile.objects.create(user=self.coord_user, role=UserRole.COORDINATOR)
        self.course = Course.objects.create(name="M.Sc. DFIS", code="MSC_DFIS", department=self.dept, coordinator=self.coord_user)

        # Company & Recruiter
        self.company = Company.objects.create(name="Cyber Corp", contact_email="contact@cyber.com", approval_status=CompanyApprovalStatus.APPROVED)
        self.recruiter_user = User.objects.create_user(username='recruiter_user', password='Pass123!')
        UserProfile.objects.create(user=self.recruiter_user, role=UserRole.RECRUITER)
        RecruiterMembership.objects.create(user=self.recruiter_user, company=self.company)

        # Admin
        self.admin_user = User.objects.create_user(username='admin_user', password='Pass123!')
        UserProfile.objects.create(user=self.admin_user, role=UserRole.ADMIN)

        # Placement Officer
        self.officer_user = User.objects.create_user(username='officer_user', password='Pass123!')
        UserProfile.objects.create(user=self.officer_user, role=UserRole.OFFICER)

        # Student
        self.student_user = User.objects.create_user(username='student_user', password='Pass123!')
        UserProfile.objects.create(user=self.student_user, role=UserRole.STUDENT)
        self.record = StudentAcademicRecord.objects.create(
            user=self.student_user, enrollment_number="S999", course=self.course,
            cgpa=Decimal('8.50'), verification_status=VerificationStatus.VERIFIED
        )

    def test_admin_dashboard_renders_successfully(self):
        self.client.login(username='admin_user', password='Pass123!')
        response = self.client.get(reverse('dashboard:admin'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Directorate Administrative Console')

    def test_officer_dashboard_renders_successfully(self):
        self.client.login(username='officer_user', password='Pass123!')
        response = self.client.get(reverse('dashboard:officer'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Placement Officer Console')

    def test_coordinator_dashboard_renders_successfully(self):
        self.client.login(username='coord_user', password='Pass123!')
        response = self.client.get(reverse('dashboard:coordinator'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Course Coordinator Console')

    def test_recruiter_dashboard_renders_successfully(self):
        self.client.login(username='recruiter_user', password='Pass123!')
        response = self.client.get(reverse('dashboard:recruiter'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Recruiter Corporate Portal')

    def test_student_dashboard_renders_successfully(self):
        self.client.login(username='student_user', password='Pass123!')
        response = self.client.get(reverse('dashboard:student'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Student Placement Desk')
