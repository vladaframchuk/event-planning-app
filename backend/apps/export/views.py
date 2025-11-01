from __future__ import annotations

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework import exceptions
from rest_framework.negotiation import BaseContentNegotiation
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.events.models import Event, Participant
from apps.export.services import generate_event_pdf


class IgnoreAcceptContentNegotiation(BaseContentNegotiation):
    """Игнорирует заголовок Accept и выбирает первый доступный рендерер."""

    def select_renderer(self, request, renderers, format_suffix=None):
        if not renderers:
            raise exceptions.NotAcceptable()
        return renderers[0], renderers[0].media_type


class EventPdfExportView(APIView):
    """Возвращает PDF-отчёт по задачам события."""

    permission_classes = [IsAuthenticated]
    content_negotiation_class = IgnoreAcceptContentNegotiation

    def get(self, request: Request, event_id: int) -> HttpResponse | Response:
        event = get_object_or_404(Event.objects.only("id", "title", "owner_id"), id=event_id)

        is_owner = event.owner_id == request.user.id
        is_participant = (
            Participant.objects.filter(event=event, user=request.user).values_list("id", flat=True).exists()
        )
        if not (is_owner or is_participant):
            return Response(status=status.HTTP_403_FORBIDDEN)

        pdf_bytes = generate_event_pdf(event.id)

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="event_{event.id}_plan.pdf"'
        return response
