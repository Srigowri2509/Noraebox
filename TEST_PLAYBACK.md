# Test Playback Connection - Step by Step

## ✅ Database Schema: CORRECT
- `rooms.current_song_id` is INTEGER ✓

## 🔍 Debugging Steps:

### Step 1: Verify Both Apps Are Running
- Tablet-app: http://localhost:5175
- Display-app: http://localhost:5176
- Backend: http://localhost:8000

### Step 2: Check Room IDs Match

**In Tablet-App Browser Console (F12):**
```javascript
localStorage.getItem("room_id")
```

**In Display-App Browser Console (F12):**
```javascript
localStorage.getItem("room_id")
```

**They MUST be the same!**

### Step 3: Test Playback Flow

1. **In Tablet-App:**
   - Add at least one song to queue
   - Click "Ready to Sing?" button
   - **Check Console** - Should see:
     ```
     ✅ Play command sent to backend
     POST /rooms/{room_id}/playback/start_next
     ```

2. **In Backend Terminal:**
   - Should see:
     ```
     POST /rooms/{room_id}/playback/start_next called
     Setting current_song_id to: {song_id} (type: int)
     Successfully updated room {room_id} with current_song_id: {song_id}
     ```

3. **In Display-App:**
   - **Check Console** - Should see (within 2 seconds):
     ```
     Display polling room status for room: {room_id}
     Room data: { current_song_id: {song_id}, ... }
     🎵 Display: New song detected! Song ID: {song_id}
     🎵 Display: Song data fetched: {...}
     ✅ Display: New song loaded: {song_title} Video URL: {url}
     ```

### Step 4: Verify Database

**In Supabase SQL Editor:**
```sql
SELECT id, name, current_song_id, status, is_active 
FROM rooms 
WHERE id = 'your-room-id-here';
```

**After clicking play, should show:**
- `current_song_id`: integer (e.g., 11)
- `status`: "playing"
- `is_active`: true

### Step 5: Check for Errors

**Common Issues:**

1. **"Cannot connect to backend"**
   - Start backend: `cd backend && uvicorn app.main:app --reload`

2. **"Room ID mismatch"**
   - Clear localStorage in both apps
   - Select same room in both

3. **"Queue is empty"**
   - Add songs to queue before clicking play

4. **"No file_url"**
   - Check songs table has valid `file_url` values

5. **"Video doesn't play"**
   - Check `file_url` is accessible
   - Check browser console for video errors
   - Verify video format is supported

### Step 6: Manual Test

**In Tablet-App Browser Console:**
```javascript
// Check current room
const roomId = localStorage.getItem("room_id");
console.log("Room ID:", roomId);

// Check queue
fetch(`http://localhost:8000/rooms/${roomId}/queue`)
  .then(r => r.json())
  .then(data => console.log("Queue:", data));
```

**In Display-App Browser Console:**
```javascript
// Check current room
const roomId = localStorage.getItem("room_id");
console.log("Room ID:", roomId);

// Check room status
fetch(`http://localhost:8000/rooms/${roomId}`)
  .then(r => r.json())
  .then(data => console.log("Room Status:", {
    current_song_id: data.current_song_id,
    status: data.status,
    is_active: data.is_active
  }));
```

## 🎯 Expected Flow:

1. Tablet-app: Click "Ready to Sing?"
2. Backend: Sets `rooms.current_song_id = {song_id}`
3. Display-app: Polls every 2 seconds, detects change
4. Display-app: Fetches song details
5. Display-app: Plays video from `file_url`

## 📞 If Still Not Working:

1. Share browser console logs from both apps
2. Share backend terminal output
3. Share the result of the SQL query above
4. Check network tab for failed API calls

