from __future__ import annotations

from datetime import timedelta

from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import ParseError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.request import Request

from apps.chat.models import Message
from apps.chat.permissions import IsEventParticipant
from apps.chat.serializers import MessageCreateSerializer, MessageSerializer
from apps.chat.ws_notify import ws_chat_send
from apps.events.models import Event

MESSAGE_RATE_LIMIT = timedelta(seconds=0.8)


class MessagePagination(PageNumberPagination):
    """Настройки пагинации сообщений."""

    page_size = 30
    page_size_query_param = "page_size"
    max_page_size = 100


class EventMessageListCreateView(generics.GenericAPIView):
    """Просмотр и создание сообщений по событию."""

    permission_classes = [IsEventParticipant]
    serializer_class = MessageSerializer
    pagination_class = MessagePagination

    def get_serializer_class(self) -> type[MessageSerializer] | type[MessageCreateSerializer]:
        if self.request.method == "POST":
            return MessageCreateSerializer
        return MessageSerializer

    def get_event(self) -> Event:
        event = get_object_or_404(Event, pk=self.kwargs["event_id"])
        self.check_object_permissions(self.request, event)
        return event

    def _parse_int_param(self, request: Request, name: str) -> int | None:
        raw = request.query_params.get(name)
        if raw in (None, ""):
            return None
        try:
            value = int(raw)
        except (TypeError, ValueError) as exc:
            raise ParseError(f"Параметр {name} должен быть целым числом.") from exc
        if value < 0:
            raise ParseError(f"Параметр {name} должен быть положительным.")
        return value

    def get_queryset(self) -> QuerySet[Message]:
        event = self.get_event()
        queryset = Message.objects.filter(event=event).select_related("author")

        before_id = self._parse_int_param(self.request, "before_id")
        after_id = self._parse_int_param(self.request, "after_id")
        self._ordered_desc = False
        if before_id is not None:
            queryset = queryset.filter(id__lt=before_id)
            queryset = queryset.order_by("-created_at", "-id")
            self._ordered_desc = True
        elif after_id is not None:
            queryset = queryset.filter(id__gt=after_id)

        if not self._ordered_desc:
            queryset = queryset.order_by("created_at", "id")

        return queryset

    def get(self, request: Request, *args, **kwargs) -> Response:
        queryset = self.get_queryset()
        page = self.paginate_queryset(queryset)
        if page is not None:
            items = list(page)
            if getattr(self, "_ordered_desc", False):
                items = list(reversed(items))
            serializer = MessageSerializer(items, many=True, context={"request": request})
            return self.get_paginated_response(serializer.data)

        items = list(queryset)
        if getattr(self, "_ordered_desc", False):
            items.reverse()
        serializer = MessageSerializer(items, many=True, context={"request": request})
        return Response(serializer.data)

    def post(self, request: Request, *args, **kwargs) -> Response:
        event = self.get_event()
        serializer = MessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        text = serializer.validated_data["text"].strip()

        user = request.user
        assert user is not None  # для mypy

        last_message = (
            Message.objects.filter(event=event, author=user)
            .order_by("-created_at", "-id")
            .first()
        )
        if last_message is not None:
            elapsed = timezone.now() - last_message.created_at
            if elapsed < MESSAGE_RATE_LIMIT:
                return Response(
                    {"detail": "Слишком часто отправляете сообщения. Повторите позже."},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )

        message = Message.objects.create(event=event, author=user, text=text)
        response_serializer = MessageSerializer(message, context={"request": request})
        response_data = response_serializer.data

        chat_payload = {
            "id": response_data["id"],
            "event": response_data["event"],
            "author": response_data["author"],
            "author_name": response_data["author_name"],
            "author_avatar": response_data["author_avatar"],
            "text": response_data["text"],
            "created_at": response_data["created_at"],
        }
        ws_chat_send(event.id, "chat.message", chat_payload)

        return Response(response_data, status=status.HTTP_201_CREATED)
