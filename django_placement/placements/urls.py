from django.urls import path
from . import views

app_name = 'placements'

urlpatterns = [
    path('', views.drive_list_view, name='drive_list'),
    path('create/', views.create_drive_view, name='create_drive'),
    path('policy/', views.policy_config_view, name='policy_config'),
    path('<int:drive_id>/', views.drive_detail_view, name='drive_detail'),
    path('<int:drive_id>/approve/', views.approve_drive_view, name='approve_drive'),
]
