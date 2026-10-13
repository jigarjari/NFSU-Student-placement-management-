from .models import AuditLog


def get_client_ip(request):
    if not request:
        return '127.0.0.1'
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '127.0.0.1')


def log_security_event(request=None, actor=None, action='ACTION', target_model='', target_id='', outcome='SUCCESS', details=''):
    """
    Records an immutable audit event in the SHA-256 cryptographic chain.
    """
    username = 'ANONYMOUS'
    role = 'UNAUTHENTICATED'

    if actor and actor.is_authenticated:
        username = actor.username
        profile = getattr(actor, 'profile', None)
        role = profile.role if profile else ('ADMIN' if actor.is_superuser else 'STUDENT')
    elif request and request.user.is_authenticated:
        username = request.user.username
        profile = getattr(request.user, 'profile', None)
        role = profile.role if profile else ('ADMIN' if request.user.is_superuser else 'STUDENT')

    ip = get_client_ip(request)

    return AuditLog.objects.create(
        actor_username=username,
        actor_role=role,
        action=action,
        target_model=target_model,
        target_id=str(target_id),
        outcome=outcome,
        details=str(details),
        ip_address=ip
    )


def verify_audit_integrity():
    """
    Iterates through the audit log chain from genesis forward to verify cryptographic integrity.
    Returns: { valid: bool, total: int, broken_at: int or None }
    """
    logs = list(AuditLog.objects.order_by('id'))
    if not logs:
        return {'valid': True, 'total': 0, 'broken_at': None}

    expected_prev = 'GENESIS_HASH_NFSU_2026'
    for idx, entry in enumerate(logs):
        if entry.prev_hash != expected_prev:
            return {'valid': False, 'total': len(logs), 'broken_at': entry.id, 'reason': f"Hash break at record #{entry.id}"}
        
        computed = entry.compute_hash()
        if entry.current_hash != computed:
            return {'valid': False, 'total': len(logs), 'broken_at': entry.id, 'reason': f"Tamper detected in record #{entry.id}"}
        
        expected_prev = entry.current_hash

    return {'valid': True, 'total': len(logs), 'broken_at': None}
