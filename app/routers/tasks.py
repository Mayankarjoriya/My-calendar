"""FastAPI routes for task CRUD, scratchpads, and backup import/export."""
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from app.db import get_conn, build_planner_data
from app.schemas import TaskCreate, TaskUpdate, ScratchpadUpsert, ImportPayload
from app.services import gcal

router = APIRouter(prefix="/api", tags=["tasks"])


@router.get("/data")
def get_all_data():
    """Return all tasks and scratchpads in the plannerData shape."""
    conn = get_conn()
    return JSONResponse(build_planner_data(conn))


@router.post("/tasks", status_code=201)
def create_task(task: TaskCreate):
    conn = get_conn()
    conn.execute(
        "INSERT INTO tasks (id, bucket_key, text, done, priority, category, due_time, recurrence, gcal_event_id, reminder_time, reminder_email_sent) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
        (task.id, task.bucket_key, task.text, int(task.done),
         task.priority, task.category, task.due_time, task.recurrence, None, task.reminder_time),
    )
    conn.commit()

    # Optionally push to Google Calendar
    gcal_event_id = None
    if task.push_to_gcal and task.due_time:
        service = gcal.get_gcal_service()
        if service:
            try:
                start_dt = datetime.fromisoformat(task.due_time)
                end_dt = start_dt + timedelta(hours=1)
                tz_str = "Asia/Kolkata"
                event_body = {
                    "summary": task.text,
                    "description": f"Category: {task.category}\nPriority: {task.priority}",
                    "start": {"dateTime": start_dt.isoformat(), "timeZone": tz_str},
                    "end": {"dateTime": end_dt.isoformat(), "timeZone": tz_str},
                    "reminders": {
                        "useDefault": False,
                        "overrides": [
                            {"method": "popup", "minutes": 30},
                            {"method": "email", "minutes": 60},
                        ],
                    },
                }
                if task.recurrence:
                    event_body["recurrence"] = gcal.build_recurrence_rule(task.recurrence)

                event = service.events().insert(calendarId="primary", body=event_body).execute()
                gcal_event_id = event.get("id")

                # Update gcal_event_id in DB
                conn2 = get_conn()
                conn2.execute(
                    "UPDATE tasks SET gcal_event_id = ? WHERE id = ?",
                    (gcal_event_id, task.id)
                )
                conn2.commit()
            except Exception as e:
                print(f"Failed to create GCal event: {e}")

    return {"status": "created", "id": task.id, "gcal_event_id": gcal_event_id}


@router.put("/tasks/{task_id}")
def update_task(task_id: str, update: TaskUpdate):
    conn = get_conn()

    row = conn.execute(
        "SELECT text, done, priority, category, due_time, recurrence, gcal_event_id, reminder_time FROM tasks WHERE id = ?",
        (task_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")

    existing_text, existing_done, existing_priority, existing_category, existing_due, existing_rec, existing_gcal, existing_rem = row
    new_text = update.text if update.text is not None else existing_text
    new_done = update.done if update.done is not None else bool(existing_done)
    new_priority = update.priority if update.priority is not None else existing_priority
    new_category = update.category if update.category is not None else existing_category
    new_due_time = update.due_time if update.due_time is not None else existing_due
    new_rec = update.recurrence if update.recurrence is not None else existing_rec
    new_gcal = update.gcal_event_id if update.gcal_event_id is not None else existing_gcal
    new_rem = update.reminder_time if update.reminder_time is not None else existing_rem

    conn.execute(
        "UPDATE tasks SET text=?, done=?, priority=?, category=?, due_time=?, recurrence=?, gcal_event_id=?, reminder_time=? WHERE id=?",
        (new_text, int(new_done), new_priority, new_category, new_due_time, new_rec, new_gcal, new_rem, task_id),
    )
    conn.commit()
    return {"status": "updated", "id": task_id}


@router.delete("/tasks/{task_id}")
def delete_task(task_id: str):
    conn = get_conn()

    # Also delete from Google Calendar if linked
    row = conn.execute("SELECT gcal_event_id FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if row and row[0]:
        service = gcal.get_gcal_service()
        if service:
            try:
                service.events().delete(calendarId="primary", eventId=row[0]).execute()
            except Exception as e:
                print(f"Failed to delete GCal event: {e}")

    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    return {"status": "deleted", "id": task_id}


@router.put("/scratchpads/{bucket_key:path}")
def upsert_scratchpad(bucket_key: str, body: ScratchpadUpsert):
    conn = get_conn()
    conn.execute(
        "INSERT INTO scratchpads (bucket_key, content) VALUES (?, ?) "
        "ON CONFLICT(bucket_key) DO UPDATE SET content=excluded.content",
        (bucket_key, body.content),
    )
    conn.commit()
    return {"status": "saved", "key": bucket_key}


@router.post("/import")
def import_data(payload: ImportPayload):
    """Bulk-import a full plannerData JSON backup into Turso."""
    conn = get_conn()
    conn.execute("DELETE FROM tasks")
    conn.execute("DELETE FROM scratchpads")

    for bucket_key, task_list in payload.tasks.items():
        for t in task_list:
            conn.execute(
                "INSERT OR REPLACE INTO tasks (id, bucket_key, text, done, priority, category, due_time, recurrence, gcal_event_id) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (t["id"], bucket_key, t["text"], int(t.get("done", False)),
                 t.get("priority", "medium"), t.get("category", "Work"),
                 t.get("due_time"), t.get("recurrence"), t.get("gcal_event_id")),
            )

    for bucket_key, content in payload.scratchpads.items():
        conn.execute(
            "INSERT OR REPLACE INTO scratchpads (bucket_key, content) VALUES (?, ?)",
            (bucket_key, content),
        )

    conn.commit()
    return {"status": "imported"}


@router.delete("/data")
def clear_all_data():
    """Wipe all tasks and scratchpads."""
    conn = get_conn()
    conn.execute("DELETE FROM tasks")
    conn.execute("DELETE FROM scratchpads")
    conn.commit()
    return {"status": "cleared"}
