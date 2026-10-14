"""Google Calendar integration and OAuth helpers."""
import json
from typing import Optional, List
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
from app.config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SCOPES
from app.db import get_conn

# Global credentials store (loaded from DB on startup)
_google_credentials: Optional[dict] = None
_oauth_states: dict = {}   # state -> pkce code_verifier


def get_google_credentials() -> Optional[dict]:
    global _google_credentials
    return _google_credentials


def set_google_credentials(creds_data: Optional[dict]):
    global _google_credentials
    _google_credentials = creds_data


def get_oauth_states() -> dict:
    return _oauth_states


def get_gcal_service():
    """Build a Google Calendar service from stored credentials."""
    global _google_credentials
    if not _google_credentials:
        return None

    creds = Credentials(
        token=_google_credentials.get("token"),
        refresh_token=_google_credentials.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=SCOPES,
    )

    # Refresh if expired
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(GoogleRequest())
            persist_credentials(creds)
        except Exception as e:
            print(f"Token refresh failed: {e}")
            return None

    return build("calendar", "v3", credentials=creds)


def persist_credentials(creds: Credentials):
    """Save credentials to DB and memory."""
    global _google_credentials
    token_data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "expiry": creds.expiry.isoformat() if creds.expiry else None,
    }
    _google_credentials = token_data
    try:
        conn = get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO google_tokens (id, token) VALUES (1, ?)",
            (json.dumps(token_data),)
        )
        conn.commit()
    except Exception as e:
        print(f"Failed to persist Google tokens: {e}")


def build_recurrence_rule(recurrence: str) -> List[str]:
    mapping = {
        "daily":   ["RRULE:FREQ=DAILY"],
        "weekly":  ["RRULE:FREQ=WEEKLY"],
        "monthly": ["RRULE:FREQ=MONTHLY"],
    }
    return mapping.get(recurrence, [])
