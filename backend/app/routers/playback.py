from fastapi import APIRouter, HTTPException, Body
from app.supabase_client import supabase
from typing import Dict, Any
from datetime import datetime

router = APIRouter()

@router.post("/event")
def event(room_id: str, payload: Dict[str, Any] = Body(...)):
    try:
        response = supabase.table("playback_events").insert({
            **payload,
            "room_id": room_id
        }).execute()
        return response.data[0] if response.data else {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ended")
def playback_ended(room_id: str):
    """Handle playback end - increment play_count and auto-start next if queue not empty"""
    try:
        print(f"POST /rooms/{room_id}/playback/ended called")
        
        # Get room and session
        try:
            room_res = supabase.table("rooms").select("session_id").eq("id", room_id).single().execute()
            room = room_res.data if hasattr(room_res, 'data') else room_res
            session_id = room.get("session_id") if isinstance(room, dict) else None
        except Exception as e:
            print(f"Error getting room: {e}")
            raise HTTPException(status_code=404, detail=f"Room not found: {room_id}")
        
        if not session_id:
            raise HTTPException(status_code=404, detail="No active session for this room")
        
        # Get session - handle case where session doesn't exist
        try:
            session_res = supabase.table("room_sessions").select("current_song_id").eq("id", session_id).single().execute()
            session = session_res.data if hasattr(session_res, 'data') else session_res
            current_song_id = session.get("current_song_id") if isinstance(session, dict) else None
        except Exception as e:
            error_str = str(e)
            if "0 rows" in error_str or "PGRST116" in error_str:
                print(f"Session {session_id} not found in room_sessions table")
                # Clear invalid session_id from room
                supabase.table("rooms").update({"session_id": None, "is_active": False}).eq("id", room_id).execute()
                raise HTTPException(status_code=404, detail="Session not found. Please start a new session.")
            raise HTTPException(status_code=500, detail=f"Error getting session: {error_str}")
        
        if current_song_id:
            # Increment play_count
            try:
                song_response = supabase.table("songs").select("play_count").eq("id", current_song_id).single().execute()
                current_count = song_response.data.get("play_count", 0) if song_response.data else 0
                supabase.table("songs").update({
                    "play_count": current_count + 1
                }).eq("id", current_song_id).execute()
                print(f"POST /rooms/{room_id}/playback/ended: Incremented play_count for song {current_song_id}")
            except Exception as e:
                print(f"Warning: Failed to increment play_count: {e}")
        
        # Check if queue has more items
        queue_response = supabase.table("queue_items") \
            .select("id") \
            .eq("room_id", room_id) \
            .limit(1).execute()
        
        queue_has_items = len(queue_response.data or []) > 0
        
        if queue_has_items:
            # Auto-start next song
            print(f"POST /rooms/{room_id}/playback/ended: Queue has items, auto-starting next song")
            return start_next(room_id)
        else:
            # Set session to idle
            supabase.table("room_sessions").update({
                "current_song_id": None,
                "current_song_start_time": None,
                "status": "idle"
            }).eq("id", session_id).execute()
            print(f"POST /rooms/{room_id}/playback/ended: Queue empty, session set to idle")
            return {"status": "idle", "message": "Queue empty"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error handling playback end: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/start_next")
def start_next(room_id: str):
    try:
        print(f"POST /rooms/{room_id}/playback/start_next called")
        
        # Get room and session
        try:
            room_res = supabase.table("rooms").select("session_id").eq("id", room_id).single().execute()
            room = room_res.data if hasattr(room_res, 'data') else room_res
            session_id = room.get("session_id") if isinstance(room, dict) else None
        except Exception as e:
            print(f"Error getting room: {e}")
            raise HTTPException(status_code=404, detail=f"Room not found: {room_id}")
        
        if not session_id:
            raise HTTPException(status_code=400, detail="No active session for this room. Please start a session first.")
        
        # Get session - handle case where session doesn't exist
        try:
            session_res = supabase.table("room_sessions").select("*").eq("id", session_id).single().execute()
            session = session_res.data if hasattr(session_res, 'data') else session_res
        except Exception as e:
            error_str = str(e)
            if "0 rows" in error_str or "PGRST116" in error_str:
                print(f"Session {session_id} not found in room_sessions table")
                # Clear invalid session_id from room
                supabase.table("rooms").update({"session_id": None, "is_active": False}).eq("id", room_id).execute()
                raise HTTPException(status_code=400, detail="Session not found. Please start a new session.")
            raise HTTPException(status_code=500, detail=f"Error getting session: {error_str}")
        
        # Get first queue item with song and artist data
        q = supabase.table("queue_items") \
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
            .limit(1).execute()
        
        if not q.data:
            print(f"POST /rooms/{room_id}/playback/start_next: Queue is empty")
            return None
        
        item = q.data[0]
        song = item.get("songs")
        
        if not song:
            print(f"POST /rooms/{room_id}/playback/start_next: Song not found for queue item")
            return None
        
        song_id = item["song_id"]
        
        # Ensure song_id is an integer (not UUID)
        if isinstance(song_id, str):
            try:
                song_id = int(song_id)
            except ValueError:
                print(f"Warning: song_id is not a valid integer: {song_id}")
        
        print(f"Setting current_song_id to: {song_id} (type: {type(song_id).__name__})")
        
        # Delete queue item
        supabase.table("queue_items").delete().eq("id", item["id"]).execute()
        
        # Update room_sessions with current song
        now = datetime.utcnow().isoformat() + "Z"
        
        # Check if this is first song (session_start_time is NULL)
        # Ensure session is a dict
        if not isinstance(session, dict):
            session = session_res.data if hasattr(session_res, 'data') else {}
        
        session_start_time = session.get("session_start_time")
        if session_start_time is None:
            # FIRST SONG → START TIMER
            print(f"POST /rooms/{room_id}/playback/start_next: First song - starting timer")
            try:
                supabase.table("room_sessions").update({
                    "session_start_time": now,  # Timer starts HERE
                    "status": "playing",
                    "current_song_id": song_id,
                    "current_song_start_time": now
                }).eq("id", session_id).execute()
                print(f"Successfully started timer and updated session {session_id} with current_song_id: {song_id}")
            except Exception as e:
                print(f"Error updating session with current_song_id: {e}")
                raise
        else:
            # SUBSEQUENT SONG → Timer continues
            print(f"POST /rooms/{room_id}/playback/start_next: Subsequent song - timer continues")
            try:
                supabase.table("room_sessions").update({
                    "status": "playing",
                    "current_song_id": song_id,
                    "current_song_start_time": now
                }).eq("id", session_id).execute()
                print(f"Successfully updated session {session_id} with current_song_id: {song_id}")
            except Exception as e:
                print(f"Error updating session with current_song_id: {e}")
                raise
        
        # Insert playback event
        try:
            supabase.table("playback_events").insert({
                "room_id": room_id,
                "song_id": song_id,
                "event_type": "start"
            }).execute()
        except Exception as e:
            print(f"Warning: Failed to insert playback event: {str(e)}")
        
        # Flatten song data with artist info
        song_data = {**song}
        
        # Extract artist info from song_artists relationship
        artist_name = None
        artist_image = None
        artist_id = None
        
        if song.get("song_artists") and len(song.get("song_artists", [])) > 0:
            artist_data = song["song_artists"][0].get("artists")
            if artist_data:
                artist_id = artist_data.get("id")
                artist_name = artist_data.get("name")
                artist_image = artist_data.get("image_url")
        
        # Fallback to direct artist field if no relationship
        if not artist_name:
            artist_name = song.get("artist")
        
        song_data["artist_id"] = artist_id
        song_data["artist"] = artist_name  # Use 'artist' field
        song_data["artist_image"] = artist_image
        
        # Remove nested structures
        song_data.pop("song_artists", None)
        
        print(f"POST /rooms/{room_id}/playback/start_next: Started song {song_id} ({song_data.get('title')})")
        return song_data
    except Exception as e:
        print(f"Error starting playback: {e}")
        raise HTTPException(status_code=500, detail=str(e))
