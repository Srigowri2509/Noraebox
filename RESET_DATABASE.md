# Database Reset Guide

## What to Remove/Reset in Database

To disconnect all devices and clear all sessions, run these SQL commands in Supabase:

### 1. Disconnect All Devices from Rooms

```sql
-- Clear room assignments from all devices
UPDATE devices 
SET room_id = NULL 
WHERE room_id IS NOT NULL;
```

This will:
- Disconnect all tablets from rooms
- Disconnect all displays from rooms
- Apps will show room selection on next load

### 2. Clear All Active Sessions

```sql
-- Clear session_id from all rooms
UPDATE rooms 
SET session_id = NULL, 
    is_active = false 
WHERE session_id IS NOT NULL OR is_active = true;
```

This will:
- Unlink all sessions from rooms
- Mark all rooms as inactive
- Rooms will show as "FREE" in admin-app

### 3. Clear All Room Sessions (Optional - if you want to delete session history)

```sql
-- Delete all room_sessions (optional - only if you want to clear history)
DELETE FROM room_sessions;
```

**OR** if you want to keep history but just mark them as finished:

```sql
-- Mark all sessions as finished
UPDATE room_sessions 
SET status = 'finished',
    session_end_time = NOW()
WHERE status != 'finished';
```

### 4. Clear All Queues (Optional)

```sql
-- Clear all song queues
DELETE FROM queue_items;
```

### 5. Reset Room Playback State (Optional)

```sql
-- Clear any remaining playback state in rooms table
UPDATE rooms 
SET current_song_id = NULL,
    current_song_start_time = NULL,
    queue = '[]'::jsonb
WHERE current_song_id IS NOT NULL 
   OR current_song_start_time IS NOT NULL
   OR queue != '[]'::jsonb;
```

---

## Complete Reset (All at Once)

If you want to reset everything, run this:

```sql
-- 1. Disconnect all devices
UPDATE devices SET room_id = NULL WHERE room_id IS NOT NULL;

-- 2. Clear all room sessions
UPDATE rooms SET session_id = NULL, is_active = false WHERE session_id IS NOT NULL OR is_active = true;

-- 3. Mark all sessions as finished
UPDATE room_sessions SET status = 'finished', session_end_time = NOW() WHERE status != 'finished';

-- 4. Clear all queues
DELETE FROM queue_items;

-- 5. Clear playback state
UPDATE rooms SET current_song_id = NULL, current_song_start_time = NULL, queue = '[]'::jsonb;
```

---

## After Database Reset

1. **Refresh both apps** (tablet-app and display-app)
2. **They should show room selection modal** (since devices are no longer assigned)
3. **Admin-app should show all rooms as "FREE"**

---

## What Each Table Stores

- **devices**: Device-to-room assignments (`room_id` field)
- **rooms**: Room state and session link (`session_id`, `is_active`, `current_song_id`)
- **room_sessions**: Active/finished sessions (timer, playback state)
- **queue_items**: Song queues for each room
- **playback_events**: History of playback events (optional to keep)

---

## Quick Check Queries

Check current state:

```sql
-- See which devices are assigned to rooms
SELECT id, device_uuid, device_type, room_id FROM devices WHERE room_id IS NOT NULL;

-- See which rooms have active sessions
SELECT id, name, is_active, session_id FROM rooms WHERE is_active = true OR session_id IS NOT NULL;

-- See active sessions
SELECT id, room_id, status, session_start_time FROM room_sessions WHERE status != 'finished';

-- See queues
SELECT room_id, COUNT(*) as queue_length FROM queue_items GROUP BY room_id;
```

