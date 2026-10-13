import csv
from decimal import Decimal
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.http import HttpResponse
from django.db.models import Count, Q
from django.utils import timezone

from accounts.decorators import role_required
from accounts.models import UserProfile, UserRole
from academics.models import Course, Department, StudentAcademicRecord, PlacementStatus, VerificationStatus
from companies.models import Company, RecruiterMembership, CompanyApprovalStatus
from placements.models import PlacementDrive, DriveStatus, PlacementPolicy
from placements.services import PlacementEligibilityEngine
from applications.models import Application, ApplicationStatus, Offer, OfferStatus, Interview
from auditlog.models import AuditLog


@login_required
def dashboard_router_view(request):
    """Directs logged-in user to their respective role dashboard."""
    role = getattr(request.user.profile, 'role', None) if hasattr(request.user, 'profile') else None
    if not role:
        if request.user.is_superuser:
            return redirect('dashboard:admin')
        return redirect('accounts:login')

    if role == UserRole.ADMIN:
        return redirect('dashboard:admin')
    elif role == UserRole.OFFICER:
        return redirect('dashboard:officer')
    elif role == UserRole.COORDINATOR:
        return redirect('dashboard:coordinator')
    elif role == UserRole.RECRUITER:
        return redirect('dashboard:recruiter')
    elif role == UserRole.STUDENT:
        return redirect('dashboard:student')
    return redirect('accounts:login')


@login_required
@role_required([UserRole.ADMIN])
def admin_dashboard_view(request):
    total_users = User.objects.count()
    users_by_role = UserProfile.objects.values('role').annotate(count=Count('id'))
    role_counts = {item['role']: item['count'] for item in users_by_role}

    total_courses = Course.objects.count()
    total_companies = Company.objects.count()
    pending_companies = Company.objects.filter(approval_status=CompanyApprovalStatus.PENDING).count()
    active_drives = PlacementDrive.objects.filter(status=DriveStatus.PUBLISHED).count()
    total_applications = Application.objects.count()
    total_offers = Offer.objects.count()

    recent_audits = AuditLog.objects.order_by('-id')[:10]
    blocked_attempts = AuditLog.objects.filter(outcome='BLOCKED').count()

    active_policy = PlacementEligibilityEngine.get_active_policy()

    context = {
        'total_users': total_users,
        'role_counts': role_counts,
        'total_courses': total_courses,
        'total_companies': total_companies,
        'pending_companies': pending_companies,
        'active_drives': active_drives,
        'total_applications': total_applications,
        'total_offers': total_offers,
        'recent_audits': recent_audits,
        'blocked_attempts': blocked_attempts,
        'active_policy': active_policy,
    }
    return render(request, 'dashboard/admin_dashboard.html', context)


@login_required
@role_required([UserRole.OFFICER])
def officer_dashboard_view(request):
    pending_companies = Company.objects.filter(approval_status=CompanyApprovalStatus.PENDING).order_by('-created_at')
    pending_drives = PlacementDrive.objects.filter(status=DriveStatus.PENDING_APPROVAL).select_related('company')
    active_drives = PlacementDrive.objects.filter(status=DriveStatus.PUBLISHED).select_related('company')

    status_counts = Application.objects.values('status').annotate(count=Count('id'))
    app_stats = {item['status']: item['count'] for item in status_counts}

    total_applications = Application.objects.count()
    total_offers = Offer.objects.count()
    accepted_offers = Offer.objects.filter(status=OfferStatus.ACCEPTED).count()

    recent_applications = Application.objects.select_related('student', 'drive', 'drive__company').order_by('-applied_at')[:8]

    context = {
        'pending_companies': pending_companies,
        'pending_drives': pending_drives,
        'active_drives': active_drives,
        'app_stats': app_stats,
        'total_applications': total_applications,
        'total_offers': total_offers,
        'accepted_offers': accepted_offers,
        'recent_applications': recent_applications,
    }
    return render(request, 'dashboard/officer_dashboard.html', context)


@login_required
@role_required([UserRole.COORDINATOR])
def coordinator_dashboard_view(request):
    assigned_courses = Course.objects.filter(coordinator=request.user)
    students = StudentAcademicRecord.objects.filter(course__in=assigned_courses).select_related('user', 'course')

    total_students = students.count()
    verified_students = students.filter(verification_status=VerificationStatus.VERIFIED).count()
    unverified_students = students.filter(verification_status=VerificationStatus.UNVERIFIED).count()
    placed_students = students.exclude(current_placement_status=PlacementStatus.UNPLACED).count()

    recent_unverified = students.filter(verification_status=VerificationStatus.UNVERIFIED)[:10]

    context = {
        'assigned_courses': assigned_courses,
        'total_students': total_students,
        'verified_students': verified_students,
        'unverified_students': unverified_students,
        'placed_students': placed_students,
        'recent_unverified': recent_unverified,
    }
    return render(request, 'dashboard/coordinator_dashboard.html', context)


@login_required
@role_required([UserRole.RECRUITER])
def recruiter_dashboard_view(request):
    membership = getattr(request.user, 'recruiter_membership', None)
    company = membership.company if membership else None

    if not company:
        return render(request, 'dashboard/recruiter_dashboard.html', {
            'company': None,
            'message': 'No company is affiliated with your recruiter account.'
        })

    drives = PlacementDrive.objects.filter(company=company)
    total_drives = drives.count()
    active_drives = drives.filter(status=DriveStatus.PUBLISHED).count()

    applications = Application.objects.filter(drive__in=drives).select_related('student', 'drive')
    total_applicants = applications.count()
    shortlisted_applicants = applications.filter(status=ApplicationStatus.SHORTLISTED).count()
    interviews_scheduled = applications.filter(status=ApplicationStatus.INTERVIEW_SCHEDULED).count()
    offers_issued = Offer.objects.filter(application__drive__in=drives).count()

    context = {
        'company': company,
        'drives': drives,
        'total_drives': total_drives,
        'active_drives': active_drives,
        'total_applicants': total_applicants,
        'shortlisted_applicants': shortlisted_applicants,
        'interviews_scheduled': interviews_scheduled,
        'offers_issued': offers_issued,
    }
    return render(request, 'dashboard/recruiter_dashboard.html', context)


@login_required
@role_required([UserRole.STUDENT])
def student_dashboard_view(request):
    academic_record = getattr(request.user, 'academic_record', None)
    
    # Active drives
    active_drives = PlacementDrive.objects.filter(status=DriveStatus.PUBLISHED).select_related('company')
    
    # Evaluate student eligibility across drives
    eligible_count = 0
    ineligible_count = 0
    drives_with_status = []

    applied_drive_ids = set(Application.objects.filter(student=request.user).values_list('drive_id', flat=True))

    for drive in active_drives:
        has_applied = drive.id in applied_drive_ids
        if academic_record:
            eval_res = PlacementEligibilityEngine.evaluate(academic_record, drive)
            is_eligible = eval_res['is_eligible']
            reason = eval_res['reason']
        else:
            is_eligible = False
            reason = "Academic record not found. Please contact coordinator."

        if is_eligible:
            eligible_count += 1
        else:
            ineligible_count += 1

        drives_with_status.append({
            'drive': drive,
            'is_eligible': is_eligible,
            'reason': reason,
            'has_applied': has_applied,
        })

    # My applications
    my_applications = Application.objects.filter(student=request.user).select_related('drive', 'drive__company', 'offer').order_by('-applied_at')
    
    # Pending offers
    pending_offers = Offer.objects.filter(
        application__student=request.user,
        status=OfferStatus.PENDING,
        deadline_window__gt=timezone.now()
    ).select_related('application', 'application__drive')

    context = {
        'academic_record': academic_record,
        'drives_with_status': drives_with_status[:6],
        'eligible_count': eligible_count,
        'ineligible_count': ineligible_count,
        'my_applications': my_applications[:5],
        'pending_offers': pending_offers,
    }
    return render(request, 'dashboard/student_dashboard.html', context)


@login_required
@role_required([UserRole.ADMIN, UserRole.OFFICER, UserRole.COORDINATOR])
def reports_view(request):
    user = request.user
    role = getattr(user.profile, 'role', None)

    # Scoped report data
    if role == UserRole.COORDINATOR:
        assigned_courses = Course.objects.filter(coordinator=user)
        students = StudentAcademicRecord.objects.filter(course__in=assigned_courses).select_related('user', 'course')
    else:
        assigned_courses = Course.objects.all()
        students = StudentAcademicRecord.objects.all().select_related('user', 'course')

    course_stats = []
    for c in assigned_courses:
        c_students = students.filter(course=c)
        total = c_students.count()
        placed = c_students.exclude(current_placement_status=PlacementStatus.UNPLACED).count()
        pct = round((placed / total * 100), 1) if total > 0 else 0
        course_stats.append({
            'course': c,
            'total': total,
            'placed': placed,
            'pct': pct
        })

    # CSV Export if authorized
    if request.GET.get('export') == 'csv':
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="placement_report_{role.lower()}.csv"'
        writer = csv.writer(response)
        writer.writerow(['Course Code', 'Course Name', 'Total Students', 'Placed Students', 'Placement Percentage'])
        for s in course_stats:
            writer.writerow([s['course'].code, s['course'].name, s['total'], s['placed'], f"{s['pct']}%"])
        return response

    return render(request, 'dashboard/reports.html', {
        'course_stats': course_stats,
        'role': role
    })
