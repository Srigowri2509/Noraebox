from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
from app.db import get_db
from app.models import Room
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
