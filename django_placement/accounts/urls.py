from django.urls import path
from . import views

app_name = 'accounts'

urlpatterns = [
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    path('profile/', views.profile_view, name='profile'),
    path('users/', views.user_list_view, name='user_list'),
    path('users/create/', views.create_user_view, name='create_user'),
    path('users/<int:user_id>/toggle-status/', views.toggle_user_status_view, name='toggle_user_status'),
]
