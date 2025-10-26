from django.contrib import admin

from .models import Event, Participant


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    """Админка событий с ключевыми полями и фильтрами."""

    list_display = ("id", "title", "owner", "start_at", "end_at")
    list_filter = ("owner", "start_at")
    search_fields = ("title",)
    autocomplete_fields = ("owner",)
    date_hierarchy = "start_at"


@admin.register(Participant)
class ParticipantAdmin(admin.ModelAdmin):
    """Админка участников для контроля состава событий."""

    list_display = ("id", "event", "user", "role", "joined_at")
    list_filter = ("role", "event")
    search_fields = ("user__email", "event__title")
    autocomplete_fields = ("event", "user")
