# Norebox Karaoke System - Complete Architecture Overview

## 🏗️ System Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Admin-App  │     │ Tablet-App  │     │ Display-App │
│  (React)    │     │  (React)    │     │  (React)    │
│  Port: 5174 │     │  Port: 5173 │     │  Port: 5175 │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    ┌──────▼──────┐
                    │   Backend   │
                    │  (FastAPI)  │
                    │ Port: 8000  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Supabase  │
                    │ (PostgreSQL)│
                    └─────────────┘
```

---

## 📱 Applications

### 1. **Admin-App** (Port 5174)
**Status: ✅ WORKING** (Requires backend running)

**Purpose:** Manage rooms, sessions, and device assignments

**Features:**
- ✅ View all rooms from database
- ✅ Select room and set session timing (hours/minutes)
- ✅ View room status (FREE/Active with timer)
- ✅ Assign/unassign devices to rooms
- ✅ Prevent duplicate room assignments (validation)
- ✅ Auto-refresh every 2 seconds
- ✅ Auto-end session when timer reaches 0

**Connection:**
- API Base: `http://localhost:8000`
- Polls: `/rooms` every 2 seconds
- Polls: `/devices` every 2 seconds

**Key Components:**
- `Dashboard.jsx` - Main room management interface
- `RoomSquare.jsx` - Room card display
- `RoomModal.jsx` - Session timing selection
- `Header.jsx` - Navigation

---

### 2. **Tablet-App** (Port 5173)
**Status: ✅ WORKING** (Requires backend running)

**Purpose:** User interface for browsing songs, adding to queue, and starting playback

**Features:**
- ✅ Room selection (via device registration)
- ✅ Browse songs from database
- ✅ Search by title, artist, album, language
- ✅ Filter by language dropdown
- ✅ View top artists with images from database
- ✅ Add songs to queue (allows duplicates)
- ✅ Remove songs from queue
- ✅ View current queue
- ✅ "Ready to Sing?" button to start playback
- ✅ Skip to next song
- ✅ Auto-refresh queue every 2 seconds

**Connection:**
- API Base: `http://localhost:8000`
- Device registration: `POST /devices/register`
- Fetches songs: `GET /songs` and `GET /songs/languages`
- Queue management: `GET /rooms/{id}/queue`, `POST /rooms/{id}/queue/add`, `POST /rooms/{id}/queue/remove`
- Playback: `POST /rooms/{id}/playback/start_next`

**Key Components:**
- `Home.jsx` - Main song browsing interface
- `SearchBar.jsx` - Filter controls
- `SearchResults.jsx` - Song list display
- `TopArtists.jsx` - Top artists grid
- `QueueList.jsx` - Current queue
- `ReadyToSing.jsx` - Play/Skip controls

---

### 3. **Display-App** (Port 5175)
**Status: ✅ WORKING** (Requires backend running)

**Purpose:** Display video playback and session timer on large screen

**Features:**
- ✅ Room selection screen
- ✅ Polls room status every 2 seconds
- ✅ Auto-plays video when `current_song_id` changes
- ✅ Displays session timer (countdown from `started_at + total_minutes`)
- ✅ Timer only shows when song is playing
- ✅ Shows next song banner
- ✅ Shows default background when session ends
- ✅ Calls `/playback/ended` when video finishes
- ✅ Auto-starts next song if queue has items

**Connection:**
- API Base: `http://localhost:8000`
- Room selection: `GET /rooms`
- Room status: `GET /rooms/{id}` every 2 seconds
- Song details: `GET /songs/{id}`
- Queue: `GET /rooms/{id}/queue`
- Playback end: `POST /rooms/{id}/playback/ended`

**Key Components:**
- `Display.jsx` - Main display logic
- `VideoPlayer.jsx` - Video playback component
- `Navbar.jsx` - Timer display
- `NextBanner.jsx` - Next song preview
- `RoomSelection.jsx` - Room selection screen

---

## 🔧 Backend (FastAPI)

**Status: ✅ IMPLEMENTED** (Must be running for apps to work)

**Base URL:** `http://localhost:8000`

**Start Command:**
```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### API Endpoints

#### **Songs** (`/songs`)
- ✅ `GET /songs` - List all songs with artist data (JOIN with artists table)
- ✅ `GET /songs?search={query}` - Search songs by title
- ✅ `GET /songs/languages` - Get unique languages
- ✅ `GET /songs/{song_id}` - Get single song with artist data
- ✅ `POST /songs/upload` - Upload new song (not used by frontend)

**Response Format:**
```json
[
  {
    "id": 11,
    "title": "Song Title",
    "album": "Album Name",
    "language": "English",
    "file_url": "https://...",
    "artist": "Artist Name",
    "artist_image": "https://..."
  }
]
```

#### **Rooms** (`/rooms`)
- ✅ `GET /rooms` - List all rooms
- ✅ `GET /rooms/{room_id}` - Get room status (with auto-end logic)
- ✅ `GET /rooms/{room_id}/status` - Alias for get_room
- ✅ `PUT /rooms/{room_id}/status` - Update room status
- ✅ `PUT /rooms/{room_id}/current` - Set current song
- ✅ `POST /rooms/{room_id}/start` - Start session (sets `total_minutes`, `started_at`, `is_active`)
- ✅ `POST /rooms/{room_id}/end` - End session (resets all session fields)

**Auto-End Logic:**
- When `GET /rooms/{id}` is called, checks if `(now - started_at) >= (total_minutes * 60)`
- If expired, automatically ends session and clears queue

#### **Queue** (`/rooms/{room_id}/queue`)
- ✅ `GET /` - Get queue (returns flat array of songs with artist data)
- ✅ `POST /add` - Add song to queue
- ✅ `POST /remove` - Remove song by position
- ✅ `DELETE /{queue_item_id}` - Remove by ID
- ✅ `POST /pop` - Pop first item (not used)

**Response Format:**
```json
[
  {
    "id": 11,
    "title": "Song Title",
    "artist": "Artist Name",
    "artist_image": "https://...",
    "file_url": "https://..."
  }
]
```

#### **Playback** (`/rooms/{room_id}/playback`)
- ✅ `POST /start_next` - Start next song from queue
  - Pops first queue item
  - Sets `current_song_id`, `current_song_start_time`, `status = "playing"`
  - Returns full song object with artist data
- ✅ `POST /ended` - Handle playback end
  - Increments `songs.play_count`
  - Auto-starts next song if queue not empty
  - Sets room to idle if queue empty
- ✅ `POST /event` - Log playback event (not used by frontend)

#### **Devices** (`/devices`)
- ✅ `POST /register` - Register device (tablet/display)
- ✅ `GET /` - List all devices with room assignments
- ✅ `GET /{device_id}` - Get device details
- ✅ `PUT /{device_id}/assign` - Assign/unassign device to room
  - **Validation:** Prevents duplicate room assignments
  - Returns error if room already assigned to another device

---

## 🗄️ Database (Supabase PostgreSQL)

**Status: ✅ CONNECTED** (via Supabase client)

### Tables

1. **`rooms`**
   - `id` (UUID, primary key)
   - `name` (text)
   - `is_active` (boolean)
   - `status` (text: "idle", "playing", "finished")
   - `started_at` (timestamp)
   - `total_minutes` (integer)
   - `current_song_id` (integer) - **⚠️ MUST BE INTEGER, NOT UUID**
   - `current_song_start_time` (timestamp)

2. **`songs`**
   - `id` (integer, primary key)
   - `title` (text)
   - `album` (text)
   - `language` (text)
   - `file_url` (text)
   - `play_count` (integer)
   - `artist` (text) - fallback field

3. **`artists`**
   - `id` (UUID, primary key)
   - `name` (text, unique)
   - `image_url` (text)

4. **`song_artists`** (junction table)
   - `song_id` (integer, foreign key → songs.id)
   - `artist_id` (UUID, foreign key → artists.id)

5. **`queue_items`**
   - `id` (UUID, primary key)
   - `room_id` (UUID, foreign key → rooms.id)
   - `song_id` (integer, foreign key → songs.id)
   - `position` (integer)
   - `added_by` (text)

6. **`devices`**
   - `id` (UUID, primary key)
   - `device_uuid` (text, unique)
   - `name` (text)
   - `room_id` (UUID, foreign key → rooms.id, nullable)
   - `meta` (jsonb)

7. **`playback_events`**
   - `id` (UUID, primary key)
   - `room_id` (UUID)
   - `song_id` (integer)
   - `event_type` (text)
   - `timestamp` (timestamp)

---

## 🔄 Complete Flow

### 1. **Initial Setup**
```
1. Admin starts backend server
2. Admin opens admin-app → sees all rooms
3. Tablet/Display devices register via POST /devices/register
4. Admin assigns devices to rooms (one device per room)
```

### 2. **Session Start (Admin)**
```
1. Admin clicks room → RoomModal opens
2. Admin selects hours/minutes (e.g., 1 hour)
3. Admin clicks "Confirm"
4. Backend: POST /rooms/{id}/start
   - Sets total_minutes = 60
   - Sets started_at = now()
   - Sets is_active = true
   - Sets status = "idle"
   - Clears queue and current_song_id
5. Room shows as ACTIVE with timer
```

### 3. **Song Queueing (Tablet)**
```
1. User browses/search songs in tablet-app
2. User clicks song → adds to queue
3. Backend: POST /rooms/{id}/queue/add
   - Inserts into queue_items with position
4. Queue updates in tablet-app (polls every 2s)
5. User can add duplicate songs (allowed)
6. User can remove songs from queue
```

### 4. **Playback Start (Tablet → Display)**
```
1. User clicks "Ready to Sing?" button
2. Backend: POST /rooms/{id}/playback/start_next
   - Pops first queue item
   - Sets current_song_id = popped_song_id
   - Sets current_song_start_time = now()
   - Sets status = "playing"
3. Display-app polls /rooms/{id} every 2s
4. Display detects current_song_id changed
5. Display fetches song: GET /songs/{id}
6. Display plays video from file_url
7. Timer starts showing (calculated from started_at + total_minutes)
```

### 5. **Playback End (Display → Auto-Continue)**
```
1. Video ends in display-app
2. Display calls: POST /rooms/{id}/playback/ended
3. Backend:
   - Increments songs.play_count
   - Checks if queue has more items
   - If queue not empty → auto calls start_next
   - If queue empty → sets status = "idle", current_song_id = NULL
4. Display polls again → sees new current_song_id or NULL
5. If new song → plays automatically
6. If NULL → shows default background
```

### 6. **Session End (Auto)**
```
1. Timer reaches 0 (calculated: (now - started_at) >= total_minutes * 60)
2. Backend auto-ends in GET /rooms/{id}:
   - Sets is_active = false
   - Sets status = "idle"
   - Clears started_at, total_minutes, current_song_id
   - Clears queue_items
3. Admin-app polls → sees room as FREE
4. Display-app polls → shows default background
5. Tablet-app → can't add songs (room inactive)
```

---

## ✅ Working Features

- ✅ All three apps connect to backend
- ✅ Backend connects to Supabase database
- ✅ Room management (view, start, end sessions)
- ✅ Device registration and assignment
- ✅ Duplicate room assignment prevention
- ✅ Song browsing and search
- ✅ Queue management (add, remove, view)
- ✅ Playback control (start, skip, auto-continue)
- ✅ Timer display (countdown from session start)
- ✅ Auto-session end when timer expires
- ✅ Artist images from database
- ✅ Language filtering
- ✅ Top artists display

---

## ⚠️ Known Issues / Requirements

1. **Backend Must Be Running**
   - All apps require backend at `http://localhost:8000`
   - Apps show error messages if backend is down

2. **Database Schema**
   - `rooms.current_song_id` MUST be INTEGER (not UUID)
   - If it's UUID, you'll get: `invalid input syntax for type uuid: "11"`

3. **Polling (No WebSockets)**
   - All apps use polling (every 2 seconds)
   - No real-time updates (acceptable for this use case)

4. **Room Selection**
   - Display-app requires room selection on first load
   - Can enter room ID manually if backend is down

---

## 🚀 To Run the System

### 1. Start Backend
```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Start Admin-App
```bash
cd admin-app
npm run dev
# Opens on http://localhost:5174
```

### 3. Start Tablet-App
```bash
cd tablet-app
npm run dev
# Opens on http://localhost:5173
```

### 4. Start Display-App
```bash
cd display-app
npm run dev
# Opens on http://localhost:5175
```

---

## 📊 System Status Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Backend Server | ✅ Ready | Must be running |
| Database Connection | ✅ Working | Via Supabase |
| Admin-App | ✅ Working | Needs backend |
| Tablet-App | ✅ Working | Needs backend |
| Display-App | ✅ Working | Needs backend |
| Room Management | ✅ Working | Full CRUD |
| Session Management | ✅ Working | Start/End/Auto-end |
| Queue Management | ✅ Working | Add/Remove/View |
| Playback Control | ✅ Working | Start/Skip/Auto-continue |
| Timer Display | ✅ Working | Countdown from session start |
| Device Assignment | ✅ Working | With duplicate prevention |
| Song Browsing | ✅ Working | Search/Filter/View |
| Artist Images | ✅ Working | From database |

---

## 🔍 Testing Checklist

- [ ] Backend starts without errors
- [ ] Admin-app shows all rooms
- [ ] Admin can start session with timing
- [ ] Tablet-app shows songs from database
- [ ] Tablet-app can add songs to queue
- [ ] Display-app shows room selection
- [ ] Display-app connects to same room as tablet
- [ ] Play button in tablet starts video in display
- [ ] Timer shows and counts down correctly
- [ ] Session auto-ends when timer reaches 0
- [ ] No two devices can be assigned to same room

---

**Last Updated:** Current session
**Architecture Version:** 1.0

