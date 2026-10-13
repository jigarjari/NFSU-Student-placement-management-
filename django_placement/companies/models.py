from django.db import models
from django.contrib.auth.models import User


class CompanyApprovalStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending Approval'
    APPROVED = 'APPROVED', 'Approved & Active'
    REJECTED = 'REJECTED', 'Registration Rejected'


class Company(models.Model):
    name = models.CharField(max_length=150, unique=True)
    website = models.URLField(blank=True)
    industry = models.CharField(max_length=100, default='Information Technology')
    headquarters_city = models.CharField(max_length=100, default='Bengaluru')
    contact_email = models.EmailField()
    description = models.TextField(blank=True)
    approval_status = models.CharField(
        max_length=20, choices=CompanyApprovalStatus.choices, default=CompanyApprovalStatus.PENDING
    )
    approved_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_companies'
    )
    rejection_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Company'
        verbose_name_plural = 'Companies'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} [{self.get_approval_status_display()}]"

    @property
    def is_verified(self):
        return self.approval_status == CompanyApprovalStatus.APPROVED

    @property
    def email(self):
        return self.contact_email


class RecruiterMembership(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='recruiter_membership')
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='recruiters')
    designation = models.CharField(max_length=100, default='Talent Acquisition Lead')
    is_company_admin = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Recruiter Membership'
        verbose_name_plural = 'Recruiter Memberships'

    def __str__(self):
        return f"{self.user.username} @ {self.company.name}"
