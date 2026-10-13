from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class UserRole(models.TextChoices):
    ADMIN = 'ADMIN', 'Placement Admin'
    OFFICER = 'OFFICER', 'Placement Officer'
    COORDINATOR = 'COORDINATOR', 'Course Coordinator'
    RECRUITER = 'RECRUITER', 'Recruiter / Company Rep'
    STUDENT = 'STUDENT', 'Student'


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.STUDENT)
    full_name = models.CharField(max_length=150)
    phone_number = models.CharField(max_length=20, blank=True, null=True)
    is_active_profile = models.BooleanField(default=True)
    
    # Account lockout & rate limiting attributes
    failed_login_attempts = models.PositiveIntegerField(default=0)
    lockout_until = models.DateTimeField(null=True, blank=True)
    
    # Audit timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'User Profile'
        verbose_name_plural = 'User Profiles'
        indexes = [
            models.Index(fields=['role']),
        ]

    def __str__(self):
        return f"{self.user.username} ({self.get_role_display()})"

    @property
    def is_locked(self):
        if self.lockout_until and timezone.now() < self.lockout_until:
            return True
        return False

    @property
    def is_admin(self):
        return self.role == UserRole.ADMIN or self.user.is_superuser

    @property
    def is_officer(self):
        return self.role in [UserRole.OFFICER, UserRole.ADMIN]

    @property
    def is_coordinator(self):
        return self.role == UserRole.COORDINATOR

    @property
    def is_recruiter(self):
        return self.role == UserRole.RECRUITER

    @property
    def is_student(self):
        return self.role == UserRole.STUDENT
