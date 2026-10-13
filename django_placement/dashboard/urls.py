from django.urls import path
from . import views

app_name = 'dashboard'

urlpatterns = [
    path('', views.dashboard_router_view, name='index'),
    path('admin/', views.admin_dashboard_view, name='admin'),
    path('officer/', views.officer_dashboard_view, name='officer'),
    path('coordinator/', views.coordinator_dashboard_view, name='coordinator'),
    path('recruiter/', views.recruiter_dashboard_view, name='recruiter'),
    path('student/', views.student_dashboard_view, name='student'),
    path('reports/', views.reports_view, name='reports'),
]
