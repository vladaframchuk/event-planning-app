from __future__ import annotations

import logging
from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from apps.utils.ws import ensure_group_name_regex_allows_colon

logger = logging.getLogger(__name__)


def ws_notify_event(event_id: int, message_type: str, payload: dict[str, Any]) -> None:
    """
    Отправляет сообщение слушателям события.

    Используем синхронный адаптер, поскольку большинство представлений Polls работают
    в синхронном контексте DRF.
    """

    channel_layer = get_channel_layer()
    if channel_layer is None:
        logger.debug(
            "ws_notify_event: channel layer отсутствует, пропускаем %s", message_type
        )
        return

    ensure_group_name_regex_allows_colon(channel_layer)
    async_to_sync(channel_layer.group_send)(
        f"event:{event_id}",
        {
            "type": "broadcast",
            "message_type": message_type,
            "payload": payload,
        },
    )
