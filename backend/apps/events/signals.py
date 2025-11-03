from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError
from django.db.models.signals import pre_delete, pre_save
from django.dispatch import receiver

from apps.events.models import Participant


def _has_other_organizers(participant: Participant) -> bool:
    return Participant.objects.filter(
        event=participant.event,
        role=Participant.Role.ORGANIZER,
    ).exclude(pk=participant.pk).exists()


def _build_error(detail: str) -> ValidationError:
    return ValidationError({"detail": detail})


@receiver(pre_delete, sender=Participant, dispatch_uid="participant_pre_delete_organizer_guard")
def prevent_last_organizer_delete(sender: type[Participant], instance: Participant, **_: Any) -> None:
    if instance.role != Participant.Role.ORGANIZER:
        return
    if not _has_other_organizers(instance):
        raise _build_error("Cannot remove the last organizer from the event.")


@receiver(pre_save, sender=Participant, dispatch_uid="participant_pre_save_organizer_guard")
def prevent_last_organizer_demotion(sender: type[Participant], instance: Participant, **_: Any) -> None:
    if not instance.pk:
        return
    try:
        previous = Participant.objects.get(pk=instance.pk)
    except Participant.DoesNotExist:
        return
    if previous.role != Participant.Role.ORGANIZER:
        return
    if instance.role == Participant.Role.ORGANIZER:
        return
    if not _has_other_organizers(previous):
        raise _build_error("Cannot demote the last organizer of the event.")
