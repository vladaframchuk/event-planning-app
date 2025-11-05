from __future__ import annotations

from time import monotonic
from typing import Dict, Tuple

from django.core.cache import cache

try:
    from django_redis.exceptions import ConnectionInterrupted
except ModuleNotFoundError:

    class ConnectionInterrupted(Exception):
        pass


try:
    from redis.exceptions import ConnectionError as RedisConnectionError
except ModuleNotFoundError:

    class RedisConnectionError(Exception):
        pass


_CACHE_ERRORS: Tuple[type[Exception], ...] = (
    ConnectionInterrupted,
    RedisConnectionError,
)
_FALLBACK_CACHE: Dict[str, tuple[object, float | None]] = {}


def _fallback_get(key: str) -> object | None:
    entry = _FALLBACK_CACHE.get(key)
    if entry is None:
        return None
    value, expires_at = entry
    if expires_at is not None and expires_at < monotonic():
        _FALLBACK_CACHE.pop(key, None)
        return None
    return value


def _fallback_set(key: str, value: object, timeout: int | None) -> None:
    expires_at: float | None = None
    if timeout is not None:
        expires_at = monotonic() + timeout
    _FALLBACK_CACHE[key] = (value, expires_at)


def cache_safe_get(key: str) -> object | None:
    try:
        return cache.get(key)
    except _CACHE_ERRORS:
        return _fallback_get(key)


def cache_safe_set(key: str, value: object, timeout: int | None = None) -> None:
    try:
        cache.set(key, value, timeout=timeout)
        _FALLBACK_CACHE.pop(key, None)
    except _CACHE_ERRORS:
        _fallback_set(key, value, timeout)


def cache_safe_delete(key: str) -> None:
    try:
        cache.delete(key)
    except _CACHE_ERRORS:
        pass
    finally:
        _FALLBACK_CACHE.pop(key, None)


def cache_safe_clear() -> None:
    try:
        cache.clear()
    except _CACHE_ERRORS:
        pass
    finally:
        _FALLBACK_CACHE.clear()
