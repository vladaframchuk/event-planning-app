from datetime import datetime

from django.test import Client, SimpleTestCase
from django.utils.timezone import now


class HealthEndpointTests(SimpleTestCase):
    """Проверяет корректность ответа health-check эндпоинта."""

    def test_health_endpoint_returns_ok_status(self) -> None:
        """Убеждаемся, что health-check отвечает корректным JSON."""
        client = Client()
        response = client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["service"], "backend")

        timestamp = datetime.fromisoformat(data["time"])
        self.assertIsNotNone(timestamp.tzinfo, "Ожидаем timezone-aware ISO 8601 дату")
        self.assertLessEqual(timestamp, now())
