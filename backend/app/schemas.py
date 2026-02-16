from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime
from uuid import UUID


# Device Schemas
class DeviceCreate(BaseModel):
    device_uuid: str
    device_type: str  # "tablet", "display", "admin"
    name: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None


class DeviceResponse(BaseModel):
    id: UUID
    device_uuid: str
    name: Optional[str]
    room_id: Optional[UUID]
    meta: Optional[Dict[str, Any]]
    device_type: Optional[str]
    
    class Config:
        from_attributes = True


# Room Schemas
class RoomResponse(BaseModel):
    id: UUID
    name: Optional[str]
    is_active: bool
    status: str
    started_at: Optional[datetime]
    total_minutes: Optional[int]
    current_song_id: Optional[int]
    current_song_start_time: Optional[datetime]
    session_id: Optional[UUID]
    
    class Config:
        from_attributes = True


# Session Schemas
class SessionStart(BaseModel):
    room_id: str
    total_minutes: int


class SessionEnd(BaseModel):
    room_id: str


class SessionResponse(BaseModel):
    id: UUID
    room_id: UUID
    status: str
    total_minutes: int
    session_created_at: datetime
    session_start_time: Optional[datetime]
    session_end_time: Optional[datetime]
    current_song_id: Optional[int]
    current_song_start_time: Optional[datetime]
    
    class Config:
        from_attributes = True


# Song Schemas
class SongResponse(BaseModel):
    id: int
    title: str
    album: Optional[str]
    language: Optional[str]
    file_url: Optional[str]
    play_count: int
    artist: Optional[str]
    artist_id: Optional[UUID] = None
    artist_image: Optional[str] = None
    
    class Config:
        from_attributes = True


# Queue Schemas
class QueueAdd(BaseModel):
    song_id: int
    added_by: Optional[str] = "tablet"


class QueueRemove(BaseModel):
    position: int


# Stats Schemas
class TopSongResponse(BaseModel):
    song_id: int
    title: str
    play_count: int
    artist: Optional[str] = None
    artist_image: Optional[str] = None


class TopArtistResponse(BaseModel):
    artist_id: UUID
    name: str
    image_url: Optional[str]
    play_count: int
