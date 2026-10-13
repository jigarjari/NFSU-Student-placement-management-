from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator, MaxValueValidator


class Department(models.Model):
    name = models.CharField(max_length=150, unique=True)
    code = models.CharField(max_length=20, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.code})"


class Course(models.Model):
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=30, unique=True)
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='courses')
    coordinator = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='coordinated_courses',
        help_text="Course Coordinator assigned to this programme"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.code})"


class VerificationStatus(models.TextChoices):
    UNVERIFIED = 'UNVERIFIED', 'Pending Verification'
    VERIFIED = 'VERIFIED', 'Verified & Approved'
    REJECTED = 'REJECTED', 'Verification Rejected'


class PlacementStatus(models.TextChoices):
    UNPLACED = 'UNPLACED', 'Unplaced'
    PLACED_INTERN = 'PLACED_INTERN', 'Internship Only'
    PLACED_FTE = 'PLACED_FTE', 'Full-Time Employment (FTE)'
    PLACED_IF = 'PLACED_IF', 'Internship + PPO / FTE (I+F)'


class CategoryTier(models.TextChoices):
    NONE = 'NONE', 'None'
    C = 'C', 'Category C (< 6 LPA)'
    B = 'B', 'Category B (6–10 LPA)'
    A = 'A', 'Category A (10–16 LPA)'
    A_PLUS = 'A_PLUS', 'Category A+ (>= 16 LPA)'


class StudentAcademicRecord(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='academic_record')
    course = models.ForeignKey(Course, on_delete=models.PROTECT, related_name='students')
    enrollment_number = models.CharField(max_length=50, unique=True)
    cgpa = models.DecimalField(
        max_digits=4, decimal_places=2,
        validators=[MinValueValidator(0.0), MaxValueValidator(10.0)]
    )
    active_backlogs = models.PositiveIntegerField(default=0)
    historical_backlogs = models.PositiveIntegerField(default=0)
    graduation_year = models.PositiveIntegerField(default=2027)
    
    # Verification & Administrative Status
    verification_status = models.CharField(
        max_length=20, choices=VerificationStatus.choices, default=VerificationStatus.UNVERIFIED
    )
    verified_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='verified_students'
    )
    verification_notes = models.TextField(blank=True)
    is_deregistered = models.BooleanField(default=False)
    
    # NFSU Policy Clause 3.2 Sanctions & Offer States
    absent_penalty_drives = models.PositiveIntegerField(
        default=0, help_text="Number of upcoming placement drives banned due to absenteeism"
    )
    current_placement_status = models.CharField(
        max_length=20, choices=PlacementStatus.choices, default=PlacementStatus.UNPLACED
    )
    current_tier = models.CharField(
        max_length=10, choices=CategoryTier.choices, default=CategoryTier.NONE
    )
    current_company = models.CharField(max_length=150, blank=True, default='')
    current_ctc = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    
    # Resume storage
    resume = models.FileField(upload_to='resumes/', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['enrollment_number']
        verbose_name = 'Student Academic Record'
        verbose_name_plural = 'Student Academic Records'

    def __str__(self):
        return f"{self.enrollment_number} - {self.user.get_full_name() or self.user.username} (CGPA: {self.cgpa})"

    @property
    def student(self):
        return self.user

    @property
    def is_verified(self):
        return self.verification_status == VerificationStatus.VERIFIED

    @property
    def remaining_ban_drives(self):
        return self.absent_penalty_drives

    @property
    def absenteeism_count(self):
        return 1 if self.absent_penalty_drives > 0 else 0

    @property
    def is_blocked(self):
        """Returns True if student ID is currently barred from applying to drives."""
        return (
            self.is_deregistered or
            self.verification_status != VerificationStatus.VERIFIED or
            self.absent_penalty_drives > 0 or
            self.current_tier == CategoryTier.A_PLUS or
            self.current_placement_status == PlacementStatus.PLACED_IF
        )
