from __future__ import annotations

import logging
from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


async def notify_event_group(event_id: int, message_type: str, payload: dict[str, Any]) -> None:
    """Send a realtime event to all subscribers of the given event group."""

    channel_layer = get_channel_layer()
    if channel_layer is None:
        logger.debug("notify_event_group: no channel layer configured, skipping message %s", message_type)
        return
    await channel_layer.group_send(
        f"event_{event_id}",
        {
            "type": "broadcast",
            "message_type": message_type,
            "payload": payload,
        },
    )


def notify_event_group_sync(event_id: int, message_type: str, payload: dict[str, Any]) -> None:
    """Synchronous adapter for contexts where awaiting is not possible."""

    async_to_sync(notify_event_group)(event_id, message_type, payload)


def notify_progress_invalidation(event_id: int) -> None:
    """Emit a progress invalidate command for the event."""

    notify_event_group_sync(event_id, "progress.invalidate", {})
