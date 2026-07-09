from __future__ import annotations

from typing import Any

from fastapi import WebSocket
from starlette.websockets import WebSocketState


class AdminWebSocketManager:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._clients.discard(websocket)

    async def broadcast(self, message: dict[str, Any]) -> None:
        stale_clients: list[WebSocket] = []

        for websocket in list(self._clients):
            try:
                if websocket.client_state != WebSocketState.CONNECTED:
                    stale_clients.append(websocket)
                    continue
                await websocket.send_json(message)
            except Exception:
                stale_clients.append(websocket)

        for websocket in stale_clients:
            self.disconnect(websocket)


admin_ws_manager = AdminWebSocketManager()
