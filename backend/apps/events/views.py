from __future__ import annotations

from django.db.models import Prefetch, Q, QuerySet
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.events.models import Event, Participant
from apps.events.permissions import IsEventParticipantOrReadOnly, IsOwnerForWrite
from apps.events.serializers import EventCreateUpdateSerializer, EventSerializer


class EventViewSet(viewsets.ModelViewSet):
    """Вьюсет CRUD для событий с фильтрами и проверкой ролей."""

    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated, IsEventParticipantOrReadOnly, IsOwnerForWrite]
    filterset_fields = ["category"]
    search_fields = ["title"]
    ordering_fields = ["start_at", "created_at"]
    ordering = ["start_at"]

    def get_queryset(self) -> QuerySet[Event]:
        """Возвращает события, доступные текущему пользователю."""
        user = self.request.user
        participation_prefetch = Prefetch(
            "participants",
            queryset=Participant.objects.filter(user=user),
            to_attr="current_user_participation",
        )
        return (
            Event.objects.filter(Q(owner=user) | Q(participants__user=user))
            .select_related("owner")
            .prefetch_related(participation_prefetch)
            .distinct()
        )

    def get_serializer_class(self):
        """Использует отдельный сериализатор для записи данных."""
        if self.action in {"create", "update", "partial_update"}:
            return EventCreateUpdateSerializer
        return EventSerializer

    def create(self, request: Request, *args, **kwargs) -> Response:
        """Создаёт событие и возвращает его полное представление."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        read_serializer = EventSerializer(
            serializer.instance,
            context=self.get_serializer_context(),
        )
        headers = self.get_success_headers(read_serializer.data)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request: Request, *args, **kwargs) -> Response:
        """Обновляет событие и возвращает полное представление."""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        read_serializer = EventSerializer(
            serializer.instance,
            context=self.get_serializer_context(),
        )
        return Response(read_serializer.data)

    def partial_update(self, request: Request, *args, **kwargs) -> Response:
        """Частично обновляет событие и возвращает полное представление."""
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def perform_create(self, serializer: EventCreateUpdateSerializer) -> None:
        """Сохраняет событие и добавляет владельца как организатора."""
        event = serializer.save(owner=self.request.user)
        Participant.objects.get_or_create(
            event=event,
            user=self.request.user,
            defaults={"role": Participant.Role.ORGANIZER},
        )

    def filter_queryset(self, queryset: QuerySet[Event]) -> QuerySet[Event]:
        """Применяет стандартные фильтры и дополнительный фильтр по будущим событиям."""
        queryset = super().filter_queryset(queryset)
        if self.action != "list":
            return queryset

        upcoming_param = self.request.query_params.get("upcoming")
        if upcoming_param is None:
            return queryset

        normalized = upcoming_param.lower()
        if normalized not in {"true", "false"}:
            return queryset

        now = timezone.now()
        if normalized == "true":
            return queryset.filter(start_at__gte=now)
        return queryset.filter(Q(start_at__lt=now) | Q(start_at__isnull=True))
