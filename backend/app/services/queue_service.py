from app.supabase_client import supabase

def next_position(room_id: str):
    try:
        response = supabase.table("queue_items").select("position") \
            .eq("room_id", room_id).order("position", desc=True).limit(1).execute()
        if response.data:
            return response.data[0]["position"] + 1
        return 1
    except Exception:
        # If query fails, start at position 1
        return 1
