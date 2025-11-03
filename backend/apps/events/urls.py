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
from apps.events.views_participants import (
    EventParticipantDetailView,
    EventParticipantListView,
)
from apps.tasks.views import EventProgressView

router = DefaultRouter()
router.register(r"events", EventViewSet, basename="event")

urlpatterns = [
    *router.urls,
    path(
        "events/<int:event_id>/participants",
        EventParticipantListView.as_view(),
        name="event-participants",
    ),
    path(
        "events/<int:event_id>/participants/<int:participant_id>",
        EventParticipantDetailView.as_view(),
        name="event-participant-detail",
    ),
    path(
        "events/<int:event_id>/invites",
        EventInviteCreateView.as_view(),
        name="event-invite-create",
    ),
    path(
        "events/<int:event_id>/progress",
        EventProgressView.as_view(),
        name="event-progress",
    ),
    path("invites/validate", ValidateInviteView.as_view(), name="invite-validate"),
    path("invites/accept", AcceptInviteView.as_view(), name="invite-accept"),
    path("invites/revoke", RevokeInviteView.as_view(), name="invite-revoke"),
]
