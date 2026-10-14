"""Main entry point for Chronos Planner FastAPI backend."""
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.db import init_db
from app.services.reminders import reminder_checker_loop
from app.routers.tasks import router as tasks_router
from app.routers.google import router as google_router
from app.routers.email import router as email_router

BASE_DIR = Path(__file__).resolve().parent
INDEX_HTML = BASE_DIR / "index.html"
STATIC_DIR = BASE_DIR / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    reminder_task = asyncio.create_task(reminder_checker_loop())
    yield
    reminder_task.cancel()


app = FastAPI(title="Chronos Planner API", lifespan=lifespan)

# Mount static assets
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Include modular API routers
app.include_router(tasks_router)
app.include_router(google_router)
app.include_router(email_router)


@app.get("/")
def read_root():
    return FileResponse(INDEX_HTML)
