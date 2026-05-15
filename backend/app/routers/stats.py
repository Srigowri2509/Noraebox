from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, text
from typing import List
from app.db import get_db
from app.models import Song, PlaybackEvent, SongArtist, Artist
from app.schemas import TopSongResponse, TopArtistResponse

router = APIRouter()


@router.get("/top-songs", response_model=List[TopSongResponse])
def get_top_songs(limit: int = 10, db: Session = Depends(get_db)):
    """Get top songs by play_count or playback_events aggregation"""
    try:
        # Option 1: Use play_count from songs table
        songs = db.query(Song).order_by(desc(Song.play_count)).limit(limit).all()
        
        result = []
        for song in songs:
            # Get artist info
            artist_name = song.artist  # fallback
            artist_image = None
            
            artist_row = db.execute(
                text("""
                    SELECT a.name FROM song_artists sa
                    JOIN artist a ON sa.artist_id = a.id
                    WHERE sa.song_id = :song_id
                    LIMIT 1
                """),
                {"song_id": song.id},
            ).fetchone()
            if artist_row:
                artist_name = artist_row.name
            
            result.append({
                "song_id": song.id,
                "title": song.title,
                "play_count": song.play_count,
                "artist": artist_name,
                "artist_image": artist_image
            })
        
        return result
    except Exception as e:
        print(f"Error fetching top songs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/top-artists", response_model=List[TopArtistResponse])
def get_top_artists(limit: int = 10, db: Session = Depends(get_db)):
    """Get top artists by play_count aggregation from songs"""
    try:
        # Aggregate play_count by artist through song_artists
        # Join songs -> song_artists -> artists and sum play_count
        top_artists = db.query(
            Artist.id,
            Artist.name,
            func.sum(Song.play_count).label('play_count')
        ).join(
            SongArtist, Artist.id == SongArtist.artist_id
        ).join(
            Song, SongArtist.song_id == Song.id
        ).group_by(
            Artist.id, Artist.name
        ).order_by(
            desc(func.sum(Song.play_count))
        ).limit(limit).all()
        
        result = []
        for artist_id, name, play_count in top_artists:
            result.append({
                "artist_id": artist_id,
                "name": name,
                "image_url": None,
                "play_count": play_count or 0
            })
        
        return result
    except Exception as e:
        print(f"Error fetching top artists: {e}")
        raise HTTPException(status_code=500, detail=str(e))
