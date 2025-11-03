from __future__ import annotations

from django.contrib.auth import get_user_model
from django.utils.translation import gettext as _
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.schemas.openapi import AutoSchema
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .emails import send_confirmation_email
from .serializers import EmailTokenObtainPairSerializer, RegistrationSerializer, ResendConfirmationSerializer
from .utils import EmailConfirmationTokenError, verify_email_confirmation_token

User = get_user_model()


class RegistrationView(APIView):
    """Создаёт нового пользователя и отправляет письмо для подтверждения email."""

    permission_classes = [AllowAny]
    schema = AutoSchema(tags=["Аутентификация"])

    def post(self, request: Request) -> Response:
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        send_confirmation_email(user)
        return Response({"message": "confirmation_sent"}, status=status.HTTP_201_CREATED)


class ResendConfirmationView(APIView):
    """Повторно отправляет письмо подтверждения на указанный email."""

    permission_classes = [AllowAny]
    schema = AutoSchema(tags=["Аутентификация"])

    def post(self, request: Request) -> Response:
        serializer = ResendConfirmationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.user
        send_confirmation_email(user)
        return Response({"message": "confirmation_sent"}, status=status.HTTP_200_OK)


class LoginView(TokenObtainPairView):
    """Выдаёт access/refresh токены по email и паролю."""

    permission_classes = [AllowAny]
    serializer_class = EmailTokenObtainPairSerializer
    schema = AutoSchema(tags=["Аутентификация"])

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
                        message = _("Аккаунт ещё не подтверждён. Проверьте почту.")
                        return Response(
                            {"detail": message},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
        return super().post(request, *args, **kwargs)


class RefreshView(TokenRefreshView):
    """Выдаёт новый access-токен по refresh."""

    permission_classes = [AllowAny]
    schema = AutoSchema(tags=["Аутентификация"])


class EmailConfirmView(APIView):
    """Подтверждает email по токену из письма."""

    permission_classes = [AllowAny]
    schema = AutoSchema(tags=["Аутентификация"])

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
