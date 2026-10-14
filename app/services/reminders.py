"""Background email reminder worker and Resend dispatch service."""
import asyncio
from datetime import datetime
import resend as resend_lib
from app.config import RESEND_API
from app.db import get_conn
from app.services import gcal

if RESEND_API:
    resend_lib.api_key = RESEND_API


async def reminder_checker_loop():
    """Background task that wakes up every 60s to check for tasks that need reminder emails sent."""
    while True:
        await asyncio.sleep(60)
        if not RESEND_API:
            continue

        try:
            now_iso = datetime.now().isoformat()[:16]  # "YYYY-MM-DDTHH:MM"
            conn = get_conn()

            due_reminders = conn.execute(
                """
                SELECT id, text, priority, category, due_time, reminder_time, bucket_key
                FROM tasks
                WHERE reminder_time IS NOT NULL
                  AND reminder_time != ''
                  AND reminder_time <= ?
                  AND reminder_email_sent = 0
                """,
                (now_iso,)
            ).fetchall()

            if due_reminders:
                # Find connected Google account email or recipient email
                to_email = None
                service = gcal.get_gcal_service()
                if service:
                    try:
                        cal_list = service.calendarList().get(calendarId="primary").execute()
                        to_email = cal_list.get("id")
                    except Exception:
                        pass

                if not to_email:
                    to_email = "delivered@resend.dev"

                for rem in due_reminders:
                    tid, text, priority, category, due_time, reminder_time, bkey = rem

                    # Fetch other tasks occurring on that same day / bucket
                    other_tasks = conn.execute(
                        "SELECT text, done, priority, due_time FROM tasks WHERE bucket_key = ?",
                        (bkey,)
                    ).fetchall()

                    tasks_html = "".join([
                        f"<li style='margin-bottom:8px;'>{'✅' if ot[1] else '⏳'} <strong>{ot[0]}</strong> "
                        f"<span style='color:#818cf8;font-size:12px;'>({ot[2]})</span>"
                        f"{' — Due: ' + ot[3].replace('T', ' ') if ot[3] else ''}</li>"
                        for ot in other_tasks
                    ])

                    email_html = f"""
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);">
                      <div style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 16px; margin-bottom: 20px;">
                        <h2 style="margin: 0; color: #818cf8;">⏰ Task Reminder Notification</h2>
                        <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 14px;">Chronos Planner automated reminder</p>
                      </div>
                      
                      <div style="background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                        <span style="display:inline-block; font-size:11px; font-weight:bold; padding:2px 8px; border-radius:6px; background:#4f46e5; color:white; text-transform:uppercase;">{priority} Priority</span>
                        <span style="display:inline-block; font-size:11px; font-weight:bold; padding:2px 8px; border-radius:6px; background:rgba(255,255,255,0.1); color:#cbd5e1; margin-left:6px;">{category}</span>
                        <h3 style="margin: 10px 0 6px 0; font-size: 18px; color: #ffffff;">{text}</h3>
                        <p style="margin: 0; font-size: 13px; color: #cbd5e1;">📅 Due: <strong>{due_time.replace('T', ' ') if due_time else 'Today'}</strong></p>
                      </div>

                      <div style="margin-bottom: 20px;">
                        <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #cbd5e1;">📋 All Tasks Happening On This Date:</h4>
                        <ul style="padding-left: 20px; font-size: 14px; color: #cbd5e1; line-height: 1.6;">
                          {tasks_html}
                        </ul>
                      </div>

                      <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px; text-align: center; font-size: 12px; color: #64748b;">
                        Sent from Chronos Planner • Keeping your days organized
                      </div>
                    </div>
                    """

                    try:
                        resend_lib.Emails.send({
                            "from": "Chronos Planner <onboarding@resend.dev>",
                            "to": [to_email],
                            "subject": f"⏰ Reminder: {text}",
                            "html": email_html
                        })
                        conn.execute(
                            "UPDATE tasks SET reminder_email_sent = 1 WHERE id = ?",
                            (tid,)
                        )
                        conn.commit()
                        print(f"Sent reminder email for task {tid} to {to_email}")
                    except Exception as send_err:
                        print(f"Failed to send reminder email: {send_err}")
        except Exception as loop_err:
            print(f"Error in reminder loop: {loop_err}")
