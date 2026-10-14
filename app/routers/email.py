"""FastAPI routes for Resend email dispatching."""
from fastapi import APIRouter, HTTPException
import resend as resend_lib
from app.config import RESEND_API
from app.schemas import EmailRequest

router = APIRouter(prefix="/api", tags=["email"])


@router.post("/email")
def send_email(request: EmailRequest):
    if not RESEND_API:
        raise HTTPException(status_code=503, detail="Resend not configured")

    try:
        resend_lib.api_key = RESEND_API
        params = {
            "from": "Chronos Planner <onboarding@resend.dev>",
            "to": [request.to_email],
            "subject": request.subject,
            "html": f"<p>{request.body}</p>"
        }
        email = resend_lib.Emails.send(params)
        return {"status": "success", "id": email["id"]}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
