from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import models

from apps.events.models import Event, Participant


class TaskList(models.Model):
    """Колонка доски задач внутри события."""

    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey(
        Event,
        on_delete=models.CASCADE,
        related_name="task_lists",
        verbose_name="Событие",
    )
    title = models.CharField("Название", max_length=100)
    order = models.IntegerField("Порядок", default=0)
    created_at = models.DateTimeField("Создано", auto_now_add=True)
    updated_at = models.DateTimeField("Обновлено", auto_now=True)

    class Meta:
        verbose_name = "Список задач"
        verbose_name_plural = "Списки задач"
        ordering = ("order", "id")
        indexes = [
            models.Index(fields=["event", "order"], name="idx_tasklist_event_order"),
            models.Index(fields=["event", "id"], name="idx_tasklist_event_id"),
        ]

    def __str__(self) -> str:
        return f"{self.title} (event={self.event_id})"


class Task(models.Model):
    """Задача, находящаяся в конкретном списке доски."""

    class Status(models.TextChoices):
        TODO = "todo", "К выполнению"
        DOING = "doing", "В процессе"
        DONE = "done", "Завершена"

    id = models.BigAutoField(primary_key=True)
    list = models.ForeignKey(
        TaskList,
        on_delete=models.CASCADE,
        related_name="tasks",
        verbose_name="Список задач",
    )
    title = models.CharField("Название", max_length=200)
    description = models.TextField("Описание", blank=True)
    status = models.CharField(
        "Статус",
        max_length=16,
        choices=Status.choices,
        default=Status.TODO,
    )
    assignee = models.ForeignKey(
        Participant,
        on_delete=models.SET_NULL,
        related_name="tasks",
        verbose_name="Ответственный",
        null=True,
        blank=True,
    )
    start_at = models.DateTimeField("Начало", null=True, blank=True)
    due_at = models.DateTimeField("Дедлайн", null=True, blank=True)
    deadline_reminder_sent_at = models.DateTimeField(
        "Когда отправлено напоминание о дедлайне",
        null=True,
        blank=True,
    )
    deadline_reminder_for_due_at = models.DateTimeField(
        "Дедлайн, для которого отправлено напоминание",
        null=True,
        blank=True,
    )
    order = models.IntegerField("Порядок", default=0)
    created_at = models.DateTimeField("Создано", auto_now_add=True)
    updated_at = models.DateTimeField("Обновлено", auto_now=True)
    depends_on = models.ManyToManyField(
        "self",
        symmetrical=False,
        related_name="dependents",
        blank=True,
        verbose_name="Зависимости",
    )

    class Meta:
        verbose_name = "Задача"
        verbose_name_plural = "Задачи"
        ordering = ("order", "id")
        indexes = [
            models.Index(fields=["list", "order"], name="idx_task_list_order"),
            models.Index(fields=["list", "status"], name="idx_task_list_status"),
            models.Index(fields=["list", "id"], name="idx_task_list_id"),
            models.Index(fields=["id"], name="idx_task_id"),
            models.Index(fields=["list", "due_at"], name="idx_task_list_due"),
            models.Index(
                fields=["due_at", "deadline_reminder_sent_at"],
                name="idx_task_deadline_reminders",
            ),
        ]

    def clean(self) -> None:
        if self.start_at and self.due_at and self.due_at < self.start_at:
            raise ValidationError("Дедлайн не может быть раньше даты начала задачи.")

    def save(self, *args, **kwargs) -> None:
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.title} (list={self.list_id})"
