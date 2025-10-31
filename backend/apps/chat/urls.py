from django.urls import path

from apps.chat.views import EventMessageListCreateView

urlpatterns = [
    path("events/<int:event_id>/messages", EventMessageListCreateView.as_view(), name="event-messages"),
]

