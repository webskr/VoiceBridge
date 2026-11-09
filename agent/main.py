"""
VoiceBridge - Windows Background Agent Main Entry Point
Detects LAN address, renders terminal QR code, opens companion browser,
hosts the local WebSocket & HTTP engine, and manages Windows startup.
"""

import sys
import os
import socket
import argparse
import asyncio
import webbrowser
import logging
import qrcode
from colorama import init, Fore, Style

try:
    from agent.keyboard import WindowsKeyboard
    from agent.sync import DocumentSyncEngine
    from agent.security import SecurityManager
    from agent.server import VoiceBridgeServer
    from agent.startup import is_startup_enabled, enable_startup, disable_startup
except ImportError:
    from keyboard import WindowsKeyboard
    from sync import DocumentSyncEngine
    from security import SecurityManager
    from server import VoiceBridgeServer
    from startup import is_startup_enabled, enable_startup, disable_startup
from aiohttp import web

init(autoreset=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger("VoiceBridge")

def get_local_ip() -> str:
    """Detects the PC's primary LAN IP address or Wi-Fi hotspot address."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def print_banner(host: str, port: int, pin: str, pairing_url: str):
    startup_status = "ENABLED" if is_startup_enabled() else "DISABLED"
    print("\n" + Fore.CYAN + "=" * 65)
    print(Fore.CYAN + Style.BRIGHT + "   VOICEBRIDGE — SECURE MOBILE VOICE & CLIPBOARD AGENT   ")
    print(Fore.CYAN + "=" * 65)
    print(f"{Fore.GREEN}● Agent Status:       {Fore.WHITE}RUNNING")
    print(f"{Fore.GREEN}● Local Network IP:   {Fore.WHITE}{host}")
    print(f"{Fore.GREEN}● Port:               {Fore.WHITE}{port}")
    print(f"{Fore.GREEN}● Pairing PIN:        {Fore.YELLOW}{Style.BRIGHT}{pin}")
    print(f"{Fore.GREEN}● Windows Startup:    {Fore.WHITE}{startup_status}")
    print(f"{Fore.GREEN}● Mobile Web App URL: {Fore.CYAN}{pairing_url}")
    print(f"{Fore.GREEN}● PC Dashboard URL:   {Fore.CYAN}http://localhost:{port}/webskr/voice-bridge")
    print(Fore.CYAN + "-" * 65)
    print(Fore.YELLOW + "Scan the QR code below on your mobile phone to connect:")
    print(Fore.CYAN + "-" * 65 + "\n")

    qr = qrcode.QRCode(border=1)
    qr.add_data(pairing_url)
    qr.make(fit=True)
    qr.print_ascii(invert=True)

    print("\n" + Fore.CYAN + "-" * 65)
    print(Fore.WHITE + "Keep this window running. Press " + Fore.RED + "Ctrl+C" + Fore.WHITE + " to stop VoiceBridge.")
    print(Fore.CYAN + "=" * 65 + "\n")

def main():
    parser = argparse.ArgumentParser(description="VoiceBridge Windows Background Agent")
    parser.add_argument("--port", type=int, default=57890, help="Port to run the agent on (default: 57890)")
    parser.add_argument("--no-browser", action="store_true", help="Do not automatically launch PC companion browser")
    parser.add_argument("--startup-enable", action="store_true", help="Enable automatic startup with Windows")
    parser.add_argument("--startup-disable", action="store_true", help="Disable automatic startup with Windows")
    parser.add_argument("--startup-status", action="store_true", help="Check if startup with Windows is enabled")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    args = parser.parse_args()

    if args.startup_enable:
        if enable_startup():
            print("VoiceBridge has been registered for Windows startup.")
        else:
            print("Failed to register for Windows startup.")
        return

    if args.startup_disable:
        if disable_startup():
            print("VoiceBridge has been removed from Windows startup.")
        else:
            print("Failed to remove from Windows startup.")
        return

    if args.startup_status:
        status = "enabled" if is_startup_enabled() else "disabled"
        print(f"Windows startup is currently {status}.")
        return

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    lan_ip = get_local_ip()
    port = args.port

    keyboard = WindowsKeyboard()
    sync_engine = DocumentSyncEngine(keyboard)
    security = SecurityManager()

    if getattr(sys, 'frozen', False):
        base_dir = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
        web_dist_dir = os.path.join(base_dir, "web", "dist")
        if not os.path.exists(web_dist_dir):
            web_dist_dir = os.path.join(os.path.dirname(sys.executable), "web", "dist")
    else:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        web_dist_dir = os.path.join(base_dir, "web", "dist")

    server = VoiceBridgeServer(
        host=lan_ip,
        port=port,
        keyboard=keyboard,
        sync_engine=sync_engine,
        security=security,
        web_dist_dir=web_dist_dir
    )

    pairing_url = server.get_pairing_url()
    print_banner(lan_ip, port, security.active_pin, pairing_url)

    if not args.no_browser:
        webbrowser.open(f"http://localhost:{port}/webskr/voice-bridge")

    web.run_app(server.app, host="0.0.0.0", port=port, print=False)

if __name__ == "__main__":
    main()
