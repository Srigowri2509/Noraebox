# backend/app/routers/devices.py
from fastapi import APIRouter, HTTPException, Body
from app.supabase_client import supabase
from pydantic import BaseModel
from typing import Optional, Dict, Any

router = APIRouter()

class RegisterPayload(BaseModel):
    device_uuid: str
    device_type: str  # REQUIRED: "tablet" | "display" | "admin"
    name: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None

@router.post("/register")
def register_device(payload: RegisterPayload = Body(...)):
    try:
        # Validate device_type
        if payload.device_type not in ["tablet", "display", "admin"]:
            raise HTTPException(
                status_code=400, 
                detail="device_type must be 'tablet', 'display', or 'admin'"
            )
        
        # Check if device exists
        try:
            r = supabase.table("devices").select("*").eq("device_uuid", payload.device_uuid).single().execute()
            device = r.data
            # Update device_type if it changed
            if device.get("device_type") != payload.device_type:
                supabase.table("devices").update({
                    "device_type": payload.device_type
                }).eq("id", device["id"]).execute()
                device["device_type"] = payload.device_type
            
            if device.get("room_id"):
                return {"assigned": True, "room_id": device["room_id"], "device": device}
            else:
                # return assigned:false and available rooms to pick
                rooms_res = supabase.table("rooms").select("*").execute()
                return {"assigned": False, "rooms": rooms_res.data or [], "device": device}
        except Exception:
            # Device doesn't exist, create it
            pass
        
        # create device
        created = supabase.table("devices").insert({
            "device_uuid": payload.device_uuid,
            "device_type": payload.device_type,
            "name": payload.name,
            "meta": payload.meta
        }).execute()
        
        rooms_res = supabase.table("rooms").select("*").execute()
        return {"assigned": False, "rooms": rooms_res.data or [], "device": created.data[0] if created.data else {}}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Device registration error: {str(e)}")

@router.get("/")
def list_devices():
    try:
        response = supabase.table("devices").select("*, rooms(*)").execute()
        return response.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{device_id}")
def get_device(device_id: str):
    try:
        response = supabase.table("devices").select("*, rooms(*)").eq("id", device_id).single().execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/me")
def get_my_device(device_uuid: str):
    """Get device info by device_uuid"""
    try:
        print(f"GET /devices/me called with device_uuid={device_uuid}")
        response = supabase.table("devices").select("*").eq("device_uuid", device_uuid).single().execute()
        print(f"GET /devices/me response: {response}")
        device = response.data
        print(f"GET /devices/me device data: {device}")
        if not device:
            print(f"GET /devices/me: Device {device_uuid} not found in database")
            raise HTTPException(status_code=404, detail="Device not found")
        result = {
            "device_uuid": device.get("device_uuid"),
            "device_type": device.get("device_type"),
            "room_id": device.get("room_id"),
            "name": device.get("name"),
            "id": device.get("id")
        }
        print(f"GET /devices/me returning: {result}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        error_str = str(e)
        print(f"Error in /devices/me: {error_str}")
        # Check if it's a "0 rows" error from Supabase
        if "0 rows" in error_str or "PGRST116" in error_str:
            print(f"Device {device_uuid} does not exist in database")
            raise HTTPException(status_code=404, detail=f"Device not found: device_uuid={device_uuid}")
        raise HTTPException(status_code=404, detail=f"Device not found: {error_str}")

@router.post("/assign-room")
def assign_room(payload: Dict[str, Any] = Body(...)):
    """Assign device to room with device_type conflict checking"""
    device_uuid = payload.get("device_uuid")
    room_id = payload.get("room_id")
    
    if not device_uuid or not room_id:
        raise HTTPException(status_code=400, detail="device_uuid and room_id are required")
    
    try:
        print(f"POST /devices/assign-room: device_uuid={device_uuid}, room_id={room_id}")
        
        # Get device
        device_res = supabase.table("devices").select("*").eq("device_uuid", device_uuid).single().execute()
        device = device_res.data
        if not device:
            raise HTTPException(status_code=404, detail=f"Device not found: {device_uuid}")
        
        device_type = device.get("device_type")
        print(f"Device {device_uuid} has device_type={device_type}")
        
        if not device_type:
            raise HTTPException(status_code=400, detail="Device does not have device_type set")
        
        # Check for conflicts - ensure no other device of same type in room
        # IMPORTANT: Only check for SAME device_type (tablet vs tablet, display vs display)
        # Different types (tablet vs display) can be in the same room
        existing_res = supabase.table("devices") \
            .select("id, name, device_uuid, device_type") \
            .eq("room_id", room_id) \
            .eq("device_type", device_type) \
            .neq("id", device["id"]) \
            .execute()
        
        print(f"Checking for existing {device_type} devices in room {room_id}: found {len(existing_res.data or [])}")
        
        if existing_res.data and len(existing_res.data) > 0:
            device_name = existing_res.data[0].get("name") or existing_res.data[0].get("device_uuid", "Unknown device")
            print(f"Conflict: Room {room_id} already has a {device_type} device: {device_name}")
            raise HTTPException(
                status_code=400, 
                detail=f"Room already has a {device_type} device assigned: {device_name}"
            )
        
        # Assign room
        updated_res = supabase.table("devices").update({"room_id": room_id}).eq("id", device["id"]).execute()
        print(f"✅ Device {device_uuid} ({device_type}) successfully assigned to room {room_id}")
        return updated_res.data[0] if updated_res.data else {}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in /devices/assign-room: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error assigning room: {str(e)}")

@router.put("/{device_id}/assign")
def assign_device(device_id: str, payload: Dict[str, Any] = Body(...)):
    # payload should have {"room_id": "<uuid>"} or {"room_id": null} to unassign
    room_id = payload.get("room_id")
    
    # If assigning to a room (not unassigning), check if room is already assigned to another device
    if room_id:
        try:
            # Get device to check device_type
            device = supabase.table("devices").select("device_type").eq("id", device_id).single().execute()
            device_type = device["device_type"]
            
            if device_type:
                # Check if any other device of same type is already assigned to this room
                existing_device = supabase.table("devices").select("id, device_uuid, name").eq("room_id", room_id).eq("device_type", device_type).neq("id", device_id).execute()
                
                if existing_device.data and len(existing_device.data) > 0:
                    other_device = existing_device.data[0]
                    device_name = other_device.get("name") or other_device.get("device_uuid", "Unknown device")
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Room already has a {device_type} device assigned: {device_name}"
                    )
        except HTTPException:
            raise
        except Exception as e:
            print(f"Error checking room assignment: {e}")
            # Continue with assignment if check fails (non-critical)
    
    # Allow null/empty string to unassign device
    update_data = {"room_id": room_id if room_id else None}
    try:
        print(f"Assigning device {device_id} to room {room_id or 'None'}")
        response = supabase.table("devices").update(update_data).eq("id", device_id).execute()
        print(f"Device {device_id} assigned successfully")
        return response.data[0] if response.data else {}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
