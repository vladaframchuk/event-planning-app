from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.schemas.openapi import AutoSchema
from rest_framework.views import APIView

from apps.common.emailing import send_templated_email
from apps.users.models import User


class NotificationTestView(APIView):
    """Отправляет авторизованному пользователю тестовое письмо."""

    permission_classes = [IsAuthenticated]
    schema = AutoSchema(tags=["Уведомления"])

    def post(self, request: Request) -> Response:
        user: User = request.user  # type: ignore[assignment]
        if not user.email:
            return Response(
                {"detail": "У пользователя отсутствует email."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        send_templated_email(
            to=[user.email],
            subject="Тестовое уведомление Event Planner",
            template="email/test_notification.html",
            context={"user": user},
        )
        return Response({"detail": "email_sent"}, status=status.HTTP_200_OK)
