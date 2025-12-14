from fastapi import APIRouter, HTTPException, Body
from app.supabase_client import supabase
from typing import Dict, Any
from datetime import datetime

router = APIRouter()

@router.get("/")
def list_rooms():
    try:
        print("GET /rooms called")
        response = supabase.table("rooms").select("*").execute()
        print(f"GET /rooms: Returning {len(response.data or [])} rooms")
        return response.data
    except Exception as e:
        error_str = str(e)
        print(f"Error listing rooms: {error_str}")
        # If Supabase disconnected, return empty list instead of crashing
        if "Server disconnected" in error_str or "connection" in error_str.lower():
            print("Supabase connection issue - returning empty rooms list")
            return []
        # For other errors, raise HTTPException
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{room_id}")
def get_room(room_id: str):
    """Get room status"""
    try:
        print(f"GET /rooms/{room_id} called")
        response = supabase.table("rooms").select("*").eq("id", room_id).single().execute()
        room = response.data
        
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        print(f"GET /rooms/{room_id}: is_active={room.get('is_active')}, session_id={room.get('session_id')}")
        return room
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting room: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{room_id}/session")
def get_session(room_id: str):
    """Get room session state from room_sessions table"""
    try:
        print(f"GET /rooms/{room_id}/session called")
        
        # Get room to find session_id
        try:
            room_res = supabase.table("rooms").select("session_id").eq("id", room_id).single().execute()
            room = room_res.data if hasattr(room_res, 'data') else room_res
        except Exception as e:
            error_str = str(e)
            print(f"Error getting room: {error_str}")
            # If Supabase disconnected, return empty session instead of crashing
            if "Server disconnected" in error_str or "connection" in error_str.lower():
                print("Supabase connection issue - returning empty session")
                return {"queue": [], "session": None}
            raise HTTPException(status_code=404, detail=f"Room not found: {room_id}")
        
        # Get queue from queue_items table (not from rooms.queue JSON field)
        queue_data = []
        try:
            queue_res = supabase.table("queue_items") \
                .select("""
                    *,
                    songs(
                        *,
                        song_artists(
                            artists(
                                id,
                                name,
                                image_url
                            )
                        )
                    )
                """) \
                .eq("room_id", room_id) \
                .order("position") \
                .execute()
            
            queue_items = queue_res.data or []
            # Transform to flat array of songs with artist data
            for item in queue_items:
                song = item.get("songs")
                if not song:
                    continue
                
                song_data = {**song}
                
                # Extract artist info
                artist_name = None
                artist_image = None
                
                if song.get("song_artists") and len(song.get("song_artists", [])) > 0:
                    artist_data = song["song_artists"][0].get("artists")
                    if artist_data:
                        artist_name = artist_data.get("name")
                        artist_image = artist_data.get("image_url")
                
                if not artist_name:
                    artist_name = song.get("artist")
                
                song_data["artist"] = artist_name
                song_data["artist_image"] = artist_image
                song_data.pop("song_artists", None)
                
                queue_data.append(song_data)
        except Exception as e:
            error_str = str(e)
            print(f"Error fetching queue: {error_str}")
            # If Supabase disconnected, return empty queue instead of crashing
            if "Server disconnected" in error_str or "connection" in error_str.lower():
                print(f"Supabase connection issue - returning empty queue")
                queue_data = []
            else:
                # For other errors, also return empty queue to prevent crashes
                queue_data = []
        
        if not isinstance(room, dict) or room.get("session_id") is None:
            return {"queue": queue_data, "session": None}
        
        session_id = room["session_id"]
        
        # Get session - handle case where session doesn't exist
        try:
            session_res = supabase.table("room_sessions").select("*").eq("id", session_id).single().execute()
            session = session_res.data if hasattr(session_res, 'data') else session_res
        except Exception as e:
            error_str = str(e)
            if "0 rows" in error_str or "PGRST116" in error_str:
                print(f"Session {session_id} not found in room_sessions table - clearing invalid session_id")
                # Clear invalid session_id from room
                try:
                    supabase.table("rooms").update({"session_id": None, "is_active": False}).eq("id", room_id).execute()
                except:
                    pass  # If Supabase is disconnected, skip clearing
                return {"queue": queue_data, "session": None}
            # If Supabase disconnected, return session as None instead of crashing
            if "Server disconnected" in error_str or "connection" in error_str.lower():
                print("Supabase connection issue - returning session as None")
                return {"queue": queue_data, "session": None}
            # For other errors, also return None to prevent crashes
            print(f"Error getting session (non-critical): {error_str}")
            return {"queue": queue_data, "session": None}
        
        # Ensure session is a dict
        if not isinstance(session, dict):
            session = {}
        
        # Auto-end check
        if session.get("session_start_time") and session.get("status") != "finished":
            started_at_str = session.get("session_start_time")
            if started_at_str:
                try:
                    started_at = datetime.fromisoformat(started_at_str.replace("Z", "+00:00"))
                    now = datetime.now(started_at.tzinfo) if started_at.tzinfo else datetime.now()
                    elapsed_seconds = (now - started_at).total_seconds()
                    total_seconds = session.get("total_minutes", 0) * 60
                    
                    if elapsed_seconds >= total_seconds:
                        print(f"GET /rooms/{room_id}/session: Session expired, auto-ending")
                        # Session expired
                        now_iso = datetime.utcnow().isoformat() + "Z"
                        supabase.table("room_sessions").update({
                            "status": "finished",
                            "session_end_time": now_iso,
                            "current_song_id": None,
                            "current_song_start_time": None
                        }).eq("id", session_id).execute()
                        
                        supabase.table("rooms").update({
                            "is_active": False,
                            "session_id": None
                        }).eq("id", room_id).execute()
                        
                        supabase.table("queue_items").delete().eq("room_id", room_id).execute()
                        
                        # Refresh session
                        session_res = supabase.table("room_sessions").select("*").eq("id", session_id).single().execute()
                        session = session_res.data if hasattr(session_res, 'data') else session_res
                        if not isinstance(session, dict):
                            session = {}
                        print(f"GET /rooms/{room_id}/session: Session auto-ended")
                except Exception as e:
                    print(f"Error checking session expiry: {e}")
        
        # queue_data is already fetched above from queue_items table
        return {
            "queue": queue_data,
            "session": session
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{room_id}/status")
def room_status(room_id: str):
    """Legacy endpoint - redirects to get_room"""
    return get_room(room_id)

@router.put("/{room_id}/status")
def update_status(room_id: str, payload: Dict[str, Any] = Body(...)):
    try:
        print(f"PUT /rooms/{room_id}/status: Updating status with {payload}")
        response = supabase.table("rooms").update(payload).eq("id", room_id).execute()
        print(f"PUT /rooms/{room_id}/status: Status updated successfully")
        return response.data[0] if response.data else {}
    except Exception as e:
        print(f"Error updating status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{room_id}/current")
def set_current(room_id: str, payload: Dict[str, Any] = Body(...)):
    try:
        print(f"PUT /rooms/{room_id}/current: Setting current song with {payload}")
        response = supabase.table("rooms").update(payload).eq("id", room_id).execute()
        print(f"PUT /rooms/{room_id}/current: Current song updated successfully")
        return response.data[0] if response.data else {}
    except Exception as e:
        print(f"Error setting current song: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{room_id}/start")
def start_session(room_id: str, payload: Dict[str, Any] = Body(...)):
    """Start a room session - creates room_sessions row"""
    try:
        total_minutes = payload.get("total_minutes")
        if not total_minutes or total_minutes <= 0:
            raise HTTPException(status_code=400, detail="total_minutes must be a positive integer")
        
        print(f"POST /rooms/{room_id}/start: Starting session with {total_minutes} minutes")
        
        # Clear queue
        supabase.table("queue_items").delete().eq("room_id", room_id).execute()
        
        # Check if a session already exists for this room and delete it first
        # (room_sessions has unique constraint on room_id)
        try:
            existing_session_res = supabase.table("room_sessions").select("id").eq("room_id", room_id).execute()
            if existing_session_res.data and len(existing_session_res.data) > 0:
                print(f"POST /rooms/{room_id}/start: Found existing session, deleting it first")
                # Mark existing session as finished
                now_iso = datetime.utcnow().isoformat() + "Z"
                supabase.table("room_sessions").update({
                    "status": "finished",
                    "session_end_time": now_iso
                }).eq("room_id", room_id).execute()
                # Delete the existing session
                supabase.table("room_sessions").delete().eq("room_id", room_id).execute()
                print(f"POST /rooms/{room_id}/start: Existing session deleted")
        except Exception as e:
            # If no existing session, that's fine - continue
            print(f"POST /rooms/{room_id}/start: No existing session to delete: {e}")
        
        # 1. Create new session in room_sessions
        now = datetime.utcnow().isoformat() + "Z"
        session = supabase.table("room_sessions").insert({
            "room_id": room_id,
            "status": "idle",
            "total_minutes": total_minutes,
            "session_created_at": now,
            "session_start_time": None,  # Timer starts when first song plays
            "current_song_id": None,
            "current_song_start_time": None
        }).execute()
        
        session_id = session.data[0]["id"]
        
        # 2. Attach session to room
        supabase.table("rooms").update({
            "is_active": True,
            "session_id": session_id
        }).eq("id", room_id).execute()
        
        print(f"POST /rooms/{room_id}/start: Session created with id {session_id}")
        return session.data[0]
    except HTTPException:
        raise
    except Exception as e:
        error_str = str(e)
        print(f"Error starting session: {error_str}")
        # Check for unique constraint violation
        if "duplicate key" in error_str or "23505" in error_str:
            raise HTTPException(
                status_code=400, 
                detail="Room already has an active session. Please end the current session first."
            )
        raise HTTPException(status_code=500, detail=f"Error starting session: {error_str}")

@router.post("/{room_id}/end")
def end_session(room_id: str):
    """End a room session - updates room_sessions"""
    try:
        print(f"POST /rooms/{room_id}/end: Ending session")
        
        # Get room to find session_id
        room_res = supabase.table("rooms").select("session_id").eq("id", room_id).single().execute()
        room = room_res.data if hasattr(room_res, 'data') else room_res
        session_id = room.get("session_id") if isinstance(room, dict) else None
        
        # Clear queue
        supabase.table("queue_items").delete().eq("room_id", room_id).execute()
        
        # Update room_sessions if session exists
        if session_id:
            now = datetime.utcnow().isoformat() + "Z"
            supabase.table("room_sessions").update({
                "status": "finished",
                "session_end_time": now,
                "current_song_id": None,
                "current_song_start_time": None
            }).eq("id", session_id).execute()
        
        # Update room
        response = supabase.table("rooms").update({
            "is_active": False,
            "session_id": None
        }).eq("id", room_id).execute()
        
        room = response.data[0] if response.data else {}
        print(f"POST /rooms/{room_id}/end: Session ended successfully")
        return room
    except Exception as e:
        print(f"Error ending session: {e}")
        raise HTTPException(status_code=500, detail=str(e))
