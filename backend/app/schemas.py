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
    # play_count can be NULL in DB; default to 0 in API
    play_count: Optional[int] = 0
    artist: Optional[str]
    # Your artist IDs are integers (not UUIDs), so expose them as int
    artist_id: Optional[int] = None
    artist_image: Optional[str] = None
    # Optional explicit artist_name field used by some frontends
    artist_name: Optional[str] = None
    # Full array of all artists with roles (from song_artists table)
    artists: Optional[List[Dict[str, Any]]] = []
    # S3 key (internal, for reference)
    s3_key: Optional[str] = None
    
    class Config:
        from_attributes = True
        # Allow extra fields in case we add more in the future
        extra = "allow"


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


# Song Suggestion Schemas
class SongSuggestionCreate(BaseModel):
    title: str
    artist: Optional[str] = None
    language: Optional[str] = None
    room_id: Optional[str] = None


class SongSuggestionResponse(BaseModel):
    id: UUID
    title: str
    artist: Optional[str]
    language: Optional[str]
    room_id: Optional[UUID]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True
