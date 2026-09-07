import threading
import time

import httpx
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import User
from db.session import get_db
from settings import settings

AUTH_CACHE_TTL = 300.0


class _TokenCache:
    def __init__(self) -> None:
        self._data: dict[str, tuple[float, dict]] = {}
        self._lock = threading.Lock()

    def get(self, token: str) -> dict | None:
        with self._lock:
            entry = self._data.get(token)
            if entry is None:
                return None
            expires_at, claims = entry
            if time.monotonic() >= expires_at:
                del self._data[token]
                return None
            return claims

    def put(self, token: str, claims: dict) -> None:
        with self._lock:
            self._data[token] = (time.monotonic() + AUTH_CACHE_TTL, claims)
            # opportunistic sweep
            now = time.monotonic()
            for k in [k for k, (exp, _) in self._data.items() if exp <= now]:
                del self._data[k]


_CACHE = _TokenCache()


async def _fetch_claims(token: str) -> dict:
    cached = _CACHE.get(token)
    if cached is not None:
        return cached
    if not settings.auth0_domain:
        raise HTTPException(401, "auth is not configured")
    try:
        async with httpx.AsyncClient(timeout=8.0) as ac:
            res = await ac.get(
                f"https://{settings.auth0_domain}/userinfo",
                headers={"Authorization": f"Bearer {token}"},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(401, "auth check failed") from exc
    if res.status_code != 200:
        raise HTTPException(401, "invalid token")
    claims = res.json()
    _CACHE.put(token, claims)
    return claims


async def current_user(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> User:
    # Header default=None (not `...`) so a *missing* header is 401, not 422.
    if not authorization:
        raise HTTPException(401, "missing bearer token")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "missing bearer token")

    claims = await _fetch_claims(token)
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(401, "token has no subject")

    user = db.execute(select(User).where(User.auth0_sub == sub)).scalar_one_or_none()
    if user is None:
        user = User(
            auth0_sub=sub, email=claims.get("email"),
            name=claims.get("name"), picture=claims.get("picture"),
        )
        db.add(user)
        db.flush()
    else:
        changed = False
        for field in ("email", "name", "picture"):
            new = claims.get(field)
            if new is not None and getattr(user, field) != new:
                setattr(user, field, new)
                changed = True
        if changed:
            db.flush()
    return user
