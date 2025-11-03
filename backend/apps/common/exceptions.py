from __future__ import annotations

from typing import Any

from django.utils.translation import gettext as _
from rest_framework import status
from rest_framework.views import exception_handler

_FALLBACK_MESSAGE = _("Произошла непредвиденная ошибка.")

_STATUS_MESSAGES: dict[int, str] = {
    status.HTTP_400_BAD_REQUEST: _("Некорректные данные."),
    status.HTTP_401_UNAUTHORIZED: _("Учетные данные не предоставлены."),
    status.HTTP_403_FORBIDDEN: _("Доступ запрещен."),
    status.HTTP_404_NOT_FOUND: _("Ресурс не найден."),
    status.HTTP_405_METHOD_NOT_ALLOWED: _("Метод не разрешен."),
    status.HTTP_415_UNSUPPORTED_MEDIA_TYPE: _("Неподдерживаемый тип контента."),
    status.HTTP_429_TOO_MANY_REQUESTS: _("Слишком много запросов. Попробуйте позже."),
    status.HTTP_500_INTERNAL_SERVER_ERROR: _FALLBACK_MESSAGE,
}

_DETAIL_TRANSLATIONS: dict[str, str] = {
    "Authentication credentials were not provided.": _("Учетные данные не предоставлены."),
    "Invalid token.": _("Неверный токен."),
    "Invalid refresh token.": _("Неверный токен обновления."),
    "No active account found with the given credentials": _(
        "Не найден активный пользователь с указанными учетными данными."
    ),
    "Unable to log in with provided credentials.": _("Не удалось войти с указанными учетными данными."),
    "You do not have permission to perform this action.": _(
        "У вас нет прав для выполнения этого действия."
    ),
    "Not found.": _("Ресурс не найден."),
}


def _contains_cyrillic(value: str) -> bool:
    return any("\u0400" <= char <= "\u04FF" or char in {"\u0451", "\u0401"} for char in value)


def _translate_detail(detail: str, status_code: int) -> str:
    if _contains_cyrillic(detail):
        return detail

    normalized = detail.strip()
    translated = _DETAIL_TRANSLATIONS.get(normalized)
    if translated:
        return translated
    if normalized.startswith('Method "') and normalized.endswith('" not allowed.'):
        return _("Метод не разрешен.")
    return _STATUS_MESSAGES.get(status_code, _FALLBACK_MESSAGE)


def localized_exception_handler(exc: Exception, context: dict[str, Any]) -> Any:
    response = exception_handler(exc, context)
    if response is None:
        return None

    data = response.data

    if isinstance(data, dict):
        payload = dict(data)
        fallback_detail = _STATUS_MESSAGES.get(response.status_code, _FALLBACK_MESSAGE)

        if "detail" in data:
            raw_detail = data["detail"]

            if isinstance(raw_detail, str):
                payload["detail"] = _translate_detail(raw_detail, response.status_code)
            elif isinstance(raw_detail, dict):
                translated_detail = dict(raw_detail)
                inner_detail = translated_detail.get("detail")
                if isinstance(inner_detail, str):
                    translated_detail["detail"] = _translate_detail(inner_detail, response.status_code)
                payload["detail"] = translated_detail
            elif raw_detail is None:
                payload["detail"] = fallback_detail
                other_fields = {key: value for key, value in data.items() if key != "detail"}
                if other_fields and "errors" not in payload:
                    payload["errors"] = other_fields
        else:
            other_fields = dict(data)
            if other_fields and "errors" not in payload:
                payload["errors"] = other_fields
            payload["detail"] = fallback_detail

        response.data = payload
        return response

    if isinstance(data, list):
        return response

    response.data = {"detail": _STATUS_MESSAGES.get(response.status_code, _FALLBACK_MESSAGE)}
    return response
