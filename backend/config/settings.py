from datetime import timedelta
from pathlib import Path
from typing import Any

import os
import environ
from celery.schedules import crontab
from django.core.exceptions import ImproperlyConfigured
from django.utils.translation import gettext_lazy as _

"""
������� ��������� Django-�������: ����������� ���������, CORS � ��������� ��������.
"""

# ������� ���������� ������� ��� ������ ��������������� ������.
BASE_DIR = Path(__file__).resolve().parent.parent

# ������ ���������� ��������� ���� ��� ��� ������ ����������.
env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")


def _get_secret_key() -> str:
    """��������� ��������� ���� � ���������� ���������� ���������� ��������."""
    secret_key = env("DJANGO_SECRET_KEY", default=env("SECRET_KEY", default=None))
    if secret_key is None:
        message = (
            "�� ������ ��������� ����. ���������, ��� DJANGO_SECRET_KEY ����� � backend/.env."
        )
        raise ImproperlyConfigured(message)
    return str(secret_key)


# �������� ��������� ���������
SECRET_KEY = _get_secret_key()
DEBUG = env.bool("DEBUG", default=False)
_LEGACY_ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=None)
ALLOWED_HOSTS: list[str] = (
    _LEGACY_ALLOWED_HOSTS
    if _LEGACY_ALLOWED_HOSTS
    else env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1", "testserver"])
)


# ����������� ����������
INSTALLED_APPS = [
    "channels",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # ��������� ����������
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "drf_spectacular_sidecar",
    "django_filters",
    "corsheaders",
    # ��������� ����������
    "apps.users",
    "apps.events.apps.EventsConfig",
    "apps.health.apps.HealthConfig",
    "apps.tasks.apps.TasksConfig",
    "apps.export.apps.ExportConfig",
    "apps.chat.apps.ChatConfig",
    "apps.polls.apps.PollsConfig",
    "apps.notifications",
]


MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
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
        "DIRS": [BASE_DIR / "templates"],
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
        default="postgres://event_user:event_password@postgres:5432/event_db",
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
LANGUAGE_CODE = "ru"
TIME_ZONE = "Europe/Moscow"
USE_I18N = True
USE_TZ = True
LANGUAGES = [("ru", _('Русский'))]
LOCALE_PATHS = [BASE_DIR / "locale"]

EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", default="")
EMAIL_PORT = env.int("EMAIL_PORT", default=25)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
EMAIL_USE_SSL = env.bool("EMAIL_USE_SSL", default=False)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="Event Planner <no-reply@event-planner.local>")
SITE_URL: str = env("SITE_URL", default="http://localhost:3000")
SITE_FRONT_URL: str = env("SITE_FRONT_URL", default=SITE_URL)


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
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.common.exceptions.localized_exception_handler",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Event Planning App API",
    "DESCRIPTION": "Документация REST API для Event Planning App",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
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
CELERY_TIMEZONE = TIME_ZONE
CELERY_ENABLE_UTC = True
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=False)
CELERY_BEAT_SCHEDULE: dict[str, Any] = {
    "send_deadline_reminders": {
        "task": "apps.notifications.tasks.send_deadline_reminders",
        "schedule": timedelta(hours=1),
    },
    "send_poll_closing_notifications": {
        "task": "apps.notifications.tasks.send_poll_closing_notifications",
        "schedule": timedelta(minutes=30),
    },
}

if env.bool("ENABLE_DAILY_DIGEST", default=False):
    CELERY_BEAT_SCHEDULE["send_daily_digest"] = {
        "task": "apps.notifications.tasks.send_daily_digest",
        "schedule": crontab(hour=9, minute=0, timezone=TIME_ZONE),
    }

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
            # 401/403/404 ������ �� �������� ������� ���������������� ��� debug-���������.
            "level": "ERROR",
            "handlers": ["console"],
            "propagate": False,
        },
    },
}


