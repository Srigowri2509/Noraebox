from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db import get_db
from app.models import Playlist, PlaylistSong, Song, SongArtist, Artist
import uuid

router = APIRouter()


@router.get("/")
def get_playlists(db: Session = Depends(get_db)):
    """Get all playlists with song counts (only non-empty playlists)"""
    try:
        # Query playlists with song counts, filtering out empty playlists
        playlists = db.query(
            Playlist.id,
            Playlist.name,
            Playlist.description,
            Playlist.image_url,
            func.count(PlaylistSong.song_id).label('song_count')
        ).outerjoin(
            PlaylistSong, Playlist.id == PlaylistSong.playlist_id
        ).group_by(
            Playlist.id,
            Playlist.name,
            Playlist.description,
            Playlist.image_url
        ).having(
            func.count(PlaylistSong.song_id) > 0
        ).order_by(Playlist.name).all()
        
        # Convert to list of dicts
        result = []
        for p in playlists:
            song_count = p.song_count or 0
            # Double check: only include if song_count > 0
            if song_count > 0:
                result.append({
                    "id": str(p.id),
                    "name": p.name,
                    "description": p.description,
                    "image_url": p.image_url,
                    "song_count": song_count
                })
        
        return result
    except Exception as e:
        print(f"Error fetching playlists: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{playlist_id}/songs")
def get_playlist_songs(playlist_id: str, db: Session = Depends(get_db)):
    """Get all songs in a playlist"""
    try:
        # Convert string UUID to UUID object
        try:
            playlist_uuid = uuid.UUID(playlist_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid playlist ID format")
        
        # Query songs in the playlist, ordered by position
        playlist_songs = db.query(Song).join(
            PlaylistSong, Song.id == PlaylistSong.song_id
        ).filter(
            PlaylistSong.playlist_id == playlist_uuid
        ).order_by(PlaylistSong.position).all()
        
        # Load artist relationships using raw SQL to avoid column issues
        from sqlalchemy import text
        songs_with_artists = []
        for song in playlist_songs:
            # Use raw SQL to get artists - only select columns that exist
            artist_query = text("""
                SELECT 
                    sa.role,
                    a.id,
                    a.name
                FROM song_artists sa
                JOIN artist a ON sa.artist_id = a.id
                WHERE sa.song_id = :song_id
            """)
            
            artist_results = db.execute(artist_query, {"song_id": song.id}).fetchall()
            
            # Build artists array
            artists = []
            for row in artist_results:
                artists.append({
                    "id": str(row.id),
                    "name": row.name,
                    "role": row.role,
                    "image_url": None  # Column doesn't exist in DB, set to None
                })
            
            # Build song response
            song_data = {
                "id": song.id,
                "title": song.title,
                "album": song.album,
                "language": song.language,
                "file_url": song.file_url,
                "play_count": song.play_count or 0,
                "artists": artists
            }
            
            songs_with_artists.append(song_data)
        
        return songs_with_artists
    except Exception as e:
        print(f"Error fetching playlist songs: {e}")
        raise HTTPException(status_code=500, detail=str(e))
