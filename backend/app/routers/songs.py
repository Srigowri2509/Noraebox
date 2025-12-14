from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.supabase_client import supabase
import uuid

router = APIRouter()

@router.get("/languages")
def get_languages():
    """Get unique languages from songs table"""
    try:
        response = supabase.table("songs").select("language").execute()
        songs = response.data or []
        print(f"Fetched {len(songs)} songs for language extraction")
        # Extract unique languages, filter out None/empty, and sort
        languages = sorted(list(set([s.get("language") for s in songs if s.get("language")])))
        print(f"Found {len(languages)} unique languages: {languages}")
        # Return flat array directly - FastAPI will serialize as JSON array
        return languages
    except Exception as e:
        print(f"Error fetching languages: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/")
def list_songs(search: str = None):
    try:
        print(f"GET /songs called (search={search})")
        # Get all songs with left join to artists via song_artists
        query = supabase.table("songs").select("""
            *,
            song_artists(
                artists(
                    id,
                    name,
                    image_url
                )
            )
        """)
        
        if search:
            query = query.ilike("title", f"%{search}%")
        
        response = query.execute()
        songs = response.data or []
        
        print(f"Fetched {len(songs)} songs from database")
        if len(songs) > 0:
            print(f"Sample song structure: {list(songs[0].keys())}")
            if songs[0].get("song_artists"):
                print(f"Sample song_artists: {songs[0].get('song_artists')}")
        
        # Transform the response to flatten artist data
        result = []
        for song in songs:
            song_data = {**song}
            # Extract artist info from song_artists relationship
            artist_name = None
            artist_image = None
            artist_id = None
            
            if song.get("song_artists") and len(song.get("song_artists", [])) > 0:
                artist_data = song_data["song_artists"][0].get("artists")
                if artist_data:
                    artist_id = artist_data.get("id")
                    artist_name = artist_data.get("name")
                    artist_image = artist_data.get("image_url")
                    print(f"Found artist for song {song.get('id')}: {artist_name}, image: {artist_image}")
            
            # Fallback to direct artist field if no relationship
            if not artist_name:
                artist_name = song.get("artist")
            
            song_data["artist_id"] = artist_id
            song_data["artist"] = artist_name  # Use 'artist' field, not 'artist_name'
            song_data["artist_image"] = artist_image
            
            # Remove the nested song_artists structure
            song_data.pop("song_artists", None)
            result.append(song_data)
        
        print(f"GET /songs: Returning {len(result)} processed songs")
        if len(result) > 0:
            print(f"Sample returned song keys: {list(result[0].keys())}")
            print(f"Sample song: id={result[0].get('id')}, title={result[0].get('title')}, artist={result[0].get('artist')}, artist_image={result[0].get('artist_image')}")
        # Return flat array directly - FastAPI will serialize as JSON array
        return result
    except Exception as e:
        print(f"Error in list_songs: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{song_id}")
def get_song(song_id: str):
    """Get song by ID - accepts integer strings"""
    try:
        print(f"GET /songs/{song_id} called")
        
        # Convert to int (song IDs are integers in the database)
        try:
            song_id_int = int(song_id)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid song ID format: {song_id}")
        
        # Get song with artist join
        response = supabase.table("songs").select("""
            *,
            song_artists(
                artists(
                    id,
                    name,
                    image_url
                )
            )
        """).eq("id", song_id_int).single().execute()
        
        song = response.data
        if not song:
            raise HTTPException(status_code=404, detail=f"Song with ID {song_id_int} not found")
        
        # Flatten artist data
        artist_name = None
        if song.get("song_artists") and len(song.get("song_artists", [])) > 0:
            artist_data = song["song_artists"][0].get("artists", {})
            if artist_data:
                song["artist_id"] = artist_data.get("id")
                artist_name = artist_data.get("name")
                song["artist_image"] = artist_data.get("image_url")
        
        # Fallback to direct artist field if no relationship
        if not artist_name:
            artist_name = song.get("artist")
        
        song["artist"] = artist_name  # Use 'artist' field, not 'artist_name'
        song.pop("song_artists", None)
        print(f"GET /songs/{song_id}: Returning song {song.get('title')}")
        
        return song
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_song: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload")
async def upload_song(
    title: str = Form(...),
    language: str = Form(None),
    album: str = Form(None),
    file: UploadFile = File(...)
):
    try:
        storage = supabase.storage()
        bucket = "karaoke-songs"
        key = f"{uuid.uuid4()}_{file.filename}"
        contents = await file.read()
        storage.from_(bucket).upload(key, contents)
        url = storage.from_(bucket).get_public_url(key)
        created = supabase.table("songs").insert({
            "title": title,
            "language": language,
            "album": album,
            "file_url": url["publicURL"]
        }).execute()
        return created.data[0] if created.data else {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
