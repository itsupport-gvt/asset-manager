"""
auth.py – Microsoft Entra ID JWT validation and RBAC for Asset Manager.

Roles (defined as App Roles in the Entra app registration):
  AssetManager.Admin   → full access
  AssetManager.Editor  → create / update / assign / return; no delete
  AssetManager.Viewer  → read-only browsing

Auth is disabled (every request treated as anonymous Admin) when
AUTH_CLIENT_ID is not configured.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional

import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from config import AUTH_CLIENT_ID
from database import get_db

logger = logging.getLogger(__name__)

AUTH_ENABLED: bool = bool(AUTH_CLIENT_ID)

# Per-tenant JWKS client cache — keyed by tid claim from the incoming token.
# We discover the tenant dynamically rather than requiring it in config.
_jwks_clients: dict[str, PyJWKClient] = {}


def _get_jwks_client(tid: str) -> PyJWKClient:
    if tid not in _jwks_clients:
        url = f"https://login.microsoftonline.com/{tid}/discovery/v2.0/keys"
        _jwks_clients[tid] = PyJWKClient(url, cache_keys=True, lifespan=3600)
    return _jwks_clients[tid]

_ENTRA_ROLE_MAP: dict[str, str] = {
    "AssetManager.Admin":   "Admin",
    "AssetManager.Editor":  "Editor",
    "AssetManager.Viewer":  "Viewer",
}

_ROLE_PRIORITY = ["Admin", "Editor", "Viewer"]

ALL_ROLES = _ROLE_PRIORITY


class UserInfo:
    def __init__(self, oid: str, name: str, email: str, role: str):
        self.oid   = oid
        self.name  = name
        self.email = email
        self.role  = role

    @property
    def display_name(self) -> str:
        return self.name or self.email or self.oid

    @property
    def is_admin(self)  -> bool: return self.role == "Admin"

    @property
    def is_editor(self) -> bool: return self.role in ("Admin", "Editor")

    @property
    def is_viewer(self) -> bool: return self.role in ("Admin", "Editor", "Viewer")


_ANONYMOUS = UserInfo("system", "System", "", "Admin")


def _resolve_role(entra_roles: list[str]) -> Optional[str]:
    local_roles = {_ENTRA_ROLE_MAP[r] for r in entra_roles if r in _ENTRA_ROLE_MAP}
    for tier in _ROLE_PRIORITY:
        if tier in local_roles:
            return tier
    return None


def _decode_id_token(token: str) -> dict:
    if not AUTH_ENABLED:
        raise RuntimeError("Auth not configured")
    # Decode without signature verification to extract the tid claim, then
    # use the tenant-specific JWKS endpoint for full verification.
    unverified = jwt.decode(token, options={"verify_signature": False})
    tid = unverified.get("tid", "")
    if not tid:
        raise RuntimeError("No tenant ID (tid) claim in token")
    jwks_client = _get_jwks_client(tid)
    issuer = f"https://login.microsoftonline.com/{tid}/v2.0"
    signing_key = jwks_client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=AUTH_CLIENT_ID,
        issuer=issuer,
        leeway=60,
    )


_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Optional[UserInfo]:
    if not AUTH_ENABLED:
        return None

    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        claims = _decode_id_token(credentials.credentials)
    except Exception as exc:
        logger.warning("Token validation failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    oid         = claims.get("oid", "")
    name        = claims.get("name", "")
    email       = claims.get("preferred_username", claims.get("email", ""))
    entra_roles = claims.get("roles", [])

    from models_db import DBAuthUser
    user_row = db.query(DBAuthUser).filter(DBAuthUser.oid == oid).first()
    now_iso = datetime.now(timezone.utc).isoformat()

    if not user_row:
        user_row = DBAuthUser(
            oid=oid, name=name, email=email,
            entra_roles=json.dumps(entra_roles),
            is_active=True,
            last_login=now_iso,
            created_at=now_iso,
        )
        db.add(user_row)
    else:
        if not user_row.is_active:
            raise HTTPException(status_code=403, detail="Your account has been disabled")
        user_row.name        = name
        user_row.email       = email
        user_row.entra_roles = json.dumps(entra_roles)
        user_row.last_login  = now_iso

    db.commit()

    role = _resolve_role(entra_roles)
    if role is None:
        raise HTTPException(
            status_code=403,
            detail="You have not been assigned a role for this application. Contact your administrator.",
        )

    return UserInfo(oid=oid, name=name, email=email, role=role)


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Optional[UserInfo]:
    if not AUTH_ENABLED or not credentials:
        return None
    try:
        return get_current_user(credentials, db)
    except HTTPException:
        return None


def require_viewer(user: Optional[UserInfo] = Depends(get_current_user)) -> UserInfo:
    if AUTH_ENABLED and (not user or not user.is_viewer):
        raise HTTPException(status_code=403, detail="Access denied")
    return user or _ANONYMOUS


def require_editor(user: Optional[UserInfo] = Depends(get_current_user)) -> UserInfo:
    if AUTH_ENABLED and (not user or not user.is_editor):
        raise HTTPException(status_code=403, detail="Editor role or higher required")
    return user or _ANONYMOUS


def require_admin(user: Optional[UserInfo] = Depends(get_current_user)) -> UserInfo:
    if AUTH_ENABLED and (not user or not user.is_admin):
        raise HTTPException(status_code=403, detail="Admin role required")
    return user or _ANONYMOUS
