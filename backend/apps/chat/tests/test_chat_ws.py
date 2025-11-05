from __future__ import annotations

import asyncio
from urllib.parse import quote

import pytest
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.events.models import Event, Participant
from config.asgi import application

pytestmark = pytest.mark.django_db(transaction=True)

User = get_user_model()

ORIGIN_HEADERS = [(b"origin", b"http://testserver"), (b"host", b"testserver")]


@pytest.fixture(autouse=True)
def _use_inmemory_channel_layer(settings):
    settings.CHANNEL_LAYERS = {
        "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}
    }


@pytest.fixture
def owner() -> User:
    return User.objects.create_user(email="owner@example.com", password="Secret123")


@pytest.fixture
def participant() -> User:
    return User.objects.create_user(
        email="participant@example.com", password="Secret123"
    )


@pytest.fixture
def event(owner: User, participant: User) -> Event:
    event = Event.objects.create(owner=owner, title="Realtime Chat")
    Participant.objects.create(event=event, user=owner, role=Participant.Role.ORGANIZER)
    Participant.objects.create(
        event=event, user=participant, role=Participant.Role.MEMBER
    )
    return event


def _build_ws_path(event_id: int, user: User) -> str:
    token = quote(str(AccessToken.for_user(user)))
    return f"/ws/events/{event_id}/?token={token}"


@pytest.mark.asyncio
async def test_rest_message_broadcasts_to_other_clients(
    event: Event, owner: User, participant: User
) -> None:
    author_comm = WebsocketCommunicator(
        application, _build_ws_path(event.id, owner), headers=ORIGIN_HEADERS
    )
    reader_comm = WebsocketCommunicator(
        application, _build_ws_path(event.id, participant), headers=ORIGIN_HEADERS
    )
    connected_author, _ = await author_comm.connect()
    connected_reader, _ = await reader_comm.connect()
    assert connected_author
    assert connected_reader

    client = APIClient()
    client.force_authenticate(user=owner)
    response = await database_sync_to_async(client.post)(
        f"/api/events/{event.id}/messages",
        data={"text": "Привет!"},
        format="json",
    )
    assert response.status_code == 201
    payload = await reader_comm.receive_json_from(timeout=1)
    assert payload["type"] == "chat.message"
    message = payload["payload"]
    assert message["text"] == "Привет!"
    assert message["author"] == owner.id
    assert "is_me" not in message

    await author_comm.disconnect()
    await reader_comm.disconnect()
    await author_comm.wait()
    await reader_comm.wait()


@pytest.mark.asyncio
async def test_typing_broadcast_respects_rate_limit(
    event: Event, owner: User, participant: User
) -> None:
    author_comm = WebsocketCommunicator(
        application, _build_ws_path(event.id, owner), headers=ORIGIN_HEADERS
    )
    reader_comm = WebsocketCommunicator(
        application, _build_ws_path(event.id, participant), headers=ORIGIN_HEADERS
    )
    connected_author, _ = await author_comm.connect()
    connected_reader, _ = await reader_comm.connect()
    assert connected_author
    assert connected_reader

    await author_comm.send_json_to(
        {"type": "chat.typing", "payload": {"event_id": event.id}}
    )
    first_typing = await reader_comm.receive_json_from(timeout=1)
    assert first_typing["type"] == "chat.typing"
    typing_payload = first_typing["payload"]
    assert typing_payload["event_id"] == event.id
    assert typing_payload["user_id"] == owner.id

    assert await author_comm.receive_nothing(timeout=0.3)

    await author_comm.send_json_to(
        {"type": "chat.typing", "payload": {"event_id": event.id}}
    )
    assert await reader_comm.receive_nothing(timeout=0.3)

    await asyncio.sleep(1.1)
    await author_comm.send_json_to(
        {"type": "chat.typing", "payload": {"event_id": event.id}}
    )
    second_typing = await reader_comm.receive_json_from(timeout=1)
    assert second_typing["type"] == "chat.typing"

    await author_comm.disconnect()
    await reader_comm.disconnect()
    await author_comm.wait()
    await reader_comm.wait()
