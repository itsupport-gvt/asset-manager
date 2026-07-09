"""
routes/users.py – Auth user endpoints for Asset Manager.

GET  /api/auth/me                   – current user identity + role
GET  /api/auth/users                – list Entra sign-in users (Admin only)
PATCH /api/auth/users/{oid}/status  – enable/disable a user (Admin only)
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import AUTH_ENABLED, ALL_ROLES, UserInfo, get_optional_user, require_admin
from database import get_db
from models_db import DBAuthUser

router = APIRouter(prefix="/api/auth", tags=["auth"])


class AuthUserOut(BaseModel):
    oid: str
    name: str
    email: str
    entra_roles: List[str]
    effective_role: str
    is_active: bool
    last_login: str
    created_at: str

    class Config:
        from_attributes = True


def _row_to_out(row: DBAuthUser) -> AuthUserOut:
    try:
        roles = json.loads(row.entra_roles or "[]")
    except Exception:
        roles = []

    from auth import _resolve_role
    effective = _resolve_role(roles) or "None"

    return AuthUserOut(
        oid=row.oid,
        name=row.name or "",
        email=row.email or "",
        entra_roles=roles,
        effective_role=effective,
        is_active=bool(row.is_active),
        last_login=row.last_login or "",
        created_at=row.created_at or "",
    )


@router.get("/me")
def get_me(
    user: Optional[UserInfo] = Depends(get_optional_user),
) -> dict:
    return {
        "auth_enabled": AUTH_ENABLED,
        "user": {
            "oid":   user.oid,
            "name":  user.name,
            "email": user.email,
            "role":  user.role,
        } if user else None,
    }


@router.get("/users", response_model=List[AuthUserOut])
def list_auth_users(
    _admin: UserInfo = Depends(require_admin),
    db: Session = Depends(get_db),
) -> List[AuthUserOut]:
    rows = db.query(DBAuthUser).order_by(DBAuthUser.created_at.desc()).all()
    return [_row_to_out(r) for r in rows]


class UpdateStatusBody(BaseModel):
    is_active: bool


@router.patch("/users/{oid}/status")
def update_user_status(
    oid: str,
    body: UpdateStatusBody,
    admin: UserInfo = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AuthUserOut:
    if oid == admin.oid and not body.is_active:
        raise HTTPException(status_code=400, detail="Cannot disable your own account")
    row = db.query(DBAuthUser).filter(DBAuthUser.oid == oid).first()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    row.is_active = body.is_active
    db.commit()
    db.refresh(row)
    return _row_to_out(row)
