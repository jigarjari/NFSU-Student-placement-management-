from decimal import Decimal
from django.test import TestCase, Client
from django.contrib.auth.models import User
from django.urls import reverse

from accounts.models import UserProfile, UserRole
from academics.models import Department, Course, StudentAcademicRecord, VerificationStatus, PlacementStatus


class AcademicsViewsTests(TestCase):
    def setUp(self):
        self.client = Client()

        self.dept = Department.objects.create(name="Cyber Security", code="CS")
        self.coord_user = User.objects.create_user(username='coord1', password='Pass123!')
        UserProfile.objects.create(user=self.coord_user, role=UserRole.COORDINATOR)

        self.course_dfis = Course.objects.create(name="M.Sc. DFIS", code="MSC_DFIS", department=self.dept, coordinator=self.coord_user)
        self.course_other = Course.objects.create(name="Other", code="OTH", department=self.dept)

        # Admin & Officer
        self.admin = User.objects.create_user(username='admin_acad', password='Pass123!')
        UserProfile.objects.create(user=self.admin, role=UserRole.ADMIN)

        self.officer = User.objects.create_user(username='officer_acad', password='Pass123!')
        UserProfile.objects.create(user=self.officer, role=UserRole.OFFICER)

        # Students
        self.s1 = User.objects.create_user(username='s1', password='Pass123!')
        UserProfile.objects.create(user=self.s1, role=UserRole.STUDENT)
        self.rec1 = StudentAcademicRecord.objects.create(
            user=self.s1, enrollment_number="ENR001", course=self.course_dfis,
            cgpa=Decimal('8.5'), verification_status=VerificationStatus.UNVERIFIED
        )

        self.s2 = User.objects.create_user(username='s2', password='Pass123!')
        UserProfile.objects.create(user=self.s2, role=UserRole.STUDENT)
        self.rec2 = StudentAcademicRecord.objects.create(
            user=self.s2, enrollment_number="ENR002", course=self.course_other,
            cgpa=Decimal('7.5'), verification_status=VerificationStatus.UNVERIFIED
        )

    def test_admin_can_view_all_students_registry(self):
        self.client.login(username='admin_acad', password='Pass123!')
        response = self.client.get(reverse('academics:student_records'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'ENR001')
        self.assertContains(response, 'ENR002')

    def test_coordinator_only_sees_assigned_course_students(self):
        self.client.login(username='coord1', password='Pass123!')
        response = self.client.get(reverse('academics:student_records'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'ENR001')
        self.assertNotContains(response, 'ENR002')

    def test_verify_student_approve_action(self):
        self.client.login(username='coord1', password='Pass123!')
        response = self.client.post(reverse('academics:verify_student', args=[self.rec1.id]), {
            'action': 'approve',
            'notes': 'Verified against semester transcript.'
        })
        self.assertEqual(response.status_code, 302)
        self.rec1.refresh_from_db()
        self.assertEqual(self.rec1.verification_status, VerificationStatus.VERIFIED)

    def test_verify_student_unassigned_course_returns_403(self):
        self.client.login(username='coord1', password='Pass123!')
        response = self.client.get(reverse('academics:verify_student', args=[self.rec2.id]))
        self.assertEqual(response.status_code, 403)
