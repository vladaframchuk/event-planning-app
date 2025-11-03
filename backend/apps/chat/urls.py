from django.urls import path

from apps.chat.views import EventMessageDetailView, EventMessageListCreateView

urlpatterns = [
    path("events/<int:event_id>/messages", EventMessageListCreateView.as_view(), name="event-messages"),
    path("events/<int:event_id>/messages/<int:message_id>", EventMessageDetailView.as_view(), name="event-message-detail"),
]



