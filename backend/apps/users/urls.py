from django.urls import path

from .views import (
    AvatarUploadView,
    ChangePasswordView,
    EmailChangeConfirmView,
    EmailChangeInitView,
    MeView,
    NotificationSettingsView,
)

app_name = "users"

urlpatterns = [
    path("me", MeView.as_view(), name="me"),
    path("me/change-password", ChangePasswordView.as_view(), name="change-password"),
    path("me/avatar", AvatarUploadView.as_view(), name="avatar-upload"),
    path(
        "account/email/change-init",
        EmailChangeInitView.as_view(),
        name="email-change-init",
    ),
    path(
        "account/email/change-confirm",
        EmailChangeConfirmView.as_view(),
        name="email-change-confirm",
    ),
    path(
        "account/notifications",
        NotificationSettingsView.as_view(),
        name="notification-settings",
    ),
]
