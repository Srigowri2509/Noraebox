from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy.orm import joinedload

from app.db import SessionLocal
from app.models import QueueItem, RoomSession
from app.services.admin_ws import admin_ws_manager

CHECK_INTERVAL_SECONDS = 1


def _utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


async def watch_session_expiry() -> None:
    while True:
        await complete_expired_sessions_once()
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)


async def complete_expired_sessions_once() -> None:
    now = datetime.now(timezone.utc)
    events = []

    db = SessionLocal()
    try:
        sessions = (
            db.query(RoomSession)
            .options(joinedload(RoomSession.room))
            .filter(
                RoomSession.status == "active",
                RoomSession.session_end_time.isnot(None),
                RoomSession.session_end_time <= now,
            )
            .all()
        )

        for session in sessions:
            room = session.room
            if not room:
                continue

            session.status = "completed"
            session.current_song_id = None
            session.current_song_start_time = None
            room.status = "completed"
            room.is_active = True

            for item in db.query(QueueItem).filter(QueueItem.room_id == session.room_id).all():
                db.delete(item)

            finished_at = session.session_end_time or now
            events.append(
                {
                    "type": "session_finished",
                    "sessionId": str(session.id),
                    "roomId": str(room.id),
                    "roomName": room.name or "Room",
                    "finishedAt": _utc_iso(finished_at),
                }
            )

        if events:
            db.commit()
    except Exception as exc:
        db.rollback()
        print(f"Session expiry monitor error: {exc}")
        events = []
    finally:
        db.close()

    for event in events:
        await admin_ws_manager.broadcast(event)
