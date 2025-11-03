from __future__ import annotations

import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.utils.translation import gettext as _
from PIL import Image, UnidentifiedImageError
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.schemas.openapi import AutoSchema
from rest_framework.views import APIView

from apps.common.emailing import send_templated_email

from .serializers import (
    EmailChangeRequestSerializer,
    MeSerializer,
    MeUpdateSerializer,
    NotificationSettingsSerializer,
    PasswordChangeSerializer,
)
from .utils import EmailChangeTokenError, make_email_change_token, verify_email_change_token

User = get_user_model()


def _invalidate_user_refresh_tokens(user: User) -> None:
    """Принудительно отзывает все refresh-токены пользователя."""
    try:
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
    except ImportError:
        return

    outstanding_tokens = OutstandingToken.objects.filter(user=user)
    for outstanding in outstanding_tokens:
        BlacklistedToken.objects.get_or_create(token=outstanding)
    outstanding_tokens.delete()


def _build_frontend_url(path: str, token: str) -> str:
    """Формирует ссылку на фронтенд с передачей токена подтверждения."""
    base_url = settings.SITE_URL.rstrip("/")
    return f"{base_url.rstrip('/')}{path}?token={token}"


class MeView(APIView):
    """Возвращает и обновляет профиль текущего пользователя."""

    permission_classes = [IsAuthenticated]
    schema = AutoSchema(tags=["Профиль"])

    def get(self, request: Request) -> Response:
        serializer = MeSerializer(request.user, context={"request": request})
        return Response(serializer.data)

    def patch(self, request: Request) -> Response:
        serializer = MeUpdateSerializer(
            request.user,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        response_serializer = MeSerializer(instance, context={"request": request})
        return Response(response_serializer.data)


class AvatarUploadView(APIView):
    """Загружает и валидационно сохраняет аватар пользователя."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]
    schema = AutoSchema(tags=["Профиль"])

    ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

    def post(self, request: Request) -> Response:
        avatar_file = request.FILES.get("avatar")
        if avatar_file is None:
            return Response(
                {"avatar": [_("Файл с изображением обязателен.")]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        extension = os.path.splitext(avatar_file.name)[1].lower()
        if extension not in self.ALLOWED_EXTENSIONS:
            return Response(
                {"avatar": [_("Допустимые форматы: .jpg, .jpeg, .png, .webp.")]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with Image.open(avatar_file) as image:
                image.verify()
        except (UnidentifiedImageError, OSError):
            return Response(
                {"avatar": [_("Не удалось распознать файл как изображение.")]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        finally:
            avatar_file.seek(0)

        user: User = request.user  # type: ignore[assignment]
        relative_path = f"users/{user.pk}/avatar{extension}"
        previous_name = user.avatar.name if user.avatar else None

        if previous_name and previous_name != relative_path and default_storage.exists(previous_name):
            default_storage.delete(previous_name)

        if default_storage.exists(relative_path):
            default_storage.delete(relative_path)

        saved_name = default_storage.save(relative_path, avatar_file)
        absolute_url = request.build_absolute_uri(f"{settings.MEDIA_URL}{saved_name}")

        user.avatar = saved_name
        user.avatar_url = absolute_url
        user.save(update_fields=["avatar", "avatar_url"])

        return Response({"avatar_url": absolute_url}, status=status.HTTP_201_CREATED)


class ChangePasswordView(APIView):
    """Обновляет пароль аутентифицированного пользователя."""

    permission_classes = [IsAuthenticated]
    schema = AutoSchema(tags=["Профиль"])

    def post(self, request: Request) -> Response:
        serializer = PasswordChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class EmailChangeInitView(APIView):
    """Запускает процесс смены email: генерирует токен и отправляет письмо на новый адрес."""

    permission_classes = [IsAuthenticated]
    schema = AutoSchema(tags=["Профиль"])

    def post(self, request: Request) -> Response:
        serializer = EmailChangeRequestSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        user: User = request.user  # type: ignore[assignment]
        new_email: str = serializer.validated_data["new_email"]
        token = make_email_change_token(user.pk, new_email)  # type: ignore[arg-type]

        confirmation_link = _build_frontend_url("/auth/email-change", token)

        send_templated_email(
            to=[new_email],
            subject=_("Подтвердите новый адрес электронной почты"),
            template="email/email_change_confirm.html",
            context={
                "user": user,
                "new_email": new_email,
                "confirmation_link": confirmation_link,
                "token": token,
            },
        )

        return Response(
            {"detail": _("Письмо с подтверждением отправлено на новый адрес.")},
            status=status.HTTP_200_OK,
        )


class EmailChangeConfirmView(APIView):
    """Подтверждает смену email по токену и отзывает refresh-токены."""

    permission_classes = [AllowAny]
    schema = AutoSchema(tags=["Профиль"])

    def get(self, request: Request) -> Response:
        token = request.query_params.get("token")
        if not token:
            return Response(
                {"detail": _("Токен подтверждения обязателен.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user_id, new_email = verify_email_change_token(token)
        except EmailChangeTokenError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"detail": _("Пользователь не найден.")}, status=status.HTTP_404_NOT_FOUND)

        if user.email.lower() == new_email.lower():
            return Response(
                {"detail": _("Адрес уже подтверждён ранее.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(email__iexact=new_email).exclude(pk=user.pk).exists():
            return Response(
                {"detail": _("Этот адрес уже используется другим аккаунтом.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.email = new_email
        user.save(update_fields=["email"])

        _invalidate_user_refresh_tokens(user)

        return Response(
            {"detail": _("Email успешно обновлён. Пожалуйста, войдите заново.")},
            status=status.HTTP_200_OK,
        )


class NotificationSettingsView(APIView):
    """Позволяет включать или отключать email-уведомления пользователя."""

    permission_classes = [IsAuthenticated]
    schema = AutoSchema(tags=["Профиль"])

    def patch(self, request: Request) -> Response:
        serializer = NotificationSettingsSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        user: User = request.user  # type: ignore[assignment]
        return Response(
            {"email_notifications_enabled": user.email_notifications_enabled},
            status=status.HTTP_200_OK,
        )
