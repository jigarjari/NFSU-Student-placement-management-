from django.urls import path
from . import views

app_name = 'companies'

urlpatterns = [
    path('', views.company_list_view, name='company_list'),
    path('<int:company_id>/', views.company_detail_view, name='company_detail'),
    path('<int:company_id>/approve/', views.approve_company_view, name='approve_company'),
]
