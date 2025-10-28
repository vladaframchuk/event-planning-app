from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0003_remove_user_avatar_url_user_avatar"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="avatar_url",
            field=models.URLField(blank=True, max_length=500, null=True, verbose_name="Avatar URL"),
        ),
    ]
