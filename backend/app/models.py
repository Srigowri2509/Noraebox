from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from .db import Base


class Device(Base):
    __tablename__ = "devices"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_uuid = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=True)
    room_id = Column(UUID(as_uuid=True), ForeignKey("rooms.id"), nullable=True)
    meta = Column(JSON, nullable=True)
    device_type = Column(String, nullable=True)  # "tablet", "display", "admin"
    
    # Relationships
    room = relationship("Room", back_populates="devices")


class Room(Base):
    __tablename__ = "rooms"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=True)
    is_active = Column(Boolean, default=False)
    status = Column(String, default="idle")  # "idle", "playing", "finished"
    started_at = Column(DateTime(timezone=True), nullable=True)
    total_minutes = Column(Integer, nullable=True)
    current_song_id = Column(Integer, ForeignKey("songs.id"), nullable=True)
    current_song_start_time = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    devices = relationship("Device", back_populates="room")
    sessions = relationship("RoomSession", back_populates="room")


class RoomSession(Base):
    __tablename__ = "room_sessions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), ForeignKey("rooms.id"), nullable=False)
    status = Column(String, default="idle")  # "idle", "playing", "finished"
    total_minutes = Column(Integer, nullable=False)
    session_created_at = Column(DateTime(timezone=True), server_default=func.now())
    session_start_time = Column(DateTime(timezone=True), nullable=True)
    session_end_time = Column(DateTime(timezone=True), nullable=True)
    current_song_id = Column(Integer, ForeignKey("songs.id"), nullable=True)
    current_song_start_time = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    room = relationship("Room", back_populates="sessions")


class Song(Base):
    __tablename__ = "songs"
    
    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    album = Column(String, nullable=True)
    language = Column(String, nullable=True)
    file_url = Column(Text, nullable=True)
    play_count = Column(Integer, default=0)
    artist = Column(String, nullable=True)  # fallback field
    
    # Relationships
    song_artists = relationship("SongArtist", back_populates="song")
    queue_items = relationship("QueueItem", back_populates="song")
    playback_events = relationship("PlaybackEvent", back_populates="song")


class Artist(Base):
    __tablename__ = "artist"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, unique=True, nullable=False)
    image_url = Column(Text, nullable=True)
    
    # Relationships
    song_artists = relationship("SongArtist", back_populates="artist")


class SongArtist(Base):
    __tablename__ = "song_artists"
    
    song_id = Column(Integer, ForeignKey("songs.id"), primary_key=True)
    artist_id = Column(UUID(as_uuid=True), ForeignKey("artist.id"), primary_key=True)
    
    # Relationships
    song = relationship("Song", back_populates="song_artists")
    artist = relationship("Artist", back_populates="song_artists")


class QueueItem(Base):
    __tablename__ = "queue_items"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), ForeignKey("rooms.id"), nullable=False)
    song_id = Column(Integer, ForeignKey("songs.id"), nullable=False)
    position = Column(Integer, nullable=False)
    added_by = Column(String, nullable=True)
    
    # Relationships
    song = relationship("Song", back_populates="queue_items")


class PlaybackEvent(Base):
    __tablename__ = "playback_events"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), nullable=False)
    song_id = Column(Integer, ForeignKey("songs.id"), nullable=False)
    event_type = Column(String, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    song = relationship("Song", back_populates="playback_events")
