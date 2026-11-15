from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import FoodOrder, Room, RoomSession
from app.schemas import FoodOrderCreate, FoodOrderStatusUpdate
from app.services.admin_ws import admin_ws_manager


router = APIRouter()

MENU_ITEMS = [
    {"id": "veg-burger", "name": "Veg Burger", "description": "Classic vegetable burger", "emoji": "🍔", "price": 200, "category": "Burgers", "supports_seasoning": False},
    {"id": "double-veg-burger", "name": "Double Veg Burger", "description": "Double vegetable patty burger", "emoji": "🍔", "price": 250, "category": "Burgers", "supports_seasoning": False},
    {"id": "aloo-burger", "name": "Aloo Burger", "description": "Crisp potato patty burger", "emoji": "🍔", "price": 200, "category": "Burgers", "supports_seasoning": False},
    {"id": "double-aloo-burger", "name": "Double Aloo Burger", "description": "Double potato patty burger", "emoji": "🍔", "price": 250, "category": "Burgers", "supports_seasoning": False},
    {"id": "paneer-burger", "name": "Paneer Burger", "description": "Paneer patty burger", "emoji": "🍔", "price": 250, "category": "Burgers", "supports_seasoning": False},
    {"id": "french-fries", "name": "French Fries", "description": "Long, crisp golden fries", "emoji": "🍟", "price": 140, "category": "Snacks", "supports_seasoning": True},
    {"id": "garlic-potato-shots", "name": "Garlic Potato Shots", "description": "Potato bites with garlic and herbs", "emoji": "🥔", "price": 140, "category": "Snacks", "supports_seasoning": True},
    {"id": "cheese-balls", "name": "Cheese Balls", "description": "Crisp bites with a cheesy centre", "emoji": "🧀", "price": 170, "category": "Snacks", "supports_seasoning": True},
    {"id": "veg-nuggets", "name": "Veg Nuggets", "description": "Crisp vegetable nuggets", "emoji": "🟤", "price": 170, "category": "Snacks", "supports_seasoning": True},
    {"id": "paneer-sticks", "name": "Paneer Sticks", "description": "Crisp golden paneer sticks", "emoji": "🥢", "price": 190, "category": "Snacks", "supports_seasoning": True},
]

SEASONINGS = [
    {"id": "classic-salt", "name": "Classic Salt", "price": 0},
    {"id": "peri-peri", "name": "Peri Peri", "price": 0},
    {"id": "cheese-loaded", "name": "Cheese Drizzle", "price": 0},
]

DIPS = [
    {"id": "ketchup", "name": "Ketchup", "emoji": "🥫", "price": 0},
    {"id": "mayonnaise", "name": "Mayonnaise", "emoji": "🥣", "price": 0},
    {"id": "cheese-dip", "name": "Cheese Dip", "emoji": "🧀", "price": 0},
]

DRINKS = [
    {"id": "coke", "name": "Coke", "emoji": "🥤", "price": 50},
    {"id": "diet-coke", "name": "Diet Coke", "emoji": "🥤", "price": 60},
    {"id": "sprite", "name": "Sprite", "emoji": "🥤", "price": 50},
    {"id": "thums-up", "name": "Thums Up", "emoji": "🥤", "price": 50},
]

ITEM_BY_ID = {item["id"]: item for item in MENU_ITEMS}
DIP_BY_ID = {item["id"]: item for item in DIPS}
DRINK_BY_ID = {item["id"]: item for item in DRINKS}
SEASONING_BY_ID = {item["id"]: item for item in SEASONINGS}
ACTIVE_STATUSES = {"pending", "preparing"}
ALL_STATUSES = ACTIVE_STATUSES | {"served", "cancelled"}


def serialize_order(order: FoodOrder, room_name: Optional[str] = None) -> dict:
    return {
        "id": str(order.id),
        "room_id": str(order.room_id),
        "room_name": room_name or (order.room.name if order.room else None),
        "session_id": str(order.session_id) if order.session_id else None,
        "items": order.items or [],
        "total_amount": int(order.total_amount or 0),
        "notes": order.notes or "",
        "status": order.status,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "updated_at": order.updated_at.isoformat() if order.updated_at else None,
    }


@router.get("/menu")
def get_food_menu():
    return {"items": MENU_ITEMS, "seasonings": SEASONINGS, "dips": DIPS, "drinks": DRINKS}


@router.post("/orders")
async def create_food_order(payload: FoodOrderCreate, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == payload.room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    session = db.query(RoomSession).filter(
        RoomSession.room_id == payload.room_id,
        RoomSession.status == "active",
    ).order_by(RoomSession.session_created_at.desc()).first()
    if not session:
        raise HTTPException(status_code=409, detail="Food can be ordered only during an active session")

    normalized_items = []
    total = 0
    for line in payload.items:
        quantity = max(0, min(20, int(line.quantity or 0)))
        if quantity == 0:
            continue

        menu_item = ITEM_BY_ID.get(line.item_id)
        dip = DIP_BY_ID.get(line.item_id)
        drink = DRINK_BY_ID.get(line.item_id)
        if not menu_item and not dip and not drink:
            raise HTTPException(status_code=400, detail=f"Unknown menu item: {line.item_id}")

        source = menu_item or dip or drink
        seasoning = None
        seasoning_price = 0
        if menu_item and menu_item.get("supports_seasoning"):
            seasoning = SEASONING_BY_ID.get(line.seasoning_id or "classic-salt")
            if not seasoning:
                raise HTTPException(status_code=400, detail="Invalid seasoning")
            seasoning_price = int(seasoning["price"])

        unit_price = int(source["price"]) + seasoning_price
        total += unit_price * quantity
        normalized_items.append({
            "item_id": source["id"],
            "name": source["name"],
            "quantity": quantity,
            "unit_price": unit_price,
            "seasoning_id": seasoning["id"] if seasoning else None,
            "seasoning_name": seasoning["name"] if seasoning else None,
            "kind": "food" if menu_item else ("dip" if dip else "drink"),
        })

    if not normalized_items:
        raise HTTPException(status_code=400, detail="Add at least one menu item")

    order = FoodOrder(
        room_id=payload.room_id,
        session_id=session.id,
        items=normalized_items,
        total_amount=total,
        notes=(payload.notes or "").strip()[:500] or None,
        status="preparing",
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    result = serialize_order(order, room.name)
    await admin_ws_manager.broadcast({"type": "food_order_created", "order": result})
    return {"status": "created", "order": result}


@router.get("/orders")
def list_food_orders(
    active_only: bool = Query(default=True),
    room_id: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = db.query(FoodOrder).order_by(FoodOrder.created_at.desc())
    if active_only:
        query = query.filter(FoodOrder.status.in_(ACTIVE_STATUSES))
    if room_id:
        query = query.filter(FoodOrder.room_id == room_id)
    orders = query.limit(limit).all()
    return {"orders": [serialize_order(order) for order in orders]}


@router.get("/orders/{order_id}")
def get_food_order(order_id: str, db: Session = Depends(get_db)):
    order = db.query(FoodOrder).filter(FoodOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Food order not found")
    return {"order": serialize_order(order)}


@router.patch("/orders/{order_id}")
async def update_food_order_status(
    order_id: str,
    payload: FoodOrderStatusUpdate,
    db: Session = Depends(get_db),
):
    status = payload.status.strip().lower()
    if status not in ALL_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid order status")

    order = db.query(FoodOrder).filter(FoodOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Food order not found")

    order.status = status
    order.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(order)
    result = serialize_order(order)
    await admin_ws_manager.broadcast({"type": "food_order_updated", "order": result})
    return {"status": "updated", "order": result}
