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
def list_songs(search: str = None, db: Session = Depends(get_db)):
    """List all songs with artist data"""
    try:
        print(f"GET /songs called (search={search})")
        
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
                    Song.artist.ilike(like_pattern),
                )
            )
        
        songs = query.all()
        
        print(f"Fetched {len(songs)} songs from database")
        
        result = []
        for song in songs:

            # 🔐 Generate signed URL from S3 key
            signed_url = None
            if song.file_url:
                signed_url = generate_signed_url(song.file_url)

            song_data = {
                "id": song.id,
                "title": song.title,
                "album": song.album,
                "language": song.language,
                "file_url": signed_url,   # <-- SIGNED URL HERE
                "play_count": song.play_count,
                "artist": song.artist,
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
        
        # 🔐 Generate signed URL
        signed_url = None
        if song.file_url:
            signed_url = generate_signed_url(song.file_url)

        song_data = {
            "id": song.id,
            "title": song.title,
            "album": song.album,
            "language": song.language,
            "file_url": signed_url,  # <-- SIGNED URL
            "play_count": song.play_count,
            "artist": song.artist,
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
