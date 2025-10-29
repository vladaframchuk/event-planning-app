from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.tasks.views import (
    BoardView,
    ReorderTaskListsView,
    ReorderTasksInListView,
    TaskListViewSet,
    TaskViewSet,
)

router = DefaultRouter()
router.register("tasklists", TaskListViewSet, basename="tasklist")
router.register("tasks", TaskViewSet, basename="task")

urlpatterns = [
    path("", include(router.urls)),
    path("events/<int:event_id>/board", BoardView.as_view(), name="event-board"),
    path("events/<int:event_id>/tasklists/reorder", ReorderTaskListsView.as_view()),
    path("tasklists/<int:list_id>/tasks/reorder", ReorderTasksInListView.as_view()),
]
