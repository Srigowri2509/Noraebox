-- ============================================
-- DISCONNECT DEVICES FROM ROOMS
-- Run this in AWS RDS PostgreSQL (via psql or AWS Console)
-- ============================================

-- 1. Disconnect ALL tablet and display devices from rooms
UPDATE devices
SET room_id = NULL
WHERE device_type IN ('tablet', 'display') AND room_id IS NOT NULL;

-- 2. Optional: Clear active sessions (if you want a clean slate)
UPDATE rooms
SET session_id = NULL, 
    is_active = false
WHERE session_id IS NOT NULL OR is_active = true;

-- 3. Optional: Clear all queues
DELETE FROM queue_items;

-- 4. Verify devices are disconnected
SELECT 
    device_uuid,
    device_type,
    name,
    room_id
FROM devices
WHERE device_type IN ('tablet', 'display')
ORDER BY device_type, name;

-- Expected result: All room_id values should be NULL

