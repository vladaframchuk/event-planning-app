from __future__ import annotations

import sys

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils.translation import gettext as _
from drf_spectacular.openapi import AutoSchema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .emails import send_confirmation_email
from .serializers import EmailTokenObtainPairSerializer, RegistrationSerializer, ResendConfirmationSerializer
from .tasks import send_confirmation_email_async
from .utils import EmailConfirmationTokenError, verify_email_confirmation_token

User = get_user_model()


def _dispatch_confirmation_email(user: User) -> None:
    if user.pk is None:
        raise ValueError("Cannot send confirmation email for unsaved user.")

    if "pytest" in sys.modules or getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
        send_confirmation_email_async.apply(args=(user.pk,))
        return

    try:
        send_confirmation_email_async.delay(user.pk)
    except Exception:
        send_confirmation_email(user)


class RegistrationView(APIView):
    """Создаёт нового пользователя и отправляет письмо для подтверждения email."""

    permission_classes = [AllowAny]
    schema = AutoSchema()

    def post(self, request: Request) -> Response:
        serializer = RegistrationSerializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError as exc:
            errors = exc.detail
            message = _("Некорректные данные.")
            if isinstance(errors, dict):
                # Попробуем достать первое понятное сообщение об ошибке, например для email.
                for field_errors in errors.values():
                    if isinstance(field_errors, list) and field_errors:
                        message = str(field_errors[0])
                        break
            return Response(
                {"detail": message, "errors": errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = serializer.save()
        _dispatch_confirmation_email(user)
        return Response({"message": "confirmation_sent"}, status=status.HTTP_201_CREATED)


class ResendConfirmationView(APIView):
    """Повторно отправляет письмо подтверждения на указанный email."""

    permission_classes = [AllowAny]
    schema = AutoSchema()

    def post(self, request: Request) -> Response:
        serializer = ResendConfirmationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.user
        _dispatch_confirmation_email(user)
        return Response({"message": "confirmation_sent"}, status=status.HTTP_200_OK)


class LoginView(TokenObtainPairView):
    """Выдаёт access/refresh токены по email и паролю."""

    permission_classes = [AllowAny]
    serializer_class = EmailTokenObtainPairSerializer
    schema = AutoSchema()

    def post(self, request: Request, *args, **kwargs) -> Response:
        """Возвращает понятное сообщение, если пользователь ещё не подтвердил email."""
        email = request.data.get("email")
        if isinstance(email, str):
            normalized = email.strip()
            if normalized:
                try:
                    user = User.objects.get(email__iexact=normalized)
                except User.DoesNotExist:
                    pass
                else:
                    if not user.is_active:
                        message = _("Учётная запись ещё не активирована. Проверьте почту.")
                        return Response(
                            {"detail": message},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
        return super().post(request, *args, **kwargs)


class RefreshView(TokenRefreshView):
    """Выдаёт новый access-токен по refresh."""

    permission_classes = [AllowAny]
    schema = AutoSchema()


class EmailConfirmView(APIView):
    """Подтверждает email по токену из письма."""

    permission_classes = [AllowAny]
    schema = AutoSchema()

    def get(self, request: Request) -> Response:
        token = request.query_params.get("token")
        if not token:
            return Response(
                {"token": [_("Токен обязателен.")]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user_id = verify_email_confirmation_token(token)
        except EmailConfirmationTokenError as error:
            return Response(
                {"token": [str(error)]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.filter(pk=user_id).first()
        if user is None:
            return Response(
                {"token": [_("Пользователь не найден.")]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not user.is_active:
            user.is_active = True
            user.save(update_fields=["is_active"])

        return Response({"message": "email_confirmed"}, status=status.HTTP_200_OK)
