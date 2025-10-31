from __future__ import annotations

from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import View

from apps.events.models import Event, Participant


class IsEventParticipant(BasePermission):
    """Доступ разрешён только владельцу события и его участникам."""

    message = "Только участники события могут работать с чатом."

    def has_permission(self, request: Request, view: View) -> bool:
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request: Request, view: View, obj: Event) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if obj.owner_id == user.id:
            return True
        return Participant.objects.filter(event=obj, user=user).exists()

