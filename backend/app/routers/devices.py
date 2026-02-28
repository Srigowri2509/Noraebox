from fastapi import APIRouter, HTTPException, Depends, Body
from sqlalchemy.orm import Session
from typing import Dict, Any, List
from app.db import get_db
from app.models import Device, Room
from app.schemas import DeviceCreate, DeviceResponse, RoomResponse

router = APIRouter()


@router.post("/register")
def register_device(payload: DeviceCreate = Body(...), db: Session = Depends(get_db)):
    """Register a device (tablet/display/admin)"""
    try:
        # Validate device_type
        if payload.device_type not in ["tablet", "display", "admin"]:
            raise HTTPException(
                status_code=400,
                detail="device_type must be 'tablet', 'display', or 'admin'"
            )
        
        # Check if device exists
        device = db.query(Device).filter(Device.device_uuid == payload.device_uuid).first()
        
        if device:
            # Update device_type if it changed
            if device.device_type != payload.device_type:
                device.device_type = payload.device_type
                db.commit()
                db.refresh(device)
            
            if device.room_id:
                return {"assigned": True, "room_id": device.room_id, "device": device}
            else:
                # Return assigned:false and available rooms to pick
                rooms = db.query(Room).all()
                return {"assigned": False, "rooms": rooms, "device": device}
        
        # Create new device
        new_device = Device(
            device_uuid=payload.device_uuid,
            device_type=payload.device_type,
            name=payload.name,
            meta=payload.meta
        )
        db.add(new_device)
        db.commit()
        db.refresh(new_device)
        
        rooms = db.query(Room).all()
        return {"assigned": False, "rooms": rooms, "device": new_device}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Device registration error: {str(e)}")


@router.post("/assign-room")
def assign_room_to_device(
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """Assign a room to a device"""
    try:
        device_uuid = payload.get("device_uuid")
        room_id = payload.get("room_id")
        
        if not device_uuid:
            raise HTTPException(status_code=400, detail="device_uuid is required")
        if not room_id:
            raise HTTPException(status_code=400, detail="room_id is required")
        
        # Find device
        device = db.query(Device).filter(Device.device_uuid == device_uuid).first()
        if not device:
            raise HTTPException(status_code=404, detail=f"Device with uuid {device_uuid} not found")
        
        # Verify room exists
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail=f"Room with id {room_id} not found")
        
        # Check if another device already has this room assigned (optional - allow multiple devices per room)
        # For now, we'll allow multiple devices per room (tablet + display can share)
        
        # Assign room to device
        device.room_id = room_id
        db.commit()
        db.refresh(device)
        
        return {
            "success": True,
            "message": f"Device {device_uuid} assigned to room {room_id}",
            "device": device
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error assigning room: {str(e)}")


@router.get("/", response_model=List[DeviceResponse])
def list_devices(db: Session = Depends(get_db)):
    """List all devices with room assignments"""
    try:
        devices = db.query(Device).all()
        return devices
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
