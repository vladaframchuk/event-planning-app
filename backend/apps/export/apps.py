from django.apps import AppConfig


class ExportConfig(AppConfig):
    """Конфигурация приложения экспорта отчётов."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.export"
    verbose_name = "Экспорт планов событий"
