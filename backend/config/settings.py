from datetime import timedelta
from pathlib import Path
from typing import Any

import os
import environ
from django.core.exceptions import ImproperlyConfigured

"""
Базовые настройки Django-проекта: подключение окружения, CORS и сторонних сервисов.
"""

# Базовая директория проекта для поиска вспомогательных файлов.
BASE_DIR = Path(__file__).resolve().parent.parent

# Читаем переменные окружения один раз при старте приложения.
env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")


def _get_secret_key() -> str:
    """Извлекает секретный ключ с безопасной обработкой отсутствия значения."""
    secret_key = env("DJANGO_SECRET_KEY", default=env("SECRET_KEY", default=None))
    if secret_key is None:
        message = (
            "Не найден секретный ключ. Убедитесь, что DJANGO_SECRET_KEY задан в backend/.env."
        )
        raise ImproperlyConfigured(message)
    return str(secret_key)


# Основные служебные настройки
SECRET_KEY = _get_secret_key()
DEBUG = env.bool("DEBUG", default=False)
_LEGACY_ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=None)
ALLOWED_HOSTS: list[str] = (
    _LEGACY_ALLOWED_HOSTS
    if _LEGACY_ALLOWED_HOSTS
    else env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1", "testserver"])
)


# Подключения приложений
INSTALLED_APPS = [
    "channels",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Сторонние приложения
    "rest_framework",
    "rest_framework_simplejwt",
    "django_filters",
    "corsheaders",
    # Локальные приложения
    "apps.users",
    "apps.events.apps.EventsConfig",
    "apps.health.apps.HealthConfig",
    "apps.tasks.apps.TasksConfig",
]


MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]


ROOT_URLCONF = "config.urls"


TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]


ASGI_APPLICATION = "config.asgi.application"
WSGI_APPLICATION = "config.wsgi.application"

USE_REDIS_CHANNEL_LAYER = env.bool("USE_REDIS_CHANNEL_LAYER", default=False)
_channel_layer_redis_url = (
    env("REDIS_URL", default=None)
    or env("CELERY_BROKER_URL", default=None)
    or "redis://redis:6379/0"
)

if USE_REDIS_CHANNEL_LAYER:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [_channel_layer_redis_url],
            },
        },
    }
else:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        },
    }

CHANNELS_WS_MAX_MESSAGE_SIZE = env.int("CHANNELS_WS_MAX_MESSAGE_SIZE", default=64 * 1024)


# Database
DATABASES = {
    "default": env.db(
        "DATABASE_URL",
        default="postgres://postgres:postgres@localhost:5432/postgres",
    )
}


# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]


# Internationalization
LANGUAGE_CODE = "ru-ru"
TIME_ZONE = "Europe/Berlin"
USE_I18N = True
USE_TZ = True

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
SITE_URL: str = env("SITE_URL", default="http://localhost:8000")
SITE_FRONT_URL: str = env("SITE_FRONT_URL", default="http://localhost:3000")


# Static files (CSS, JavaScript, Images)
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"


# Default primary key field type
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "users.User"


# DRF Configuration
REST_FRAMEWORK: dict[str, Any] = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
}


SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "AUTH_HEADER_TYPES": ("Bearer",),
}


# CORS and CSRF
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
]
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])


# Celery / Redis configuration
CELERY_BROKER_URL = env(
    "CELERY_BROKER_URL",
    default=env("REDIS_URL", default="redis://localhost:6379/0"),
)
CELERY_RESULT_BACKEND = CELERY_BROKER_URL
REDIS_URL: str = env("REDIS_URL", default=CELERY_BROKER_URL)

USE_REDIS_CACHE = env.bool("USE_REDIS_CACHE", default=False)

if USE_REDIS_CACHE:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": os.environ.get("REDIS_URL", _channel_layer_redis_url),
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "event-planning-app",
        }
    }


LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
        },
    },
    "loggers": {
        "django.request": {
            # 401/403/404 теперь не засоряют консоль предупреждениями при debug-сценариях.
            "level": "ERROR",
            "handlers": ["console"],
            "propagate": False,
        },
    },
}
