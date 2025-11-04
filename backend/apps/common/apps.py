from __future__ import annotations

from django.apps import AppConfig, apps


class CommonConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.common"
    verbose_name = "Общее"

    def ready(self) -> None:
        token_blacklist = apps.get_app_config("token_blacklist")
        token_blacklist.verbose_name = "Черный список токенов"
