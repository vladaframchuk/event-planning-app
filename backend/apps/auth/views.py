from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .emails import send_confirmation_email
from .serializers import EmailTokenObtainPairSerializer, RegistrationSerializer
from .utils import EmailConfirmationTokenError, verify_email_confirmation_token

User = get_user_model()


class RegistrationView(APIView):
    """Создаёт неактивного пользователя и отправляет ему письмо подтверждения."""

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        send_confirmation_email(user)
        return Response({"message": "confirmation_sent"}, status=status.HTTP_201_CREATED)


class LoginView(TokenObtainPairView):
    """Выдаёт пару JWT-токенов по email и паролю активного пользователя."""

    permission_classes = [AllowAny]
    serializer_class = EmailTokenObtainPairSerializer


class RefreshView(TokenRefreshView):
    """Обновляет access-токен по refresh."""

    permission_classes = [AllowAny]


class EmailConfirmView(APIView):
    """Активирует пользователя по токену, выданному в письме подтверждения."""

    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        token = request.query_params.get("token")
        if not token:
            return Response(
                {"token": ["Токен обязателен."]},
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
                {"token": ["Пользователь не найден."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not user.is_active:
            user.is_active = True
            user.save(update_fields=["is_active"])

        return Response({"message": "email_confirmed"}, status=status.HTTP_200_OK)

