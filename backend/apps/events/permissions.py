from __future__ import annotations

from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.request import Request
from rest_framework.views import View

from apps.events.models import Event, Participant


class IsEventOwnerOrReadOnly(BasePermission):
    """SAFE-методы доступны участникам события, редактирование — только владельцу."""

    message = "Редактировать событие может только владелец."

    def has_permission(self, request: Request, view: View) -> bool:
        """Проверяем, что пользователь аутентифицирован."""
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request: Request, view: View, obj: Event) -> bool:
        """SAFE-методы доступны участникам, а запись — только владельцу."""
        if request.method in SAFE_METHODS:
            if obj.owner_id == request.user.id:
                return True
            return obj.participants.filter(user=request.user).exists()

        if obj.owner_id == request.user.id:
            return True

        return Participant.objects.filter(
            event=obj,
            user=request.user,
            role=Participant.Role.ORGANIZER,
        ).exists()
