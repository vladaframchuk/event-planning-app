from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("events", "0003_invite"),
    ]

    operations = [
        migrations.CreateModel(
            name="Message",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("text", models.TextField(verbose_name="Текст")),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True, verbose_name="Создано")),
                ("edited_at", models.DateTimeField(blank=True, null=True, verbose_name="Изменено")),
                (
                    "author",
                    models.ForeignKey(
                        db_index=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="messages",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Автор",
                    ),
                ),
                (
                    "event",
                    models.ForeignKey(
                        db_index=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="messages",
                        to="events.event",
                        verbose_name="Событие",
                    ),
                ),
            ],
            options={
                "verbose_name": "Сообщение",
                "verbose_name_plural": "Сообщения",
                "ordering": ["created_at", "id"],
            },
        ),
        migrations.AddIndex(
            model_name="message",
            index=models.Index(fields=["event", "created_at"], name="chat_messag_event_i_af102c_idx"),
        ),
    ]
