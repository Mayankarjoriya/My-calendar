import os
import json
from contextlib import asynccontextmanager

import libsql
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional

load_dotenv()
load_dotenv(".env.local")
load_dotenv("c.env.local")

# ---------------------------------------------------------------------------
# Database connection
# ---------------------------------------------------------------------------
TURSO_DATABASE_URL = os.environ.get("TURSO_DATABASE_URL", "")
TURSO_AUTH_TOKEN = os.environ.get("TURSO_AUTH_TOKEN", "")

def get_conn():
    """Create a new libsql connection (stateless — safe for serverless)."""
    if not TURSO_DATABASE_URL:
        raise RuntimeError(
            "TURSO_DATABASE_URL is not set. "
            "Set environment variables in Vercel Dashboard or .env.local."
        )
    return libsql.connect(
        database=TURSO_DATABASE_URL,
        auth_token=TURSO_AUTH_TOKEN,
    )


def init_db():
    """Create tables if they don't exist."""
    conn = get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id          TEXT PRIMARY KEY,
            bucket_key  TEXT NOT NULL,
            text        TEXT NOT NULL,
            done        INTEGER NOT NULL DEFAULT 0,
            priority    TEXT NOT NULL DEFAULT 'medium',
            category    TEXT NOT NULL DEFAULT 'Work'
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS scratchpads (
            bucket_key  TEXT PRIMARY KEY,
            content     TEXT NOT NULL
        )
    """)
    conn.commit()


# ---------------------------------------------------------------------------
# Lifespan: init DB on startup
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        init_db()
    except Exception as e:
        print(f"Database init warning: {e}")
    yield


app = FastAPI(title="Chronos Planner API", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Helper: rebuild the plannerData shape the frontend expects
# ---------------------------------------------------------------------------
def build_planner_data(conn) -> dict:
    tasks_result = conn.execute(
        "SELECT id, bucket_key, text, done, priority, category FROM tasks"
    ).fetchall()

    scratchpads_result = conn.execute(
        "SELECT bucket_key, content FROM scratchpads"
    ).fetchall()

    tasks: dict = {}
    for row in tasks_result:
        tid, bkey, text, done, priority, category = row
        if bkey not in tasks:
            tasks[bkey] = []
        tasks[bkey].append({
            "id": tid,
            "text": text,
            "done": bool(done),
            "priority": priority,
            "category": category,
        })

    scratchpads: dict = {}
    for row in scratchpads_result:
        bkey, content = row
        scratchpads[bkey] = content

    return {"tasks": tasks, "scratchpads": scratchpads}


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class TaskCreate(BaseModel):
    id: str
    bucket_key: str
    text: str
    priority: str = "medium"
    category: str = "Work"
    done: bool = False


class TaskUpdate(BaseModel):
    text: Optional[str] = None
    done: Optional[bool] = None
    priority: Optional[str] = None
    category: Optional[str] = None


class ScratchpadUpsert(BaseModel):
    content: str


class ImportPayload(BaseModel):
    tasks: dict       # { bucket_key: [task, ...] }
    scratchpads: dict # { bucket_key: "text" }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def read_root():
    return FileResponse("index.html")


@app.get("/api/data")
def get_all_data():
    """Return all tasks and scratchpads in the plannerData shape."""
    conn = get_conn()
    return JSONResponse(build_planner_data(conn))


@app.post("/api/tasks", status_code=201)
def create_task(task: TaskCreate):
    conn = get_conn()
    conn.execute(
        "INSERT INTO tasks (id, bucket_key, text, done, priority, category) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (task.id, task.bucket_key, task.text, int(task.done), task.priority, task.category),
    )
    conn.commit()
    return {"status": "created", "id": task.id}


@app.put("/api/tasks/{task_id}")
def update_task(task_id: str, update: TaskUpdate):
    conn = get_conn()

    row = conn.execute(
        "SELECT text, done, priority, category FROM tasks WHERE id = ?",
        (task_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")

    existing_text, existing_done, existing_priority, existing_category = row
    new_text     = update.text     if update.text     is not None else existing_text
    new_done     = update.done     if update.done     is not None else bool(existing_done)
    new_priority = update.priority if update.priority is not None else existing_priority
    new_category = update.category if update.category is not None else existing_category

    conn.execute(
        "UPDATE tasks SET text=?, done=?, priority=?, category=? WHERE id=?",
        (new_text, int(new_done), new_priority, new_category, task_id),
    )
    conn.commit()
    return {"status": "updated", "id": task_id}


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: str):
    conn = get_conn()
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    return {"status": "deleted", "id": task_id}


@app.put("/api/scratchpads/{bucket_key:path}")
def upsert_scratchpad(bucket_key: str, body: ScratchpadUpsert):
    conn = get_conn()
    conn.execute(
        "INSERT INTO scratchpads (bucket_key, content) VALUES (?, ?) "
        "ON CONFLICT(bucket_key) DO UPDATE SET content=excluded.content",
        (bucket_key, body.content),
    )
    conn.commit()
    return {"status": "saved", "key": bucket_key}


@app.post("/api/import")
def import_data(payload: ImportPayload):
    """Bulk-import a full plannerData JSON backup into Turso."""
    conn = get_conn()

    conn.execute("DELETE FROM tasks")
    conn.execute("DELETE FROM scratchpads")

    for bucket_key, task_list in payload.tasks.items():
        for t in task_list:
            conn.execute(
                "INSERT OR REPLACE INTO tasks (id, bucket_key, text, done, priority, category) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (t["id"], bucket_key, t["text"], int(t.get("done", False)),
                 t.get("priority", "medium"), t.get("category", "Work")),
            )

    for bucket_key, content in payload.scratchpads.items():
        conn.execute(
            "INSERT OR REPLACE INTO scratchpads (bucket_key, content) VALUES (?, ?)",
            (bucket_key, content),
        )

    conn.commit()
    return {"status": "imported"}


@app.delete("/api/data")
def clear_all_data():
    """Wipe all tasks and scratchpads."""
    conn = get_conn()
    conn.execute("DELETE FROM tasks")
    conn.execute("DELETE FROM scratchpads")
    conn.commit()
    return {"status": "cleared"}
