# Playback Connection Debug Guide

## Issue: Tablet-App Play Button Not Playing in Display-App

### ✅ What I Fixed:

1. **Display-App Device Registration**
   - Added `display-app/src/init/registerDevice.js`
   - Display-app now registers as a device (like tablet-app)
   - Device gets assigned to selected room

2. **Better Logging**
   - Added console logs to track room polling
   - Added logs to track song changes

### 🔍 How to Debug:

#### Step 1: Verify Both Apps Are Connected to Same Room

**Tablet-App:**
1. Open browser console (F12)
2. Check: `localStorage.getItem("room_id")`
3. Should show: Room UUID (e.g., "13698756-bff4-49d1-8d61-cf8fba7c4333")

**Display-App:**
1. Open browser console (F12)
2. Check: `localStorage.getItem("room_id")`
3. Should match tablet-app's room_id

**If they don't match:**
- Clear localStorage in both apps
- Select the SAME room in both apps

#### Step 2: Verify Backend is Running

```bash
# Check if backend is running
curl http://localhost:8000/

# Should return: {"ok": true}
```

#### Step 3: Check Database Schema

**IMPORTANT:** The `rooms.current_song_id` column MUST be INTEGER type, not UUID!

**Check in Supabase SQL Editor:**
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'rooms' AND column_name = 'current_song_id';
```

**If it's UUID, fix it:**
```sql
ALTER TABLE rooms 
ALTER COLUMN current_song_id TYPE INTEGER 
USING current_song_id::text::integer;
```

#### Step 4: Test Playback Flow

1. **In Tablet-App:**
   - Add songs to queue
   - Click "Ready to Sing?" button
   - Check browser console for:
     ```
     ✅ Play command sent to backend
     POST /rooms/{room_id}/playback/start_next
     ```

2. **In Backend Terminal:**
   - Should see:
     ```
     POST /rooms/{room_id}/playback/start_next called
     Setting current_song_id to: 11 (type: int)
     Successfully updated room {room_id} with current_song_id: 11
     ```

3. **In Display-App:**
   - Check browser console for:
     ```
     Display polling room status for room: {room_id}
     Room data: { current_song_id: 11, ... }
     Display: New song loaded: {song title}
     ```

#### Step 5: Verify Room Data in Database

**In Supabase SQL Editor:**
```sql
SELECT id, name, current_song_id, status, is_active 
FROM rooms 
WHERE id = 'your-room-id';
```

**Should show:**
- `current_song_id`: integer (e.g., 11)
- `status`: "playing"
- `is_active`: true

### 🐛 Common Issues:

#### Issue 1: "invalid input syntax for type uuid: '11'"
**Cause:** `rooms.current_song_id` is UUID type but songs have integer IDs
**Fix:** Run the ALTER TABLE command above

#### Issue 2: Display-App Shows "Loading rooms..." Forever
**Cause:** Backend not running or CORS issue
**Fix:** 
- Start backend: `cd backend && uvicorn app.main:app --reload`
- Check browser console for errors

#### Issue 3: Play Button Does Nothing
**Cause:** 
- Queue is empty
- Room ID mismatch
- Backend not running

**Fix:**
- Add songs to queue first
- Verify both apps use same room_id
- Check backend is running

#### Issue 4: Video Doesn't Play in Display-App
**Cause:**
- `file_url` is null or invalid
- Video format not supported
- CORS issue with video URL

**Fix:**
- Check song has valid `file_url` in database
- Check browser console for video errors
- Verify video URL is accessible

### 📋 Checklist:

- [ ] Backend server is running on port 8000
- [ ] Both apps have same `room_id` in localStorage
- [ ] `rooms.current_song_id` is INTEGER type (not UUID)
- [ ] Songs have valid `file_url` in database
- [ ] Queue has songs before clicking play
- [ ] Browser console shows no errors
- [ ] Backend terminal shows playback endpoint called
- [ ] Display-app console shows room polling working

### 🔧 Quick Test:

1. **Clear both apps:**
   ```javascript
   // In both browser consoles:
   localStorage.clear();
   location.reload();
   ```

2. **Select same room in both apps**

3. **In tablet-app:**
   - Add a song to queue
   - Click "Ready to Sing?"

4. **In display-app:**
   - Should automatically play video
   - Check console for logs

### 📞 If Still Not Working:

1. Check browser console errors in both apps
2. Check backend terminal for errors
3. Verify database schema matches requirements
4. Check network tab for failed API calls
5. Verify room_id matches in both apps

