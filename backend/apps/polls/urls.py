from django.urls import path

from apps.polls.views import (
    EventPollListCreateView,
    PollCloseView,
    PollDetailView,
    PollVoteView,
)

urlpatterns = [
    path(
        "events/<int:event_id>/polls",
        EventPollListCreateView.as_view(),
        name="event-polls",
    ),
    path("polls/<int:poll_id>", PollDetailView.as_view(), name="poll-detail"),
    path("polls/<int:poll_id>/vote", PollVoteView.as_view(), name="poll-vote"),
    path("polls/<int:poll_id>/close", PollCloseView.as_view(), name="poll-close"),
]
