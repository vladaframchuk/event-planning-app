from django.urls import path

from apps.export.views import EventExportCSVView, EventExportXLSView, EventPdfExportView

urlpatterns = [
    path("events/<int:event_id>/export/pdf", EventPdfExportView.as_view(), name="event-export-pdf"),
    path("events/<int:event_id>/export/csv", EventExportCSVView.as_view(), name="event-export-csv"),
    path("events/<int:event_id>/export/xls", EventExportXLSView.as_view(), name="event-export-xls"),
]
