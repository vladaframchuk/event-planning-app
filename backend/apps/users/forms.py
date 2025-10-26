from __future__ import annotations

from django import forms
from django.contrib.auth.forms import ReadOnlyPasswordHashField

from .models import User


class UserCreationForm(forms.ModelForm):
    """Форма создания пользователя через админку."""

    password1 = forms.CharField(label="Пароль", widget=forms.PasswordInput)
    password2 = forms.CharField(label="Подтверждение пароля", widget=forms.PasswordInput)

    class Meta:
        model = User
        fields = ("email", "name")

    def clean_password2(self) -> str:
        """Проверяет совпадение паролей."""
        password1 = self.cleaned_data.get("password1")
        password2 = self.cleaned_data.get("password2")
        if password1 and password2 and password1 != password2:
            raise forms.ValidationError("Пароли должны совпадать.")
        return password2 or ""

    def save(self, commit: bool = True) -> User:
        """Сохраняет пользователя с хешированным паролем."""
        user = super().save(commit=False)
        user.set_password(self.cleaned_data["password1"])
        if commit:
            user.save()
        return user


class UserChangeForm(forms.ModelForm):
    """Форма редактирования пользователя в админке."""

    password = ReadOnlyPasswordHashField(label="Пароль")

    class Meta:
        model = User
        fields = ("email", "name", "password", "is_active", "is_staff", "is_superuser")

    def clean_password(self) -> str:
        """Возвращает неизменённое значение пароля."""
        return self.initial.get("password", "")
