import re
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_ROOT_DIR = _BACKEND_DIR.parent

# Default passwords that were committed to the repository at some point: treated as public, never accepted.
LEAKED_DEFAULT_PASSWORDS = frozenset()


class Settings(BaseSettings):
    PROJECT_NAME: str
    DEBUG: bool
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    # Initial password for new users. Required, no default: a default in code is a password everyone can read.
    DEFAULT_PASSWORD: str

    # Browser origins allowed to call the API (comma separated). Fetched from .env. Never "*": requests carry the session cookie.
    CORS_ORIGINS: str
    # Also accept the app opened from any private-network address (10.x, 172.16-31.x, 192.168.x) on the frontend
    # port, so it works on another machine without editing CORS_ORIGINS. Public origins still need CORS_ORIGINS.
    CORS_ALLOW_PRIVATE_NETWORK: bool = True
    FRONTEND_PORT: int = 8106  # the port in the root .env; used for the private-network CORS rule
    BACKEND_PORT: int = 8107

    # Sessions. ACCESS_TOKEN_EXPIRE_MINUTES is the longest a sign-in can last in total; the session also ends
    # after SESSION_IDLE_MINUTES without activity (it is renewed while the user keeps working).
    SESSION_IDLE_MINUTES: int = 30

    # Session cookie. COOKIE_SECURE=None means "secure unless DEBUG" (Secure cookies need HTTPS).
    COOKIE_NAME: str = "bigbasket_session"
    COOKIE_SECURE: bool | None = None
    COOKIE_SAMESITE: str = "strict"  # use "none" (with COOKIE_SECURE=true) only if the UI and API are on different sites

    # Brute-force protection on login
    MAX_FAILED_LOGINS: int = 5           # wrong passwords before the account is locked
    LOCKOUT_MINUTES: int = 15
    LOGIN_ATTEMPTS_PER_IP: int = 20      # login requests allowed per IP ...
    LOGIN_WINDOW_SECONDS: int = 300      # ... in this many seconds (per server process)
    MAX_LIVE_CONNECTIONS_PER_USER: int = 5

    # Photoroom AI Background Removal configuration (https://docs.photoroom.com/)
    PHOTOROOM_API_KEY: str = ""
    
    # Google Gemini AI Vision & Classification configuration (https://ai.google.dev/gemini-api/docs/models)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = ""  # Configured strictly in .env (e.g. GEMINI_MODEL=gemini-3.5-flash-lite)
    # Optional second model (e.g. gemini-3.1-flash-lite), used only when GEMINI_MODEL keeps failing with 429/5xx.
    GEMINI_FALLBACK_MODEL: str = ""
    GEMINI_MAX_ATTEMPTS: int  # Required, fetched from .env only (attempts per model)
    # Optional speed-up for the classification call only (e.g. "low" or "minimal" on Gemini 3). Empty = model default.
    # Compare results on your own images before enabling: less thinking can change classification accuracy.
    GEMINI_THINKING_LEVEL: str = ""

    # Redis & Celery Distributed Task Queue configuration (configured strictly in .env)
    REDIS_URL: str
    CELERY_BROKER_URL: str
    CELERY_RESULT_BACKEND: str

    @field_validator("DEFAULT_PASSWORD")
    @classmethod
    def _strong_default_password(cls, v: str) -> str:
        if v in LEAKED_DEFAULT_PASSWORDS:
            raise ValueError("DEFAULT_PASSWORD is a value that was published in the repository; set a new one in .env")
        if len(v) < 10 or not all(re.search(p, v) for p in (r"[a-z]", r"[A-Z]", r"\d", r"[^A-Za-z0-9]")):
            raise ValueError("DEFAULT_PASSWORD must be 10+ characters with upper and lower case letters, a digit and a symbol")
        return v

    class Config:
        env_file = str(_ROOT_DIR / ".env")
        env_file_encoding = "utf-8"
        extra = "ignore"

    @property
    def cookie_secure(self) -> bool:
        return (not self.DEBUG) if self.COOKIE_SECURE is None else self.COOKIE_SECURE

    @property
    def cors_origin_regex(self) -> str | None:
        if not self.CORS_ALLOW_PRIVATE_NETWORK:
            return None
        return (
            r"^https?://(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}"
            r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})" + f":{self.FRONTEND_PORT}$"
        )

    def origin_allowed(self, origin: str) -> bool:
        """True if a browser Origin is trusted: listed in CORS_ORIGINS or a private-network address."""
        origin = origin.rstrip("/")
        if origin in self.cors_origins:
            return True
        pattern = self.cors_origin_regex
        return bool(pattern and re.match(pattern, origin))

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.CORS_ORIGINS.split(",") if o.strip() and o.strip() != "*"]


settings = Settings()
