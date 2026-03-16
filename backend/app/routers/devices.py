from fastapi import APIRouter, HTTPException, Depends, Body
from sqlalchemy.orm import Session
from typing import Dict, Any, List
import uuid
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
        
        print(f"Assign room request: device_uuid={device_uuid}, room_id={room_id}")
        
        if not device_uuid:
            raise HTTPException(status_code=400, detail="device_uuid is required")
        if not room_id:
            raise HTTPException(status_code=400, detail="room_id is required")
        
        # Convert room_id string to UUID if needed
        from uuid import UUID as UUIDType
        try:
            room_uuid = UUIDType(room_id) if isinstance(room_id, str) else room_id
        except (ValueError, TypeError) as e:
            print(f"Invalid room_id format: {room_id}, error: {e}")
            raise HTTPException(status_code=400, detail=f"Invalid room_id format: {room_id}. Must be a valid UUID.")
        
        # Find device - if not found, create it (device should have been registered, but handle edge case)
        device = db.query(Device).filter(Device.device_uuid == device_uuid).first()
        if not device:
            # Device doesn't exist - this shouldn't happen if registration worked, but create it anyway
            print(f"Warning: Device {device_uuid} not found in database, creating it...")
            # Try to get device_type from payload or default to tablet
            device_type = payload.get("device_type", "tablet")
            device = Device(
                device_uuid=device_uuid,
                device_type=device_type,
                name=payload.get("name"),
                meta=payload.get("meta")
            )
            db.add(device)
            db.commit()
            db.refresh(device)
            print(f"Created new device: {device.id}")
        else:
            print(f"Found existing device: {device.id}")
        
        # Verify room exists
        room = db.query(Room).filter(Room.id == room_uuid).first()
        if not room:
            # List available rooms for better error message
            available_rooms = db.query(Room).all()
            room_ids = [str(r.id) for r in available_rooms]
            room_names = [r.name or f"Room {i+1}" for i, r in enumerate(available_rooms)]
            print(f"Room {room_id} not found. Available rooms: {list(zip(room_names, room_ids))}")
            raise HTTPException(
                status_code=404, 
                detail=f"Room with id {room_id} not found. Available rooms: {', '.join([f'{name} ({id})' for name, id in zip(room_names, room_ids[:5])])}"
            )
        
        print(f"Found room: {room.id} ({room.name})")
        
        # Check if room is already taken by another device of the same type
        existing_device = db.query(Device).filter(
            Device.room_id == room_uuid,
            Device.device_type == device.device_type,
            Device.device_uuid != device_uuid  # not the same device
        ).first()
        
        if existing_device:
            room_display = room.name or f"Room {room_id[:8]}"
            raise HTTPException(
                status_code=409,
                detail=f"{room_display} is already taken by another {device.device_type} device. Please select a different room."
            )
        
        # Assign room to device
        device.room_id = room_uuid
        db.commit()
        db.refresh(device)
        
        print(f"Successfully assigned device {device_uuid} to room {room_id}")
        
        return {
            "success": True,
            "message": f"Device {device_uuid} assigned to room {room_id}",
            "device": device
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        import traceback
        error_detail = f"Error assigning room: {str(e)}\n{traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(status_code=500, detail=f"Error assigning room: {str(e)}")


@router.put("/{device_id}/assign")
def assign_device_to_room(device_id: str, payload: dict = Body(...), db: Session = Depends(get_db)):
    """Assign a room to a device - alternative endpoint for admin app"""
    try:
        room_id = payload.get("room_id")
        
        # Find device
        device = db.query(Device).filter(Device.id == device_id).first()
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        
        # If room_id is provided, verify it exists
        if room_id:
            try:
                uuid.UUID(room_id)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid room_id format: {room_id}")
            
            room = db.query(Room).filter(Room.id == room_id).first()
            if not room:
                raise HTTPException(status_code=404, detail="Room not found")
        
        # Assign room to device (or unassign if room_id is null)
        device.room_id = room_id if room_id else None
        db.commit()
        db.refresh(device)
        
        print(f"PUT /devices/{device_id}/assign: Device assigned to room {room_id if room_id else 'None'}")
        return {
            "success": True,
            "message": f"Device assigned to room {room_id if room_id else 'unassigned'}",
            "device": device
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error assigning device: {e}")
        raise HTTPException(status_code=500, detail=f"Error assigning device: {str(e)}")


@router.get("/", response_model=List[DeviceResponse])
def list_devices(db: Session = Depends(get_db)):
    """List all devices with room assignments"""
    try:
        devices = db.query(Device).all()
        return devices
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
