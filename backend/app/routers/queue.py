from fastapi import APIRouter, HTTPException, Body
from app.supabase_client import supabase
from app.services.queue_service import next_position
from typing import Dict, Any

router = APIRouter()

@router.post("/add")
def add_to_queue(room_id: str, payload: Dict[str, Any] = Body(...)):
    song_id = payload.get("song_id")
    added_by = payload.get("added_by", "tablet")
    if not song_id:
        raise HTTPException(400, "song_id is required")
    try:
        pos = next_position(room_id)
        response = supabase.table("queue_items").insert({
            "room_id": room_id,
            "song_id": song_id,
            "position": pos,
            "added_by": added_by
        }).execute()
        print(f"POST /rooms/{room_id}/queue/add: Added song {song_id} at position {pos}")
        return response.data[0] if response.data else {}
    except Exception as e:
        print(f"Error adding to queue: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/")
def get_queue(room_id: str):
    try:
        print(f"GET /rooms/{room_id}/queue called")
        # Get queue items with songs and artists joined
        response = supabase.table("queue_items") \
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
        
        queue_items = response.data or []
        
        # Transform to flat array of songs with artist data
        result = []
        for item in queue_items:
            song = item.get("songs")
            if not song:
                continue
            
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
            
            result.append(song_data)
        
        print(f"GET /rooms/{room_id}/queue: Returning {len(result)} songs")
        return result
    except Exception as e:
        print(f"Error getting queue: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{queue_item_id}")
def remove_from_queue(room_id: str, queue_item_id: str):
    """Remove a specific queue item by ID"""
    try:
        print(f"DELETE /rooms/{room_id}/queue/{queue_item_id}: Removing queue item")
        # Verify the queue item belongs to this room
        response = supabase.table("queue_items") \
            .delete() \
            .eq("id", queue_item_id) \
            .eq("room_id", room_id) \
            .execute()
        print(f"DELETE /rooms/{room_id}/queue/{queue_item_id}: Queue item removed")
        return {"success": True}
    except Exception as e:
        print(f"Error removing queue item: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/remove")
def remove_by_position(room_id: str, payload: Dict[str, Any] = Body(...)):
    """Remove queue item by position/index"""
    try:
        position = payload.get("position")
        if position is None:
            raise HTTPException(400, "position is required")
        
        print(f"POST /rooms/{room_id}/queue/remove: Removing item at position {position}")
        
        # Get queue items ordered by position
        response = supabase.table("queue_items") \
            .select("*") \
            .eq("room_id", room_id) \
            .order("position") \
            .execute()
        
        queue_items = response.data or []
        if position < 0 or position >= len(queue_items):
            raise HTTPException(400, f"Invalid position: {position}")
        
        item_to_remove = queue_items[position]
        supabase.table("queue_items").delete().eq("id", item_to_remove["id"]).execute()
        
        print(f"POST /rooms/{room_id}/queue/remove: Removed item at position {position}")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error removing queue item by position: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/pop")
def pop_next(room_id: str):
    try:
        q = supabase.table("queue_items") \
            .select("*") \
            .eq("room_id", room_id) \
            .order("position") \
            .limit(1).execute()
        if not q.data:
            return None
        item = q.data[0]
        supabase.table("queue_items").delete().eq("id", item["id"]).execute()
        return item
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
