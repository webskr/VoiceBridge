"""
VoiceBridge - LAN HTTP & WebSocket Server
Runs an async HTTP and WebSocket server on the local network.
Serves the web application, pairing endpoint, QR code, real-time voice typing,
chunked large clipboard transfer, transfer history, and Windows startup management.
"""

import os
import json
import asyncio
import io
import time
import logging
from aiohttp import web, WSMsgType
import qrcode

try:
    from agent.keyboard import WindowsKeyboard
    from agent.sync import DocumentSyncEngine
    from agent.security import SecurityManager
    from agent.transfer import TransferManager
    from agent.clipboard import set_clipboard_text, copy_and_paste_text
    from agent.startup import is_startup_enabled, enable_startup, disable_startup
except ImportError:
    from keyboard import WindowsKeyboard
    from sync import DocumentSyncEngine
    from security import SecurityManager
    from transfer import TransferManager
    from clipboard import set_clipboard_text, copy_and_paste_text
    from startup import is_startup_enabled, enable_startup, disable_startup

logger = logging.getLogger("VoiceBridge.Server")

class VoiceBridgeServer:
    def __init__(self, host: str, port: int, keyboard: WindowsKeyboard, sync_engine: DocumentSyncEngine, security: SecurityManager, web_dist_dir: str):
        self.host = host
        self.port = port
        self.keyboard = keyboard
        self.sync_engine = sync_engine
        self.security = security
        self.transfer_mgr = TransferManager()
        self.web_dist_dir = web_dist_dir
        
        # Connected WebSockets
        self.mobile_ws = None
        self.companion_ws_set = set()
        
        self.app = web.Application()
        self.setup_routes()

    def get_pairing_url(self) -> str:
        return f"http://{self.host}:{self.port}/?pin={self.security.active_pin}"

    def setup_routes(self):
        # API routes
        self.app.router.add_get('/status', self.handle_status)
        self.app.router.add_get('/qr', self.handle_qr_image)
        self.app.router.add_get('/api/history', self.handle_get_history)
        self.app.router.add_get('/api/history/item', self.handle_get_history_item)
        self.app.router.add_post('/api/history/copy', self.handle_copy_history)
        self.app.router.add_post('/api/history/inject', self.handle_inject_history)
        self.app.router.add_get('/api/voice/get', self.handle_get_voice)
        self.app.router.add_post('/api/voice/reset', self.handle_reset_voice)
        self.app.router.add_post('/api/type', self.handle_direct_type)
        self.app.router.add_post('/api/clipboard', self.handle_direct_clipboard)
        self.app.router.add_get('/api/startup', self.handle_get_startup)
        self.app.router.add_post('/api/startup', self.handle_set_startup)

        # MCP Streamable HTTP Endpoint
        self.app.router.add_post('/mcp', self.handle_mcp_http)
        self.app.router.add_get('/mcp', self.handle_mcp_http_get)

        # WebSocket
        self.app.router.add_get('/ws', self.handle_websocket)
        
        # Check if pre-built frontend exists
        if os.path.exists(self.web_dist_dir) and os.path.isdir(self.web_dist_dir):
            logger.info(f"Serving frontend from {self.web_dist_dir}")
            self.app.router.add_static('/assets', path=os.path.join(self.web_dist_dir, 'assets'), name='assets')
            self.app.router.add_get('/', self.handle_index)
            self.app.router.add_get('/companion', self.handle_index)
        else:
            logger.info("web/dist not found yet, serving built-in lightweight landing page.")
            self.app.router.add_get('/', self.handle_builtin_page)
            self.app.router.add_get('/companion', self.handle_builtin_page)

    async def handle_index(self, request):
        index_file = os.path.join(self.web_dist_dir, 'index.html')
        if os.path.exists(index_file):
            return web.FileResponse(index_file)
        return await self.handle_builtin_page(request)

    async def handle_builtin_page(self, request):
        html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>VoiceBridge</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; text-align: center; padding: 2rem; margin: 0; }}
        .card {{ background: #1e293b; max-width: 450px; margin: 2rem auto; padding: 2rem; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }}
        h1 {{ margin-top: 0; color: #38bdf8; font-size: 1.8rem; }}
        .pin {{ font-size: 2.2rem; font-weight: bold; letter-spacing: 4px; color: #f43f5e; margin: 1rem 0; background: #0f172a; padding: 0.5rem 1rem; border-radius: 8px; display: inline-block; }}
        img.qr {{ border-radius: 12px; margin: 1rem 0; max-width: 240px; background: white; padding: 10px; }}
        p {{ color: #94a3b8; line-height: 1.5; }}
        .btn {{ background: #38bdf8; color: #0f172a; border: none; padding: 0.8rem 1.5rem; font-size: 1rem; font-weight: 600; border-radius: 8px; cursor: pointer; text-decoration: none; display: inline-block; margin-top: 1rem; }}
    </style>
</head>
<body>
    <div class="card">
        <h1>VoiceBridge Agent</h1>
        <p>Scan with your mobile phone camera or enter PIN:</p>
        <div class="pin">{self.security.active_pin}</div>
        <div>
            <img class="qr" src="/qr" alt="Pairing QR Code" />
        </div>
        <p>Endpoint: <code>http://{self.host}:{self.port}</code></p>
        <a class="btn" href="/companion">Open PC Companion</a>
    </div>
</body>
</html>"""
        return web.Response(text=html, content_type='text/html')

    async def handle_status(self, request):
        return web.json_response({
            "service": "VoiceBridge Windows Agent",
            "version": "1.1.0",
            "host": self.host,
            "port": self.port,
            "pin": self.security.active_pin,
            "active_mobile": self.mobile_ws is not None and not self.mobile_ws.closed,
            "connected_companions": len(self.companion_ws_set),
            "paused": self.keyboard.is_paused,
            "canonical_length": len(self.sync_engine.canonical_text),
            "canonical_text": self.sync_engine.canonical_text,
            "startup_enabled": is_startup_enabled(),
            "history_count": len(self.transfer_mgr.history)
        })

    async def handle_get_voice(self, request):
        return web.json_response({
            "text": self.sync_engine.canonical_text,
            "length": len(self.sync_engine.canonical_text),
            "revision": self.sync_engine.last_revision
        })

    async def handle_reset_voice(self, request):
        self.sync_engine.reset()
        await self.broadcast_to_companions({
            "type": "doc_update",
            "text": "",
            "revision": 0,
            "is_final": True
        })
        return web.json_response({"success": True})

    async def handle_get_history_item(self, request):
        item_id = request.query.get("id")
        if not item_id:
            return web.json_response({"success": False, "error": "Missing id parameter"}, status=400)
        text = self.transfer_mgr.get_history_item_full_text(item_id)
        if text is not None:
            return web.json_response({"id": item_id, "text": text})
        return web.json_response({"success": False, "error": "Item not found"}, status=404)

    async def handle_direct_type(self, request):
        try:
            body = await request.json()
            text = body.get("text", "")
            if text:
                success = self.keyboard.send_string_sync(text)
                return web.json_response({"success": success})
            return web.json_response({"success": False, "error": "No text provided"}, status=400)
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    async def handle_direct_clipboard(self, request):
        try:
            body = await request.json()
            text = body.get("text", "")
            auto_paste = body.get("auto_paste", False)
            if text:
                success = copy_and_paste_text(text, auto_paste=auto_paste)
                return web.json_response({"success": success})
            return web.json_response({"success": False, "error": "No text provided"}, status=400)
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    async def handle_mcp_http(self, request):
        try:
            msg = await request.json()
            method = msg.get("method")
            req_id = msg.get("id")

            if method == "initialize":
                resp = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {"tools": {}},
                        "serverInfo": {
                            "name": "voicebridge-mcp",
                            "version": "1.1.0"
                        }
                    }
                }
                return web.json_response(resp)

            elif method == "notifications/initialized":
                return web.Response(status=204)

            elif method == "ping":
                return web.json_response({"jsonrpc": "2.0", "id": req_id, "result": {}})

            elif method == "tools/list":
                tools = [
                    {
                        "name": "voicebridge_status",
                        "description": "Check VoiceBridge connection status, active mobile pairing, PIN, and local IP.",
                        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}
                    },
                    {
                        "name": "voicebridge_get_live_voice",
                        "description": "Get current live text dictated from phone voice typing (Gboard microphone).",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "reset_after_read": {"type": "boolean", "description": "Clear voice buffer after read."}
                            },
                            "additionalProperties": False
                        }
                    },
                    {
                        "name": "voicebridge_get_clipboard_transfers",
                        "description": "List clipboard transfers or fetch full content of a 3000+ line transfer.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "transfer_id": {"type": "string", "description": "Optional transfer ID."}
                            },
                            "additionalProperties": False
                        }
                    },
                    {
                        "name": "voicebridge_type_text",
                        "description": "Type text directly into active Windows cursor using SendInput.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {"text": {"type": "string"}},
                            "required": ["text"],
                            "additionalProperties": False
                        }
                    },
                    {
                        "name": "voicebridge_set_clipboard",
                        "description": "Copy text to Windows clipboard with optional Ctrl+V auto-paste.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "text": {"type": "string"},
                                "auto_paste": {"type": "boolean"}
                            },
                            "required": ["text"],
                            "additionalProperties": False
                        }
                    }
                ]
                return web.json_response({"jsonrpc": "2.0", "id": req_id, "result": {"tools": tools}})

            elif method == "tools/call":
                params = msg.get("params", {})
                name = params.get("name")
                arguments = params.get("arguments", {})

                if name == "voicebridge_status":
                    status_data = {
                        "service": "VoiceBridge Windows Agent",
                        "version": "1.1.0",
                        "host": self.host,
                        "port": self.port,
                        "pin": self.security.active_pin,
                        "active_mobile": self.mobile_ws is not None and not self.mobile_ws.closed,
                        "canonical_length": len(self.sync_engine.canonical_text)
                    }
                    content = [{"type": "text", "text": json.dumps(status_data, indent=2)}]
                    return web.json_response({"jsonrpc": "2.0", "id": req_id, "result": {"content": content, "isError": False}})

                elif name == "voicebridge_get_live_voice":
                    text = self.sync_engine.canonical_text
                    if arguments.get("reset_after_read", False) and text:
                        self.sync_engine.reset()
                    content = [{"type": "text", "text": text or "(No voice text dictated yet)"}]
                    return web.json_response({"jsonrpc": "2.0", "id": req_id, "result": {"content": content, "isError": False}})

                elif name == "voicebridge_get_clipboard_transfers":
                    transfer_id = arguments.get("transfer_id")
                    if transfer_id:
                        text = self.transfer_mgr.get_history_item_full_text(transfer_id)
                        content = [{"type": "text", "text": text or f"Transfer '{transfer_id}' not found."}]
                        return web.json_response({"jsonrpc": "2.0", "id": req_id, "result": {"content": content, "isError": not bool(text)}})
                    else:
                        history = self.transfer_mgr.get_history()
                        content = [{"type": "text", "text": json.dumps(history, indent=2)}]
                        return web.json_response({"jsonrpc": "2.0", "id": req_id, "result": {"content": content, "isError": False}})

                elif name == "voicebridge_type_text":
                    text = arguments.get("text", "")
                    success = self.keyboard.send_string_sync(text) if text else False
                    content = [{"type": "text", "text": f"Injected {len(text)} chars." if success else "Failed to inject."}]
                    return web.json_response({"jsonrpc": "2.0", "id": req_id, "result": {"content": content, "isError": not success}})

                elif name == "voicebridge_set_clipboard":
                    text = arguments.get("text", "")
                    auto_paste = arguments.get("auto_paste", False)
                    success = copy_and_paste_text(text, auto_paste=auto_paste) if text else False
                    content = [{"type": "text", "text": f"Copied {len(text)} chars." if success else "Failed to copy."}]
                    return web.json_response({"jsonrpc": "2.0", "id": req_id, "result": {"content": content, "isError": not success}})

                return web.json_response({"jsonrpc": "2.0", "id": req_id, "result": {"content": [{"type": "text", "text": f"Unknown tool: {name}"}], "isError": True}})

            return web.json_response({"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": "Method not found"}})
        except Exception as e:
            return web.json_response({"jsonrpc": "2.0", "error": {"code": -32603, "message": str(e)}}, status=500)

    async def handle_mcp_http_get(self, request):
        return web.json_response({
            "service": "VoiceBridge MCP Streamable HTTP Endpoint",
            "protocol": "Model Context Protocol (MCP)",
            "endpoint": f"http://{self.host}:{self.port}/mcp",
            "status": "ready"
        })

    async def handle_qr_image(self, request):
        pairing_url = self.get_pairing_url()
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=8,
            border=2,
        )
        qr.add_data(pairing_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#0f172a", back_color="#ffffff")
        
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        return web.Response(body=buf.getvalue(), content_type='image/png')

    async def handle_get_history(self, request):
        return web.json_response(self.transfer_mgr.get_history())

    async def handle_copy_history(self, request):
        try:
            body = await request.json()
            item_id = body.get("id")
            text = self.transfer_mgr.get_history_item_full_text(item_id)
            if text:
                success = set_clipboard_text(text)
                return web.json_response({"success": success})
            return web.json_response({"success": False, "error": "Item not found"}, status=404)
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    async def handle_inject_history(self, request):
        try:
            body = await request.json()
            item_id = body.get("id")
            text = self.transfer_mgr.get_history_item_full_text(item_id)
            if text:
                # Small delay to allow user to switch focus if needed
                delay = body.get("delay", 0)
                if delay > 0:
                    await asyncio.sleep(delay)
                success = copy_and_paste_text(text, auto_paste=True)
                return web.json_response({"success": success})
            return web.json_response({"success": False, "error": "Item not found"}, status=404)
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    async def handle_get_startup(self, request):
        return web.json_response({"enabled": is_startup_enabled()})

    async def handle_set_startup(self, request):
        try:
            body = await request.json()
            enable = body.get("enable", False)
            if enable:
                success = enable_startup()
            else:
                success = disable_startup()
            return web.json_response({"success": success, "enabled": is_startup_enabled()})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    async def broadcast_to_companions(self, message: dict):
        dead_ws = set()
        for ws in self.companion_ws_set:
            if ws.closed:
                dead_ws.add(ws)
            else:
                try:
                    await ws.send_json(message)
                except Exception as e:
                    logger.warning(f"Error broadcasting to companion: {e}")
                    dead_ws.add(ws)
        self.companion_ws_set -= dead_ws

    async def handle_websocket(self, request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        
        client_ip = request.remote or "Unknown"
        is_mobile = False
        is_companion = False
        current_token = None

        logger.info(f"WebSocket client connected from {client_ip}")

        try:
            async for msg in ws:
                if msg.type == WSMsgType.TEXT:
                    try:
                        data = json.loads(msg.data)
                    except json.JSONDecodeError:
                        await ws.send_json({"type": "error", "message": "Invalid JSON"})
                        continue

                    msg_type = data.get("type")

                    # Handle Pairing Request
                    if msg_type == "pair_request":
                        candidate_pin = data.get("pin", "")
                        device_info = data.get("deviceInfo", "Mobile Device")
                        if self.security.is_pin_valid(candidate_pin):
                            token = self.security.create_session(device_info=device_info, client_ip=client_ip)
                            current_token = token
                            is_mobile = True
                            self.mobile_ws = ws
                            
                            self.sync_engine.reset()
                            
                            await ws.send_json({
                                "type": "pair_success",
                                "sessionToken": token,
                                "deviceInfo": device_info,
                                "message": "Paired successfully with Windows Agent"
                            })
                            logger.info(f"Mobile device successfully paired: {device_info} ({client_ip})")
                            
                            await self.broadcast_to_companions({
                                "type": "device_paired",
                                "deviceInfo": device_info,
                                "clientIp": client_ip,
                                "status": "connected"
                            })
                        else:
                            await ws.send_json({
                                "type": "pair_error",
                                "message": "Invalid or expired pairing PIN"
                            })

                    # Handle PC Companion Registration
                    elif msg_type == "companion_connect":
                        is_companion = True
                        self.companion_ws_set.add(ws)
                        logger.info(f"Registered PC companion view from {client_ip}")
                        await ws.send_json({
                            "type": "companion_init",
                            "status": "ready",
                            "hasMobile": self.mobile_ws is not None and not self.mobile_ws.closed,
                            "canonicalText": self.sync_engine.canonical_text,
                            "paused": self.keyboard.is_paused,
                            "startupEnabled": is_startup_enabled(),
                            "history": self.transfer_mgr.get_history(),
                            "pin": self.security.active_pin,
                            "pairingUrl": self.get_pairing_url()
                        })

                    # Handle Live Voice/Text Update from Mobile
                    elif msg_type == "text_update":
                        token = data.get("token") or current_token
                        if not self.security.validate_session(token):
                            await ws.send_json({"type": "auth_error", "message": "Unauthorized or expired session"})
                            continue

                        if not self.security.check_rate_limit(client_ip):
                            logger.warning(f"Rate limit exceeded for {client_ip}")
                            continue

                        text = data.get("text", "")
                        revision = data.get("revision", 0)
                        is_final = data.get("isFinal", False)

                        res = self.sync_engine.apply_update(
                            new_text=text,
                            revision=revision,
                            is_final=is_final,
                            inject=not self.keyboard.is_paused
                        )

                        await self.broadcast_to_companions({
                            "type": "live_sync",
                            "text": text,
                            "revision": revision,
                            "isFinal": is_final,
                            "diff": {
                                "deleted": res.get("delete_count", 0),
                                "inserted": res.get("inserted_len", 0)
                            }
                        })

                        await ws.send_json({
                            "type": "ack",
                            "revision": revision,
                            "applied": res.get("applied", False)
                        })

                    # Handle Chunked Large Clipboard Transfer: START
                    elif msg_type == "transfer_start":
                        token = data.get("token") or current_token
                        if not self.security.validate_session(token):
                            await ws.send_json({"type": "auth_error", "message": "Unauthorized session"})
                            continue

                        transfer_id = data.get("transferId")
                        total_chunks = data.get("totalChunks", 1)
                        total_bytes = data.get("totalBytes", 0)
                        total_lines = data.get("totalLines", 1)
                        auto_paste = data.get("autoPaste", True)

                        progress = self.transfer_mgr.start_transfer(
                            transfer_id=transfer_id,
                            total_chunks=total_chunks,
                            total_bytes=total_bytes,
                            total_lines=total_lines,
                            auto_paste=auto_paste
                        )

                        # Acknowledge start to mobile
                        await ws.send_json({
                            "type": "transfer_start_ack",
                            "transferId": transfer_id,
                            "status": "ready"
                        })

                        # Broadcast to PC Companion
                        await self.broadcast_to_companions({
                            "type": "transfer_progress",
                            **progress
                        })

                    # Handle Chunked Large Clipboard Transfer: CHUNK
                    elif msg_type == "transfer_chunk":
                        token = data.get("token") or current_token
                        if not self.security.validate_session(token):
                            await ws.send_json({"type": "auth_error", "message": "Unauthorized session"})
                            continue

                        transfer_id = data.get("transferId")
                        chunk_index = data.get("chunkIndex")
                        chunk_data = data.get("data", "")
                        checksum = data.get("checksum")

                        accepted, is_complete, progress = self.transfer_mgr.receive_chunk(
                            transfer_id=transfer_id,
                            chunk_index=chunk_index,
                            data=chunk_data,
                            checksum=checksum
                        )

                        # Send ACK to mobile so it knows this chunk was securely saved
                        await ws.send_json({
                            "type": "chunk_ack",
                            "transferId": transfer_id,
                            "chunkIndex": chunk_index,
                            "accepted": accepted,
                            "isComplete": is_complete,
                            "receivedChunks": progress.get("receivedChunks", 0),
                            "totalChunks": progress.get("totalChunks", 0)
                        })

                        # Broadcast progress to companion
                        await self.broadcast_to_companions({
                            "type": "transfer_progress",
                            **progress
                        })

                        # If complete, notify companion and broadcast updated history
                        if is_complete:
                            await self.broadcast_to_companions({
                                "type": "transfer_completed",
                                "transferId": transfer_id,
                                "history": self.transfer_mgr.get_history()
                            })

                    # Handle Transfer Controls (Pause, Resume, Cancel)
                    elif msg_type == "transfer_control":
                        transfer_id = data.get("transferId")
                        action = data.get("action")
                        progress = self.transfer_mgr.control_transfer(transfer_id, action)
                        if progress:
                            await ws.send_json({
                                "type": "transfer_control_ack",
                                "transferId": transfer_id,
                                "action": action,
                                "status": progress["status"]
                            })
                            await self.broadcast_to_companions({
                                "type": "transfer_progress",
                                **progress
                            })

                    # Handle General Controls (Pause, Resume, Clear, Disconnect)
                    elif msg_type == "control":
                        action = data.get("action")
                        if action == "pause":
                            self.keyboard.pause()
                            await self.broadcast_to_companions({"type": "control_state", "paused": True})
                            await ws.send_json({"type": "control_ack", "action": "pause", "paused": True})
                        elif action == "resume":
                            self.keyboard.resume()
                            await self.broadcast_to_companions({"type": "control_state", "paused": False})
                            await ws.send_json({"type": "control_ack", "action": "resume", "paused": False})
                        elif action == "clear":
                            self.sync_engine.reset()
                            await self.broadcast_to_companions({"type": "live_sync", "text": "", "revision": 0, "isFinal": True})
                            await ws.send_json({"type": "control_ack", "action": "clear"})
                        elif action == "disconnect":
                            if current_token:
                                self.security.revoke_session(current_token)
                            if is_mobile:
                                self.mobile_ws = None
                            await self.broadcast_to_companions({"type": "device_disconnected", "reason": "user_action"})
                            await ws.send_json({"type": "disconnected"})
                            break

                    elif msg_type == "ping":
                        await ws.send_json({"type": "pong", "timestamp": data.get("timestamp")})

                elif msg.type == WSMsgType.ERROR:
                    logger.error(f"WebSocket connection closed with error {ws.exception()}")

        finally:
            if is_mobile:
                self.mobile_ws = None
                await self.broadcast_to_companions({
                    "type": "device_disconnected",
                    "reason": "connection_closed"
                })
                logger.info("Mobile device disconnected.")
            if is_companion and ws in self.companion_ws_set:
                self.companion_ws_set.remove(ws)
                logger.info("Companion view disconnected.")

        return ws
