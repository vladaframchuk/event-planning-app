from __future__ import annotations

from typing import Any, Tuple

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import exceptions, status
from rest_framework.negotiation import BaseContentNegotiation
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from drf_spectacular.openapi import AutoSchema
from rest_framework.views import APIView

from apps.events.models import Event, Participant
from apps.export.services import generate_event_pdf
from apps.export.utils import generate_event_csv, generate_event_xls


class IgnoreAcceptContentNegotiation(BaseContentNegotiation):
    """Отключает учёт заголовка Accept при отдаче бинарных файлов."""

    def select_renderer(self, request, renderers, format_suffix=None):
        if not renderers:
            raise exceptions.NotAcceptable()
        return renderers[0], renderers[0].media_type


def _fetch_event_and_membership(event_id: int, user: Any) -> Tuple[Event, bool]:
    """Возвращает событие и флаг доступа, если пользователь участвует в нём."""

    event = get_object_or_404(Event.objects.only("id", "title", "owner_id"), id=event_id)

    if not getattr(user, "is_authenticated", False):
        return event, False
    if event.owner_id == getattr(user, "id", None):
        return event, True
    is_participant = Participant.objects.filter(event_id=event.id, user=user).values_list("id", flat=True).exists()
    return event, is_participant


class EventPdfExportView(APIView):
    """Возвращает PDF-файл с планом по задачам события."""

    permission_classes = [IsAuthenticated]
    content_negotiation_class = IgnoreAcceptContentNegotiation
    schema = AutoSchema()

    def get(self, request: Request, event_id: int) -> HttpResponse | Response:
        event, allowed = _fetch_event_and_membership(event_id, request.user)
        if not allowed:
            return Response(status=status.HTTP_403_FORBIDDEN)

        pdf_bytes = generate_event_pdf(event.id)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="event_{event.id}_plan.pdf"'
        return response


class EventExportCSVView(APIView):
    """Возвращает CSV-файл с задачами и опросами события."""

    permission_classes = [IsAuthenticated]
    content_negotiation_class = IgnoreAcceptContentNegotiation
    schema = AutoSchema()

    def get(self, request: Request, event_id: int) -> HttpResponse | Response:
        event, allowed = _fetch_event_and_membership(event_id, request.user)
        if not allowed:
            return Response(status=status.HTTP_403_FORBIDDEN)

        csv_bytes = generate_event_csv(event.id)
        response = HttpResponse(csv_bytes, content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="event_{event.id}_plan.csv"'
        return response


class EventExportXLSView(APIView):
    """Возвращает XLS-файл с задачами и опросами события."""

    permission_classes = [IsAuthenticated]
    content_negotiation_class = IgnoreAcceptContentNegotiation
    schema = AutoSchema()

    def get(self, request: Request, event_id: int) -> HttpResponse | Response:
        event, allowed = _fetch_event_and_membership(event_id, request.user)
        if not allowed:
            return Response(status=status.HTTP_403_FORBIDDEN)

        xls_bytes = generate_event_xls(event.id)
        response = HttpResponse(
            xls_bytes,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="event_{event.id}_plan.xlsx"'
        return response
