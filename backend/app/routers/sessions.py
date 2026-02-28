from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone, timedelta
from app.db import get_db
from app.models import Room, RoomSession, QueueItem

router = APIRouter()


@router.post("/start")
def start_session(room_id: str = Query(...), minutes: int = Query(...), db: Session = Depends(get_db)):
    """Start a room session - creates room_sessions row with status='active'"""
    try:
        if not minutes or minutes <= 0:
            raise HTTPException(status_code=400, detail="minutes must be a positive integer")
        
        print(f"POST /sessions/start: Starting session for room {room_id} with {minutes} minutes")
        
        # Verify room exists
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Create new session with status='active' and session_end_time set
        now = datetime.now(timezone.utc)
        session_end_time = now + timedelta(minutes=minutes)
        
        new_session = RoomSession(
            room_id=room_id,
            status="active",
            total_minutes=minutes,
            session_created_at=now,
            session_start_time=now,
            session_end_time=session_end_time,
            current_song_id=None,
            current_song_start_time=None
        )
        db.add(new_session)
        db.commit()
        db.refresh(new_session)
        
        # Update room status
        room.status = 'active'
        db.commit()
        
        print(f"POST /sessions/start: Session created with id {new_session.id}")
        return {"status": "started"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        error_str = str(e)
        print(f"Error starting session: {error_str}")
        raise HTTPException(status_code=500, detail=f"Error starting session: {error_str}")


@router.post("/end")
def end_session(room_id: str = Query(...), db: Session = Depends(get_db)):
    """End a room session - updates room_sessions status to 'ended'"""
    try:
        print(f"POST /sessions/end: Ending session for room {room_id}")
        
        # Verify room exists
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Update active session to 'ended'
        db.query(RoomSession).filter(
            RoomSession.room_id == room_id,
            RoomSession.status == 'active'
        ).update({"status": "ended"})
        
        # Update room status
        room.status = 'available'
        db.commit()
        
        print(f"POST /sessions/end: Session ended successfully")
        return {"status": "ended"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error ending session: {e}")
        raise HTTPException(status_code=500, detail=str(e))
