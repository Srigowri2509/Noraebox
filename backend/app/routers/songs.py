from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import distinct, or_
from typing import List
from app.db import get_db
from app.models import Song, SongArtist, Artist
from app.schemas import SongResponse
from app.s3_service import generate_signed_url

router = APIRouter()


@router.get("/languages")
def get_languages(db: Session = Depends(get_db)):
    """Get unique languages from songs table"""
    try:
        languages = db.query(distinct(Song.language)).filter(Song.language.isnot(None)).all()
        # Extract language values from tuples
        language_list = sorted([lang[0] for lang in languages if lang[0]])
        print(f"Found {len(language_list)} unique languages: {language_list}")
        return language_list
    except Exception as e:
        print(f"Error fetching languages: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[SongResponse])
def list_songs(
    search: str = None, 
    signed_urls: bool = Query(True, description="Generate signed URLs for all songs (default: True)"),
    db: Session = Depends(get_db)
):
    """List all songs with artist data
    
    Args:
        search: Optional search term to filter songs
        signed_urls: If True (default), generate signed URLs for all songs. Set to False for faster response with S3 keys only.
    """
    try:
        print(f"GET /songs called (search={search}, signed_urls={signed_urls})")
        
        # Eagerly load song_artists and artist relationships
        query = db.query(Song).options(
            joinedload(Song.song_artists).joinedload(SongArtist.artist)
        )
        
        if search:
            like_pattern = f"%{search}%"
            query = query.filter(
                or_(
                    Song.title.ilike(like_pattern),
                    Song.album.ilike(like_pattern),
                    Song.language.ilike(like_pattern),
                )
            )
        
        songs = query.all()
        
        print(f"Fetched {len(songs)} songs from database")
        
        # Build result list
        result = []
        for song in songs:
            # Generate signed URL if requested
            file_url_value = song.file_url
            if signed_urls and song.file_url:
                try:
                    file_url_value = generate_signed_url(song.file_url)
                except Exception as e:
                    print(f"Warning: Failed to generate signed URL for song {song.id}: {e}")
                    # Fallback to S3 key
                    file_url_value = song.file_url
            
            song_data = {
                "id": song.id,
                "title": song.title,
                "album": song.album,
                "language": song.language,
                "file_url": file_url_value,  # Signed URL if requested, otherwise S3 key
                "s3_key": song.file_url,  # Always include original S3 key
                "play_count": song.play_count,
                "artist": None,  # Will be set from song_artists relationship
                "artist_id": None,
                "artist_image": None
            }
            
            if song.song_artists and len(song.song_artists) > 0:
                artist_rel = song.song_artists[0]
                if artist_rel.artist:
                    song_data["artist_id"] = artist_rel.artist.id
                    song_data["artist"] = artist_rel.artist.name
                    song_data["artist_image"] = artist_rel.artist.image_url
            
            result.append(song_data)
        
        url_type = "signed URLs" if signed_urls else "S3 keys"
        print(f"Returning {len(result)} songs with {url_type}")
        return result

    except Exception as e:
        print(f"Error in list_songs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{song_id}", response_model=SongResponse)
def get_song(song_id: str, db: Session = Depends(get_db)):
    """Get song by ID"""
    try:
        try:
            song_id_int = int(song_id)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid song ID format: {song_id}")
        
        # Eagerly load song_artists and artist relationships
        song = db.query(Song).options(
            joinedload(Song.song_artists).joinedload(SongArtist.artist)
        ).filter(Song.id == song_id_int).first()
        
        if not song:
            raise HTTPException(status_code=404, detail=f"Song with ID {song_id_int} not found")
        
        # 🔐 Generate signed URL only for individual song requests (when actually playing)
        signed_url = None
        if song.file_url:
            try:
                signed_url = generate_signed_url(song.file_url)
            except Exception as e:
                print(f"Warning: Failed to generate signed URL for song {song_id_int}: {e}")
                # Fallback to returning the S3 key
                signed_url = song.file_url

        song_data = {
            "id": song.id,
            "title": song.title,
            "album": song.album,
            "language": song.language,
            "file_url": signed_url,  # <-- SIGNED URL (only for individual song requests)
            "s3_key": song.file_url,  # Also include original S3 key
            "play_count": song.play_count,
            "artist": None,  # Will be set from song_artists relationship
            "artist_id": None,
            "artist_image": None
        }
        
        if song.song_artists and len(song.song_artists) > 0:
            artist_rel = song.song_artists[0]
            if artist_rel.artist:
                song_data["artist_id"] = artist_rel.artist.id
                song_data["artist"] = artist_rel.artist.name
                song_data["artist_image"] = artist_rel.artist.image_url
        
        return song_data

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_song: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{song_id}/signed-url")
def get_song_signed_url(song_id: str, db: Session = Depends(get_db)):
    """Get signed URL for a song - use this when you need to play the song"""
    try:
        try:
            song_id_int = int(song_id)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid song ID format: {song_id}")
        
        song = db.query(Song).filter(Song.id == song_id_int).first()
        
        if not song:
            raise HTTPException(status_code=404, detail=f"Song with ID {song_id_int} not found")
        
        if not song.file_url:
            raise HTTPException(status_code=404, detail=f"Song {song_id_int} has no file_url")
        
        # Generate signed URL
        try:
            signed_url = generate_signed_url(song.file_url)
            return {"signed_url": signed_url, "s3_key": song.file_url}
        except Exception as e:
            print(f"Error generating signed URL for song {song_id_int}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to generate signed URL: {str(e)}")
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_song_signed_url: {e}")
        raise HTTPException(status_code=500, detail=str(e))
