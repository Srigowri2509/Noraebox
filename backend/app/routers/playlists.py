from collections import defaultdict

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

        # playlist_id -> ordered song ids (first four) for 2×2 cover grid on tablet UI
        pl_song_ids = defaultdict(list)
        if playlists:
            for pl_id, song_id, pos in (
                db.query(
                    PlaylistSong.playlist_id,
                    PlaylistSong.song_id,
                    PlaylistSong.position,
                )
                .filter(PlaylistSong.playlist_id.in_([p.id for p in playlists]))
                .order_by(
                    PlaylistSong.playlist_id,
                    func.coalesce(PlaylistSong.position, 999999),
                    PlaylistSong.song_id,
                )
                .all()
            ):
                if len(pl_song_ids[pl_id]) < 4:
                    pl_song_ids[pl_id].append(song_id)

        all_song_ids = {sid for ids in pl_song_ids.values() for sid in ids}
        song_image = {}
        if all_song_ids:
            rows = (
                db.query(SongArtist.song_id, SongArtist.role, Artist.image_url)
                .join(Artist, SongArtist.artist_id == Artist.id)
                .filter(SongArtist.song_id.in_(all_song_ids))
                .all()
            )
            by_song = defaultdict(list)
            for song_id, role, url in rows:
                if not url:
                    continue
                prio = 0 if (role or "").lower() == "singer" else 1
                by_song[song_id].append((prio, url))
            for song_id, pairs in by_song.items():
                pairs.sort(key=lambda x: x[0])
                song_image[song_id] = pairs[0][1]

        # Convert to list of dicts
        result = []
        for p in playlists:
            song_count = p.song_count or 0
            # Double check: only include if song_count > 0
            if song_count > 0:
                # Up to 4 unique cover URLs (no duplicates in the 2×2 grid)
                preview_images = []
                seen_urls = set()
                for sid in pl_song_ids.get(p.id, []):
                    if len(preview_images) >= 4:
                        break
                    url = song_image.get(sid) or p.image_url
                    if not url:
                        continue
                    if url in seen_urls:
                        continue
                    seen_urls.add(url)
                    preview_images.append(url)
                while len(preview_images) < 4:
                    preview_images.append(None)

                result.append({
                    "id": str(p.id),
                    "name": p.name,
                    "description": p.description,
                    "image_url": p.image_url,
                    "song_count": song_count,
                    "preview_images": preview_images[:4],
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
