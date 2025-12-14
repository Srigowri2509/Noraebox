from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.routers import songs, rooms, queue, playback, devices
import traceback

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
app.include_router(queue.router, prefix="/rooms/{room_id}/queue")
app.include_router(playback.router, prefix="/rooms/{room_id}/playback")
app.include_router(devices.router, prefix="/devices")

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

