from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db import get_db
from app.models import Room, RoomSession, QueueItem, Song

router = APIRouter()


@router.post("/add")
def add_to_queue(room_id: str = Query(...), song_id: int = Query(...), db: Session = Depends(get_db)):
    """Add a song to the queue"""
    try:
        # Verify room exists
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Verify song exists
        song = db.query(Song).filter(Song.id == song_id).first()
        if not song:
            raise HTTPException(status_code=404, detail="Song not found")
        
        # Get max position for this room
        max_position = db.query(func.max(QueueItem.position)).filter(
            QueueItem.room_id == room_id
        ).scalar() or 0
        
        # Create new queue item
        new_item = QueueItem(
            room_id=room_id,
            song_id=song_id,
            position=max_position + 1,
            added_by='tablet'
        )
        db.add(new_item)
        db.commit()
        
        print(f"POST /queue/add: Added song {song_id} to room {room_id} at position {max_position + 1}")
        return {"status": "added"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error adding to queue: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/next")
def play_next(room_id: str = Query(...), db: Session = Depends(get_db)):
    """Play the next song from the queue"""
    try:
        # Get next item in queue
        next_item = db.query(QueueItem).filter(
            QueueItem.room_id == room_id
        ).order_by(QueueItem.position).first()
        
        if not next_item:
            return {"status": "no_songs"}
        
        # Update active session with current song
        session = db.query(RoomSession).filter(
            RoomSession.room_id == room_id,
            RoomSession.status == 'active'
        ).first()
        
        if session:
            session.current_song_id = next_item.song_id
        
        # Remove from queue
        db.delete(next_item)
        db.commit()
        
        print(f"POST /queue/next: Playing song {next_item.song_id} for room {room_id}")
        return {"status": "playing"}
    except Exception as e:
        db.rollback()
        print(f"Error playing next song: {e}")
        raise HTTPException(status_code=500, detail=str(e))
