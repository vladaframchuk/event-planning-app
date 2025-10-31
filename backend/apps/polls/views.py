from __future__ import annotations

from collections import defaultdict
from typing import Iterable

from django.db import transaction
from django.db.models import Count, Prefetch, QuerySet
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
from apps.polls.permissions import IsEventOwner, IsEventParticipant
from apps.polls.serializers import (
    PollCreateSerializer,
    PollListItemSerializer,
    PollReadSerializer,
)


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
            return [IsAuthenticated(), IsEventParticipant()]
        return [IsAuthenticated(), IsEventOwner()]

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
        headers = self.get_success_headers(response_serializer.data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)


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
            return [IsAuthenticated(), IsEventParticipant()]
        if self.request.method == "DELETE":
            return [IsAuthenticated(), IsEventOwner()]
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
        poll.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PollVoteView(PollDetailBaseView, APIView):
    permission_classes = [IsAuthenticated, IsEventParticipant]

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
        with transaction.atomic():
            existing_votes_qs = Vote.objects.select_for_update().filter(poll=poll, user=user)
            existing_option_ids = list(existing_votes_qs.values_list("option_id", flat=True))

            if not poll.multiple:
                selected_id = option_ids[0]
                if existing_option_ids:
                    if not poll.allow_change_vote:
                        if selected_id not in existing_option_ids:
                            return Response({"detail": "Изменение голоса запрещено."}, status=status.HTTP_400_BAD_REQUEST)
                    else:
                        if selected_id not in existing_option_ids:
                            existing_votes_qs.delete()
                            Vote.objects.create(poll=poll, option_id=selected_id, user=user)
                else:
                    Vote.objects.create(poll=poll, option_id=selected_id, user=user)
            else:
                new_option_ids = set(option_ids)
                existing_option_ids_set = set(existing_option_ids)

                if existing_option_ids_set and not poll.allow_change_vote and new_option_ids != existing_option_ids_set:
                    return Response({"detail": "Изменение голоса запрещено."}, status=status.HTTP_400_BAD_REQUEST)

                to_create = new_option_ids - existing_option_ids_set
                if poll.allow_change_vote:
                    to_delete = existing_option_ids_set - new_option_ids
                    if to_delete:
                        existing_votes_qs.filter(option_id__in=to_delete).delete()
                else:
                    to_delete = set()

                Vote.objects.bulk_create(
                    [
                        Vote(poll=poll, option_id=option_id, user=user)
                        for option_id in to_create
                    ],
                    ignore_conflicts=True,
                )

        refreshed_poll = self.get_poll_queryset().get(id=poll.id)
        vote_map = self._collect_user_votes([refreshed_poll], request.user.id)
        serializer = PollReadSerializer(
            refreshed_poll,
            context={"request": request, "user_votes_map": vote_map},
        )
        return Response(serializer.data)


class PollCloseView(PollDetailBaseView, APIView):
    permission_classes = [IsAuthenticated, IsEventOwner]

    def post(self, request: Request, poll_id: int) -> Response:
        poll = self.get_object()
        if poll.is_closed:
            return Response({"message": "closed"}, status=status.HTTP_200_OK)
        poll.is_closed = True
        poll.save(update_fields=["is_closed", "updated_at"])
        return Response({"message": "closed"}, status=status.HTTP_200_OK)

