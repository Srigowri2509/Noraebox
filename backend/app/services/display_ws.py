from __future__ import annotations

from collections import defaultdict
from typing import Any

from fastapi import WebSocket
from starlette.websockets import WebSocketState


class DisplayWebSocketManager:
    def __init__(self) -> None:
        self._clients: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, room_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients[str(room_id)].add(websocket)

    def disconnect(self, room_id: str, websocket: WebSocket) -> None:
        clients = self._clients.get(str(room_id))
        if not clients:
            return
        clients.discard(websocket)
        if not clients:
            self._clients.pop(str(room_id), None)

    async def broadcast(self, room_id: str, message: dict[str, Any]) -> int:
        room_key = str(room_id)
        stale_clients: list[WebSocket] = []
        delivered = 0

        for websocket in list(self._clients.get(room_key, set())):
            try:
                if websocket.client_state != WebSocketState.CONNECTED:
                    stale_clients.append(websocket)
                    continue
                await websocket.send_json(message)
                delivered += 1
            except Exception:
                stale_clients.append(websocket)

        for websocket in stale_clients:
            self.disconnect(room_key, websocket)

        return delivered


display_ws_manager = DisplayWebSocketManager()
