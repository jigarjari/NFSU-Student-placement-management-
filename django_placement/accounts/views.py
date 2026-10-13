from datetime import timedelta
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.utils import timezone

from .models import UserProfile, UserRole
from .forms import LoginForm, UserCreationByAdminForm, UserProfileEditForm
from .decorators import role_required
from auditlog.services import log_security_event


def login_view(request):
    if request.user.is_authenticated:
        return redirect('dashboard:index')

    if request.method == 'POST':
        form = LoginForm(request.POST)
        if form.is_valid():
            username = form.cleaned_data['username'].strip()
            password = form.cleaned_data['password']

            # Check if user exists to enforce account lockout
            user_obj = User.objects.filter(username=username).first()
            if not user_obj:
                user_obj = User.objects.filter(email=username).first()

            if user_obj:
                profile, _ = UserProfile.objects.get_or_create(
                    user=user_obj,
                    defaults={'full_name': user_obj.get_full_name() or user_obj.username, 'role': UserRole.STUDENT}
                )
                if profile.is_locked:
                    mins_remaining = int((profile.lockout_until - timezone.now()).total_seconds() / 60) + 1
                    log_security_event(
                        request=request, actor=user_obj, action='SECURITY_ALERT_LOGIN_ACCOUNT_LOCKED',
                        target_model='User', target_id=str(user_obj.id), outcome='BLOCKED',
                        details=f"Login attempt on locked account {user_obj.username}. Lock active for {mins_remaining} more minutes."
                    )
                    messages.error(request, f"Account Temporarily Locked: 5 failed attempts detected. Please wait {mins_remaining} minutes before trying again.")
                    return render(request, 'accounts/login.html', {'form': form})

            # Authenticate credentials
            user = authenticate(request, username=username, password=password)
            if not user and user_obj:
                user = authenticate(request, username=user_obj.username, password=password)

            if user is not None:
                profile = getattr(user, 'profile', None)
                if profile and not profile.is_active_profile:
                    log_security_event(
                        request=request, actor=user, action='LOGIN_BLOCKED_DEACTIVATED_USER',
                        target_model='User', target_id=str(user.id), outcome='BLOCKED',
                        details=f"Deactivated account {user.username} tried to log in."
                    )
                    messages.error(request, "Account Deactivated: Please contact the Placement Cell administration.")
                    return render(request, 'accounts/login.html', {'form': form})

                # Successful login: Reset failed attempts
                if profile:
                    profile.failed_login_attempts = 0
                    profile.lockout_until = None
                    profile.save()

                login(request, user)
                log_security_event(
                    request=request, actor=user, action='USER_LOGIN_SUCCESS',
                    target_model='User', target_id=str(user.id), outcome='SUCCESS',
                    details=f"Session established for {user.username} ({profile.role if profile else 'USER'})"
                )
                messages.success(request, f"Welcome back, {user.get_full_name() or user.username}!")
                next_url = request.GET.get('next')
                return redirect(next_url if next_url else 'dashboard:index')

            else:
                # Failed login: Increment lockout tracker
                if user_obj and hasattr(user_obj, 'profile'):
                    profile = user_obj.profile
                    profile.failed_login_attempts += 1
                    if profile.failed_login_attempts >= 5:
                        profile.lockout_until = timezone.now() + timedelta(minutes=15)
                        log_security_event(
                            request=request, actor=user_obj, action='SECURITY_ALERT_ACCOUNT_LOCKOUT_TRIGGERED',
                            target_model='User', target_id=str(user_obj.id), outcome='ALERT',
                            details=f"5 consecutive failed login attempts on {user_obj.username}. Account locked for 15 minutes."
                        )
                        messages.error(request, "Account Temporarily Locked: 5 consecutive failed sign-in attempts detected under NFSU Cybersecurity Protocols.")
                    else:
                        remaining = 5 - profile.failed_login_attempts
                        messages.error(request, f"Invalid institutional credentials. Attempts remaining before lock: {remaining}")
                    profile.save()
                else:
                    messages.error(request, "Invalid institutional credentials.")

                log_security_event(
                    request=request, actor=None, action='SECURITY_ALERT_LOGIN_FAILED',
                    target_model='AUTH', target_id=username, outcome='FAILURE',
                    details=f"Failed login attempt for username: {username}"
                )
    else:
        form = LoginForm()

    return render(request, 'accounts/login.html', {'form': form})


@login_required
def logout_view(request):
    user = request.user
    log_security_event(
        request=request, actor=user, action='USER_LOGOUT_SUCCESS',
        target_model='User', target_id=str(user.id), outcome='SUCCESS',
        details=f"User {user.username} signed out."
    )
    logout(request)
    messages.info(request, "You have been securely signed out.")
    return redirect('accounts:login')


@login_required
@role_required(['ADMIN'])
def user_list_view(request):
    users = User.objects.select_related('profile').all().order_by('-date_joined')
    return render(request, 'accounts/user_list.html', {'users': users})


@login_required
@role_required(['ADMIN'])
def create_user_view(request):
    if request.method == 'POST':
        form = UserCreationByAdminForm(request.POST)
        if form.is_valid():
            user = User.objects.create_user(
                username=form.cleaned_data['username'],
                email=form.cleaned_data['email'],
                password=form.cleaned_data['password'],
                first_name=form.cleaned_data['full_name']
            )
            UserProfile.objects.create(
                user=user,
                role=form.cleaned_data['role'],
                full_name=form.cleaned_data['full_name'],
                phone_number=form.cleaned_data.get('phone_number')
            )
            log_security_event(
                request=request, actor=request.user, action='ADMIN_CREATE_USER',
                target_model='User', target_id=str(user.id), outcome='SUCCESS',
                details=f"Admin {request.user.username} created user {user.username} with role {form.cleaned_data['role']}"
            )
            messages.success(request, f"User account '{user.username}' created successfully.")
            return redirect('accounts:user_list')
    else:
        form = UserCreationByAdminForm()

    return render(request, 'accounts/create_user.html', {'form': form})


@login_required
@role_required(['ADMIN'])
def toggle_user_status_view(request, user_id):
    target_user = get_object_or_404(User, id=user_id)
    if target_user == request.user:
        messages.error(request, "Operation Denied: You cannot deactivate your own administrative account.")
        return redirect('accounts:user_list')

    profile = getattr(target_user, 'profile', None)
    if profile:
        profile.is_active_profile = not profile.is_active_profile
        profile.save()
        target_user.is_active = profile.is_active_profile
        target_user.save()

        action = 'USER_ACTIVATED' if profile.is_active_profile else 'USER_DEACTIVATED'
        log_security_event(
            request=request, actor=request.user, action=action,
            target_model='User', target_id=str(target_user.id), outcome='SUCCESS',
            details=f"Admin {request.user.username} toggled status of {target_user.username} to active={profile.is_active_profile}"
        )
        messages.success(request, f"User '{target_user.username}' status updated to {'Active' if profile.is_active_profile else 'Deactivated'}.")

    return redirect('accounts:user_list')


@login_required
def profile_view(request):
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    if request.method == 'POST':
        form = UserProfileEditForm(request.POST, instance=profile)
        if form.is_valid():
            form.save()
            log_security_event(
                request=request, actor=request.user, action='PROFILE_UPDATE',
                target_model='UserProfile', target_id=str(profile.id), outcome='SUCCESS',
                details=f"User {request.user.username} updated profile information."
            )
            messages.success(request, "Profile updated successfully.")
            return redirect('accounts:profile')
    else:
        form = UserProfileEditForm(instance=profile)

    return render(request, 'accounts/profile.html', {'form': form, 'profile': profile})
