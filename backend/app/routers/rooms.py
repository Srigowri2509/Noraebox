from fastapi import APIRouter, HTTPException, Depends, Body
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import datetime, timezone, timedelta
from app.db import get_db
from app.models import Room, RoomSession, QueueItem, Song, SongArtist, Artist
from app.schemas import RoomResponse

router = APIRouter()

# Default duration (in minutes) for sessions created automatically when playback starts
DEFAULT_SESSION_MINUTES = 15


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


@router.get("/{room_id}/session")
def get_room_session(room_id: str, db: Session = Depends(get_db)):
    """Get room session data - backward compatibility endpoint"""
    try:
        # Get the most recent session (active or latest)
        session = db.query(RoomSession).filter(
            RoomSession.room_id == room_id
        ).order_by(RoomSession.session_created_at.desc()).first()

        if not session:
            return {"session": None, "queue": []}

        # Get queue
        queue_items = db.query(QueueItem, Song).join(
            Song, Song.id == QueueItem.song_id
        ).filter(
            QueueItem.room_id == room_id
        ).order_by(QueueItem.position).all()

        queue = [
            {
                "id": str(qi.id),
                "song_id": qi.song_id,
                "title": song.title,
                "position": qi.position
            }
            for qi, song in queue_items
        ]

        session_response = {
            "id": str(session.id),
            "room_id": str(session.room_id),
            "status": session.status,
            "total_minutes": session.total_minutes,
            "session_created_at": session.session_created_at.isoformat() if session.session_created_at else None,
            "session_start_time": session.session_start_time.isoformat() if session.session_start_time else None,
            "session_end_time": session.session_end_time.isoformat() if session.session_end_time else None,
            "current_song_id": session.current_song_id,
            "current_song_start_time": session.current_song_start_time.isoformat() if session.current_song_start_time else None
        }
        print(f"📊 GET /rooms/{room_id}/session: Returning session with total_minutes={session.total_minutes}")
        
        return {
            "session": session_response,
            "queue": queue
        }
    except Exception as e:
        print(f"Error getting room session: {e}")
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
        
        print(f"GET /rooms/{room_id}: is_active={room.is_active}, status={room.status}")
        return room
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting room: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{room_id}/queue")
def get_queue(room_id: str, db: Session = Depends(get_db)):
    """Get queue for a room - queue is based on song_id only, independent of artists"""
    try:
        # Verify room exists
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Get queue items with song data (no artist joins - queue is song_id based only)
        queue_items = db.query(QueueItem, Song).outerjoin(
            Song, Song.id == QueueItem.song_id
        ).filter(
            QueueItem.room_id == room_id
        ).order_by(QueueItem.position).all()
        
        queue = []
        for qi, song in queue_items:
            if not song:
                continue
            
            # Queue only contains song_id and song basic info - no artist data
            queue.append({
                "id": str(qi.id),
                "song_id": qi.song_id,  # Primary identifier for queue
                "title": song.title,
                "album": song.album,
                "language": song.language,
                "position": qi.position,
                "added_by": qi.added_by
            })
        
        return queue
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting queue: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{room_id}/queue/add")
def add_to_queue(room_id: str, payload: dict = Body(...), db: Session = Depends(get_db)):
    """Add a song to the queue"""
    try:
        song_id = payload.get("song_id")
        added_by = payload.get("added_by", "tablet")
        
        if not song_id:
            raise HTTPException(status_code=400, detail="song_id is required")
        
        # Verify room exists
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Verify song exists
        song = db.query(Song).filter(Song.id == song_id).first()
        if not song:
            raise HTTPException(status_code=404, detail="Song not found")
        
        # Check if this song is already in the queue (prevent duplicates by song_id only)
        # Once a song is played and removed, it can be added again
        existing_item = db.query(QueueItem).filter(
            QueueItem.room_id == room_id,
            QueueItem.song_id == song_id
        ).first()
        
        if existing_item:
            # Song already in queue - return existing position instead of adding duplicate
            print(f"POST /rooms/{room_id}/queue/add: Song {song_id} already in queue at position {existing_item.position}, skipping duplicate")
            return {"status": "already_exists", "queue_id": str(existing_item.id), "position": existing_item.position, "message": "Song already in queue"}
        
        # Get max position for this room
        max_position = db.query(func.max(QueueItem.position)).filter(
            QueueItem.room_id == room_id
        ).scalar() or 0
        
        # Create new queue item
        new_item = QueueItem(
            room_id=room_id,
            song_id=song_id,
            position=max_position + 1,
            added_by=added_by
        )
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        
        print(f"POST /rooms/{room_id}/queue/add: Added song {song_id} at position {max_position + 1}")
        return {"status": "added", "queue_id": str(new_item.id), "position": new_item.position}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error adding to queue: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{room_id}/queue/remove")
def remove_from_queue(room_id: str, payload: dict = Body(...), db: Session = Depends(get_db)):
    """Remove a song from the queue by position"""
    try:
        position = payload.get("position")
        
        if position is None:
            raise HTTPException(status_code=400, detail="position is required")
        
        # Verify room exists
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Find queue item by position
        queue_item = db.query(QueueItem).filter(
            QueueItem.room_id == room_id,
            QueueItem.position == position
        ).first()
        
        if not queue_item:
            raise HTTPException(status_code=404, detail="Queue item not found")
        
        # Remove item
        db.delete(queue_item)
        
        # Reorder remaining items
        remaining_items = db.query(QueueItem).filter(
            QueueItem.room_id == room_id,
            QueueItem.position > position
        ).all()
        
        for item in remaining_items:
            item.position -= 1
        
        db.commit()
        
        print(f"POST /rooms/{room_id}/queue/remove: Removed item at position {position}")
        return {"status": "removed"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error removing from queue: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{room_id}/current")
def set_current_song(room_id: str, payload: dict = Body(...), db: Session = Depends(get_db)):
    """Set the current song for a room"""
    try:
        current_song_id = payload.get("current_song_id")
        
        if current_song_id is None:
            raise HTTPException(status_code=400, detail="current_song_id is required")
        
        # Verify room exists
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Verify song exists
        song = db.query(Song).filter(Song.id == current_song_id).first()
        if not song:
            raise HTTPException(status_code=404, detail="Song not found")
        
        # Get or create active session
        session = db.query(RoomSession).filter(
            RoomSession.room_id == room_id,
            RoomSession.status == 'active'
        ).first()
        
        if not session:
            # Create a new active session
            session = RoomSession(
                room_id=room_id,
                status='active',
                session_created_at=datetime.now(timezone.utc),
                session_start_time=datetime.now(timezone.utc),
                current_song_id=current_song_id,
                current_song_start_time=datetime.now(timezone.utc)
            )
            db.add(session)
        else:
            # Update existing session
            session.current_song_id = current_song_id
            session.current_song_start_time = datetime.now(timezone.utc)
        
        db.commit()
        db.refresh(session)
        
        print(f"PUT /rooms/{room_id}/current: Set current song to {current_song_id}")
        return {"status": "updated", "current_song_id": current_song_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error setting current song: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{room_id}/playback/start_next")
def start_next_song(room_id: str, db: Session = Depends(get_db)):
    """Start playing the next song from the queue"""
    try:
        # Verify room exists
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Get next item in queue (lowest position)
        next_item = db.query(QueueItem).filter(
            QueueItem.room_id == room_id
        ).order_by(QueueItem.position).first()
        
        if not next_item:
            print(f"POST /rooms/{room_id}/playback/start_next: No songs in queue")
            return {"status": "no_songs", "message": "Queue is empty"}
        
        # Get or create active session
        session = db.query(RoomSession).filter(
            RoomSession.room_id == room_id,
            RoomSession.status == 'active'
        ).first()
        
        now = datetime.now(timezone.utc)
        
        if not session:
            # Create a new active session with default minutes
            # Timer starts NOW (first song is being played)
            session_minutes = DEFAULT_SESSION_MINUTES
            session_end_time = now + timedelta(minutes=session_minutes)
            session = RoomSession(
                room_id=room_id,
                status='active',
                total_minutes=session_minutes,
                session_created_at=now,
                session_start_time=now,  # Timer starts when first song plays
                session_end_time=session_end_time,
                current_song_id=next_item.song_id,
                current_song_start_time=now
            )
            db.add(session)
            # Update room status
            room.status = 'active'
            print(f"POST /rooms/{room_id}/playback/start_next: Creating new session with {session_minutes} minutes, timer starts now")
        else:
            # If admin already created a session but timer hasn't started yet, start it now
            if not session.session_start_time:
                session.session_start_time = now
                # Respect the total_minutes assigned by admin, fallback to default if missing
                total_minutes = session.total_minutes or DEFAULT_SESSION_MINUTES
                session.session_end_time = session.session_start_time + timedelta(minutes=total_minutes)
                print(f"POST /rooms/{room_id}/playback/start_next: Starting timer now for existing session ({total_minutes} minutes)")
            # Update existing session with next song
            # DO NOT reset session_start_time if it already exists - timer should continue
            session.current_song_id = next_item.song_id
            session.current_song_start_time = now  # Only update current song start time
            print(f"POST /rooms/{room_id}/playback/start_next: Continuing session, timer NOT restarted")
        
        # Remove the song from queue
        db.delete(next_item)
        
        # Reorder remaining items
        remaining_items = db.query(QueueItem).filter(
            QueueItem.room_id == room_id,
            QueueItem.position > next_item.position
        ).all()
        
        for item in remaining_items:
            item.position -= 1
        
        # Commit all changes together (session creation/update, queue removal, room status)
        db.commit()
        db.refresh(session)
        
        # Get song details
        song = db.query(Song).filter(Song.id == next_item.song_id).first()
        
        print(f"POST /rooms/{room_id}/playback/start_next: Started playing song {next_item.song_id} ({song.title if song else 'unknown'})")
        return {
            "status": "playing",
            "song_id": next_item.song_id,
            "song_title": song.title if song else None,
            "file_url": song.file_url if song else None
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error starting next song: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{room_id}/playback/ended")
def playback_ended(room_id: str, db: Session = Depends(get_db)):
    """Handle playback ended - auto-start next song from queue if available"""
    try:
        # Verify room exists
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Get active session
        session = db.query(RoomSession).filter(
            RoomSession.room_id == room_id,
            RoomSession.status == 'active'
        ).first()
        
        if session:
            # Clear current song
            session.current_song_id = None
            session.current_song_start_time = None
            db.commit()
        
        # Check if there's a next song in queue
        next_item = db.query(QueueItem).filter(
            QueueItem.room_id == room_id
        ).order_by(QueueItem.position).first()
        
        if next_item:
            # Auto-start next song
            now = datetime.now(timezone.utc)
            
            if not session:
                # Create a new active session with default minutes
                # Timer starts NOW (first song is being played)
                session_minutes = DEFAULT_SESSION_MINUTES
                session_end_time = now + timedelta(minutes=session_minutes)
                session = RoomSession(
                    room_id=room_id,
                    status='active',
                    total_minutes=session_minutes,
                    session_created_at=now,
                    session_start_time=now,  # Timer starts when first song plays
                    session_end_time=session_end_time,
                    current_song_id=next_item.song_id,
                    current_song_start_time=now
                )
                db.add(session)
                print(f"POST /rooms/{room_id}/playback/ended: Creating new session with {session_minutes} minutes, timer starts now")
            else:
                # If admin already created a session but timer hasn't started yet, start it now
                if not session.session_start_time:
                    session.session_start_time = now
                    total_minutes = session.total_minutes or DEFAULT_SESSION_MINUTES
                    session.session_end_time = session.session_start_time + timedelta(minutes=total_minutes)
                    print(f"POST /rooms/{room_id}/playback/ended: Starting timer now for existing session ({total_minutes} minutes)")
                # Update existing session with next song
                # DO NOT reset session_start_time if it already exists - timer should continue
                session.current_song_id = next_item.song_id
                session.current_song_start_time = now  # Only update current song start time
                print(f"POST /rooms/{room_id}/playback/ended: Continuing session, timer NOT restarted")
            
            # Remove from queue
            db.delete(next_item)
            
            # Reorder remaining items
            remaining_items = db.query(QueueItem).filter(
                QueueItem.room_id == room_id,
                QueueItem.position > next_item.position
            ).all()
            
            for item in remaining_items:
                item.position -= 1
            
            db.commit()
            db.refresh(session)
            
            song = db.query(Song).filter(Song.id == next_item.song_id).first()
            print(f"POST /rooms/{room_id}/playback/ended: Auto-started next song {next_item.song_id} ({song.title if song else 'unknown'})")
            
            # Return song details for immediate playback
            return {
                "status": "next_started",
                "song_id": next_item.song_id,
                "song_title": song.title if song else None,
                "song": {
                    "id": song.id,
                    "title": song.title,
                    "album": song.album,
                    "language": song.language,
                    "file_url": song.file_url,  # Frontend will need to get signed URL
                    "s3_key": song.file_url
                } if song else None
            }
        else:
            print(f"POST /rooms/{room_id}/playback/ended: No more songs in queue")
            return {"status": "ended", "message": "No more songs in queue"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error handling playback ended: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{room_id}/start")
def start_room_session_short(room_id: str, payload: dict = Body(...), db: Session = Depends(get_db)):
    """Start a session for a room - short endpoint /rooms/{room_id}/start"""
    try:
        # Support both "minutes" and "total_minutes" in payload
        minutes = payload.get("minutes") or payload.get("total_minutes", DEFAULT_SESSION_MINUTES)
        
        if not minutes or minutes <= 0:
            raise HTTPException(status_code=400, detail="minutes must be a positive integer")
        
        print(f"POST /rooms/{room_id}/sessions/start: Starting session with {minutes} minutes")
        
        # Verify room exists
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Check if there's already an active session (due to unique constraint)
        existing_session = db.query(RoomSession).filter(
            RoomSession.room_id == room_id,
            RoomSession.status == 'active'
        ).first()
        
        if existing_session:
            # Update existing session instead of creating new one
            print(f"POST /rooms/{room_id}/start: Updating existing session {existing_session.id}")
            print(f"📝 POST /rooms/{room_id}/start: Updating existing session - setting total_minutes to {minutes}")
            existing_session.total_minutes = minutes
            # IMPORTANT: Do NOT start the timer here.
            # Timer should start only when the first song actually starts playing.
            # Keep existing session_start_time as-is (usually None until first song).
            existing_session.session_start_time = existing_session.session_start_time
            # Clear end time so it can be recalculated when timer starts
            existing_session.session_end_time = None
            existing_session.current_song_id = None
            existing_session.current_song_start_time = None
            db.commit()
            db.refresh(existing_session)
            print(f"✅ POST /rooms/{room_id}/start: Session updated - total_minutes is now {existing_session.total_minutes}")
            
            # Update room status
            room.status = 'active'
            db.commit()
            
            print(f"POST /rooms/{room_id}/start: Session updated with id {existing_session.id}")
            return {"status": "started", "session_id": str(existing_session.id), "updated": True}
        else:
            # Create new session
            now = datetime.now(timezone.utc)
            print(f"📝 POST /rooms/{room_id}/start: Creating new session with total_minutes={minutes}")
            new_session = RoomSession(
                room_id=room_id,
                status="active",
                total_minutes=minutes,
                session_created_at=now,
                # Timer will start when the first song actually plays
                session_start_time=None,
                session_end_time=None,
                current_song_id=None,
                current_song_start_time=None
            )
            db.add(new_session)
            db.commit()
            db.refresh(new_session)
            print(f"✅ POST /rooms/{room_id}/start: Session created - total_minutes is {new_session.total_minutes}")
            
            # Update room status
            room.status = 'active'
            db.commit()
            
            print(f"POST /rooms/{room_id}/start: Session created with id {new_session.id}")
            return {"status": "started", "session_id": str(new_session.id), "updated": False}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        error_str = str(e)
        print(f"Error starting session: {error_str}")
        raise HTTPException(status_code=500, detail=f"Error starting session: {error_str}")


@router.post("/{room_id}/sessions/start")
def start_room_session(room_id: str, payload: dict = Body(...), db: Session = Depends(get_db)):
    """Start a session for a room - alternative endpoint under /rooms"""
    try:
        # Support both "minutes" and "total_minutes" in payload
        minutes = payload.get("minutes") or payload.get("total_minutes", DEFAULT_SESSION_MINUTES)
        
        if not minutes or minutes <= 0:
            raise HTTPException(status_code=400, detail="minutes must be a positive integer")
        
        print(f"POST /rooms/{room_id}/sessions/start: Starting session with {minutes} minutes")
        
        # Verify room exists
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Check if there's already an active session (due to unique constraint)
        existing_session = db.query(RoomSession).filter(
            RoomSession.room_id == room_id,
            RoomSession.status == 'active'
        ).first()
        
        if existing_session:
            # Update existing session instead of creating new one
            print(f"POST /rooms/{room_id}/sessions/start: Updating existing session {existing_session.id}")
            existing_session.total_minutes = minutes
            # IMPORTANT: Do NOT start the timer here.
            # Timer should start only when the first song actually starts playing.
            existing_session.session_start_time = existing_session.session_start_time
            # Clear end time so it can be recalculated when timer starts
            existing_session.session_end_time = None
            existing_session.current_song_id = None
            existing_session.current_song_start_time = None
            db.commit()
            db.refresh(existing_session)
            
            # Update room status
            room.status = 'active'
            db.commit()
            
            print(f"POST /rooms/{room_id}/sessions/start: Session updated with id {existing_session.id}")
            return {"status": "started", "session_id": str(existing_session.id), "updated": True}
        else:
            # Create new session
            now = datetime.now(timezone.utc)
            new_session = RoomSession(
                room_id=room_id,
                status="active",
                total_minutes=minutes,
                session_created_at=now,
                # Timer will start when the first song actually plays
                session_start_time=None,
                session_end_time=None,
                current_song_id=None,
                current_song_start_time=None
            )
            db.add(new_session)
            db.commit()
            db.refresh(new_session)
            
            # Update room status
            room.status = 'active'
            db.commit()
            
            print(f"POST /rooms/{room_id}/sessions/start: Session created with id {new_session.id}")
            return {"status": "started", "session_id": str(new_session.id), "updated": False}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        error_str = str(e)
        print(f"Error starting session: {error_str}")
        raise HTTPException(status_code=500, detail=f"Error starting session: {error_str}")


@router.put("/{room_id}/status")
def update_room_status(room_id: str, payload: dict = Body(...), db: Session = Depends(get_db)):
    """Update room status - used for extending sessions"""
    try:
        # Verify room exists
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Get active session
        session = db.query(RoomSession).filter(
            RoomSession.room_id == room_id,
            RoomSession.status == 'active'
        ).first()
        
        # Update total_minutes if provided
        if "total_minutes" in payload:
            total_minutes = payload["total_minutes"]
            if total_minutes and total_minutes > 0:
                if session:
                    # Update existing session
                    session.total_minutes = total_minutes
                    if session.session_start_time:
                        # Recalculate session_end_time
                        session.session_end_time = session.session_start_time + timedelta(minutes=total_minutes)
                    else:
                        # Session not started yet, just update total_minutes
                        now = datetime.now(timezone.utc)
                        session.session_end_time = now + timedelta(minutes=total_minutes)
                    db.commit()
                    print(f"PUT /rooms/{room_id}/status: Updated session total_minutes to {total_minutes}")
                else:
                    # No active session, create one
                    now = datetime.now(timezone.utc)
                    new_session = RoomSession(
                        room_id=room_id,
                        status="active",
                        total_minutes=total_minutes,
                        session_created_at=now,
                        session_start_time=None,
                        session_end_time=None,
                        current_song_id=None,
                        current_song_start_time=None
                    )
                    db.add(new_session)
                    db.commit()
                    print(f"PUT /rooms/{room_id}/status: Created new session with {total_minutes} minutes")
        
        return {"status": "updated"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error updating room status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{room_id}/end")
def end_room_session(room_id: str, db: Session = Depends(get_db)):
    """End a room session - stops playback, clears queue, and resets everything"""
    try:
        # Verify room exists
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Get active session
        session = db.query(RoomSession).filter(
            RoomSession.room_id == room_id,
            RoomSession.status == 'active'
        ).first()
        
        # Clear current song and stop playback
        if session:
            session.current_song_id = None
            session.current_song_start_time = None
            session.status = 'ended'
            print(f"POST /rooms/{room_id}/end: Cleared current song and ended session")
        
        # Clear ALL queue items for this room
        queue_items = db.query(QueueItem).filter(
            QueueItem.room_id == room_id
        ).all()
        
        queue_count = len(queue_items)
        for item in queue_items:
            db.delete(item)
        
        print(f"POST /rooms/{room_id}/end: Cleared {queue_count} queue items")
        
        # Update room status
        room.status = 'available'
        room.is_active = False
        
        db.commit()
        
        print(f"POST /rooms/{room_id}/end: Session ended successfully - queue cleared, playback stopped")
        return {
            "status": "ended", 
            "message": "Session ended successfully",
            "queue_cleared": queue_count
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error ending session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{room_id}/extend")
def extend_room_session(room_id: str, payload: dict = Body(...), db: Session = Depends(get_db)):
    """Set the total session time to the specified minutes (replaces existing total_minutes)"""
    try:
        # Support both "minutes" and "total_minutes" for consistency
        minutes = payload.get("minutes") or payload.get("total_minutes")
        if not minutes or minutes <= 0:
            raise HTTPException(status_code=400, detail="minutes must be a positive integer")
        
        # Verify room exists
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Get active session
        session = db.query(RoomSession).filter(
            RoomSession.room_id == room_id,
            RoomSession.status == 'active'
        ).first()
        
        if not session:
            raise HTTPException(status_code=404, detail="No active session found for this room")
        
        # SET total_minutes to the new value (don't add to existing)
        old_total = session.total_minutes
        session.total_minutes = minutes
        print(f"📝 POST /rooms/{room_id}/extend: Setting total_minutes from {old_total} to {minutes}")
        
        # Recalculate session_end_time based on session_start_time (if timer has started)
        # or from now (if timer hasn't started yet)
        now = datetime.now(timezone.utc)
        if session.session_start_time:
            # Timer has started - recalculate end time from the original start time with new total
            session.session_end_time = session.session_start_time + timedelta(minutes=session.total_minutes)
            print(f"POST /rooms/{room_id}/extend: Updated session time to {minutes} minutes (timer already started, recalculated end time)")
        else:
            # Timer hasn't started yet - set end time from now
            session.session_end_time = now + timedelta(minutes=session.total_minutes)
            print(f"POST /rooms/{room_id}/extend: Updated session time to {minutes} minutes (timer not started yet)")
        
        db.commit()
        db.refresh(session)
        
        print(f"✅ POST /rooms/{room_id}/extend: Session time updated successfully. New total_minutes: {session.total_minutes}")
        return {
            "status": "extended",
            "total_minutes": session.total_minutes,
            "session_end_time": session.session_end_time.isoformat() if session.session_end_time else None
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error extending session: {e}")
        raise HTTPException(status_code=500, detail=str(e))
