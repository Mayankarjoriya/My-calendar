"""Pydantic data schemas for Chronos Planner."""
from typing import Optional, Dict, List, Any
from pydantic import BaseModel


class TaskCreate(BaseModel):
    id: str
    bucket_key: str
    text: str
    priority: str = "medium"
    category: str = "Work"
    done: bool = False
    due_time: Optional[str] = None          # ISO datetime string e.g. "2026-10-15T09:00:00"
    recurrence: Optional[str] = None        # "daily"|"weekly"|"monthly"|None
    reminder_time: Optional[str] = None     # Scheduled reminder time e.g. "2026-10-14T18:00:00"
    push_to_gcal: bool = False              # Whether to create a Google Calendar event


class TaskUpdate(BaseModel):
    text: Optional[str] = None
    done: Optional[bool] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    due_time: Optional[str] = None
    recurrence: Optional[str] = None
    reminder_time: Optional[str] = None
    gcal_event_id: Optional[str] = None


class ScratchpadUpsert(BaseModel):
    content: str


class ImportPayload(BaseModel):
    tasks: Dict[str, List[Dict[str, Any]]]       # { bucket_key: [task, ...] }
    scratchpads: Dict[str, str]                  # { bucket_key: "text" }


class EmailRequest(BaseModel):
    to_email: str
    subject: str
    body: str


class GCalEventRequest(BaseModel):
    task_id: str
    summary: str
    description: Optional[str] = None
    start_datetime: str   # ISO format "2026-10-15T09:00:00"
    end_datetime: str     # ISO format "2026-10-15T10:00:00"
    timezone: str = "Asia/Kolkata"
    recurrence: Optional[str] = None   # "daily"|"weekly"|"monthly"
    reminder_minutes: int = 30
