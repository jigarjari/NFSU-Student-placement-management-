from functools import wraps
from django.core.exceptions import PermissionDenied
from django.shortcuts import redirect
from django.contrib import messages
from auditlog.services import log_security_event


def role_required(allowed_roles):
    """
    Decorator enforcing that the logged-in user belongs to one of the allowed roles.
    Raises PermissionDenied (HTTP 403) or logs security alert if violated.
    """
    if isinstance(allowed_roles, str):
        allowed_roles = [allowed_roles]

    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(request, *args, **kwargs):
            if not request.user.is_authenticated:
                return redirect('accounts:login')

            profile = getattr(request.user, 'profile', None)
            user_role = profile.role if profile else ('ADMIN' if request.user.is_superuser else 'STUDENT')

            if request.user.is_superuser or user_role in allowed_roles:
                return view_func(request, *args, **kwargs)

            # Security violation: Log unauthorized access attempt
            log_security_event(
                request=request,
                actor=request.user,
                action='UNAUTHORIZED_ACCESS_ATTEMPT',
                target_model='VIEW',
                target_id=view_func.__name__,
                outcome='BLOCKED',
                details=f"User {request.user.username} with role {user_role} attempted to access {view_func.__name__} requiring {allowed_roles}"
            )
            raise PermissionDenied("Access Denied: You do not possess the required institutional authorization for this resource.")
        return _wrapped_view
    return decorator
