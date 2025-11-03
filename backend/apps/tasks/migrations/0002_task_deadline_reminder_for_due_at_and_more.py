
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("events", "0003_invite"),
        ("tasks", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="task",
            name="deadline_reminder_for_due_at",
            field=models.DateTimeField(
                blank=True,
                null=True,
                verbose_name="Дедлайн, для которого отправлено напоминание",
            ),
        ),
        migrations.AddField(
            model_name="task",
            name="deadline_reminder_sent_at",
            field=models.DateTimeField(
                blank=True,
                null=True,
                verbose_name="Когда отправлено напоминание о дедлайне",
            ),
        ),
        migrations.AlterField(
            model_name="task",
            name="start_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Начало"),
        ),
        migrations.AlterField(
            model_name="task",
            name="status",
            field=models.CharField(
                choices=[("todo", "К выполнению"), ("doing", "В процессе"), ("done", "Завершена")],
                default="todo",
                max_length=16,
                verbose_name="Статус",
            ),
        ),
        migrations.AddIndex(
            model_name="task",
            index=models.Index(
                fields=["due_at", "deadline_reminder_sent_at"],
                name="idx_task_deadline_reminders",
            ),
        ),
    ]
