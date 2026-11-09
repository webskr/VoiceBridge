"""
VoiceBridge - Windows Auto-Start Registry Integration
Allows the VoiceBridge Windows Agent to automatically start with Windows
after explicit user permission, using HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run.
"""

import os
import sys
import winreg
import logging

logger = logging.getLogger("VoiceBridge.Startup")

RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
APP_NAME = "VoiceBridgeAgent"

def get_executable_command() -> str:
    """Returns the command to execute VoiceBridge at startup."""
    if getattr(sys, 'frozen', False):
        # Running as compiled PyInstaller .exe
        return f'"{sys.executable}" --no-browser'
    else:
        # Running from Python source
        main_py = os.path.join(os.path.dirname(os.path.abspath(__file__)), "main.py")
        return f'"{sys.executable}" "{main_py}" --no-browser'

def is_startup_enabled() -> bool:
    """Checks if VoiceBridge is registered in HKCU Run."""
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_READ) as key:
            value, _ = winreg.QueryValueEx(key, APP_NAME)
            return bool(value)
    except FileNotFoundError:
        return False
    except Exception as e:
        logger.warning(f"Error checking startup registry: {e}")
        return False

def enable_startup() -> bool:
    """Registers VoiceBridge in Windows startup."""
    cmd = get_executable_command()
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, cmd)
        logger.info(f"Registered in Windows startup: {cmd}")
        return True
    except Exception as e:
        logger.error(f"Failed to enable startup: {e}")
        return False

def disable_startup() -> bool:
    """Removes VoiceBridge from Windows startup."""
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
            winreg.DeleteValue(key, APP_NAME)
        logger.info("Removed VoiceBridge from Windows startup.")
        return True
    except FileNotFoundError:
        return True
    except Exception as e:
        logger.error(f"Failed to disable startup: {e}")
        return False

