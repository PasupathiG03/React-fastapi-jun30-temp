from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logger import logger
from app.api import auth, menu, users, roles

app = FastAPI(title=settings.PROJECT_NAME, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8106"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(menu.router, prefix="/api/menus", tags=["Menus"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(roles.router, prefix="/api/roles", tags=["Roles"])


@app.on_event("startup")
async def on_startup():
    logger.info("Starting %s", settings.PROJECT_NAME)


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}
