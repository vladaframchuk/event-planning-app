from __future__ import annotations

from datetime import datetime
from typing import Literal

from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.events.models import Event, Invite, Participant
from apps.events.serializers import InviteCreateSerializer, InviteReadSerializer

InviteStatus = Literal["ok", "expired", "revoked", "exhausted"]


def _determine_status(invite: Invite, now: datetime) -> InviteStatus:
    """Возвращает статус инвайта относительно текущего времени."""
    if invite.is_revoked:
        return "revoked"
    if invite.expires_at <= now:
        return "expired"
    if invite.max_uses != 0 and invite.uses_count >= invite.max_uses:
        return "exhausted"
    return "ok"


class EventInviteCreateView(APIView):
    """Создание инвайта владельцем события."""

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, event_id: int) -> Response:
        event = get_object_or_404(Event, pk=event_id)
        if event.owner_id != request.user.id:
            return Response(
                {"detail": "Недостаточно прав для создания инвайта."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = InviteCreateSerializer(
            data=request.data,
            context={"event": event, "user": request.user},
        )
        serializer.is_valid(raise_exception=True)
        invite = serializer.save()
        read_serializer = InviteReadSerializer(invite)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)


class ValidateInviteView(APIView):
    """Публичная проверка инвайта по токену."""

    permission_classes = (AllowAny,)

    def get(self, request: Request) -> Response:
        token = request.query_params.get("token")
        if not token:
            return Response(
                {"status": "not_found", "event": None, "uses_left": None, "expires_at": None},
                status=status.HTTP_200_OK,
            )

        try:
            invite = Invite.objects.select_related("event").get(token=token)
        except Invite.DoesNotExist:
            return Response(
                {"status": "not_found", "event": None, "uses_left": None, "expires_at": None},
                status=status.HTTP_200_OK,
            )

        now = timezone.now()
        status_code = _determine_status(invite, now)
        uses_left = None
        if invite.max_uses != 0:
            uses_left = max(invite.max_uses - invite.uses_count, 0)

        event_payload = {
            "id": invite.event_id,
            "title": invite.event.title,
            "location": invite.event.location,
            "start_at": invite.event.start_at.isoformat() if invite.event.start_at else None,
        }

        response_payload = {
            "status": status_code,
            "event": event_payload,
            "uses_left": uses_left,
            "expires_at": invite.expires_at.isoformat(),
        }
        return Response(response_payload, status=status.HTTP_200_OK)


class AcceptInviteView(APIView):
    """Принятие приглашения и добавление участника."""

    permission_classes = (IsAuthenticated,)

    ERROR_MESSAGES: dict[InviteStatus, str] = {
        "revoked": "Инвайт отозван.",
        "expired": "Инвайт просрочен.",
        "exhausted": "Инвайт исчерпан.",
    }

    def post(self, request: Request) -> Response:
        token = (request.data or {}).get("token")
        if not token:
            return Response(
                {"detail": "Требуется токен инвайта.", "code": "invalid_token"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            initial_invite = Invite.objects.select_related("event").get(token=token)
        except Invite.DoesNotExist:
            return Response(
                {"detail": "Инвайт не найден.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        with transaction.atomic():
            invite = (
                Invite.objects.select_for_update()
                .select_related("event")
                .get(pk=initial_invite.pk)
            )

            already_member = Participant.objects.filter(
                event=invite.event,
                user=request.user,
            ).exists()
            if already_member:
                return Response(
                    {"message": "already_member"},
                    status=status.HTTP_200_OK,
                )

            now = timezone.now()
            status_code = _determine_status(invite, now)
            if status_code != "ok":
                detail = self.ERROR_MESSAGES.get(status_code, "Инвайт недоступен.")
                return Response(
                    {"detail": detail, "code": status_code},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            Participant.objects.create(
                event=invite.event,
                user=request.user,
                role=Participant.Role.MEMBER,
            )
            Invite.objects.filter(pk=invite.pk).update(uses_count=F("uses_count") + 1)

        return Response(
            {"message": "joined", "event_id": initial_invite.event_id},
            status=status.HTTP_201_CREATED,
        )


class RevokeInviteView(APIView):
    """Отзыв инвайта владельцем события."""

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:
        token = (request.data or {}).get("token")
        if not token:
            return Response(
                {"detail": "Требуется токен инвайта.", "code": "invalid_token"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        invite = get_object_or_404(
            Invite.objects.select_related("event"),
            token=token,
        )
        if invite.event.owner_id != request.user.id:
            return Response(
                {"detail": "Недостаточно прав для отзыва инвайта."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not invite.is_revoked:
            invite.is_revoked = True
            invite.save(update_fields=["is_revoked", "updated_at"])

        return Response({"message": "revoked"}, status=status.HTTP_200_OK)
