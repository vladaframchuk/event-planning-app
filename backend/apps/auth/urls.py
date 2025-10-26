from __future__ import annotations

from django.urls import path

from .views import EmailConfirmView, LoginView, RefreshView, RegistrationView

urlpatterns = [
    path("register", RegistrationView.as_view(), name="auth-register"),
    path("login", LoginView.as_view(), name="auth-login"),
    path("refresh", RefreshView.as_view(), name="auth-refresh"),
    path("confirm", EmailConfirmView.as_view(), name="auth-confirm"),
]

