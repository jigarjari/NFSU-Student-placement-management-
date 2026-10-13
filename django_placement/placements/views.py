from decimal import Decimal
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from django.contrib import messages
from django.utils import timezone

from accounts.decorators import role_required
from academics.models import Course
from companies.models import Company, RecruiterMembership
from .models import PlacementDrive, DriveStatus, PlacementPolicy, DriveAuthorization, OfferType
from .services import PlacementEligibilityEngine
from auditlog.services import log_security_event


@login_required
def drive_list_view(request):
    user = request.user
    profile = getattr(user, 'profile', None)

    # Base Query
    drives = PlacementDrive.objects.select_related('company', 'created_by').prefetch_related('eligible_courses').all()

    # Recruiter Scoping: Only see authorized drives for their company!
    if profile and profile.role == 'RECRUITER':
        membership = RecruiterMembership.objects.filter(user=user).first()
        if membership:
            drives = drives.filter(company=membership.company)
        else:
            drives = drives.none()
    elif profile and profile.role == 'STUDENT':
        # Students only see published drives
        drives = drives.filter(status=DriveStatus.PUBLISHED)

    # Filtering by category
    category_filter = request.GET.get('category')
    if category_filter and category_filter != 'All':
        drives = drives.filter(category=category_filter)

    # For students, compute per-drive eligibility dynamically via PlacementEligibilityEngine
    student_evaluations = {}
    if profile and profile.role == 'STUDENT':
        academic_record = getattr(user, 'academic_record', None)
        if academic_record:
            for drive in drives:
                student_evaluations[drive.id] = PlacementEligibilityEngine.evaluate(academic_record, drive)

    return render(request, 'placements/drive_list.html', {
        'drives': drives,
        'student_evaluations': student_evaluations,
        'selected_category': category_filter,
    })


@login_required
def drive_detail_view(request, drive_id):
    drive = get_object_or_404(PlacementDrive.objects.select_related('company'), id=drive_id)
    user = request.user
    profile = getattr(user, 'profile', None)

    # Recruiter IDOR check
    if profile and profile.role == 'RECRUITER':
        membership = RecruiterMembership.objects.filter(user=user).first()
        if not membership or drive.company != membership.company:
            log_security_event(
                request=request, actor=user, action='IDOR_ATTEMPT_UNAUTHORIZED_DRIVE_ACCESS',
                target_model='PlacementDrive', target_id=str(drive.id), outcome='BLOCKED',
                details=f"Recruiter {user.username} tried to view drive #{drive.id} belonging to {drive.company.name}"
            )
            raise PermissionDenied("Access Denied: You are not authorized to view recruitment drives of another company.")

    evaluation = None
    existing_application = None
    if profile and profile.role == 'STUDENT':
        academic_record = getattr(user, 'academic_record', None)
        if academic_record:
            evaluation = PlacementEligibilityEngine.evaluate(academic_record, drive)
        existing_application = drive.applications.filter(student=user).first()

    return render(request, 'placements/drive_detail.html', {
        'drive': drive,
        'evaluation': evaluation,
        'existing_application': existing_application
    })


@login_required
@role_required(['ADMIN', 'OFFICER', 'RECRUITER'])
def create_drive_view(request):
    user = request.user
    profile = getattr(user, 'profile', None)
    policy = PlacementEligibilityEngine.get_active_policy()
    courses = Course.objects.all()

    # Determine permitted company
    if profile and profile.role == 'RECRUITER':
        membership = RecruiterMembership.objects.filter(user=user).select_related('company').first()
        if not membership or membership.company.approval_status != 'APPROVED':
            messages.error(request, "Your company profile is not yet approved by the Placement Cell. You cannot submit drives.")
            return redirect('companies:company_list')
        permitted_companies = [membership.company]
    else:
        permitted_companies = Company.objects.filter(approval_status='APPROVED')

    if request.method == 'POST':
        company_id = request.POST.get('company')
        job_title = request.POST.get('job_title', '').strip()
        job_description = request.POST.get('job_description', '').strip()
        offer_type = request.POST.get('offer_type', 'FTE')
        ctc_lpa = Decimal(request.POST.get('ctc_lpa', '0.0') or '0.0')
        stipend = Decimal(request.POST.get('stipend_monthly', '0.0') or '0.0')
        min_cgpa = Decimal(request.POST.get('min_cgpa', '6.5') or '6.5')
        max_backlogs = int(request.POST.get('max_active_backlogs', '0') or '0')
        deadline = request.POST.get('deadline')
        drive_date = request.POST.get('drive_date')
        location = request.POST.get('location', 'NFSU Gandhinagar Campus')
        selected_courses = request.POST.getlist('courses')

        company = get_object_or_404(Company, id=company_id)

        # Enforce recruiter company restriction
        if profile and profile.role == 'RECRUITER' and company != membership.company:
            raise PermissionDenied("You can only post placement drives for your own verified company.")

        category = policy.determine_category(ctc_lpa)

        # Status: Published if Officer/Admin, Pending Approval if Recruiter
        initial_status = DriveStatus.PUBLISHED if (profile.role in ['ADMIN', 'OFFICER']) else DriveStatus.PENDING_APPROVAL

        drive = PlacementDrive.objects.create(
            company=company,
            job_title=job_title,
            job_description=job_description,
            offer_type=offer_type,
            category=category,
            ctc_lpa=ctc_lpa,
            stipend_monthly=stipend,
            min_cgpa=min_cgpa,
            max_active_backlogs=max_backlogs,
            deadline=deadline,
            drive_date=drive_date,
            location=location,
            status=initial_status,
            created_by=user,
            approved_by=user if initial_status == DriveStatus.PUBLISHED else None
        )
        if selected_courses:
            drive.eligible_courses.set(selected_courses)

        # If recruiter, record DriveAuthorization
        if profile and profile.role == 'RECRUITER':
            DriveAuthorization.objects.create(drive=drive, recruiter=user, authorized_by=user)

        log_security_event(
            request=request, actor=user, action='CREATE_PLACEMENT_DRIVE',
            target_model='PlacementDrive', target_id=str(drive.id), outcome='SUCCESS',
            details=f"Created drive {drive.job_title} at {company.name} with CTC ₹{ctc_lpa} LPA ({category})"
        )
        messages.success(request, f"Placement drive '{drive.job_title}' created successfully ({drive.get_status_display()}).")
        return redirect('placements:drive_detail', drive_id=drive.id)

    return render(request, 'placements/create_drive.html', {
        'companies': permitted_companies,
        'courses': courses,
        'offer_types': OfferType.choices
    })


@login_required
@role_required(['ADMIN', 'OFFICER'])
def approve_drive_view(request, drive_id):
    drive = get_object_or_404(PlacementDrive, id=drive_id)
    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'publish':
            drive.status = DriveStatus.PUBLISHED
            drive.approved_by = request.user
            drive.save()
            messages.success(request, f"Drive '{drive.job_title}' at {drive.company.name} is now Published and open for applications.")
            log_security_event(
                request=request, actor=request.user, action='APPROVE_PUBLISH_DRIVE',
                target_model='PlacementDrive', target_id=str(drive.id), outcome='SUCCESS',
                details=f"Officer {request.user.username} approved drive {drive.id}."
            )
        elif action == 'close':
            drive.status = DriveStatus.CLOSED
            drive.save()
            messages.info(request, f"Drive '{drive.job_title}' closed.")

        return redirect('placements:drive_detail', drive_id=drive.id)

    return render(request, 'placements/approve_drive.html', {'drive': drive})


@login_required
@role_required(['ADMIN'])
def policy_config_view(request):
    policy = PlacementEligibilityEngine.get_active_policy()

    if request.method == 'POST':
        policy.title = request.POST.get('title', policy.title)
        policy.version = request.POST.get('version', policy.version)
        policy.tier_a_plus_min = Decimal(request.POST.get('tier_a_plus_min', '16.0'))
        policy.tier_a_min = Decimal(request.POST.get('tier_a_min', '10.0'))
        policy.tier_b_min = Decimal(request.POST.get('tier_b_min', '6.0'))
        policy.tier_b_switching_multiplier = Decimal(request.POST.get('tier_b_switching_multiplier', '1.5'))
        policy.absenteeism_penalty_drives = int(request.POST.get('absenteeism_penalty_drives', '3'))
        policy.offer_acceptance_window_hours = int(request.POST.get('offer_acceptance_window_hours', '24'))
        policy.save()

        log_security_event(
            request=request, actor=request.user, action='UPDATE_PLACEMENT_POLICY',
            target_model='PlacementPolicy', target_id=str(policy.id), outcome='SUCCESS',
            details=f"Admin {request.user.username} updated policy parameters: A+={policy.tier_a_plus_min}, B_mult={policy.tier_b_switching_multiplier}"
        )
        messages.success(request, "Global Placement Policy parameters updated successfully.")
        return redirect('placements:policy_config')

    return render(request, 'placements/policy_config.html', {'policy': policy})
