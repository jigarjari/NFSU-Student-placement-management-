from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from django.contrib import messages

from accounts.decorators import role_required
from .models import Company, CompanyApprovalStatus, RecruiterMembership
from auditlog.services import log_security_event


@login_required
def company_list_view(request):
    user = request.user
    profile = getattr(user, 'profile', None)

    # Recruiters can ONLY see their own company!
    if profile and profile.role == 'RECRUITER':
        membership = RecruiterMembership.objects.filter(user=user).select_related('company').first()
        companies = [membership.company] if membership else []
    else:
        companies = Company.objects.all()

    return render(request, 'companies/company_list.html', {'companies': companies})


@login_required
def company_detail_view(request, company_id):
    company = get_object_or_404(Company, id=company_id)
    user = request.user
    profile = getattr(user, 'profile', None)

    # IDOR Prevention: If recruiter, must match their own company!
    if profile and profile.role == 'RECRUITER':
        membership = RecruiterMembership.objects.filter(user=user, company=company).first()
        if not membership:
            log_security_event(
                request=request, actor=user, action='IDOR_ATTEMPT_CROSS_COMPANY_ACCESS',
                target_model='Company', target_id=str(company.id), outcome='BLOCKED',
                details=f"Recruiter {user.username} tried to view details of unauthorized company #{company.id} ({company.name})."
            )
            raise PermissionDenied("Access Denied: You are not authorized to view or manage details for another company.")

    drives = company.drives.all()
    return render(request, 'companies/company_detail.html', {'company': company, 'drives': drives})


@login_required
@role_required(['ADMIN', 'OFFICER'])
def approve_company_view(request, company_id):
    company = get_object_or_404(Company, id=company_id)

    if request.method == 'POST':
        action = request.POST.get('action')
        reason = request.POST.get('reason', '').strip()

        if action == 'approve':
            company.approval_status = CompanyApprovalStatus.APPROVED
            company.approved_by = request.user
            company.rejection_reason = ''
            company.save()
            messages.success(request, f"Company '{company.name}' has been successfully approved.")
            log_security_event(
                request=request, actor=request.user, action='COMPANY_APPROVED',
                target_model='Company', target_id=str(company.id), outcome='SUCCESS',
                details=f"Placement Officer {request.user.username} approved company {company.name}"
            )
        elif action == 'reject':
            company.approval_status = CompanyApprovalStatus.REJECTED
            company.approved_by = request.user
            company.rejection_reason = reason
            company.save()
            messages.warning(request, f"Company '{company.name}' registration was rejected.")
            log_security_event(
                request=request, actor=request.user, action='COMPANY_REJECTED',
                target_model='Company', target_id=str(company.id), outcome='SUCCESS',
                details=f"Company {company.name} rejected: {reason}"
            )

        return redirect('companies:company_detail', company_id=company.id)

    return render(request, 'companies/approve_company.html', {'company': company})
