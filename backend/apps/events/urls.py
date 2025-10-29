from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.events.views import EventViewSet
from apps.events.views_invites import (
    AcceptInviteView,
    EventInviteCreateView,
    RevokeInviteView,
    ValidateInviteView,
)

router = DefaultRouter()
router.register(r"events", EventViewSet, basename="event")

urlpatterns = [
    *router.urls,
    path(
        "events/<int:event_id>/invites",
        EventInviteCreateView.as_view(),
        name="event-invite-create",
    ),
    path("invites/validate", ValidateInviteView.as_view(), name="invite-validate"),
    path("invites/accept", AcceptInviteView.as_view(), name="invite-accept"),
    path("invites/revoke", RevokeInviteView.as_view(), name="invite-revoke"),
]
