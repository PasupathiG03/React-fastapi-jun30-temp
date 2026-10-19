import re

from pydantic import field_validator
from pydantic_settings import BaseSettings

# Default passwords that were committed to the repository at some point: treated as public, never accepted.
LEAKED_DEFAULT_PASSWORDS = frozenset({"Admin@123#", "Admin@123"})


class Settings(BaseSettings):
    PROJECT_NAME: str
    DEBUG: bool
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    # Initial password for new users. Required, no default: a default in code is a password everyone can read.
    DEFAULT_PASSWORD: str

    # Browser origins allowed to call the API (comma separated). Never "*": requests carry the session cookie.
    CORS_ORIGINS: str = "http://localhost:8106"

    # Sessions. ACCESS_TOKEN_EXPIRE_MINUTES is the longest a sign-in can last in total; the session also ends
    # after SESSION_IDLE_MINUTES without activity (it is renewed while the user keeps working).
    SESSION_IDLE_MINUTES: int = 30

    # Session cookie. COOKIE_SECURE=None means "secure unless DEBUG" (Secure cookies need HTTPS).
    COOKIE_NAME: str = "pulse_session"
    COOKIE_SECURE: bool | None = None
    COOKIE_SAMESITE: str = "strict"  # use "none" (with COOKIE_SECURE=true) only if the UI and API are on different sites

    # Brute-force protection on login
    MAX_FAILED_LOGINS: int = 5           # wrong passwords before the account is locked
    LOCKOUT_MINUTES: int = 15
    LOGIN_ATTEMPTS_PER_IP: int = 20      # login requests allowed per IP ...
    LOGIN_WINDOW_SECONDS: int = 300      # ... in this many seconds (per server process)
    MAX_LIVE_CONNECTIONS_PER_USER: int = 5

    @field_validator("DEFAULT_PASSWORD")
    @classmethod
    def _strong_default_password(cls, v: str) -> str:
        if v in LEAKED_DEFAULT_PASSWORDS:
            raise ValueError("DEFAULT_PASSWORD is a value that was published in the repository; set a new one in .env")
        if len(v) < 10 or not all(re.search(p, v) for p in (r"[a-z]", r"[A-Z]", r"\d", r"[^A-Za-z0-9]")):
            raise ValueError("DEFAULT_PASSWORD must be 10+ characters with upper and lower case letters, a digit and a symbol")
        return v

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @property
    def cookie_secure(self) -> bool:
        return (not self.DEBUG) if self.COOKIE_SECURE is None else self.COOKIE_SECURE

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.CORS_ORIGINS.split(",") if o.strip() and o.strip() != "*"]


settings = Settings()
