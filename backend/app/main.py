from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from app.routers import songs, rooms, sessions, devices, stats, queue, playlists
from pathlib import Path
import traceback
import json

# Temporary: auto-create database tables on startup (Option 2)
from app.models import Device, Room, RoomSession, Song, Artist, SongArtist, QueueItem, PlaybackEvent, Playlist, PlaylistSong
from app.db import Base, engine

app = FastAPI()

# CORS must be added BEFORE routers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(songs.router, prefix="/songs")
app.include_router(rooms.router, prefix="/rooms")
app.include_router(sessions.router, prefix="/sessions")
app.include_router(queue.router, prefix="/queue")
app.include_router(devices.router, prefix="/devices")
app.include_router(stats.router, prefix="/stats")
app.include_router(playlists.router, prefix="/playlists")

# Create all tables once at startup (can be removed after first successful run)
@app.on_event("startup")
async def create_tables():
    # Import models above ensures all metadata is registered
    Base.metadata.create_all(bind=engine)

# Serve web assets for remote updates
web_assets_path = Path(__file__).parent.parent.parent / "web-assets"
web_assets_path.mkdir(exist_ok=True)

# Serve tablet-app web assets
tablet_app_path = web_assets_path / "tablet-app"
tablet_app_path.mkdir(exist_ok=True)
app.mount("/web-assets/tablet-app", StaticFiles(directory=str(tablet_app_path)), name="tablet-app")

# Serve display-app web assets
display_app_path = web_assets_path / "display-app"
display_app_path.mkdir(exist_ok=True)
app.mount("/web-assets/display-app", StaticFiles(directory=str(display_app_path)), name="display-app")

# Config endpoint for runtime configuration
@app.get("/config/app-config.json")
def get_app_config():
    """Return runtime configuration for apps (API URL, etc.)"""
    config_path = web_assets_path / "app-config.json"
    if config_path.exists():
        with open(config_path, 'r') as f:
            return json.load(f)
    
    # Default config
    return {
        "api_url": "http://16.112.20.5:8000",
        "update_check_url": "http://16.112.20.5:8000",
        "version": "1.0.0"
    }

@app.get("/")
def root():
    return {"ok": True}

# Global exception handler to ensure CORS headers are always sent
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "type": type(exc).__name__},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )

