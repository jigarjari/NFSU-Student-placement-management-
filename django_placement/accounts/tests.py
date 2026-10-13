from django.test import TestCase, Client
from django.contrib.auth.models import User
from django.urls import reverse
from accounts.models import UserProfile, UserRole


class AuthenticationAndRBACTests(TestCase):
    def setUp(self):
        self.client = Client()
        
        # Create Admin
        self.admin_user = User.objects.create_user(username='admin_test', password='AdminPassword123!', email='admin@nfsu.ac.in')
        UserProfile.objects.create(user=self.admin_user, role=UserRole.ADMIN, full_name='Admin Test')
        
        # Create Officer
        self.officer_user = User.objects.create_user(username='officer_test', password='OfficerPassword123!')
        UserProfile.objects.create(user=self.officer_user, role=UserRole.OFFICER, full_name='Officer Test')
        
        # Create Coordinator
        self.coord_user = User.objects.create_user(username='coord_test', password='CoordPassword123!')
        UserProfile.objects.create(user=self.coord_user, role=UserRole.COORDINATOR, full_name='Coord Test')
        
        # Create Student
        self.student_user = User.objects.create_user(username='student_test', password='StudentPassword123!')
        UserProfile.objects.create(user=self.student_user, role=UserRole.STUDENT, full_name='Student Test')

    def test_valid_login(self):
        """Test successful authentication with valid credentials."""
        response = self.client.post(reverse('accounts:login'), {
            'username': 'admin_test',
            'password': 'AdminPassword123!'
        })
        self.assertEqual(response.status_code, 302)
        self.assertTrue('_auth_user_id' in self.client.session)

    def test_student_can_login_via_student_id(self):
        """Students can authenticate directly using their Student ID (Enrollment Number)."""
        from academics.models import Department, Course, StudentAcademicRecord, VerificationStatus
        dept = Department.objects.create(name="Forensics", code="FS")
        course = Course.objects.create(name="Cyber Security", code="CS", department=dept)
        StudentAcademicRecord.objects.create(
            user=self.student_user, enrollment_number="NFSU2024TEST01",
            course=course, cgpa=8.0, verification_status=VerificationStatus.VERIFIED
        )
        response = self.client.post(reverse('accounts:login'), {
            'username': 'NFSU2024TEST01',
            'password': 'StudentPassword123!'
        })
        self.assertEqual(response.status_code, 302)
        self.assertEqual(int(self.client.session['_auth_user_id']), self.student_user.id)

    def test_invalid_login(self):
        """Test authentication failure with invalid password."""
        response = self.client.post(reverse('accounts:login'), {
            'username': 'admin_test',
            'password': 'WrongPassword!'
        })
        self.assertEqual(response.status_code, 200)
        self.assertFalse('_auth_user_id' in self.client.session)
        self.assertContains(response, 'Invalid institutional credentials')

    def test_account_lockout_after_five_failed_attempts(self):
        """Test that 5 consecutive failed login attempts locks the account."""
        for _ in range(5):
            self.client.post(reverse('accounts:login'), {
                'username': 'student_test',
                'password': 'WrongPassword!'
            })
        profile = UserProfile.objects.get(user=self.student_user)
        self.assertTrue(profile.is_locked)
        self.assertGreaterEqual(profile.failed_login_attempts, 5)

        # 6th attempt should explicitly warn account is locked
        response = self.client.post(reverse('accounts:login'), {
            'username': 'student_test',
            'password': 'WrongPassword!'
        })
        self.assertContains(response, 'Account Temporarily Locked')

    def test_anonymous_access_redirects_to_login(self):
        """Test that unauthenticated requests to protected endpoints redirect to login."""
        response = self.client.get(reverse('dashboard:admin'))
        self.assertEqual(response.status_code, 302)
        self.assertTrue(reverse('accounts:login') in response.url)

    def test_unauthorized_access_to_admin_dashboard_returns_403(self):
        """Test that a Student or Coordinator receives 403 Forbidden when requesting Admin console."""
        self.client.login(username='student_test', password='StudentPassword123!')
        response = self.client.get(reverse('dashboard:admin'))
        self.assertEqual(response.status_code, 403)

        self.client.login(username='coord_test', password='CoordPassword123!')
        response = self.client.get(reverse('dashboard:admin'))
        self.assertEqual(response.status_code, 403)

    def test_privilege_escalation_blocked_on_user_provisioning(self):
        """Test that non-admins cannot invoke user creation or status changes."""
        self.client.login(username='officer_test', password='OfficerPassword123!')
        response = self.client.get(reverse('accounts:user_list'))
        self.assertEqual(response.status_code, 403)

        response = self.client.post(reverse('accounts:create_user'), {
            'username': 'attacker',
            'role': UserRole.ADMIN,
            'full_name': 'Attacker',
            'password': 'Hacked12345!',
            'confirm_password': 'Hacked12345!'
        })
        self.assertEqual(response.status_code, 403)
