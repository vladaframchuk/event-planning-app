from __future__ import annotations

from collections import defaultdict
from typing import Any, Iterable, Mapping

from django.db import transaction
from django.db.models import Count, F, Prefetch, QuerySet
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.events.models import Event
from apps.polls.models import Poll, PollOption, Vote
from apps.events.permissions import IsEventMember, IsEventOrganizer, ReadOnlyOrEventMember
from apps.polls.serializers import (
    PollCreateSerializer,
    PollListItemSerializer,
    PollReadSerializer,
)
from apps.polls.ws_notify import ws_notify_event


def _build_poll_created_payload(event_id: int, poll_data: Mapping[str, Any]) -> dict[str, Any]:
    """Готовим структуру poll.created из сериализованных данных."""

    options = [
        {
            "id": int(option["id"]),
            "label": option.get("label"),
            "date_value": option.get("date_value"),
            "votes_count": int(option.get("votes_count", 0) or 0),
        }
        for option in poll_data.get("options", [])
    ]
    return {
        "event_id": event_id,
        "poll": {
            "id": int(poll_data["id"]),
            "type": poll_data["type"],
            "question": poll_data["question"],
            "multiple": bool(poll_data["multiple"]),
            "allow_change_vote": bool(poll_data["allow_change_vote"]),
            "is_closed": bool(poll_data["is_closed"]),
            "end_at": poll_data.get("end_at"),
            "created_at": poll_data.get("created_at"),
            "my_votes": [int(option_id) for option_id in poll_data.get("my_votes", [])],
            "options": options,
            "total_votes": int(poll_data.get("total_votes", 0) or 0),
            "leader_option_ids": [int(option_id) for option_id in poll_data.get("leader_option_ids", [])],
        },
        "version": int(poll_data.get("version", 1) or 1),
    }


def _build_poll_updated_payload(
    event_id: int,
    poll_data: Mapping[str, Any],
    *,
    changed_option_ids: set[int] | None = None,
) -> dict[str, Any]:
    """Дельта для poll.updated — только счётчики нужных опций."""

    raw_options = poll_data.get("options", [])
    filtered_ids = {int(option_id) for option_id in (changed_option_ids or set())}
    if filtered_ids:
        options_iterable = [option for option in raw_options if int(option["id"]) in filtered_ids]
    else:
        options_iterable = raw_options

    options = [
        {
            "id": int(option["id"]),
            "votes_count": int(option.get("votes_count", 0) or 0),
        }
        for option in options_iterable
    ]
    return {
        "event_id": event_id,
        "poll_id": int(poll_data["id"]),
        "options": options,
        "total_votes": int(poll_data.get("total_votes", 0) or 0),
        "leader_option_ids": [int(option_id) for option_id in poll_data.get("leader_option_ids", [])],
        "version": int(poll_data.get("version", 1) or 1),
    }


def _build_poll_closed_payload(event_id: int, poll_id: int, version: int) -> dict[str, Any]:
    return {
        "event_id": event_id,
        "poll_id": poll_id,
        "version": version,
    }


def _build_poll_deleted_payload(event_id: int, poll_id: int) -> dict[str, Any]:
    return {
        "event_id": event_id,
        "poll_id": poll_id,
    }


class PollPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 50


class PollQuerysetMixin:
    option_prefetch = Prefetch(
        "options",
        queryset=PollOption.objects.annotate(votes_count=Count("votes")).order_by("id"),
    )

    def get_poll_queryset(self) -> QuerySet[Poll]:
        return (
            Poll.objects.select_related("event")
            .prefetch_related(self.option_prefetch)
            .annotate(total_votes=Count("votes", distinct=True))
        )

    def _collect_user_votes(self, polls: Iterable[Poll], user_id: int) -> dict[int, list[int]]:
        poll_ids = [poll.id for poll in polls]
        if not poll_ids:
            return {}
        votes = (
            Vote.objects.filter(poll_id__in=poll_ids, user_id=user_id)
            .values_list("poll_id", "option_id")
        )
        vote_map: dict[int, list[int]] = defaultdict(list)
        for poll_id, option_id in votes:
            vote_map[poll_id].append(option_id)
        return vote_map


class EventScopedMixin:
    _event_cache: Event | None = None

    def get_event_id(self, request: Request) -> int | None:
        if hasattr(self, "_event_id_cache"):
            return self._event_id_cache
        raw_event_id = self.kwargs.get("event_id")
        try:
            event_id = int(raw_event_id)
        except (TypeError, ValueError):
            event_id = None
        self._event_id_cache = event_id
        return event_id

    def get_event(self) -> Event:
        if self._event_cache is not None:
            return self._event_cache
        event_id = self.get_event_id(self.request)
        if event_id is None:
            raise ValueError("Event id is required.")
        event = get_object_or_404(Event, id=event_id)
        self._event_cache = event
        return event


class EventPollListCreateView(EventScopedMixin, PollQuerysetMixin, generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    pagination_class = PollPagination
    queryset = Poll.objects.none()

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsAuthenticated(), IsEventMember()]
        return [IsAuthenticated(), IsEventOrganizer()]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return PollCreateSerializer
        return PollListItemSerializer

    def get_queryset(self) -> QuerySet[Poll]:
        event_id = self.get_event_id(self.request)
        queryset = (
            self.get_poll_queryset()
            .filter(event_id=event_id)
            .order_by("-created_at", "-id")
        )
        is_closed_param = self.request.query_params.get("is_closed")
        if is_closed_param is not None:
            if is_closed_param.lower() in {"1", "true", "yes"}:
                queryset = queryset.filter(is_closed=True)
            elif is_closed_param.lower() in {"0", "false", "no"}:
                queryset = queryset.filter(is_closed=False)
        return queryset

    def list(self, request: Request, *args, **kwargs) -> Response:
        queryset = self.filter_queryset(self.get_queryset())

        page = self.paginate_queryset(queryset)
        if page is not None:
            polls = list(page)
            vote_map = self._collect_user_votes(polls, request.user.id)
            serializer = self.get_serializer(
                polls,
                many=True,
                context={**self.get_serializer_context(), "user_votes_map": vote_map},
            )
            return self.get_paginated_response(serializer.data)

        polls = list(queryset)
        vote_map = self._collect_user_votes(polls, request.user.id)
        serializer = self.get_serializer(
            polls,
            many=True,
            context={**self.get_serializer_context(), "user_votes_map": vote_map},
        )
        return Response(serializer.data)

    def create(self, request: Request, *args, **kwargs) -> Response:
        event = self.get_event()
        serializer = self.get_serializer(
            data=request.data,
            context={**self.get_serializer_context(), "event": event},
        )
        serializer.is_valid(raise_exception=True)
        poll = serializer.save()
        detailed_poll = self.get_poll_queryset().get(id=poll.id)
        vote_map = self._collect_user_votes([detailed_poll], request.user.id)
        response_serializer = PollReadSerializer(
            detailed_poll,
            context={**self.get_serializer_context(), "user_votes_map": vote_map},
        )
        response_data = response_serializer.data
        ws_notify_event(
            event.id,
            "poll.created",
            _build_poll_created_payload(event.id, response_data),
        )
        headers = self.get_success_headers(response_data)
        return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)


class PollDetailBaseView(PollQuerysetMixin):
    lookup_url_kwarg = "poll_id"

    def get_object(self) -> Poll:
        if hasattr(self, "_cached_poll"):
            return self._cached_poll
        poll_id = self.kwargs.get(self.lookup_url_kwarg)
        poll = get_object_or_404(self.get_poll_queryset(), id=poll_id)
        self._cached_poll = poll
        return poll

    def get_event_id(self, request: Request) -> int | None:
        if hasattr(self, "_cached_poll"):
            return self._cached_poll.event_id
        poll = self.get_object()
        self._cached_poll = poll
        return poll.event_id


class PollDetailView(PollDetailBaseView, APIView):
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsAuthenticated(), ReadOnlyOrEventMember()]
        if self.request.method == "DELETE":
            return [IsAuthenticated(), IsEventOrganizer()]
        return super().get_permissions()

    def get(self, request: Request, poll_id: int) -> Response:
        poll = self.get_object()
        vote_map = self._collect_user_votes([poll], request.user.id)
        serializer = PollReadSerializer(
            poll,
            context={"request": request, "user_votes_map": vote_map},
        )
        return Response(serializer.data)

    def delete(self, request: Request, poll_id: int) -> Response:
        poll = self.get_object()
        event_id = poll.event_id
        poll_identifier = poll.id
        poll.delete()
        ws_notify_event(
            event_id,
            "poll.deleted",
            _build_poll_deleted_payload(event_id, poll_identifier),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class PollVoteView(PollDetailBaseView, APIView):
    permission_classes = [IsAuthenticated, IsEventMember]

    def post(self, request: Request, poll_id: int) -> Response:
        poll = self.get_object()
        now = timezone.now()
        if poll.is_voting_closed(now=now):
            return Response({"detail": "Голосование недоступно."}, status=status.HTTP_400_BAD_REQUEST)

        option_ids = request.data.get("option_ids")
        if not isinstance(option_ids, list):
            return Response({"option_ids": ["Нужно передать список идентификаторов."]}, status=status.HTTP_400_BAD_REQUEST)

        try:
            option_ids = [int(option_id) for option_id in option_ids]
        except (TypeError, ValueError):
            return Response({"option_ids": ["Идентификаторы должны быть целыми числами."]}, status=status.HTTP_400_BAD_REQUEST)

        if not poll.multiple and len(option_ids) != 1:
            return Response({"option_ids": ["Для этого опроса можно выбрать только один вариант."]}, status=status.HTTP_400_BAD_REQUEST)

        if poll.multiple and len(option_ids) != len(set(option_ids)):
            return Response({"option_ids": ["Варианты не должны повторяться."]}, status=status.HTTP_400_BAD_REQUEST)

        available_option_ids = {option.id for option in poll.options.all()}
        invalid_options = [option_id for option_id in option_ids if option_id not in available_option_ids]
        if invalid_options:
            return Response({"option_ids": ["Указаны варианты, которые не принадлежат опросу."]}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        changed = False
        touched_option_ids: set[int] = set()

        with transaction.atomic():
            existing_votes_qs = Vote.objects.select_for_update().filter(poll=poll, user=user)
            existing_option_ids = list(existing_votes_qs.values_list("option_id", flat=True))

            if not poll.multiple:
                selected_id = option_ids[0]
                if existing_option_ids:
                    if not poll.allow_change_vote:
                        if selected_id not in existing_option_ids:
                            return Response({"detail": "????????? ?????? ?????????."}, status=status.HTTP_400_BAD_REQUEST)
                    else:
                        if selected_id not in existing_option_ids:
                            touched_option_ids.update(existing_option_ids)
                            deleted_count, _ = existing_votes_qs.delete()
                            if deleted_count:
                                changed = True
                            Vote.objects.create(poll=poll, option_id=selected_id, user=user)
                            changed = True
                            touched_option_ids.add(selected_id)
                else:
                    Vote.objects.create(poll=poll, option_id=selected_id, user=user)
                    changed = True
                    touched_option_ids.add(selected_id)
            else:
                new_option_ids = set(option_ids)
                existing_option_ids_set = set(existing_option_ids)

                if existing_option_ids_set and not poll.allow_change_vote and new_option_ids != existing_option_ids_set:
                    return Response({"detail": "????????? ?????? ?????????."}, status=status.HTTP_400_BAD_REQUEST)

                to_create = new_option_ids - existing_option_ids_set
                if poll.allow_change_vote:
                    to_delete = existing_option_ids_set - new_option_ids
                    if to_delete:
                        touched_option_ids.update(to_delete)
                        deleted_count, _ = existing_votes_qs.filter(option_id__in=to_delete).delete()
                        if deleted_count:
                            changed = True

                if to_create:
                    Vote.objects.bulk_create(
                        [
                            Vote(poll=poll, option_id=option_id, user=user)
                            for option_id in to_create
                        ],
                        ignore_conflicts=True,
                    )
                    changed = True
                    touched_option_ids.update(to_create)

            if changed:
                Poll.objects.filter(id=poll.id).update(
                    version=F("version") + 1,
                    updated_at=timezone.now(),
                )

        refreshed_poll = self.get_poll_queryset().get(id=poll.id)
        vote_map = self._collect_user_votes([refreshed_poll], request.user.id)
        serializer = PollReadSerializer(
            refreshed_poll,
            context={"request": request, "user_votes_map": vote_map},
        )
        response_data = serializer.data
        if changed:
            ws_notify_event(
                refreshed_poll.event_id,
                "poll.updated",
                _build_poll_updated_payload(
                    refreshed_poll.event_id,
                    response_data,
                    changed_option_ids=touched_option_ids,
                ),
            )
        return Response(response_data)


class PollCloseView(PollDetailBaseView, APIView):
    permission_classes = [IsAuthenticated, IsEventOrganizer]

    def post(self, request: Request, poll_id: int) -> Response:
        poll = self.get_object()
        if poll.is_closed:
            return Response({"message": "closed"}, status=status.HTTP_200_OK)
        poll.is_closed = True
        poll.version += 1
        poll.save(update_fields=["is_closed", "updated_at", "version"])
        ws_notify_event(
            poll.event_id,
            "poll.closed",
            _build_poll_closed_payload(poll.event_id, poll.id, poll.version),
        )
        return Response({"message": "closed"}, status=status.HTTP_200_OK)

