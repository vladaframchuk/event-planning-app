from __future__ import annotations

import re
from typing import Any


def ensure_group_name_regex_allows_colon(channel_layer: Any) -> None:
    """
    Channels ограничивает состав символов в именах групп.
    Разрешаем использование двоеточия для шаблона event:<id>.
    """

    pattern = getattr(channel_layer, "group_name_regex", None)
    if pattern is None or not hasattr(pattern, "pattern"):
        return
    if ":" in getattr(pattern, "pattern", ""):
        return
    channel_layer.group_name_regex = re.compile(r"^[\w\-.:]+$")

