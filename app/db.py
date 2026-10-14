"""Database connection and initialization with Turso (libsql)."""
import json
import libsql
from app.config import TURSO_DATABASE_URL, TURSO_AUTH_TOKEN

_google_credentials = None


def get_conn():
    """Create a new libsql connection (stateless — safe for serverless)."""
    if not TURSO_DATABASE_URL:
        raise RuntimeError(
            "TURSO_DATABASE_URL is not set. "
            "Please configure your environment variables or c.env."
        )
    return libsql.connect(
        database=TURSO_DATABASE_URL,
        auth_token=TURSO_AUTH_TOKEN,
    )


def _add_column_if_missing(conn, table: str, column_def: str):
    col_name = column_def.strip().split()[0]
    cols = [r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]
    if col_name not in cols:
        try:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column_def}")
            conn.commit()
        except Exception:
            pass


def init_db():
    """Initialize tables and load stored tokens if available."""
    global _google_credentials
    conn = get_conn()

    conn.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            bucket_key TEXT NOT NULL,
            text TEXT NOT NULL,
            done INTEGER NOT NULL DEFAULT 0,
            priority TEXT NOT NULL DEFAULT 'medium',
            category TEXT NOT NULL DEFAULT 'Work',
            due_time TEXT,
            recurrence TEXT,
            gcal_event_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    _add_column_if_missing(conn, "tasks", "due_time TEXT")
    _add_column_if_missing(conn, "tasks", "recurrence TEXT")
    _add_column_if_missing(conn, "tasks", "gcal_event_id TEXT")
    _add_column_if_missing(conn, "tasks", "reminder_time TEXT")
    _add_column_if_missing(conn, "tasks", "reminder_email_sent INTEGER DEFAULT 0")

    conn.execute("""
        CREATE TABLE IF NOT EXISTS scratchpads (
            bucket_key TEXT PRIMARY KEY,
            content TEXT NOT NULL DEFAULT ''
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS google_tokens (
            id INTEGER PRIMARY KEY,
            token TEXT NOT NULL
        )
    """)

    conn.commit()

    # Load stored Google credentials if present
    try:
        row = conn.execute("SELECT token FROM google_tokens WHERE id = 1").fetchone()
        if row:
            from app.services import gcal
            gcal.set_google_credentials(json.loads(row[0]))
    except Exception as e:
        print(f"Could not restore Google tokens: {e}")


def build_planner_data(conn) -> dict:
    """Helper: rebuild the plannerData shape the frontend expects."""
    tasks_result = conn.execute(
        "SELECT id, bucket_key, text, done, priority, category, due_time, recurrence, gcal_event_id, reminder_time FROM tasks"
    ).fetchall()

    scratchpads_result = conn.execute(
        "SELECT bucket_key, content FROM scratchpads"
    ).fetchall()

    tasks: dict = {}
    for row in tasks_result:
        tid, bkey, text, done, priority, category, due_time, recurrence, gcal_event_id, reminder_time = row
        if bkey not in tasks:
            tasks[bkey] = []
        tasks[bkey].append({
            "id": tid,
            "text": text,
            "done": bool(done),
            "priority": priority,
            "category": category,
            "due_time": due_time or None,
            "recurrence": recurrence or None,
            "gcal_event_id": gcal_event_id or None,
            "reminder_time": reminder_time or None,
        })

    scratchpads: dict = {}
    for row in scratchpads_result:
        bkey, content = row
        scratchpads[bkey] = content

    return {"tasks": tasks, "scratchpads": scratchpads}
