from __future__ import annotations

from typing import Any

from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.request import Request
from rest_framework.views import View

from apps.events.models import Event, Participant


def _resolve_event_id_from_view(view: View, request: Request) -> int | None:
    getter = getattr(view, "get_event_id", None)
    if callable(getter):
        try:
            event_id = getter(request)
        except TypeError:
            event_id = getter()  # type: ignore[call-arg]
        if event_id is None:
            return None
        try:
            return int(event_id)
        except (TypeError, ValueError):
            return None
    kwargs = getattr(view, "kwargs", {})
    for key in ("event_id", "event_pk"):
        if key not in kwargs:
            continue
        try:
            return int(kwargs[key])
        except (TypeError, ValueError):
            continue
    pk_value = kwargs.get("pk")
    if pk_value is None:
        return None
    try:
        event_id = int(pk_value)
    except (TypeError, ValueError):
        return None
    if not Event.objects.filter(id=event_id).exists():
        return None
    return event_id


def _resolve_event_id_from_object(obj: Any) -> int | None:
    if obj is None:
        return None
    if isinstance(obj, Event):
        return obj.id
    event_id = getattr(obj, "event_id", None)
    if isinstance(event_id, int):
        return event_id
    event = getattr(obj, "event", None)
    if event is not None:
        resolved = _resolve_event_id_from_object(event)
        if resolved is not None:
            return resolved
    for attr in ("list", "poll", "option", "message", "task"):
        related = getattr(obj, attr, None)
        if related is None:
            continue
        resolved = _resolve_event_id_from_object(related)
        if resolved is not None:
            return resolved
    return None


def _extract_request_keys(data_source: Any) -> set[str]:
    if data_source is None:
        return set()
    if isinstance(data_source, dict):
        return {str(key) for key in data_source.keys()}
    if hasattr(data_source, "keys"):
        try:
            return {str(key) for key in data_source.keys()}
        except TypeError:
            return set()
    return set()


def _is_task_instance(obj: Any) -> bool:
    return getattr(obj, "__class__", None).__name__ == "Task"


class _ParticipantRoleResolver:
    def __init__(self) -> None:
        self._role_cache: dict[tuple[int, int], str | None] = {}
        self._owner_cache: dict[tuple[int, int], bool] = {}

    def _get_role(self, event_id: int, user_id: int) -> str | None:
        cache_key = (event_id, user_id)
        if cache_key not in self._role_cache:
            role = (
                Participant.objects.filter(event_id=event_id, user_id=user_id)
                .values_list("role", flat=True)
                .first()
            )
            self._role_cache[cache_key] = role
        return self._role_cache[cache_key]

    def _is_participant(self, event_id: int, user_id: int) -> bool:
        if self._is_event_owner(event_id, user_id):
            return True
        return self._get_role(event_id, user_id) is not None

    def _is_organizer(self, event_id: int, user_id: int) -> bool:
        if self._is_event_owner(event_id, user_id):
            return True
        return self._get_role(event_id, user_id) == Participant.Role.ORGANIZER

    def _is_event_owner(self, event_id: int, user_id: int) -> bool:
        if not isinstance(event_id, int) or not isinstance(user_id, int):
            return False
        cache_key = (event_id, user_id)
        if cache_key not in self._owner_cache:
            self._owner_cache[cache_key] = Event.objects.filter(id=event_id, owner_id=user_id).exists()
        return self._owner_cache[cache_key]


class ReadOnlyOrEventMember(_ParticipantRoleResolver, BasePermission):
    """
    Allows read access to event participants and delegates write checks to other permissions.
    """

    message = "Only event participants can access this resource."

    def has_permission(self, request: Request, view: View) -> bool:
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return False
        if request.method in SAFE_METHODS:
            event_id = _resolve_event_id_from_view(view, request)
            if event_id is None:
                return True
            return self._is_participant(event_id, user.id)
        return True

    def has_object_permission(self, request: Request, view: View, obj: Any) -> bool:
        if request.method not in SAFE_METHODS:
            return True
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return False
        event_id = _resolve_event_id_from_object(obj)
        if event_id is None:
            return False
        return self._is_participant(event_id, user.id)


class IsEventMember(_ParticipantRoleResolver, BasePermission):
    """Restricts access to event participants."""

    message = "Only event participants can perform this action."

    def has_permission(self, request: Request, view: View) -> bool:
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return False
        event_id = _resolve_event_id_from_view(view, request)
        if event_id is None:
            return True
        return self._is_participant(event_id, user.id)

    def has_object_permission(self, request: Request, view: View, obj: Any) -> bool:
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return False
        event_id = _resolve_event_id_from_object(obj)
        if event_id is None:
            return False
        return self._is_participant(event_id, user.id)


class IsEventOrganizer(_ParticipantRoleResolver, BasePermission):
    """Restricts access to event organizers."""

    message = "Only event organizers can perform this action."

    def has_permission(self, request: Request, view: View) -> bool:
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return False
        event_id = _resolve_event_id_from_view(view, request)
        if event_id is None:
            return True
        return self._is_organizer(event_id, user.id)

    def has_object_permission(self, request: Request, view: View, obj: Any) -> bool:
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return False
        event_id = _resolve_event_id_from_object(obj)
        if event_id is None:
            return False
        return self._is_organizer(event_id, user.id)


class IsTaskEditor(_ParticipantRoleResolver, BasePermission):
    """Grants task editing rights to organizers and task assignees for status updates."""

    message = "You do not have permission to modify this task."
    _status_only_fields = {"status"}

    def _is_status_only_update(self, request: Request) -> bool:
        keys = _extract_request_keys(getattr(request, "data", None))
        return bool(keys) and keys <= self._status_only_fields

    def has_permission(self, request: Request, view: View) -> bool:
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return False
        if request.method in SAFE_METHODS:
            return True
        event_id = _resolve_event_id_from_view(view, request)
        if event_id is None:
            return True
        if not self._is_participant(event_id, user.id):
            return False
        if self._is_organizer(event_id, user.id):
            return True
        action = getattr(view, "action", None)
        if action == "status":
            return True
        if request.method in {"PATCH", "PUT"} and self._is_status_only_update(request):
            return True
        return False

    def has_object_permission(self, request: Request, view: View, obj: Any) -> bool:
        if request.method in SAFE_METHODS:
            return True
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return False
        event_id = _resolve_event_id_from_object(obj)
        if event_id is None:
            return False
        if not self._is_participant(event_id, user.id):
            return False
        if self._is_organizer(event_id, user.id):
            return True
        if not _is_task_instance(obj):
            return False
        assignee = getattr(obj, "assignee", None)
        if assignee is None or getattr(assignee, "user_id", None) != user.id:
            return False
        action = getattr(view, "action", None)
        if action == "status":
            return True
        if request.method in {"PATCH", "PUT"} and self._is_status_only_update(request):
            return True
        return False
