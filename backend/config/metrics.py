from __future__ import annotations

import time
from typing import Any

from celery import Task
from celery.signals import (
    before_task_publish,
    task_failure,
    task_postrun,
    task_prerun,
    task_retry,
)
from prometheus_client import Counter, Gauge, Histogram

CELERY_TASK_STARTED: Counter = Counter(
    "celery_task_started_total",
    "Total Celery tasks started",
    ["task"],
)
CELERY_TASK_SUCCEEDED: Counter = Counter(
    "celery_task_succeeded_total",
    "Total Celery tasks succeeded",
    ["task"],
)
CELERY_TASK_FAILED: Counter = Counter(
    "celery_task_failed_total",
    "Total Celery tasks failed",
    ["task", "exception"],
)
CELERY_TASK_RETRIED: Counter = Counter(
    "celery_task_retried_total",
    "Total Celery task retries",
    ["task"],
)
CELERY_TASK_DURATION: Histogram = Histogram(
    "celery_task_duration_seconds",
    "Duration of Celery tasks",
    ["task"],
)
CELERY_QUEUE_LATENCY: Histogram = Histogram(
    "celery_task_queue_latency_seconds",
    "Latency between task publish and execution",
    ["task"],
)
CELERY_ACTIVE_TASKS: Gauge = Gauge(
    "celery_tasks_active",
    "Active Celery tasks",
    ["task"],
)
WS_ACTIVE_CONNECTIONS: Gauge = Gauge(
    "channels_ws_active_connections",
    "Active WebSocket connections",
    ["consumer"],
)
WS_DISCONNECTS: Counter = Counter(
    "channels_ws_disconnects_total",
    "WebSocket disconnects",
    ["consumer", "code"],
)
WS_ERRORS: Counter = Counter(
    "channels_ws_errors_total",
    "WebSocket errors",
    ["consumer", "reason"],
)

_published_at: dict[str, float] = {}
_started_at: dict[str, float] = {}


def _task_label(sender: Any) -> str:
    if isinstance(sender, Task):
        return sender.name or sender.__class__.__name__
    if isinstance(sender, str):
        return sender
    return sender.__class__.__name__


@before_task_publish.connect
def _handle_before_task_publish(
    sender: Any = None,
    headers: dict[str, Any] | None = None,
    body: dict[str, Any] | None = None,
    **kwargs: Any,
) -> None:
    task_id = None
    if headers and isinstance(headers, dict):
        task_id = headers.get("id")
    if task_id is None and body and isinstance(body, dict):
        task_id = body.get("id")
    if isinstance(task_id, str):
        _published_at[task_id] = time.perf_counter()


@task_prerun.connect
def _handle_task_prerun(
    sender: Task,
    task_id: str,
    **kwargs: Any,
) -> None:
    label = _task_label(sender)
    CELERY_TASK_STARTED.labels(task=label).inc()
    CELERY_ACTIVE_TASKS.labels(task=label).inc()
    now = time.perf_counter()
    _started_at[task_id] = now
    published = _published_at.pop(task_id, None)
    if published is not None:
        CELERY_QUEUE_LATENCY.labels(task=label).observe(now - published)


@task_postrun.connect
def _handle_task_postrun(
    sender: Task,
    task_id: str,
    state: str | None = None,
    **kwargs: Any,
) -> None:
    label = _task_label(sender)
    started = _started_at.pop(task_id, None)
    if started is not None:
        CELERY_TASK_DURATION.labels(task=label).observe(time.perf_counter() - started)
    CELERY_ACTIVE_TASKS.labels(task=label).dec()
    if state == "SUCCESS":
        CELERY_TASK_SUCCEEDED.labels(task=label).inc()


@task_failure.connect
def _handle_task_failure(
    sender: Task,
    task_id: str,
    exception: Exception,
    **kwargs: Any,
) -> None:
    label = _task_label(sender)
    CELERY_TASK_FAILED.labels(
        task=label,
        exception=exception.__class__.__name__,
    ).inc()


@task_retry.connect
def _handle_task_retry(
    sender: Task,
    request: Any,
    reason: Exception,
    **kwargs: Any,
) -> None:
    label = _task_label(sender)
    CELERY_TASK_RETRIED.labels(task=label).inc()
