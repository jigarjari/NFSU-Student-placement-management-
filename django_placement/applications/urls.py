from django.urls import path
from . import views

app_name = 'applications'

urlpatterns = [
    path('apply/<int:drive_id>/', views.apply_drive_view, name='apply_drive'),
    path('my-applications/', views.my_applications_view, name='my_applications'),
    path('drive/<int:drive_id>/applicants/', views.applicant_list_view, name='applicant_list'),
    path('<int:application_id>/update-status/', views.update_status_view, name='update_status'),
    path('<int:application_id>/schedule-interview/', views.schedule_interview_view, name='schedule_interview'),
    path('<int:application_id>/issue-offer/', views.issue_offer_view, name='issue_offer'),
    path('offer/<int:offer_id>/respond/', views.respond_offer_view, name='respond_offer'),
    path('<int:application_id>/withdraw/', views.withdraw_application_view, name='withdraw_application'),
]
