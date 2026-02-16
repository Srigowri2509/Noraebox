from fastapi import APIRouter, HTTPException, Depends, Body
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.db import get_db
from app.models import Room, RoomSession, QueueItem
from app.schemas import SessionStart, SessionEnd, SessionResponse

router = APIRouter()


@router.post("/start", response_model=SessionResponse)
def start_session(payload: SessionStart = Body(...), db: Session = Depends(get_db)):
    """Start a room session - creates room_sessions row"""
    try:
        room_id = payload.room_id
        total_minutes = payload.total_minutes
        if not total_minutes or total_minutes <= 0:
            raise HTTPException(status_code=400, detail="total_minutes must be a positive integer")
        
        print(f"POST /sessions/start: Starting session for room {room_id} with {total_minutes} minutes")
        
        # Verify room exists
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Clear queue
        db.query(QueueItem).filter(QueueItem.room_id == room_id).delete()
        
        # Check if a session already exists for this room and delete it first
        existing_session = db.query(RoomSession).filter(RoomSession.room_id == room_id).first()
        if existing_session:
            print(f"POST /sessions/start: Found existing session, deleting it first")
            # Mark existing session as finished
            now = datetime.now(timezone.utc)
            existing_session.status = "finished"
            existing_session.session_end_time = now
            db.delete(existing_session)
            db.commit()
            print(f"POST /sessions/start: Existing session deleted")
        
        # Create new session
        now = datetime.now(timezone.utc)
        new_session = RoomSession(
            room_id=room_id,
            status="idle",
            total_minutes=total_minutes,
            session_created_at=now,
            session_start_time=None,  # Timer starts when first song plays
            current_song_id=None,
            current_song_start_time=None
        )
        db.add(new_session)
        db.commit()
        db.refresh(new_session)
        
        # Attach session to room
        room.is_active = True
        room.session_id = new_session.id
        db.commit()
        db.refresh(room)
        
        print(f"POST /sessions/start: Session created with id {new_session.id}")
        return new_session
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        error_str = str(e)
        print(f"Error starting session: {error_str}")
        raise HTTPException(status_code=500, detail=f"Error starting session: {error_str}")


@router.post("/end")
def end_session(payload: SessionEnd = Body(...), db: Session = Depends(get_db)):
    """End a room session - updates room_sessions"""
    try:
        room_id = payload.room_id
        print(f"POST /sessions/end: Ending session for room {room_id}")
        
        # Get room to find session_id
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        session_id = room.session_id
        
        # Clear queue
        db.query(QueueItem).filter(QueueItem.room_id == room_id).delete()
        
        # Update room_sessions if session exists
        if session_id:
            session = db.query(RoomSession).filter(RoomSession.id == session_id).first()
            if session:
                now = datetime.now(timezone.utc)
                session.status = "finished"
                session.session_end_time = now
                session.current_song_id = None
                session.current_song_start_time = None
                db.commit()
        
        # Update room
        room.is_active = False
        room.session_id = None
        db.commit()
        db.refresh(room)
        
        print(f"POST /sessions/end: Session ended successfully")
        return room
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error ending session: {e}")
        raise HTTPException(status_code=500, detail=str(e))
