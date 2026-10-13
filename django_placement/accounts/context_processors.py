def user_role_context(request):
    """
    Injects user role flags into all template contexts safely.
    """
    if request.user.is_authenticated:
        profile = getattr(request.user, 'profile', None)
        role = profile.role if profile else ('ADMIN' if request.user.is_superuser else 'STUDENT')
        return {
            'user_profile': profile,
            'user_role': role,
            'is_admin': profile.is_admin if profile else request.user.is_superuser,
            'is_officer': profile.is_officer if profile else request.user.is_superuser,
            'is_coordinator': profile.is_coordinator if profile else False,
            'is_recruiter': profile.is_recruiter if profile else False,
            'is_student': profile.is_student if profile else False,
        }
    return {
        'user_profile': None,
        'user_role': None,
        'is_admin': False,
        'is_officer': False,
        'is_coordinator': False,
        'is_recruiter': False,
        'is_student': False,
    }
