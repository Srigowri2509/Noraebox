from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone
from app.db import get_db
from app.models import Room, RoomSession, QueueItem, Song
from app.schemas import RoomResponse

router = APIRouter()


@router.get("/", response_model=List[RoomResponse])
def list_rooms(db: Session = Depends(get_db)):
    """List all rooms"""
    try:
        print("GET /rooms called")
        rooms = db.query(Room).all()
        print(f"GET /rooms: Returning {len(rooms)} rooms")
        return rooms
    except Exception as e:
        error_str = str(e)
        print(f"Error listing rooms: {error_str}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{room_id}/status")
def get_room_status(room_id: str, db: Session = Depends(get_db)):
    """Get room status for polling - returns room_status, session info, current song, and queue"""
    try:
        # Get active session
        session = db.query(RoomSession).filter(
            RoomSession.room_id == room_id,
            RoomSession.status == 'active'
        ).first()

        if not session:
            return {
                "room_status": "available",
                "current_song": None,
                "queue": []
            }

        # Remaining time
        if session.session_end_time:
            remaining_seconds = int((session.session_end_time - datetime.now(timezone.utc)).total_seconds())
            remaining_seconds = max(0, remaining_seconds)
        else:
            remaining_seconds = 0

        # Get current song
        current_song = None
        if session.current_song_id:
            song = db.query(Song).filter(Song.id == session.current_song_id).first()
            if song:
                current_song = {
                    "id": song.id,
                    "title": song.title,
                    "file_url": song.file_url
                }

        # Get queue
        queue_items = db.query(QueueItem, Song).join(
            Song, Song.id == QueueItem.song_id
        ).filter(
            QueueItem.room_id == room_id
        ).order_by(QueueItem.position).all()

        queue = [
            {
                "queue_id": str(qi.id),
                "song_id": qi.song_id,
                "title": song.title
            }
            for qi, song in queue_items
        ]

        return {
            "room_status": "active",
            "session_end_time": session.session_end_time.isoformat() if session.session_end_time else None,
            "remaining_seconds": remaining_seconds,
            "current_song": current_song,
            "queue": queue
        }
    except Exception as e:
        print(f"Error getting room status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{room_id}", response_model=RoomResponse)
def get_room(room_id: str, db: Session = Depends(get_db)):
    """Get room status"""
    try:
        print(f"GET /rooms/{room_id} called")
        room = db.query(Room).filter(Room.id == room_id).first()
        
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        print(f"GET /rooms/{room_id}: is_active={room.is_active}, session_id={room.session_id}")
        return room
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting room: {e}")
        raise HTTPException(status_code=500, detail=str(e))
