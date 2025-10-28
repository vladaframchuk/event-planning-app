from __future__ import annotations

from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.request import Request
from rest_framework.views import View

from apps.events.models import Event


class IsEventParticipantOrReadOnly(BasePermission):
    """Разрешает чтение события только владельцу или участнику."""

    message = "Доступ к событию разрешён только участникам."

    def has_permission(self, request: Request, view: View) -> bool:
        """Чтение доступно всем аутентифицированным пользователям, проверка на уровне объекта."""
        return True

    def has_object_permission(self, request: Request, view: View, obj: Event) -> bool:
        """Проверяет, что пользователь владелец или участник события."""
        if request.method in SAFE_METHODS:
            if obj.owner_id == request.user.id:
                return True
            return obj.participants.filter(user=request.user).exists()
        return True


class IsOwnerForWrite(BasePermission):
    """Разрешает изменения событий только владельцу."""

    message = "Только владелец события может изменять или удалять его."

    def has_permission(self, request: Request, view: View) -> bool:
        """Создание и чтение доступны аутентифицированным пользователям."""
        return True

    def has_object_permission(self, request: Request, view: View, obj: Event) -> bool:
        """Проверяет, что изменения выполняет владелец события."""
        if request.method in SAFE_METHODS:
            return True
        return obj.owner_id == request.user.id
