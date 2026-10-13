import os
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from django.contrib import messages
from django.db.models import Q

from accounts.decorators import role_required
from .models import Course, Department, StudentAcademicRecord, VerificationStatus
from auditlog.services import log_security_event


@login_required
def course_list_view(request):
    courses = Course.objects.select_related('department', 'coordinator').all()
    departments = Department.objects.all()
    return render(request, 'academics/course_list.html', {'courses': courses, 'departments': departments})


@login_required
@role_required(['ADMIN', 'OFFICER', 'COORDINATOR'])
def student_records_view(request):
    user = request.user
    profile = getattr(user, 'profile', None)
    
    records = StudentAcademicRecord.objects.select_related('user', 'course', 'course__department').all()

    # Scope Course Coordinator strictly to their assigned courses!
    if profile and profile.role == 'COORDINATOR':
        coordinated_course_ids = Course.objects.filter(coordinator=user).values_list('id', flat=True)
        records = records.filter(course_id__in=coordinated_course_ids)

    # Filtering
    course_filter = request.GET.get('course')
    status_filter = request.GET.get('status')
    search_query = request.GET.get('q')

    if course_filter and course_filter != 'All':
        records = records.filter(course__code=course_filter)
    if status_filter and status_filter != 'All':
        records = records.filter(verification_status=status_filter)
    if search_query:
        records = records.filter(
            Q(enrollment_number__icontains=search_query) |
            Q(user__first_name__icontains=search_query) |
            Q(user__username__icontains=search_query)
        )

    courses = Course.objects.all()
    return render(request, 'academics/student_records.html', {
        'records': records,
        'courses': courses,
        'selected_course': course_filter,
        'selected_status': status_filter,
        'search_query': search_query
    })


@login_required
@role_required(['ADMIN', 'OFFICER', 'COORDINATOR'])
def verify_student_view(request, record_id):
    record = get_object_or_404(StudentAcademicRecord, id=record_id)
    user = request.user
    profile = getattr(user, 'profile', None)

    # Scoping check: If coordinator, student course MUST match their coordinated course!
    if profile and profile.role == 'COORDINATOR':
        if record.course.coordinator != user:
            log_security_event(
                request=request, actor=user, action='UNAUTHORIZED_COORDINATOR_ACCESS_ATTEMPT',
                target_model='StudentAcademicRecord', target_id=str(record.id), outcome='BLOCKED',
                details=f"Coordinator {user.username} attempted to verify student {record.enrollment_number} from unassigned course {record.course.name}."
            )
            raise PermissionDenied("Access Denied: You are not the assigned Course Coordinator for this student's academic programme.")

    if request.method == 'POST':
        action = request.POST.get('action')
        notes = request.POST.get('notes', '').strip()

        if action == 'approve':
            record.verification_status = VerificationStatus.VERIFIED
            record.verified_by = user
            record.verification_notes = notes
            record.save()
            messages.success(request, f"Student {record.enrollment_number} ({record.user.get_full_name()}) verified successfully.")
            log_security_event(
                request=request, actor=user, action='STUDENT_ACADEMIC_VERIFIED',
                target_model='StudentAcademicRecord', target_id=str(record.id), outcome='SUCCESS',
                details=f"Verified student {record.enrollment_number} with CGPA {record.cgpa}."
            )
        elif action == 'reject':
            record.verification_status = VerificationStatus.REJECTED
            record.verified_by = user
            record.verification_notes = notes
            record.save()
            messages.warning(request, f"Student {record.enrollment_number} verification marked as rejected.")
            log_security_event(
                request=request, actor=user, action='STUDENT_ACADEMIC_REJECTED',
                target_model='StudentAcademicRecord', target_id=str(record.id), outcome='SUCCESS',
                details=f"Rejected student {record.enrollment_number}: {notes}"
            )

        return redirect('academics:student_records')

    return render(request, 'academics/verify_student.html', {'record': record})


@login_required
@role_required(['STUDENT'])
def upload_resume_view(request):
    try:
        record = request.user.academic_record
    except StudentAcademicRecord.DoesNotExist:
        messages.error(request, "Student academic profile not found. Please contact administration.")
        return redirect('dashboard:student')

    if request.method == 'POST':
        resume_file = request.FILES.get('resume')
        if not resume_file:
            messages.error(request, "Please choose a PDF résumé file to upload.")
            return redirect('dashboard:student')

        # Security check: Validate file extension (.pdf only)
        ext = os.path.splitext(resume_file.name)[1].lower()
        if ext != '.pdf':
            log_security_event(
                request=request, actor=request.user, action='MALICIOUS_FILE_UPLOAD_BLOCKED',
                target_model='StudentAcademicRecord', target_id=str(record.id), outcome='BLOCKED',
                details=f"Attempted upload with prohibited file extension: {ext}"
            )
            messages.error(request, "Security Violation: Only PDF files (.pdf) are permitted for résumés.")
            return redirect('dashboard:student')

        # Security check: Max file size (5MB)
        if resume_file.size > 5 * 1024 * 1024:
            messages.error(request, "File exceeds maximum permitted size of 5 MB.")
            return redirect('dashboard:student')

        record.resume = resume_file
        record.save()
        log_security_event(
            request=request, actor=request.user, action='RESUME_UPLOADED',
            target_model='StudentAcademicRecord', target_id=str(record.id), outcome='SUCCESS',
            details=f"Student {request.user.username} uploaded résumé ({resume_file.name}, {resume_file.size} bytes)."
        )
        messages.success(request, "Résumé uploaded successfully.")

    return redirect('dashboard:student')
