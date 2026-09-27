from fastapi import APIRouter, Depends

from app.schemas import (
    AuthResponse,
    AuthUser,
    LoginRequest,
    RegisterRequest,
    SetPasswordRequest,
    VerifyEmailRequest,
    VerifyEmailResponse,
)
from app.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
async def register(payload: RegisterRequest) -> AuthResponse:
    user = auth_service.register_user(payload.email, payload.password, payload.name)
    token = auth_service.create_session(user["id"])
    return AuthResponse(token=token, user=AuthUser(**user))


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest) -> AuthResponse:
    user = auth_service.authenticate_user(payload.email, payload.password)
    token = auth_service.create_session(user["id"])
    return AuthResponse(token=token, user=AuthUser(**user))


@router.post("/logout")
async def logout(token: str = Depends(auth_service.get_current_token)) -> dict:
    auth_service.delete_session(token)
    return {"ok": True}


@router.get("/me", response_model=AuthUser)
async def me(user: dict = Depends(auth_service.get_current_user)) -> AuthUser:
    return AuthUser(**user)


@router.post("/verify-email", response_model=VerifyEmailResponse)
async def verify_email(payload: VerifyEmailRequest) -> VerifyEmailResponse:
    """Recovery step 1: check whether this email has an account. No email is
    sent — the frontend uses this to decide whether to show the "set a new
    password" form directly."""
    return VerifyEmailResponse(exists=auth_service.email_exists(payload.email))


@router.post("/set-password", response_model=AuthResponse)
async def set_password(payload: SetPasswordRequest) -> AuthResponse:
    """Recovery step 2: set a new password for an email that verify-email
    already confirmed exists, and log the user in with it."""
    user = auth_service.set_password_by_email(payload.email, payload.new_password)
    token = auth_service.create_session(user["id"])
    return AuthResponse(token=token, user=AuthUser(**user))
