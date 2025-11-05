from __future__ import annotations

from urllib.parse import quote

import pytest
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.events.models import Event, Participant
from apps.polls.models import Poll
from config.asgi import application

pytestmark = pytest.mark.django_db(transaction=True)

User = get_user_model()

ORIGIN_HEADERS = [(b"origin", b"http://testserver"), (b"host", b"testserver")]


def _build_ws_path(event_id: int, user: User) -> str:
    token = quote(str(AccessToken.for_user(user)))
    return f"/ws/events/{event_id}/?token={token}"


@pytest.fixture(autouse=True)
def _inmemory_channel_layer(settings):
    settings.CHANNEL_LAYERS = {
        "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"},
    }


@pytest.fixture
def owner() -> User:
    return User.objects.create_user(
        email="poll-owner@example.com", password="Secret123"
    )


@pytest.fixture
def event(owner: User) -> Event:
    event = Event.objects.create(owner=owner, title="Poll realtime")
    Participant.objects.create(event=event, user=owner, role=Participant.Role.ORGANIZER)
    return event


@pytest.mark.asyncio
async def test_poll_created_broadcast(event: Event, owner: User) -> None:
    communicator = WebsocketCommunicator(
        application, _build_ws_path(event.id, owner), headers=ORIGIN_HEADERS
    )
    connected, _ = await communicator.connect()
    assert connected

    client = APIClient()
    client.force_authenticate(user=owner)
    response = await database_sync_to_async(client.post)(
        f"/api/events/{event.id}/polls",
        data={
            "type": "custom",
            "question": "Что выбираем?",
            "multiple": False,
            "allow_change_vote": True,
            "options": [
                {"label": "Вариант A"},
                {"label": "Вариант B"},
            ],
        },
        format="json",
    )
    assert response.status_code == 201

    message = await communicator.receive_json_from(timeout=1)
    assert message["type"] == "poll.created"
    payload = message["payload"]
    assert payload["event_id"] == event.id
    assert payload["version"] == 1

    poll_payload = payload["poll"]
    assert poll_payload["question"] == "Что выбираем?"
    assert poll_payload["total_votes"] == 0
    assert poll_payload["leader_option_ids"] == []
    assert poll_payload["is_closed"] is False
    assert len(poll_payload["options"]) == 2
    first_option = poll_payload["options"][0]
    assert "votes_count" in first_option and first_option["votes_count"] == 0

    await communicator.disconnect()
    await communicator.wait()


@pytest.mark.asyncio
async def test_poll_lifecycle_realtime_updates(event: Event, owner: User) -> None:
    communicator = WebsocketCommunicator(
        application, _build_ws_path(event.id, owner), headers=ORIGIN_HEADERS
    )
    connected, _ = await communicator.connect()
    assert connected

    client = APIClient()
    client.force_authenticate(user=owner)

    create_response = await database_sync_to_async(client.post)(
        f"/api/events/{event.id}/polls",
        data={
            "type": "custom",
            "question": "Где встречаемся?",
            "multiple": False,
            "allow_change_vote": True,
            "options": [
                {"label": "Коворкинг"},
                {"label": "Кафе"},
            ],
        },
        format="json",
    )
    assert create_response.status_code == 201
    created_body = create_response.json()
    poll_id = created_body["id"]
    option_ids = [option["id"] for option in created_body["options"]]

    created_message = await communicator.receive_json_from(timeout=1)
    assert created_message["type"] == "poll.created"
    assert created_message["payload"]["version"] == 1

    vote_response = await database_sync_to_async(client.post)(
        f"/api/polls/{poll_id}/vote",
        data={"option_ids": [option_ids[0]]},
        format="json",
    )
    assert vote_response.status_code == 200

    vote_message = await communicator.receive_json_from(timeout=1)
    assert vote_message["type"] == "poll.updated"
    vote_payload = vote_message["payload"]
    assert vote_payload["poll_id"] == poll_id
    assert vote_payload["version"] == 2
    assert vote_payload["total_votes"] == 1
    assert vote_payload["leader_option_ids"] == [option_ids[0]]
    assert vote_payload["options"] == [{"id": option_ids[0], "votes_count": 1}]

    version_after_vote = await database_sync_to_async(
        lambda: Poll.objects.get(id=poll_id).version
    )()
    assert version_after_vote == 2

    close_response = await database_sync_to_async(client.post)(
        f"/api/polls/{poll_id}/close",
    )
    assert close_response.status_code == 200

    close_message = await communicator.receive_json_from(timeout=1)
    assert close_message["type"] == "poll.closed"
    close_payload = close_message["payload"]
    assert close_payload["poll_id"] == poll_id
    assert close_payload["version"] == 3

    version_after_close = await database_sync_to_async(
        lambda: Poll.objects.get(id=poll_id).version
    )()
    assert version_after_close == 3

    delete_response = await database_sync_to_async(client.delete)(
        f"/api/polls/{poll_id}"
    )
    assert delete_response.status_code == 204

    delete_message = await communicator.receive_json_from(timeout=1)
    assert delete_message["type"] == "poll.deleted"
    delete_payload = delete_message["payload"]
    assert delete_payload["poll_id"] == poll_id
    assert delete_payload["event_id"] == event.id

    poll_exists = await database_sync_to_async(
        lambda: Poll.objects.filter(id=poll_id).exists()
    )()
    assert poll_exists is False

    await communicator.disconnect()
    await communicator.wait()
