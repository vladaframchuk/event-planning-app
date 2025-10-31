from __future__ import annotations

import pytest
from channels.testing import WebsocketCommunicator
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from urllib.parse import quote

from apps.events.models import Event, Participant
from apps.tasks.models import Task, TaskList
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
    return User.objects.create_user(email="owner@example.com", password="Secret123")


@pytest.fixture
def event(owner: User) -> Event:
    event = Event.objects.create(owner=owner, title="Realtime Demo")
    Participant.objects.create(event=event, user=owner, role=Participant.Role.ORGANIZER)
    return event


@pytest.fixture
def task_list(event: Event) -> TaskList:
    return TaskList.objects.create(event=event, title="Backlog", order=0)


@pytest.fixture
def existing_task(task_list: TaskList) -> Task:
    return Task.objects.create(list=task_list, title="Book venue", order=0)


ORIGIN_HEADERS = [(b"origin", b"http://testserver"), (b"host", b"testserver")]


def _build_ws_path(event_id: int, user: User) -> str:
    token = quote(str(AccessToken.for_user(user)))
    return f"/ws/events/{event_id}/?token={token}"


@pytest.mark.asyncio
async def test_participant_can_connect(event: Event, owner: User) -> None:
    communicator = WebsocketCommunicator(application, _build_ws_path(event.id, owner), headers=ORIGIN_HEADERS)
    connected, close_code = await communicator.connect()
    assert connected
    await communicator.disconnect()
    await communicator.wait()


@pytest.mark.asyncio
async def test_non_participant_is_rejected(event: Event) -> None:
    stranger = await database_sync_to_async(User.objects.create_user)(
        email="stranger@example.com", password="Secret123"
    )
    communicator = WebsocketCommunicator(application, _build_ws_path(event.id, stranger), headers=ORIGIN_HEADERS)
    connected, close_code = await communicator.connect()
    assert not connected
    # Consumer closes connection with 4403 for forbidden access.
    assert close_code == 4403
    await communicator.disconnect()
    await communicator.wait()


@pytest.mark.asyncio
async def test_task_creation_broadcast(event: Event, owner: User, task_list: TaskList) -> None:
    communicator = WebsocketCommunicator(application, _build_ws_path(event.id, owner), headers=ORIGIN_HEADERS)
    connected, close_code = await communicator.connect()
    assert connected

    client = APIClient()
    client.force_authenticate(user=owner)
    response = await database_sync_to_async(client.post)(
        "/api/tasks/",
        data={"list": task_list.id, "title": "Decorate hall"},
        format="json",
    )
    assert response.status_code == 201

    message = await communicator.receive_json_from(timeout=1)
    assert message["type"] == "task.created"
    payload = message["payload"]
    assert payload["title"] == "Decorate hall"
    assert payload["list"] == task_list.id

    progress_message = await communicator.receive_json_from(timeout=1)
    assert progress_message["type"] == "progress.invalidate"

    await communicator.disconnect()
    await communicator.wait()


@pytest.mark.asyncio
async def test_task_update_triggers_progress_invalidation(
    event: Event,
    owner: User,
    existing_task: Task,
) -> None:
    communicator = WebsocketCommunicator(application, _build_ws_path(event.id, owner), headers=ORIGIN_HEADERS)
    connected, close_code = await communicator.connect()
    assert connected

    client = APIClient()
    client.force_authenticate(user=owner)
    response = await database_sync_to_async(client.patch)(
        f"/api/tasks/{existing_task.id}/",
        data={"status": Task.Status.DOING},
        format="json",
    )
    assert response.status_code == 200

    message = await communicator.receive_json_from(timeout=1)
    assert message["type"] == "task.updated"
    assert message["payload"]["status"] == Task.Status.DOING

    progress_message = await communicator.receive_json_from(timeout=1)
    assert progress_message["type"] == "progress.invalidate"

    await communicator.disconnect()
    await communicator.wait()
