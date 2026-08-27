from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import PlaybackEvent, QueueItem, Room, Song
from app.services.song_access import match_suggestions, resolve_website_code

router = APIRouter()
MAX_QUEUE_SIZE = 20


class SongCodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=12)

    @validator("code")
    def normalize_code(cls, value: str) -> str:
        return "".join(str(value).upper().split()).replace("-", "")


class SongCodeImportRequest(SongCodeRequest):
    room_id: str
    song_ids: list[int] = Field(default_factory=list, max_length=10)


@router.post("/preview")
def preview_song_code(payload: SongCodeRequest, db: Session = Depends(get_db)):
    website = resolve_website_code(payload.code)
    matches = match_suggestions(db, website.get("suggestions", []))
    return {
        "booking_ref": website.get("bookingRef"),
        "valid_until": website.get("validUntil"),
        "session": website.get("session"),
        "matches": matches,
        "available_count": sum(1 for match in matches if match["available"]),
        "unavailable_count": sum(1 for match in matches if not match["available"]),
    }


@router.post("/import")
def import_song_code(payload: SongCodeImportRequest, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == payload.room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    website = resolve_website_code(payload.code)
    matches = match_suggestions(db, website.get("suggestions", []))
    allowed_ids = {match["song"]["id"] for match in matches if match["available"]}
    requested_ids = list(dict.fromkeys(payload.song_ids))
    if not requested_ids:
        raise HTTPException(status_code=400, detail="Select at least one available song")
    if any(song_id not in allowed_ids for song_id in requested_ids):
        raise HTTPException(status_code=400, detail="One or more selected songs are not in this booking list")

    existing_ids = {
        row[0]
        for row in db.query(QueueItem.song_id).filter(QueueItem.room_id == payload.room_id).all()
    }
    current_count = len(existing_ids)
    max_position = (
        db.query(func.max(QueueItem.position)).filter(QueueItem.room_id == payload.room_id).scalar()
        or 0
    )
    added = []
    skipped = []
    for song_id in requested_ids:
        if song_id in existing_ids:
            skipped.append({"song_id": song_id, "reason": "already_in_queue"})
            continue
        if current_count >= MAX_QUEUE_SIZE:
            skipped.append({"song_id": song_id, "reason": "queue_full"})
            continue
        song = db.query(Song).filter(Song.id == song_id).first()
        if not song:
            skipped.append({"song_id": song_id, "reason": "unavailable"})
            continue
        max_position += 1
        db.add(
            QueueItem(
                room_id=payload.room_id,
                song_id=song_id,
                position=max_position,
                added_by=f"booking:{website.get('bookingId', 'code')}",
            )
        )
        db.add(PlaybackEvent(room_id=payload.room_id, song_id=song_id, event_type="queued"))
        existing_ids.add(song_id)
        current_count += 1
        added.append({"song_id": song_id, "title": song.title, "position": max_position})

    db.commit()
    return {"status": "ok", "added": added, "skipped": skipped, "queue_count": current_count}
