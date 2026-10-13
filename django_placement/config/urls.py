from django.contrib import admin
from django.urls import path, include
from django.shortcuts import redirect
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', lambda request: redirect('dashboard:index'), name='home'),
    path('accounts/', include('accounts.urls', namespace='accounts')),
    path('academics/', include('academics.urls', namespace='academics')),
    path('companies/', include('companies.urls', namespace='companies')),
    path('placements/', include('placements.urls', namespace='placements')),
    path('applications/', include('applications.urls', namespace='applications')),
    path('auditlog/', include('auditlog.urls', namespace='auditlog')),
    path('dashboard/', include('dashboard.urls', namespace='dashboard')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
