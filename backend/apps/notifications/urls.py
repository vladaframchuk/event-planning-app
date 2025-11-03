from __future__ import annotations

from django.urls import path

from .views import NotificationTestView

app_name = "notifications"

urlpatterns = [
    path("notifications/test", NotificationTestView.as_view(), name="test"),
]
