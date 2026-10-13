from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from academics.models import Course, CategoryTier
from companies.models import Company


class OfferType(models.TextChoices):
    INTERNSHIP = 'INTERNSHIP', 'Internship Only'
    FTE = 'FTE', 'Full-Time Employment (FTE)'
    INTERNSHIP_FTE = 'INTERNSHIP_FTE', 'Internship + FTE / PPO (I+F)'


class DriveStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    PENDING_APPROVAL = 'PENDING_APPROVAL', 'Pending Officer Approval'
    PUBLISHED = 'PUBLISHED', 'Published & Active'
    CLOSED = 'CLOSED', 'Drive Closed'


class PlacementPolicy(models.Model):
    title = models.CharField(max_length=150, default="NFSU Placement Guidelines 2026–27")
    version = models.CharField(max_length=30, default="2026-27.v1")
    
    # Tier thresholds (CTC in LPA)
    tier_a_plus_min = models.DecimalField(max_digits=5, decimal_places=2, default=16.00)
    tier_a_min = models.DecimalField(max_digits=5, decimal_places=2, default=10.00)
    tier_b_min = models.DecimalField(max_digits=5, decimal_places=2, default=6.00)
    
    # Category B switching multiplier (New CTC >= 1.5x Existing CTC)
    tier_b_switching_multiplier = models.DecimalField(max_digits=3, decimal_places=2, default=1.50)
    
    # Absenteeism penalty default (Clause 3.2 ban)
    absenteeism_penalty_drives = models.PositiveIntegerField(default=3)
    
    # Offer acceptance window in hours
    offer_acceptance_window_hours = models.PositiveIntegerField(default=24)
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Placement Policy'
        verbose_name_plural = 'Placement Policies'

    def __str__(self):
        return f"{self.title} ({self.version}) - {'Active' if self.is_active else 'Archived'}"

    def determine_category(self, ctc):
        ctc_val = float(ctc or 0)
        if ctc_val >= float(self.tier_a_plus_min):
            return CategoryTier.A_PLUS
        elif ctc_val >= float(self.tier_a_min):
            return CategoryTier.A
        elif ctc_val >= float(self.tier_b_min):
            return CategoryTier.B
        return CategoryTier.C


class PlacementDrive(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='drives')
    job_title = models.CharField(max_length=150)
    job_description = models.TextField()
    offer_type = models.CharField(max_length=20, choices=OfferType.choices, default=OfferType.FTE)
    category = models.CharField(max_length=10, choices=CategoryTier.choices, default=CategoryTier.B)
    
    # Compensation
    ctc_lpa = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, help_text="Annual CTC in LPA")
    stipend_monthly = models.DecimalField(max_digits=9, decimal_places=2, default=0.00, help_text="Monthly stipend for internships")
    
    # Eligibility constraints
    min_cgpa = models.DecimalField(max_digits=4, decimal_places=2, default=6.50)
    max_active_backlogs = models.PositiveIntegerField(default=0)
    eligible_courses = models.ManyToManyField(Course, related_name='eligible_drives')
    graduation_year = models.PositiveIntegerField(default=2027)
    
    # Deadlines & Schedules
    deadline = models.DateTimeField()
    drive_date = models.DateField()
    location = models.CharField(max_length=150, default='NFSU Gandhinagar Campus / Virtual')
    
    # Workflow status
    status = models.CharField(max_length=20, choices=DriveStatus.choices, default=DriveStatus.DRAFT)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_drives')
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_drives')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-drive_date']
        verbose_name = 'Placement Drive'
        verbose_name_plural = 'Placement Drives'

    def __str__(self):
        return f"{self.company.name} - {self.job_title} ({self.get_category_display()})"

    @property
    def is_expired(self):
        return timezone.now() > self.deadline

    @property
    def is_open(self):
        return self.status == DriveStatus.PUBLISHED and not self.is_expired


class DriveAuthorization(models.Model):
    drive = models.ForeignKey(PlacementDrive, on_delete=models.CASCADE, related_name='authorizations')
    recruiter = models.ForeignKey(User, on_delete=models.CASCADE, related_name='drive_authorizations')
    authorized_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='given_drive_authorizations')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('drive', 'recruiter')
        verbose_name = 'Drive Authorization'
        verbose_name_plural = 'Drive Authorizations'

    def __str__(self):
        return f"{self.recruiter.username} authorized for {self.drive}"
