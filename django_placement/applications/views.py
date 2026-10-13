from datetime import timedelta
from decimal import Decimal
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from django.contrib import messages
from django.utils import timezone
from django.db import transaction

from accounts.decorators import role_required
from academics.models import StudentAcademicRecord, PlacementStatus, CategoryTier
from placements.models import PlacementDrive, DriveStatus
from placements.services import PlacementEligibilityEngine
from .models import Application, ApplicationStatus, Interview, InterviewOutcome, Offer, OfferStatus
from auditlog.services import log_security_event


@login_required
@role_required(['STUDENT'])
def apply_drive_view(request, drive_id):
    drive = get_object_or_404(PlacementDrive, id=drive_id)
    user = request.user

    try:
        academic_record = user.academic_record
    except StudentAcademicRecord.DoesNotExist:
        messages.error(request, "Application Denied: Student academic profile not found. Please contact administration.")
        return redirect('placements:drive_detail', drive_id=drive.id)

    # Prevent duplicate applications check
    if Application.objects.filter(student=user, drive=drive).exists():
        log_security_event(
            request=request, actor=user, action='DUPLICATE_APPLICATION_BLOCKED',
            target_model='Application', target_id=str(drive.id), outcome='BLOCKED',
            details=f"Student {user.username} attempted duplicate application for drive #{drive.id}"
        )
        messages.warning(request, "You have already submitted an application for this recruitment drive.")
        return redirect('placements:drive_detail', drive_id=drive.id)

    # Server-Side Policy Re-Evaluation
    evaluation = PlacementEligibilityEngine.evaluate(academic_record, drive)
    if not evaluation['is_eligible']:
        log_security_event(
            request=request, actor=user, action='POLICY_APPLICATION_REJECTION',
            target_model='Application', target_id=str(drive.id), outcome='BLOCKED',
            details=f"Policy rejection for {user.username} on drive {drive.id}: {evaluation['reason']}"
        )
        messages.error(request, f"Eligibility Check Failed: {evaluation['reason']}")
        return redirect('placements:drive_detail', drive_id=drive.id)

    # Create application
    policy = PlacementEligibilityEngine.get_active_policy()
    app = Application.objects.create(
        student=user,
        drive=drive,
        status=ApplicationStatus.APPLIED,
        eval_policy_version=policy.version
    )

    log_security_event(
        request=request, actor=user, action='SUBMIT_PLACEMENT_APPLICATION',
        target_model='Application', target_id=str(app.id), outcome='SUCCESS',
        details=f"Student {user.username} successfully applied for {drive.job_title} at {drive.company.name} (Policy: {policy.version})"
    )
    messages.success(request, f"Application for '{drive.job_title}' at {drive.company.name} submitted successfully.")
    return redirect('applications:my_applications')


@login_required
@role_required(['STUDENT'])
def my_applications_view(request):
    # IDOR Protection: Strict filtering to request.user
    applications = Application.objects.filter(student=request.user).select_related('drive', 'drive__company', 'offer').order_by('-applied_at')
    return render(request, 'applications/my_applications.html', {'applications': applications})


@login_required
@role_required(['ADMIN', 'OFFICER', 'RECRUITER'])
def applicant_list_view(request, drive_id):
    drive = get_object_or_404(PlacementDrive.objects.select_related('company'), id=drive_id)
    user = request.user
    profile = getattr(user, 'profile', None)

    # Recruiter IDOR check
    if profile and profile.role == 'RECRUITER':
        membership = getattr(user, 'recruiter_membership', None)
        if not membership or drive.company != membership.company:
            log_security_event(
                request=request, actor=user, action='IDOR_ATTEMPT_UNAUTHORIZED_APPLICANT_LIST_ACCESS',
                target_model='PlacementDrive', target_id=str(drive.id), outcome='BLOCKED',
                details=f"Recruiter {user.username} tried to view applicants of drive #{drive.id} belonging to {drive.company.name}"
            )
            raise PermissionDenied("Access Denied: You cannot view applicants for another company's drive.")

    applications = drive.applications.select_related('student', 'student__academic_record', 'student__academic_record__course').all()

    # Status filter
    status_filter = request.GET.get('status')
    if status_filter and status_filter != 'All':
        applications = applications.filter(status=status_filter)

    return render(request, 'applications/applicant_list.html', {
        'drive': drive,
        'applications': applications,
        'statuses': ApplicationStatus.choices,
        'selected_status': status_filter
    })


@login_required
@role_required(['ADMIN', 'OFFICER', 'RECRUITER'])
def update_status_view(request, application_id):
    app = get_object_or_404(Application.objects.select_related('drive', 'drive__company', 'student'), id=application_id)
    user = request.user
    profile = getattr(user, 'profile', None)

    # Recruiter IDOR check
    if profile and profile.role == 'RECRUITER':
        membership = getattr(user, 'recruiter_membership', None)
        if not membership or app.drive.company != membership.company:
            raise PermissionDenied("Access Denied: You cannot update applications for another company.")

    if request.method == 'POST':
        new_status = request.POST.get('status')
        reason = request.POST.get('rejection_reason', '').strip()

        if new_status in ApplicationStatus.values:
            old_status = app.status
            app.status = new_status
            if new_status == ApplicationStatus.REJECTED:
                app.rejection_reason = reason
            app.save()

            log_security_event(
                request=request, actor=user, action='UPDATE_APPLICATION_STATUS',
                target_model='Application', target_id=str(app.id), outcome='SUCCESS',
                details=f"Application status changed from {old_status} to {new_status} for student {app.student.username} by {user.username}"
            )
            messages.success(request, f"Application status updated to '{app.get_status_display()}'.")

    return redirect('applications:applicant_list', drive_id=app.drive.id)


@login_required
@role_required(['ADMIN', 'OFFICER', 'RECRUITER'])
def schedule_interview_view(request, application_id):
    app = get_object_or_404(Application.objects.select_related('drive', 'student'), id=application_id)
    user = request.user
    profile = getattr(user, 'profile', None)

    if profile and profile.role == 'RECRUITER':
        membership = getattr(user, 'recruiter_membership', None)
        if not membership or app.drive.company != membership.company:
            raise PermissionDenied("Access Denied.")

    if request.method == 'POST':
        round_name = request.POST.get('round_name', 'Technical Interview')
        scheduled_at = request.POST.get('scheduled_at')
        meeting_link = request.POST.get('meeting_link', '')

        interview = Interview.objects.create(
            application=app,
            round_number=app.interviews.count() + 1,
            round_name=round_name,
            scheduled_at=scheduled_at,
            meeting_link=meeting_link
        )
        app.status = ApplicationStatus.INTERVIEW_SCHEDULED
        app.save()

        log_security_event(
            request=request, actor=user, action='SCHEDULE_INTERVIEW',
            target_model='Interview', target_id=str(interview.id), outcome='SUCCESS',
            details=f"Interview scheduled for {app.student.username} on {scheduled_at}."
        )
        messages.success(request, f"Interview scheduled for {app.student.get_full_name() or app.student.username}.")
        return redirect('applications:applicant_list', drive_id=app.drive.id)

    return render(request, 'applications/schedule_interview.html', {'application': app})


@login_required
@role_required(['ADMIN', 'OFFICER', 'RECRUITER'])
def issue_offer_view(request, application_id):
    app = get_object_or_404(Application.objects.select_related('drive', 'student'), id=application_id)
    user = request.user
    profile = getattr(user, 'profile', None)

    if profile and profile.role == 'RECRUITER':
        membership = getattr(user, 'recruiter_membership', None)
        if not membership or app.drive.company != membership.company:
            raise PermissionDenied("Access Denied.")

    if request.method == 'POST':
        package_ctc = Decimal(request.POST.get('package_ctc', str(app.drive.ctc_lpa)))
        stipend = Decimal(request.POST.get('stipend', str(app.drive.stipend_monthly)))
        
        # 24-hour mandatory acceptance window
        policy = PlacementEligibilityEngine.get_active_policy()
        deadline = timezone.now() + timedelta(hours=policy.offer_acceptance_window_hours)

        offer, created = Offer.objects.update_or_create(
            application=app,
            defaults={
                'package_ctc': package_ctc,
                'stipend': stipend,
                'offer_letter_ref': f"NFSU/{app.drive.company.name[:4].upper()}/{timezone.now().year}/{app.id}",
                'deadline_window': deadline,
                'status': OfferStatus.PENDING
            }
        )
        app.status = ApplicationStatus.OFFERED
        app.save()

        log_security_event(
            request=request, actor=user, action='ISSUE_PLACEMENT_OFFER',
            target_model='Offer', target_id=str(offer.id), outcome='SUCCESS',
            details=f"Issued offer of ₹{package_ctc} LPA to {app.student.username} with 24h deadline expiring {deadline}."
        )
        messages.success(request, f"Offer of ₹{package_ctc} LPA issued to {app.student.username}. 24-hour response window started.")
        return redirect('applications:applicant_list', drive_id=app.drive.id)

    return render(request, 'applications/issue_offer.html', {'application': app})


@login_required
@role_required(['STUDENT'])
def respond_offer_view(request, offer_id):
    offer = get_object_or_404(Offer.objects.select_related('application', 'application__drive', 'application__drive__company'), id=offer_id)
    user = request.user

    # IDOR Check: Student can only respond to their own offer!
    if offer.application.student != user:
        log_security_event(
            request=request, actor=user, action='IDOR_ATTEMPT_RESPOND_OTHER_OFFER',
            target_model='Offer', target_id=str(offer.id), outcome='BLOCKED',
            details=f"Student {user.username} attempted to accept/decline offer #{offer.id} of {offer.application.student.username}."
        )
        raise PermissionDenied("Access Denied: You cannot respond to an offer issued to another student.")

    if offer.is_expired:
        offer.status = OfferStatus.EXPIRED
        offer.save()
        messages.error(request, "This offer has expired because the mandatory 24-hour decision window has closed.")
        return redirect('applications:my_applications')

    if request.method == 'POST':
        action = request.POST.get('action')
        academic_record = getattr(user, 'academic_record', None)

        with transaction.atomic():
            if action == 'accept':
                offer.status = OfferStatus.ACCEPTED
                offer.decision_timestamp = timezone.now()
                offer.save()

                offer.application.status = ApplicationStatus.OFFER_ACCEPTED
                offer.application.save()

                # Update student record with placement outcomes
                if academic_record:
                    drive = offer.application.drive
                    academic_record.current_company = drive.company.name
                    academic_record.current_ctc = offer.package_ctc
                    
                    policy = PlacementEligibilityEngine.get_active_policy()
                    academic_record.current_tier = policy.determine_category(offer.package_ctc)

                    if drive.offer_type == 'INTERNSHIP':
                        academic_record.current_placement_status = PlacementStatus.PLACED_INTERN
                    elif drive.offer_type == 'INTERNSHIP_FTE':
                        academic_record.current_placement_status = PlacementStatus.PLACED_IF
                    else:
                        academic_record.current_placement_status = PlacementStatus.PLACED_FTE
                    
                    academic_record.save()

                log_security_event(
                    request=request, actor=user, action='OFFER_ACCEPTED_BY_STUDENT',
                    target_model='Offer', target_id=str(offer.id), outcome='SUCCESS',
                    details=f"Student {user.username} accepted offer #{offer.id} at {offer.application.drive.company.name} for ₹{offer.package_ctc} LPA."
                )
                messages.success(request, f"Congratulations! You have accepted the placement offer from {offer.application.drive.company.name}.")

            elif action == 'decline':
                offer.status = OfferStatus.DECLINED
                offer.decision_timestamp = timezone.now()
                offer.save()

                offer.application.status = ApplicationStatus.OFFER_REJECTED
                offer.application.save()

                log_security_event(
                    request=request, actor=user, action='OFFER_DECLINED_BY_STUDENT',
                    target_model='Offer', target_id=str(offer.id), outcome='SUCCESS',
                    details=f"Student {user.username} declined offer #{offer.id} at {offer.application.drive.company.name}."
                )
                messages.info(request, f"You have declined the offer from {offer.application.drive.company.name}.")

        return redirect('applications:my_applications')

    return render(request, 'applications/respond_offer.html', {'offer': offer})


@login_required
@role_required(['STUDENT'])
def withdraw_application_view(request, application_id):
    app = get_object_or_404(Application, id=application_id)
    if app.student != request.user:
        raise PermissionDenied("Access Denied.")

    if app.status in [ApplicationStatus.APPLIED, ApplicationStatus.UNDER_REVIEW]:
        app.status = ApplicationStatus.WITHDRAWN
        app.save()
        log_security_event(
            request=request, actor=request.user, action='WITHDRAW_APPLICATION',
            target_model='Application', target_id=str(app.id), outcome='SUCCESS',
            details=f"Student {request.user.username} withdrew application #{app.id}."
        )
        messages.info(request, "Application withdrawn successfully.")
    else:
        messages.warning(request, "Cannot withdraw application after shortlisting or interview scheduling.")

    return redirect('applications:my_applications')
