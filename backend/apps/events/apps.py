from django.apps import AppConfig


class EventsConfig(AppConfig):
    """Конфигурация приложения событий."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.events"
    verbose_name = "События"
