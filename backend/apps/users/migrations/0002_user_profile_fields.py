from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="avatar_url",
            field=models.URLField(
                blank=True, max_length=500, null=True, verbose_name="URL �������"
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="locale",
            field=models.CharField(
                blank=True, max_length=32, null=True, verbose_name="������"
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="timezone",
            field=models.CharField(
                blank=True, max_length=64, null=True, verbose_name="������ �����"
            ),
        ),
    ]
