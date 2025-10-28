from django.urls import path

from .views import AvatarUploadView, ChangeEmailConfirmView, ChangeEmailRequestView, ChangePasswordView, MeView

app_name = "users"

urlpatterns = [
    path("me", MeView.as_view(), name="me"),
    path("me/change-password", ChangePasswordView.as_view(), name="change-password"),
    path("me/change-email/request", ChangeEmailRequestView.as_view(), name="change-email-request"),
    path("me/change-email/confirm", ChangeEmailConfirmView.as_view(), name="change-email-confirm"),
    path("me/avatar", AvatarUploadView.as_view(), name="avatar-upload"),
]
