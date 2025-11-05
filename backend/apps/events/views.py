from __future__ import annotations

from django.db import IntegrityError
from django.db.models import Q, QuerySet
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.events.models import Event, Participant
from apps.events.permissions import IsEventOrganizer, ReadOnlyOrEventMember
from apps.events.serializers import EventCreateUpdateSerializer, EventSerializer


class EventPagination(PageNumberPagination):
    """Пагинация по 10 событий на страницу."""

    page_size = 10


class EventViewSet(viewsets.ModelViewSet):
    """CRUD эндпоинт для управления событиями."""

    queryset = Event.objects.none()
    serializer_class = EventSerializer
    permission_classes = (IsAuthenticated,)
    filter_backends = (
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    )
    filterset_fields = ("category",)
    search_fields = ("title", "description", "location")
    ordering_fields = ("start_at",)
    ordering = ("start_at",)
    pagination_class = EventPagination

    def get_queryset(self) -> QuerySet[Event]:
        """Возвращаем события, где пользователь владелец или участник."""
        user = self.request.user
        return (
            Event.objects.filter(Q(owner=user) | Q(participants__user=user))
            .select_related("owner")
            .prefetch_related("participants")
            .distinct()
        )

    def get_serializer_class(
        self,
    ) -> type[EventSerializer] | type[EventCreateUpdateSerializer]:
        """Для записи используем упрощённый сериализатор."""
        if self.action in {"create", "update", "partial_update"}:
            return EventCreateUpdateSerializer
        return EventSerializer

    def create(self, request: Request, *args, **kwargs) -> Response:
        """Создаём событие и возвращаем данные для чтения."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        read_serializer = EventSerializer(
            serializer.instance, context=self.get_serializer_context()
        )
        headers = self.get_success_headers(read_serializer.data)
        return Response(
            read_serializer.data, status=status.HTTP_201_CREATED, headers=headers
        )

    def update(self, request: Request, *args, **kwargs) -> Response:
        """Обновляем событие и возвращаем данные для чтения."""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        read_serializer = EventSerializer(
            serializer.instance, context=self.get_serializer_context()
        )
        return Response(read_serializer.data)

    def partial_update(self, request: Request, *args, **kwargs) -> Response:
        """Частично обновляем событие и возвращаем данные для чтения."""
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def perform_create(self, serializer: EventCreateUpdateSerializer) -> None:
        """Проставляем владельца и создаём организатора-участника."""
        event = serializer.save(owner=self.request.user)
        try:
            Participant.objects.get_or_create(
                event=event,
                user=self.request.user,
                defaults={"role": Participant.Role.ORGANIZER},
            )
        except IntegrityError:
            # Если участник уже существует из-за гонки, просто обновим роль организатора.
            Participant.objects.filter(event=event, user=self.request.user).update(
                role=Participant.Role.ORGANIZER,
            )

    def filter_queryset(self, queryset: QuerySet[Event]) -> QuerySet[Event]:
        """Дополнительно фильтруем по признаку будущих событий."""
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
            return queryset.filter(start_at__gt=now)
        return queryset.filter(Q(start_at__lte=now) | Q(start_at__isnull=True))

    @action(detail=False, methods=["get"], url_path="categories")
    def categories(self, request: Request) -> Response:
        """Возвращает уникальные категории событий пользователя."""
        categories_qs = (
            self.get_queryset()
            .exclude(category__isnull=True)
            .exclude(category__exact="")
            .values_list("category", flat=True)
            .distinct()
            .order_by("category")
        )
        return Response({"categories": list(categories_qs)})

    def get_permissions(self) -> list[BasePermission]:
        action = getattr(self, "action", None)
        if action in {"list", "create", "categories"}:
            return [IsAuthenticated()]
        if action == "retrieve":
            return [IsAuthenticated(), ReadOnlyOrEventMember()]
        return [IsAuthenticated(), IsEventOrganizer()]
