from __future__ import annotations

from typing import Any, Optional
from urllib.parse import parse_qs

from channels.auth import AuthMiddlewareStack
from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken

from apps.users.models import User


@database_sync_to_async
def get_user_from_token(token: str) -> Optional[User]:
    try:
        access = AccessToken(token)
        user_id = access.get("user_id")
        if user_id is None:
            return None
        return User.objects.get(pk=user_id)
    except Exception:
        return None


class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> Any:
        headers = dict(scope.get("headers", []))
        token: Optional[str] = None

        auth_header = headers.get(b"authorization")
        if auth_header and auth_header.lower().startswith(b"bearer "):
            token = auth_header.split()[1].decode()
        else:
            query_params = parse_qs(scope.get("query_string", b"").decode())
            token_list = query_params.get("token")
            if token_list:
                token = token_list[0]

        scope["user"] = AnonymousUser()
        if token:
            user = await get_user_from_token(token)
            if user:
                scope["user"] = user
        return await super().__call__(scope, receive, send)


def JWTAuthMiddlewareStack(inner):
    return JWTAuthMiddleware(AuthMiddlewareStack(inner))
