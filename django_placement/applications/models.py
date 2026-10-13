from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from placements.models import PlacementDrive


class ApplicationStatus(models.TextChoices):
    APPLIED = 'APPLIED', 'Applied'
    UNDER_REVIEW = 'UNDER_REVIEW', 'Under Review'
    SHORTLISTED = 'SHORTLISTED', 'Shortlisted'
    INTERVIEW_SCHEDULED = 'INTERVIEW_SCHEDULED', 'Interview Scheduled'
    SELECTED = 'SELECTED', 'Selected'
    OFFERED = 'OFFERED', 'Offered'
    OFFER_ACCEPTED = 'OFFER_ACCEPTED', 'Offer Accepted'
    OFFER_REJECTED = 'OFFER_REJECTED', 'Offer Rejected'
    REJECTED = 'REJECTED', 'Rejected'
    WITHDRAWN = 'WITHDRAWN', 'Withdrawn'


class Application(models.Model):
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='placement_applications')
    drive = models.ForeignKey(PlacementDrive, on_delete=models.CASCADE, related_name='applications')
    applied_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(
        max_length=30, choices=ApplicationStatus.choices, default=ApplicationStatus.APPLIED
    )
    eval_policy_version = models.CharField(max_length=50, default='2026-27.v1')
    rejection_reason = models.TextField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-applied_at']
        verbose_name = 'Placement Application'
        verbose_name_plural = 'Placement Applications'
        # Database-level unique constraint to guarantee no duplicate applications
        constraints = [
            models.UniqueConstraint(fields=['student', 'drive'], name='unique_student_drive_application')
        ]

    def __str__(self):
        return f"{self.student.username} -> {self.drive.job_title} ({self.get_status_display()})"


class InterviewOutcome(models.TextChoices):
    PENDING = 'PENDING', 'Pending Schedule / Evaluation'
    PASSED = 'PASSED', 'Passed & Advanced'
    FAILED = 'FAILED', 'Did Not Advance'


class Interview(models.Model):
    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name='interviews')
    round_number = models.PositiveIntegerField(default=1)
    round_name = models.CharField(max_length=150, default='Technical Interview Round 1')
    scheduled_at = models.DateTimeField()
    meeting_link = models.URLField(blank=True, null=True)
    feedback = models.TextField(blank=True)
    outcome = models.CharField(
        max_length=20, choices=InterviewOutcome.choices, default=InterviewOutcome.PENDING
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['round_number']
        verbose_name = 'Interview Schedule'
        verbose_name_plural = 'Interview Schedules'

    def __str__(self):
        return f"{self.application.student.username} - Round {self.round_number}: {self.round_name}"


class OfferStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending Student Decision'
    ACCEPTED = 'ACCEPTED', 'Accepted & Finalized'
    DECLINED = 'DECLINED', 'Declined by Student'
    EXPIRED = 'EXPIRED', 'Expired (24h Window Closed)'


class Offer(models.Model):
    application = models.OneToOneField(Application, on_delete=models.CASCADE, related_name='offer')
    package_ctc = models.DecimalField(max_digits=5, decimal_places=2, help_text="Offered annual CTC in LPA")
    stipend = models.DecimalField(max_digits=9, decimal_places=2, default=0.00, help_text="Monthly stipend if applicable")
    offer_letter_ref = models.CharField(max_length=150, default='NFSU/OFFER/2026-27')
    issued_at = models.DateTimeField(auto_now_add=True)
    deadline_window = models.DateTimeField(help_text="24-hour mandatory acceptance deadline")
    status = models.CharField(
        max_length=20, choices=OfferStatus.choices, default=OfferStatus.PENDING
    )
    decision_timestamp = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Placement Offer'
        verbose_name_plural = 'Placement Offers'

    def __str__(self):
        return f"Offer #{self.id} for {self.application.student.username} (₹{self.package_ctc} LPA) - {self.status}"

    @property
    def is_expired(self):
        return self.status == OfferStatus.PENDING and timezone.now() > self.deadline_window
