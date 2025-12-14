# Quick Test Guide - Room Connection & Playback

## ✅ Step 1: Verify Room Connection

### In Browser Console (NOT PowerShell!)

**Open Browser Developer Tools:**
- Press `F12` or `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
- Click the "Console" tab

**In Tablet-App Browser Console:**
```javascript
console.log("Tablet Room ID:", localStorage.getItem("room_id"));
```

**In Display-App Browser Console:**
```javascript
console.log("Display Room ID:", localStorage.getItem("room_id"));
```

**Both should show the SAME room ID!**

---

## ✅ Step 2: Test Playback

1. **In Tablet-App:**
   - Add songs to queue
   - Click "Ready to Sing?" button
   - Check browser console for: `✅ Play command sent to backend`

2. **In Display-App:**
   - Should automatically detect new song
   - Check browser console for: `🎵 Display: New song detected!`
   - Video should start playing

---

## ✅ Step 3: Check Backend

**In Backend Terminal (PowerShell/CMD):**
```bash
# Should see logs like:
POST /rooms/{room_id}/playback/start_next called
Setting current_song_id to: 11 (type: int)
Successfully updated room {room_id} with current_song_id: 11
```

---

## 🔧 If Room IDs Don't Match:

**Clear and Re-select:**

**In Tablet-App Browser Console:**
```javascript
localStorage.clear();
location.reload();
```

**In Display-App Browser Console:**
```javascript
localStorage.clear();
location.reload();
```

Then select the **SAME room** in both apps.

---

## ⚠️ Important: Database Check

**In Supabase SQL Editor, run:**
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'rooms' AND column_name = 'current_song_id';
```

**If data_type is 'uuid', fix it:**
```sql
ALTER TABLE rooms 
ALTER COLUMN current_song_id TYPE INTEGER 
USING current_song_id::text::integer;
```

---

## 📝 Browser Console Commands (Copy-Paste Ready)

### Check Room ID:
```javascript
localStorage.getItem("room_id")
```

### Clear Everything:
```javascript
localStorage.clear(); location.reload();
```

### Check Device UUID:
```javascript
localStorage.getItem("device_uuid")
```

### Check All Storage:
```javascript
Object.keys(localStorage).forEach(key => console.log(key, ":", localStorage.getItem(key)))
```

