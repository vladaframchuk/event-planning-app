from __future__ import annotations

import json
import logging
from typing import Any

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from apps.utils.ws import ensure_group_name_regex_allows_colon

from django.conf import settings
from django.contrib.auth.models import AnonymousUser

from apps.events.models import Participant

logger = logging.getLogger(__name__)


class EventConsumer(AsyncJsonWebsocketConsumer):
    """Realtime events for a specific event board."""

    group_name: str
    event_id: int

    async def connect(self) -> None:
        user = self.scope.get("user")
        if user is None or isinstance(user, AnonymousUser) or not user.is_authenticated:
            await self.close(code=4401)
            return

        try:
            event_id = int(self.scope["url_route"]["kwargs"]["event_id"])
        except (KeyError, ValueError, TypeError):
            await self.close(code=4400)
            return

        # Проверяем, что пользователь участвует в событии.
        if not await self._is_participant(event_id, user.id):
            await self.close(code=4403)
            return

        self.event_id = event_id
        self.group_name = f"event:{event_id}"

        ensure_group_name_regex_allows_colon(self.channel_layer)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        logger.info("EventConsumer: user %s connected to event %s", user.id, event_id)
        await self.accept()

    async def disconnect(self, code: int) -> None:
        group_name = getattr(self, "group_name", None)
        if group_name:
            await self.channel_layer.group_discard(group_name, self.channel_name)
        logger.info(
            "EventConsumer: channel %s disconnected with code %s",
            self.channel_name,
            code,
        )

    async def receive_json(self, content: Any, **kwargs: Any) -> None:  # noqa: ARG002
        message_type = None
        if isinstance(content, dict):
            message_type = content.get("type")
        if message_type == "ping":
            await self.send_json({"type": "pong"})
            return
        logger.debug("EventConsumer: ignoring incoming payload %s", content)
        # Placeholder for future rate-limited client to server messages.

    async def broadcast(self, event: dict[str, Any]) -> None:
        message = {"type": event["message_type"], "payload": event["payload"]}
        if self._payload_exceeds_limit(message):
            logger.warning(
                "EventConsumer: message for event %s exceeds max size, dropping",
                getattr(self, "event_id", "unknown"),
            )
            return
        await self.send_json(message)

    @staticmethod
    @database_sync_to_async
    def _is_participant(event_id: int, user_id: int) -> bool:
        return Participant.objects.filter(event_id=event_id, user_id=user_id).exists()

    @property
    def max_message_size(self) -> int:
        return getattr(settings, "CHANNELS_WS_MAX_MESSAGE_SIZE", 64 * 1024)

    def _payload_exceeds_limit(self, message: dict[str, Any]) -> bool:
        serialized = json.dumps(message, separators=(",", ":"), ensure_ascii=False)
        return len(serialized.encode("utf-8")) > self.max_message_size
