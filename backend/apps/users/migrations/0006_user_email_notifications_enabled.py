from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0005_alter_user_options_alter_user_avatar_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="email_notifications_enabled",
            field=models.BooleanField(
                default=True,
                help_text="Флаг согласия на получение уведомлений по электронной почте.",
                verbose_name="Email notifications enabled",
            ),
        ),
    ]
