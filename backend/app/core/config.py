from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str
    DEBUG: bool
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    DEFAULT_PASSWORD: str = "Admin@123#"

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
