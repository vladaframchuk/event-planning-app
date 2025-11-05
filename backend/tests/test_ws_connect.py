from __future__ import annotations

from urllib.parse import quote

import pytest
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken

from apps.events.models import Event, Participant
from config.asgi import application

pytestmark = pytest.mark.django_db(transaction=True)

User = get_user_model()


@pytest.fixture(autouse=True)
def _inmemory_channel_layer(settings):
    settings.CHANNEL_LAYERS = {
        "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"},
    }


@pytest.fixture
def owner() -> User:
    return User.objects.create_user(email="ws-owner@example.com", password="Secret123")


@pytest.fixture
def event(owner: User) -> Event:
    event = Event.objects.create(owner=owner, title="WebSocket Demo")
    Participant.objects.create(event=event, user=owner, role=Participant.Role.ORGANIZER)
    return event


def _build_ws_path(event_id: int, user: User) -> str:
    token = quote(str(AccessToken.for_user(user)))
    return f"/ws/events/{event_id}/?token={token}"


ORIGIN_HEADERS = [(b"origin", b"http://testserver"), (b"host", b"testserver")]


@pytest.mark.asyncio
async def test_participant_establishes_connection(event: Event, owner: User) -> None:
    communicator = WebsocketCommunicator(
        application, _build_ws_path(event.id, owner), headers=ORIGIN_HEADERS
    )
    connected, close_code = await communicator.connect()
    assert connected
    assert close_code is None
    await communicator.disconnect()
    await communicator.wait()


@pytest.mark.asyncio
async def test_stranger_is_rejected(event: Event) -> None:
    stranger = await database_sync_to_async(User.objects.create_user)(
        email="ws-stranger@example.com",
        password="Secret123",
    )
    communicator = WebsocketCommunicator(
        application,
        _build_ws_path(event.id, stranger),
        headers=ORIGIN_HEADERS,
    )
    connected, close_code = await communicator.connect()
    assert not connected
    assert close_code == 4403
    await communicator.disconnect()
    await communicator.wait()
