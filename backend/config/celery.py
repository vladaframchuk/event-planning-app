from __future__ import annotations

import os

from celery import Celery

from config import metrics

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

celery_app = Celery("event_planning_app")
celery_app.config_from_object("django.conf:settings", namespace="CELERY")
celery_app.autodiscover_tasks()


@celery_app.task(bind=True)
def debug_task(self, *args, **kwargs):  # type: ignore[no-untyped-def]
    print(f"Request: {self.request!r}, args={args}, kwargs={kwargs}")


def _ensure_metrics() -> None:
    _ = metrics.CELERY_TASK_STARTED


_ensure_metrics()
