from __future__ import annotations

from typing import Any

from django.db.models import Model
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import View

from apps.events.models import Event, Participant
from apps.polls.models import Poll


def _resolve_event_id_from_view(view: View, request: Request) -> int | None:
    getter = getattr(view, "get_event_id", None)
    if callable(getter):
        return getter(request)
    return None


def _extract_event_id(obj: Model) -> int | None:
    if isinstance(obj, Poll):
        return obj.event_id
    return getattr(obj, "event_id", None)


class IsEventParticipant(BasePermission):
    message = "Доступно только участникам события."

    def has_permission(self, request: Request, view: View) -> bool:
        event_id = _resolve_event_id_from_view(view, request)
        if event_id is None:
            return True
        return Participant.objects.filter(event_id=event_id, user=request.user).exists()

    def has_object_permission(self, request: Request, view: View, obj: Model) -> bool:
        event_id = _extract_event_id(obj)
        if event_id is None:
            return False
        return Participant.objects.filter(event_id=event_id, user=request.user).exists()


class IsEventOwner(BasePermission):
    message = "Только владелец события может выполнить это действие."

    def has_permission(self, request: Request, view: View) -> bool:
        event_id = _resolve_event_id_from_view(view, request)
        if event_id is None:
            return True
        return Event.objects.filter(id=event_id, owner=request.user).exists()

    def has_object_permission(self, request: Request, view: View, obj: Model) -> bool:
        event_id = _extract_event_id(obj)
        if event_id is None:
            return False
        return Event.objects.filter(id=event_id, owner=request.user).exists()

