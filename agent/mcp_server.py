"""
VoiceBridge MCP Server
Model Context Protocol (MCP) server for Antigravity, Cursor, and VS Code.
Enables AI agents and IDEs to receive real-time phone voice dictation,
fetch large clipboard transfers (3,000+ lines), inject text into active windows,
and manage the VoiceBridge connection directly from within the IDE.
"""

import sys
import os
import json
import socket
import logging
import threading
import time
import urllib.request
import urllib.error

# Ensure stdout and stdin use UTF-8
if sys.platform == "win32":
    import io
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Configure logging exclusively to stderr so stdout remains pure JSON-RPC
logging.basicConfig(
    stream=sys.stderr,
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] [VoiceBridge-MCP] %(message)s'
)
logger = logging.getLogger("VoiceBridge.MCP")

VOICEBRIDGE_HOST = "127.0.0.1"
VOICEBRIDGE_PORT = 57890
SERVER_BASE_URL = f"http://{VOICEBRIDGE_HOST}:{VOICEBRIDGE_PORT}"

def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(('127.0.0.1', port)) == 0

def start_voicebridge_background():
    """Starts the VoiceBridge server in a background thread if not already running."""
    if is_port_in_use(VOICEBRIDGE_PORT):
        logger.info(f"VoiceBridge server is already running on port {VOICEBRIDGE_PORT}.")
        return

    logger.info(f"Port {VOICEBRIDGE_PORT} is free. Starting background VoiceBridge server...")
    
    def _run():
        import asyncio
        try:
            from agent.keyboard import WindowsKeyboard
            from agent.sync import DocumentSyncEngine
            from agent.security import SecurityManager
            from agent.server import VoiceBridgeServer
            from agent.main import get_local_ip, find_web_dist
        except ImportError:
            sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            from agent.keyboard import WindowsKeyboard
            from agent.sync import DocumentSyncEngine
            from agent.security import SecurityManager
            from agent.server import VoiceBridgeServer
            from agent.main import get_local_ip, find_web_dist

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        host_ip = get_local_ip()
        web_dist = find_web_dist()
        
        keyboard = WindowsKeyboard()
        sync_engine = DocumentSyncEngine(keyboard)
        security = SecurityManager()
        
        server = VoiceBridgeServer(
            host=host_ip,
            port=VOICEBRIDGE_PORT,
            keyboard=keyboard,
            sync_engine=sync_engine,
            security=security,
            web_dist_dir=web_dist
        )
        
        loop.run_until_complete(server.start())
        logger.info(f"VoiceBridge background server active on http://{host_ip}:{VOICEBRIDGE_PORT} [PIN: {security.active_pin}]")
        loop.run_forever()

    t = threading.Thread(target=_run, daemon=True, name="VoiceBridge-Server-Thread")
    t.start()
    
    # Wait for server to come online
    for _ in range(15):
        time.sleep(0.3)
        if is_port_in_use(VOICEBRIDGE_PORT):
            logger.info("Background VoiceBridge server initialized successfully.")
            break

def api_request(method: str, path: str, data: dict = None) -> dict:
    """Helper to query the local VoiceBridge server."""
    url = f"{SERVER_BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        logger.warning(f"API request to {path} failed: {e}")
        return {"error": str(e), "success": False}

# MCP Tool Definitions
TOOLS = [
    {
        "name": "voicebridge_status",
        "description": "Check VoiceBridge connection status, active mobile pairing, PIN, server URLs, and recent activity.",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "additionalProperties": False
        }
    },
    {
        "name": "voicebridge_get_live_voice",
        "description": "Get the current live text dictated from the phone's voice typing (Gboard/keyboard mic).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "reset_after_read": {
                    "type": "boolean",
                    "description": "Whether to clear the voice buffer after retrieving it (default: false)."
                }
            },
            "additionalProperties": False
        }
    },
    {
        "name": "voicebridge_get_clipboard_transfers",
        "description": "List clipboard transfers received from the phone or fetch full content of a specific transfer (supports 3000+ lines).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "transfer_id": {
                    "type": "string",
                    "description": "Optional ID of a specific transfer to retrieve full text. If omitted, returns list of recent transfers."
                }
            },
            "additionalProperties": False
        }
    },
    {
        "name": "voicebridge_type_text",
        "description": "Directly type text into whichever window currently has the active cursor on Windows using SendInput Unicode injection.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "Text to inject at the current cursor position."
                }
            },
            "required": ["text"],
            "additionalProperties": False
        }
    },
    {
        "name": "voicebridge_set_clipboard",
        "description": "Copy text to the Windows system clipboard and optionally trigger Ctrl+V to paste it into the active window.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "Text to copy to Windows clipboard."
                },
                "auto_paste": {
                    "type": "boolean",
                    "description": "Whether to simulate Ctrl+V keystroke immediately (default: false)."
                }
            },
            "required": ["text"],
            "additionalProperties": False
        }
    }
]

def handle_tool_call(name: str, arguments: dict) -> dict:
    if name == "voicebridge_status":
        res = api_request("GET", "/status")
        return {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(res, indent=2, ensure_ascii=False)
                }
            ],
            "isError": "error" in res and not res.get("service")
        }

    elif name == "voicebridge_get_live_voice":
        reset = arguments.get("reset_after_read", False)
        res = api_request("GET", "/api/voice/get")
        text = res.get("text", "")
        if reset and text:
            api_request("POST", "/api/voice/reset", {})
        return {
            "content": [
                {
                    "type": "text",
                    "text": text if text else "(No voice text dictated yet)"
                }
            ],
            "isError": False
        }

    elif name == "voicebridge_get_clipboard_transfers":
        transfer_id = arguments.get("transfer_id")
        if transfer_id:
            res = api_request("GET", f"/api/history/item?id={transfer_id}")
            text = res.get("text", "")
            return {
                "content": [
                    {
                        "type": "text",
                        "text": text if text else f"Transfer '{transfer_id}' not found."
                    }
                ],
                "isError": "error" in res
            }
        else:
            res = api_request("GET", "/api/history")
            return {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(res, indent=2, ensure_ascii=False)
                    }
                ],
                "isError": False
            }

    elif name == "voicebridge_type_text":
        text = arguments.get("text", "")
        res = api_request("POST", "/api/type", {"text": text})
        return {
            "content": [
                {
                    "type": "text",
                    "text": f"Successfully injected {len(text)} characters into active cursor." if res.get("success") else f"Failed: {res.get('error')}"
                }
            ],
            "isError": not res.get("success", False)
        }

    elif name == "voicebridge_set_clipboard":
        text = arguments.get("text", "")
        auto_paste = arguments.get("auto_paste", False)
        res = api_request("POST", "/api/clipboard", {"text": text, "auto_paste": auto_paste})
        action = "Copied to clipboard and pasted" if auto_paste else "Copied to clipboard"
        return {
            "content": [
                {
                    "type": "text",
                    "text": f"{action} ({len(text)} characters)." if res.get("success") else f"Failed: {res.get('error')}"
                }
            ],
            "isError": not res.get("success", False)
        }

    else:
        return {
            "content": [
                {
                    "type": "text",
                    "text": f"Unknown tool: {name}"
                }
            ],
            "isError": True
        }

def process_message(msg: dict) -> dict:
    method = msg.get("method")
    req_id = msg.get("id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": "voicebridge",
                    "version": "1.1.0"
                }
            }
        }

    elif method == "notifications/initialized":
        # Notification - no response required
        return None

    elif method == "ping":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {}
        }

    elif method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "tools": TOOLS
            }
        }

    elif method == "tools/call":
        params = msg.get("params", {})
        tool_name = params.get("name")
        arguments = params.get("arguments", {})
        result = handle_tool_call(tool_name, arguments)
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": result
        }

    else:
        if req_id is not None:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {
                    "code": -32601,
                    "message": f"Method not found: {method}"
                }
            }
        return None

def main():
    logger.info("Starting VoiceBridge MCP Server...")
    start_voicebridge_background()

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            line = line.strip()
            if not line:
                continue

            msg = json.loads(line)
            response = process_message(msg)
            if response is not None:
                sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
                sys.stdout.flush()
        except (KeyboardInterrupt, SystemExit):
            break
        except Exception as e:
            logger.error(f"Error handling message: {e}", exc_info=True)

if __name__ == "__main__":
    main()
