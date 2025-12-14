# 🚀 Quick Start & Verification Guide

## Step 1: Start Backend Server

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Expected Output:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

**Test:** Open http://localhost:8000/ in browser → Should see `{"ok": true}`

---

## Step 2: Start All Apps

### Option A: Use Start Scripts

**Windows:**
```bash
.\start_all_apps.bat
```

**Mac/Linux:**
```bash
./start_all_apps.sh
```

### Option B: Manual Start (4 Terminals)

**Terminal 1 - Backend:**
```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 - Admin-App:**
```bash
cd admin-app
npm run dev
```
Opens: http://localhost:5174

**Terminal 3 - Tablet-App:**
```bash
cd tablet-app
npm run dev
```
Opens: http://localhost:5175

**Terminal 4 - Display-App:**
```bash
cd display-app
npm run dev
```
Opens: http://localhost:5176

---

## Step 3: Verify Each App Works

### ✅ Admin-App Verification

1. **Open** http://localhost:5174
2. **Should See:**
   - List of rooms (squares)
   - Each room shows "FREE" or "READY" or timer
   - Devices panel at bottom
3. **Test:**
   - Click a room → Modal opens
   - Enter 60 minutes → Click Start
   - Room should show "READY" (not timer yet)

### ✅ Tablet-App Verification

1. **Open** http://localhost:5175
2. **Should See:**
   - Room selection modal (if not assigned)
   - OR song library (if already assigned)
3. **Test:**
   - Select a room from dropdown
   - Click "Assign Room"
   - Should see song library
   - Add songs to queue
   - Queue should appear on right side

### ✅ Display-App Verification

1. **Open** http://localhost:5176
2. **Should See:**
   - Room selection modal (if not assigned)
   - OR default background with logo (if already assigned)
3. **Test:**
   - Select SAME room as tablet-app
   - Click "Assign Room"
   - Should show default background
   - Timer should NOT show yet (no session started)

---

## Step 4: Complete Flow Test

### Test 1: Device Registration ✅

1. **Open tablet-app** → Check browser console (F12)
2. **Should See:**
   ```
   POST /devices/register called
   Device registered: {device_uuid: "...", device_type: "tablet"}
   GET /devices/me called
   ```

### Test 2: Room Pairing ✅

1. **In tablet-app** → Select Room 1 → Click "Assign Room"
2. **In display-app** → Select Room 1 → Click "Assign Room"
3. **Check backend logs** → Should see:
   ```
   POST /devices/assign-room called
   Device abc-123 (tablet) assigned to room room-1
   POST /devices/assign-room called
   Device xyz-789 (display) assigned to room room-1
   ```

### Test 3: Session Start ✅

1. **In admin-app** → Click Room 1 → Enter 60 → Click Start
2. **Check backend logs** → Should see:
   ```
   POST /rooms/{id}/start called
   Session created with id session-123
   ```
3. **Check database** (Supabase):
   ```sql
   SELECT * FROM room_sessions WHERE room_id = 'room-1';
   ```
   - Should see: `session_start_time = NULL` ✅
   - Should see: `status = 'idle'` ✅
   - Should see: `total_minutes = 60` ✅

### Test 4: First Play (Timer Starts) ✅

1. **In tablet-app** → Add song to queue → Click "Ready to Sing?"
2. **Check backend logs** → Should see:
   ```
   POST /rooms/{id}/playback/start_next called
   First song - starting timer
   Setting session_start_time = now()
   ```
3. **Check database**:
   ```sql
   SELECT session_start_time FROM room_sessions WHERE room_id = 'room-1';
   ```
   - Should see: `session_start_time = '2025-01-14T18:05:00Z'` (NOT NULL) ✅
4. **In display-app** → Should:
   - ✅ Play video automatically
   - ✅ Show timer counting down (e.g., 59:58, 59:57...)
   - ✅ Timer in top-right corner

### Test 5: Subsequent Songs ✅

1. **Wait for first song to end** (or click Skip)
2. **Check backend logs** → Should see:
   ```
   POST /rooms/{id}/playback/start_next called
   Subsequent song - timer continues
   ```
3. **Check database**:
   ```sql
   SELECT session_start_time FROM room_sessions WHERE room_id = 'room-1';
   ```
   - Should see: `session_start_time` UNCHANGED (same as first song) ✅
4. **In display-app** → Should:
   - ✅ Play next video
   - ✅ Timer continues (doesn't reset)

### Test 6: Timer Display ✅

1. **In admin-app** → Room 1 should show:
   - Before first song: "READY" (no timer)
   - After first song: Timer counting down (e.g., 58:30)
2. **In display-app** → Top-right should show:
   - Before first song: No timer
   - After first song: Timer counting down

### Test 7: Session Auto-End ✅

1. **Wait for timer to reach 0:00** (or manually end in admin)
2. **Check backend logs** → Should see:
   ```
   GET /rooms/{id}/session called
   Session expired, auto-ending
   ```
3. **In display-app** → Should:
   - ✅ Stop video
   - ✅ Show default background
   - ✅ Timer disappears
4. **In admin-app** → Room 1 should show "FREE"

---

## 🐛 Common Issues & Fixes

### Issue: "Cannot connect to backend"

**Fix:**
1. Check backend is running: `curl http://localhost:8000/`
2. Check backend logs for errors
3. Check CORS is enabled in `backend/app/main.py`

### Issue: "Room already has a tablet device"

**Fix:**
- This is correct behavior! Backend prevents duplicate devices
- Unassign the other tablet first, or select a different room

### Issue: Display-app doesn't play video

**Check:**
1. Both apps assigned to same room? (Check localStorage: `room_id`)
2. Session started? (Check admin-app shows "READY" or timer)
3. Song has `file_url`? (Check database: `songs.file_url`)
4. Backend logs show `current_song_id` being set?

### Issue: Timer doesn't show

**Check:**
1. First song played? (`session_start_time` must NOT be NULL)
2. Display-app polling `/rooms/{id}/session`?
3. Check browser console for errors

---

## 📋 Quick Verification Checklist

- [ ] Backend running on port 8000
- [ ] Admin-app shows rooms list
- [ ] Tablet-app shows room selection
- [ ] Display-app shows room selection
- [ ] Can assign tablet to room
- [ ] Can assign display to same room
- [ ] Admin can start session (room shows "READY")
- [ ] Tablet can add songs to queue
- [ ] Tablet can click Play
- [ ] Display plays video when Play clicked
- [ ] Timer shows in display-app after first song
- [ ] Timer shows in admin-app after first song
- [ ] Timer continues on subsequent songs (doesn't reset)
- [ ] Session auto-ends when timer reaches 0

---

## 🎯 Expected Behavior Summary

| Action | Tablet-App | Display-App | Admin-App | Backend |
|--------|-----------|-------------|-----------|---------|
| **App Opens** | Shows room selection | Shows room selection | Shows rooms list | - |
| **Room Selected** | Shows song library | Shows default bg | - | Updates `devices.room_id` |
| **Admin Starts Session** | - | - | Room shows "READY" | Creates `room_sessions` (timer NULL) |
| **First Play** | Queue decreases | Video plays, timer shows | Timer shows | Sets `session_start_time` |
| **Next Song** | Queue decreases | Next video plays | Timer continues | Updates `current_song_id` only |
| **Timer Reaches 0** | - | Shows default bg | Room shows "FREE" | Auto-ends session |

---

Everything should work automatically once all apps are running! 🎉

