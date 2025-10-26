from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.utils.translation import gettext_lazy as _

from .forms import UserChangeForm, UserCreationForm
from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    """Админка кастомных пользователей с удобным поиском и фильтрами."""

    add_form = UserCreationForm
    form = UserChangeForm
    ordering = ("email",)
    list_display = ("id", "email", "name", "is_staff", "is_active", "date_joined")
    list_filter = ("is_staff", "is_active")
    search_fields = ("email", "name")
    fieldsets = (
        (_("Основная информация"), {"fields": ("email", "name", "password")}),
        (_("Права доступа"), {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        (_("Важные даты"), {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "name", "password1", "password2", "is_staff", "is_active"),
            },
        ),
    )
    filter_horizontal = ("groups", "user_permissions")
