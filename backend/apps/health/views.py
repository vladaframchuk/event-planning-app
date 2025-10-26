from django.utils.timezone import now
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthView(APIView):
    """Простейший health-check, который сообщает о готовности бэкенда."""

    permission_classes = (AllowAny,)
    authentication_classes: tuple[type, ...] = ()

    def get(self, request: Request) -> Response:
        """Возвращает текущее состояние сервиса с временной меткой."""
        payload: dict[str, str] = {
            "status": "ok",
            "service": "backend",
            "time": now().isoformat(),
        }
        return Response(payload)
