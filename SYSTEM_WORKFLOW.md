# Complete System Workflow Guide

## 🎯 How The System Works

This document explains the complete flow of the karaoke system from startup to playback.

---

## 📱 **1. APP STARTUP FLOW**

### **Tablet-App Startup**

1. **App Opens** → `tablet-app/src/App.jsx` loads
2. **Device Registration** → Calls `ensureDeviceRegistered()`:
   - Generates/retrieves `device_uuid` from localStorage
   - Calls `POST /devices/register` with `device_type: "tablet"`
   - Backend stores device in `devices` table
3. **Check Room Assignment** → Calls `GET /devices/me?device_uuid={uuid}`
   - Backend returns: `{device_uuid, device_type, room_id}`
4. **If `room_id === null`**:
   - ✅ Shows ONLY `RoomSelectModal`
   - ❌ Does NOT show Home component
   - ❌ Does NOT fetch songs
   - ❌ Does NOT poll queue
5. **If `room_id` exists**:
   - ✅ Stores `room_id` in localStorage
   - ✅ Shows `Home` component
   - ✅ Fetches songs from `/songs`
   - ✅ Polls queue from `/rooms/{room_id}/queue`

### **Display-App Startup**

1. **App Opens** → `display-app/src/App.jsx` loads
2. **Device Registration** → Calls `ensureDeviceRegistered()`:
   - Generates/retrieves `device_uuid` from localStorage
   - Calls `POST /devices/register` with `device_type: "display"`
   - Backend stores device in `devices` table
3. **Check Room Assignment** → Calls `GET /devices/me?device_uuid={uuid}`
   - Backend returns: `{device_uuid, device_type, room_id}`
4. **If `room_id === null`**:
   - ✅ Shows ONLY `RoomSelectModal`
   - ❌ Does NOT show Display component
   - ❌ Does NOT poll room status
5. **If `room_id` exists**:
   - ✅ Stores `room_id` in localStorage
   - ✅ Shows `Display` component
   - ✅ Polls session from `/rooms/{room_id}/session`

### **Admin-App Startup**

1. **App Opens** → `admin-app/src/pages/Dashboard.jsx` loads
2. **Fetches Rooms** → Calls `GET /rooms`
   - Backend returns list of all rooms
3. **Fetches Devices** → Calls `GET /devices`
   - Backend returns list of all devices with room assignments
4. **Polls Every 2 Seconds** → Updates room and device status

---

## 🔗 **2. ROOM PAIRING FLOW**

### **When User Selects Room (Tablet or Display)**

1. **User Clicks Room** → `RoomSelectModal` shows room list
2. **User Selects Room** → Calls `POST /devices/assign-room`:
   ```json
   {
     "device_uuid": "abc-123...",
     "room_id": "room-uuid-123"
   }
   ```
3. **Backend Validates**:
   - Gets device by `device_uuid`
   - Reads `device_type` from device
   - Checks if room already has device of same type:
     - If `device_type = "tablet"` → Check no other tablet in room
     - If `device_type = "display"` → Check no other display in room
   - If conflict → Returns 400 error: "Room already has a {device_type} device"
   - If OK → Updates `devices.room_id`
4. **Frontend**:
   - Stores `room_id` in localStorage
   - Reloads page to show main interface

### **Important Rules**

- ✅ One tablet + one display per room (enforced by backend)
- ❌ Cannot assign two tablets to same room
- ❌ Cannot assign two displays to same room
- ✅ Tablet and display can be in same room (different types)

---

## 🎬 **3. SESSION START FLOW (Admin)**

### **Admin Starts Session**

1. **Admin Opens Room Modal** → Clicks on a room square
2. **Admin Sets Time** → Enters minutes (e.g., 60 minutes)
3. **Admin Clicks Start** → Calls `POST /rooms/{room_id}/start`:
   ```json
   {
     "total_minutes": 60
   }
   ```
4. **Backend Creates Session**:
   - Creates row in `room_sessions` table:
     ```python
     {
       "room_id": "room-uuid",
       "status": "idle",
       "total_minutes": 60,
       "session_created_at": "2025-01-14T18:00:00Z",
       "session_start_time": None,  # ⚠️ Timer NOT started yet
       "current_song_id": None,
       "current_song_start_time": None
     }
     ```
   - Updates `rooms` table:
     ```python
     {
       "is_active": True,
       "session_id": "session-uuid"  # Links to room_sessions
     }
     ```
5. **Result**:
   - ✅ Room is "ready but idle"
   - ❌ Timer does NOT start yet
   - ❌ No song playing
   - ✅ Admin shows "READY" (not timer)

---

## 🎵 **4. PLAYBACK FLOW (Tablet → Display)**

### **User Adds Songs to Queue (Tablet)**

1. **User Browses Songs** → Tablet fetches from `GET /songs`
2. **User Clicks Song** → Calls `POST /rooms/{room_id}/queue/add`:
   ```json
   {
     "song_id": 11,
     "added_by": "tablet"
   }
   ```
3. **Backend** → Adds to `queue_items` table
4. **Tablet** → Polls `GET /rooms/{room_id}/queue` every 2 seconds
   - Shows updated queue in UI

### **User Clicks "Ready to Sing?" (Tablet)**

1. **User Clicks Play** → Calls `POST /rooms/{room_id}/playback/start_next`
2. **Backend Logic**:
   - Gets room → Finds `session_id`
   - Gets session from `room_sessions` table
   - Pops first song from `queue_items`
   - **Checks: Is `session.session_start_time` NULL?**
   
   **If YES (First Song)**:
   ```python
   # Timer starts HERE
   room_sessions.update({
     "session_start_time": now(),  # ⏰ TIMER STARTS
     "status": "playing",
     "current_song_id": 11,
     "current_song_start_time": now()
   })
   ```
   
   **If NO (Subsequent Song)**:
   ```python
   # Timer continues (does NOT update session_start_time)
   room_sessions.update({
     "status": "playing",
     "current_song_id": 12,
     "current_song_start_time": now()
     # session_start_time stays the same
   })
   ```
3. **Display-App Detects Change**:
   - Polls `GET /rooms/{room_id}/session` every 2 seconds
   - Sees `session.current_song_id` changed
   - Fetches song details from `GET /songs/{song_id}`
   - Plays video from `song.file_url`

---

## ⏱️ **5. TIMER FLOW**

### **Timer Calculation**

**Formula:**
```
remaining_time = (session_start_time + total_minutes) - now()
```

**When Timer Shows:**
- ✅ `session_start_time` exists (first song played)
- ✅ `total_minutes` > 0
- ✅ `status` != "finished"

**When Timer Does NOT Show:**
- ❌ `session_start_time` is NULL (session ready but idle)
- ❌ Session is finished
- ❌ No active session

### **Display-App Timer**

1. **Polls** → `GET /rooms/{room_id}/session` every 2 seconds
2. **Checks** → `session.session_start_time`
3. **If NULL** → Shows idle screen, NO timer
4. **If Exists** → Calculates: `(session_start_time + total_minutes) - now()`
5. **Displays** → Timer in top-right corner

### **Admin-App Timer**

1. **Fetches** → `GET /rooms/{room_id}/session` for each room
2. **Checks** → `session.session_start_time`
3. **If NULL** → Shows "READY" (session ready but idle)
4. **If Exists** → Calculates and shows timer
5. **Updates** → Every 2 seconds

---

## 🔚 **6. SESSION END FLOW**

### **Auto-End (Backend)**

1. **Backend Checks** → Inside `GET /rooms/{room_id}/session`:
   ```python
   if session.session_start_time and session.status != "finished":
     elapsed = now() - session_start_time
     if elapsed >= total_minutes:
       # Session expired
       room_sessions.update({
         "status": "finished",
         "session_end_time": now(),
         "current_song_id": None
       })
       rooms.update({
         "is_active": False,
         "session_id": None
       })
       # Clear queue
       queue_items.delete().eq("room_id", room_id)
   ```

2. **Display-App**:
   - Polls session → Sees `status = "finished"`
   - Stops video playback
   - Shows default background
   - Timer disappears

3. **Admin-App**:
   - Polls rooms → Sees `is_active = False`
   - Shows room as "FREE"

### **Manual End (Admin)**

1. **Admin Clicks "End"** → Calls `POST /rooms/{room_id}/end`
2. **Backend**:
   - Updates `room_sessions.status = "finished"`
   - Sets `rooms.is_active = False`
   - Clears queue
3. **Result** → Same as auto-end

---

## 🔄 **7. COMPLETE USER JOURNEY**

### **Scenario: Customer Rents Room for 1 Hour**

1. **Admin** → Opens admin-app
2. **Admin** → Clicks Room 1 → Sets 60 minutes → Clicks Start
   - ✅ Room 1 status: "READY" (no timer yet)
3. **Customer** → Opens tablet-app
   - ✅ Shows room selection (if not assigned)
   - ✅ Selects Room 1
   - ✅ Shows song library
4. **Customer** → Opens display-app (on TV screen)
   - ✅ Shows room selection (if not assigned)
   - ✅ Selects Room 1 (same room)
5. **Customer** → Adds songs to queue (tablet-app)
6. **Customer** → Clicks "Ready to Sing?" (tablet-app)
   - ✅ First song plays in display-app
   - ✅ Timer starts: 60:00 → 59:59 → 59:58...
   - ✅ Display-app shows video
7. **Song Ends** → Display-app calls `POST /rooms/{room_id}/playback/ended`
   - ✅ Backend increments `songs.play_count`
   - ✅ If queue has more songs → Auto-starts next song
   - ✅ Timer continues (doesn't reset)
8. **After 1 Hour** → Timer reaches 0:00
   - ✅ Backend auto-ends session
   - ✅ Display-app shows default background
   - ✅ Admin-app shows Room 1 as "FREE"

---

## ✅ **8. VERIFICATION CHECKLIST**

### **To Verify Everything Works:**

1. **Start Backend**:
   ```bash
   cd backend
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
   - Should see: "Application startup complete"
   - Test: `curl http://localhost:8000/` → Should return `{"ok": true}`

2. **Start Tablet-App**:
   ```bash
   cd tablet-app
   npm run dev
   ```
   - Opens on `http://localhost:5175`
   - Should show room selection modal
   - After selecting room → Should show song library

3. **Start Display-App**:
   ```bash
   cd display-app
   npm run dev
   ```
   - Opens on `http://localhost:5176`
   - Should show room selection modal
   - After selecting room → Should show default background

4. **Start Admin-App**:
   ```bash
   cd admin-app
   npm run dev
   ```
   - Opens on `http://localhost:5174`
   - Should show list of rooms
   - Should show devices panel

### **Test Flow:**

1. ✅ **Device Registration**:
   - Open tablet-app → Should register device
   - Check backend logs → Should see `POST /devices/register`

2. ✅ **Room Pairing**:
   - Select Room 1 in tablet-app
   - Select Room 1 in display-app
   - Check backend logs → Should see `POST /devices/assign-room`

3. ✅ **Session Start**:
   - In admin-app → Click Room 1 → Start 60 minutes
   - Check backend logs → Should see `POST /rooms/{id}/start`
   - Check database → `room_sessions` should have row with `session_start_time = NULL`

4. ✅ **Playback Start**:
   - In tablet-app → Add song to queue → Click Play
   - Check backend logs → Should see `POST /rooms/{id}/playback/start_next`
   - Check database → `room_sessions.session_start_time` should be set (NOT NULL)
   - Display-app → Should play video

5. ✅ **Timer**:
   - Display-app → Should show timer counting down
   - Admin-app → Should show timer for Room 1

---

## 🐛 **9. TROUBLESHOOTING**

### **If Tablet-App Shows "Backend Connection Issue":**

- ✅ Check backend is running: `curl http://localhost:8000/`
- ✅ Check CORS is enabled (should be in `main.py`)
- ✅ Check browser console for errors

### **If Room Selection Doesn't Work:**

- ✅ Check `POST /devices/assign-room` in backend logs
- ✅ Check device has `device_type` set
- ✅ Check room doesn't already have device of same type

### **If Display-App Doesn't Play Video:**

- ✅ Check both apps are assigned to same room
- ✅ Check `GET /rooms/{room_id}/session` returns session data
- ✅ Check `session.current_song_id` is set
- ✅ Check `song.file_url` exists in database

### **If Timer Doesn't Show:**

- ✅ Check `session.session_start_time` is NOT NULL (first song must play)
- ✅ Check `session.total_minutes` > 0
- ✅ Check display-app is polling `/rooms/{id}/session`

---

## 📊 **10. DATA FLOW DIAGRAM**

```
┌─────────────┐
│  Admin-App  │
└──────┬──────┘
       │ POST /rooms/{id}/start
       ▼
┌─────────────┐
│   Backend   │
│             │
│ Creates:    │
│ room_sessions│
│ (session_start_time = NULL)│
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│ Tablet-App  │     │ Display-App │
│             │     │             │
│ Polls:      │     │ Polls:      │
│ /queue      │     │ /session    │
└──────┬──────┘     └──────┬──────┘
       │                   │
       │ POST /playback/start_next
       ▼                   │
┌─────────────┐            │
│   Backend   │            │
│             │            │
│ Sets:       │            │
│ session_start_time = now()│
│ (Timer starts)            │
└──────┬──────┘            │
       │                   │
       │                   │ Detects current_song_id
       │                   │
       └───────────────────┘
              │
              ▼
       ┌─────────────┐
       │ Display-App │
       │ Plays Video │
       └─────────────┘
```

---

## 🎯 **KEY POINTS TO REMEMBER**

1. **Timer starts ONLY when first song plays** (not when admin starts session)
2. **All session state lives in `room_sessions`** (NOT `rooms` table)
3. **Apps are blocked until room assigned** (enforced by frontend)
4. **One tablet + one display per room** (enforced by backend)
5. **Backend is single source of truth** (apps never store state locally)
6. **Display-app polls session every 2 seconds** (detects changes automatically)

---

## 🚀 **Quick Start Commands**

```bash
# Terminal 1: Backend
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2: Tablet-App
cd tablet-app
npm run dev

# Terminal 3: Display-App
cd display-app
npm run dev

# Terminal 4: Admin-App
cd admin-app
npm run dev
```

Then open:
- Admin: http://localhost:5174
- Tablet: http://localhost:5175
- Display: http://localhost:5176

---

This system should work end-to-end once all apps are running and devices are paired to rooms!

