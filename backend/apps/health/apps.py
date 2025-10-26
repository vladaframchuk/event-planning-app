from django.apps import AppConfig


class HealthConfig(AppConfig):
    """Конфигурация для инфраструктурного приложения здоровья."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.health"
    verbose_name = "Health"

