from __future__ import annotations

import os
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.core.files.storage import default_storage
from django.urls import reverse
from PIL import Image, UnidentifiedImageError
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import (
    EmailChangeRequestSerializer,
    MeSerializer,
    MeUpdateSerializer,
    PasswordChangeSerializer,
)
from .utils import EmailChangeTokenError, make_email_change_token, verify_email_change_token

User = get_user_model()


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = MeSerializer(request.user, context={"request": request})
        return Response(serializer.data)

    def patch(self, request):
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
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

    def post(self, request):
        avatar_file = request.FILES.get("avatar")
        if avatar_file is None:
            return Response(
                {"avatar": ["Файл обязателен."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        extension = os.path.splitext(avatar_file.name)[1].lower()
        if extension not in self.ALLOWED_EXTENSIONS:
            return Response(
                {"avatar": ["Допустимы только изображения форматов .jpg, .jpeg, .png, .webp."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with Image.open(avatar_file) as image:
                image.verify()
        except (UnidentifiedImageError, OSError):
            return Response(
                {"avatar": ["Загрузите корректный файл изображения."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        finally:
            avatar_file.seek(0)

        user = request.user
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
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChangeEmailRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = EmailChangeRequestSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        new_email = serializer.validated_data["new_email"]
        token = make_email_change_token(request.user.pk, new_email)  # type: ignore[arg-type]

        confirm_path = reverse("users:change-email-confirm")
        confirm_query = urlencode({"token": token})
        confirm_url = request.build_absolute_uri(f"{confirm_path}?{confirm_query}")

        subject = "Confirm your new email address"
        message = (
            "You requested to change the email address for your account.\n\n"
            f"To confirm the change, open the following link:\n{confirm_url}\n\n"
            "If you did not request this change, you can ignore this email."
        )
        from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@example.com")
        send_mail(subject, message, from_email, [new_email])

        return Response(status=status.HTTP_204_NO_CONTENT)


class ChangeEmailConfirmView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        token = request.query_params.get("token")
        if not token:
            return Response(
                {"detail": "Token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user_id, new_email = verify_email_change_token(token)
        except EmailChangeTokenError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if user.email.lower() == new_email.lower():
            return Response(
                {"detail": "Email already confirmed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(email__iexact=new_email).exclude(pk=user.pk).exists():
            return Response(
                {"detail": "This email is already in use."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.email = new_email
        user.save(update_fields=["email"])

        return Response({"detail": "Email updated successfully."}, status=status.HTTP_200_OK)
