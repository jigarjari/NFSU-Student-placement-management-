import csv
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from django.contrib import messages
from accounts.decorators import role_required
from .models import AuditLog
from .services import verify_audit_integrity, log_security_event


@login_required
@role_required(['ADMIN', 'OFFICER'])
def audit_list_view(request):
    user = request.user
    role = getattr(user.profile, 'role', 'STUDENT')
    
    queryset = AuditLog.objects.all().order_by('-id')

    # Placement Officer has limited view: placement-specific logs only
    if role == 'OFFICER':
        queryset = queryset.filter(action__in=[
            'APPROVE_COMPANY', 'APPROVE_DRIVE', 'REJECT_DRIVE',
            'SUBMIT_PLACEMENT_APPLICATION', 'UPDATE_APPLICATION_STATUS',
            'ISSUE_PLACEMENT_OFFER', 'OFFER_ACCEPTED_BY_STUDENT', 'OFFER_DECLINED_BY_STUDENT'
        ])

    # Search & filters
    search_q = request.GET.get('q', '').strip()
    if search_q:
        queryset = queryset.filter(details__icontains=search_q) | queryset.filter(actor_username__icontains=search_q) | queryset.filter(action__icontains=search_q)

    outcome_filter = request.GET.get('outcome', '')
    if outcome_filter:
        queryset = queryset.filter(outcome=outcome_filter)

    role_filter = request.GET.get('role', '')
    if role_filter:
        queryset = queryset.filter(actor_role=role_filter)

    # Verification state
    integrity_result = None
    if request.GET.get('verify') == '1':
        integrity_result = verify_audit_integrity()
        log_security_event(
            request=request, actor=user, action='VERIFY_AUDIT_LOG_INTEGRITY',
            target_model='AuditLog', target_id='ALL', outcome='SUCCESS' if integrity_result['valid'] else 'TAMPER_FOUND',
            details=f"Admin {user.username} executed cryptographic integrity check: {integrity_result}"
        )

    # Export to CSV (Admin only)
    if request.GET.get('export') == 'csv' and role == 'ADMIN':
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="nfsu_security_audit_logs.csv"'
        writer = csv.writer(response)
        writer.writerow(['ID', 'Timestamp', 'Actor Username', 'Actor Role', 'Action', 'Target Model', 'Target ID', 'Outcome', 'IP Address', 'SHA-256 Hash', 'Details'])
        for item in queryset[:1000]:
            writer.writerow([
                item.id,
                item.timestamp.isoformat(),
                item.actor_username,
                item.actor_role,
                item.action,
                item.target_model,
                item.target_id,
                item.outcome,
                item.ip_address,
                item.current_hash,
                item.details
            ])
        return response

    return render(request, 'auditlog/audit_list.html', {
        'logs': queryset[:250],
        'integrity_result': integrity_result,
        'search_q': search_q,
        'outcome_filter': outcome_filter,
        'role_filter': role_filter,
        'is_admin': role == 'ADMIN',
    })
