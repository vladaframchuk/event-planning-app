"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from django.urls import include, path
from django_prometheus import urls as prometheus_urls
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from apps.health.views import HealthView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health", HealthView.as_view(), name="health"),
    path("doc/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("doc/swagger/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("doc/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    path("doc/", SpectacularRedocView.as_view(url_name="schema")),
    path("api/auth/", include("apps.auth.urls")),
    path("api/", include("apps.events.urls")),
    path("api/", include("apps.users.urls")),
    path("api/", include("apps.tasks.urls")),
    path("api/", include("apps.polls.urls")),
    path("api/", include("apps.chat.urls")),
    path("api/", include("apps.export.urls")),
    path("api/", include("apps.notifications.urls")),
    path("metrics/", include(prometheus_urls)),
]

if settings.DEBUG:
    urlpatterns += staticfiles_urlpatterns()

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
