from __future__ import annotations

from django.urls import re_path

from apps.events.consumers import EventConsumer

websocket_urlpatterns = [
    re_path(r"^ws/events/(?P<event_id>\d+)/$", EventConsumer.as_asgi()),
]
