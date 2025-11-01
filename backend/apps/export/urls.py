from django.urls import path

from apps.export.views import EventPdfExportView

urlpatterns = [
    path("events/<int:event_id>/export/pdf", EventPdfExportView.as_view(), name="event-export-pdf"),
]
