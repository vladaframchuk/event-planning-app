from __future__ import annotations

from typing import Iterable

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.schemas.openapi import AutoSchema
from rest_framework.views import APIView

from apps.events.models import Event, Participant
from apps.events.permissions import IsEventOrganizer
from apps.events.serializers import (
    ParticipantRoleUpdateSerializer,
    ParticipantSerializer,
)


class EventParticipantPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class EventParticipantListView(generics.ListAPIView):
    serializer_class = ParticipantSerializer
    pagination_class = EventParticipantPagination
    permission_classes = [IsAuthenticated, IsEventOrganizer]
    schema = AutoSchema(tags=["Events"])

    ordering_map = {
        "name": "user__name",
        "role": "role",
    }

    def get_event(self) -> Event:
        if not hasattr(self, "_event"):
            event = get_object_or_404(Event.objects.all(), pk=self.kwargs["event_id"])
            self._event = event
        event = self._event  # type: ignore[attr-defined]
        self.check_object_permissions(self.request, event)
        return event

    def _resolve_ordering(self, raw_value: str) -> list[str]:
        if not raw_value:
            return ["user__name"]
        fields: list[str] = []
        for token in raw_value.split(","):
            normalized = token.strip()
            if not normalized:
                continue
            descending = normalized.startswith("-")
            key = normalized[1:] if descending else normalized
            db_field = self.ordering_map.get(key, "user__name")
            if descending:
                fields.append(f"-{db_field}")
            else:
                fields.append(db_field)
        if not fields:
            fields.append("user__name")
        return fields

    def get_queryset(self) -> QuerySet[Participant]:
        event = self.get_event()
        ordering_param = self.request.query_params.get("ordering", "name")
        order_fields = self._resolve_ordering(ordering_param)
        return (
            Participant.objects.filter(event=event)
            .select_related("user")
            .order_by(*order_fields, "id")
        )

    def get_serializer_context(self) -> dict[str, object]:
        context = super().get_serializer_context()
        context["request"] = self.request
        return context


class EventParticipantDetailView(APIView):
    permission_classes = [IsAuthenticated, IsEventOrganizer]
    schema = AutoSchema(tags=["Events"])

    def get_event(self) -> Event:
        if not hasattr(self, "_event"):
            event = get_object_or_404(Event.objects.all(), pk=self.kwargs["event_id"])
            self._event = event
        event = self._event  # type: ignore[attr-defined]
        self.check_object_permissions(self.request, event)
        return event

    def get_participant(self) -> Participant:
        event = self.get_event()
        participant = get_object_or_404(
            Participant.objects.select_related("user"),
            event=event,
            pk=self.kwargs["participant_id"],
        )
        self.check_object_permissions(self.request, participant)
        return participant

    def _other_organizers_exist(self, event: Event, exclude: Iterable[int]) -> bool:
        qs = Participant.objects.filter(event=event, role=Participant.Role.ORGANIZER)
        if exclude:
            qs = qs.exclude(pk__in=list(exclude))
        return qs.exists()

    def _error(self, code: str, detail: str, *, status_code: int = status.HTTP_400_BAD_REQUEST) -> Response:
        return Response({"code": code, "detail": detail}, status=status_code)

    def _extract_validation_detail(self, error: DjangoValidationError) -> str:
        if hasattr(error, "message_dict"):
            detail_list = error.message_dict.get("detail")
            if detail_list:
                first = detail_list[0]
                if isinstance(first, str):
                    return first
                return str(first)
        if hasattr(error, "messages") and error.messages:
            first_message = error.messages[0]
            if isinstance(first_message, str):
                return first_message
            return str(first_message)
        return "Operation is not allowed."

    def _build_serializer(self, participant: Participant) -> ParticipantSerializer:
        serializer = ParticipantSerializer(participant, context={"request": self.request})
        return serializer

    def patch(self, request: Request, event_id: int, participant_id: int) -> Response:
        participant = self.get_participant()
        serializer = ParticipantRoleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_role = serializer.validated_data["role"]
        if new_role == participant.role:
            return Response(self._build_serializer(participant).data)

        if participant.role == Participant.Role.ORGANIZER and new_role != Participant.Role.ORGANIZER:
            other_exists = self._other_organizers_exist(participant.event, {participant.pk})
            if participant.user_id == request.user.id and not other_exists:
                 has_other_participants = (
                     participant.event.participants.exclude(pk=participant.pk).exists()
                 )
                 return self._error(
                    "self_last_organizer" if has_other_participants else "last_organizer",
                    "Cannot change your role because you are the only organizer.",
                )
            if not other_exists:
                return self._error("last_organizer", "Cannot demote the last organizer.")

        participant.role = new_role
        try:
            with transaction.atomic():
                participant.save(update_fields=["role"])
        except DjangoValidationError as exc:
            detail = self._extract_validation_detail(exc)
            return self._error("last_organizer", detail)

        return Response(self._build_serializer(participant).data)

    def delete(self, request: Request, event_id: int, participant_id: int) -> Response:
        participant = self.get_participant()
        if participant.role == Participant.Role.ORGANIZER:
            other_exists = self._other_organizers_exist(participant.event, {participant.pk})
            if participant.user_id == request.user.id and not other_exists:
                return self._error(
                    "last_organizer",
                    "Cannot remove yourself because you are the only organizer.",
                )
            if not other_exists:
                return self._error("last_organizer", "Cannot remove the last organizer.")

        try:
            with transaction.atomic():
                participant.delete()
        except DjangoValidationError as exc:
            detail = self._extract_validation_detail(exc)
            return self._error("last_organizer", detail)
        return Response(status=status.HTTP_204_NO_CONTENT)





