from django.urls import path
from . import views

app_name = 'academics'

urlpatterns = [
    path('courses/', views.course_list_view, name='course_list'),
    path('students/', views.student_records_view, name='student_records'),
    path('students/<int:record_id>/verify/', views.verify_student_view, name='verify_student'),
    path('students/upload-resume/', views.upload_resume_view, name='upload_resume'),
]
