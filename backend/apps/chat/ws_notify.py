from __future__ import annotations

from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def ws_chat_send(event_id: int, message_type: str, payload: dict[str, Any]) -> None:
    """Отправка компактного события чата всем участникам события."""

    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    async_to_sync(channel_layer.group_send)(
        f"event:{event_id}",
        {"type": "broadcast", "message_type": message_type, "payload": payload},
    )
