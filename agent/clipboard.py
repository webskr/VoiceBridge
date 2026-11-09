"""
VoiceBridge - Windows Native Clipboard & Fast Paste Engine
Uses Win32 user32 and kernel32 APIs to copy unicode text directly to the system clipboard
and trigger instantaneous paste (Ctrl+V) into the active cursor without character drops.
"""

import ctypes
from ctypes import wintypes
import time
import logging

logger = logging.getLogger("VoiceBridge.Clipboard")

user32 = ctypes.WinDLL('user32', use_last_error=True)
kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)

GMEM_MOVEABLE = 0x0002
CF_UNICODETEXT = 13

# Ensure 64-bit pointers on x64 Windows
kernel32.GlobalAlloc.argtypes = [wintypes.UINT, ctypes.c_size_t]
kernel32.GlobalAlloc.restype = wintypes.HGLOBAL

kernel32.GlobalLock.argtypes = [wintypes.HGLOBAL]
kernel32.GlobalLock.restype = wintypes.LPVOID

kernel32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]
kernel32.GlobalUnlock.restype = wintypes.BOOL

kernel32.GlobalFree.argtypes = [wintypes.HGLOBAL]
kernel32.GlobalFree.restype = wintypes.HGLOBAL

user32.OpenClipboard.argtypes = [wintypes.HWND]
user32.OpenClipboard.restype = wintypes.BOOL

user32.CloseClipboard.argtypes = []
user32.CloseClipboard.restype = wintypes.BOOL

user32.EmptyClipboard.argtypes = []
user32.EmptyClipboard.restype = wintypes.BOOL

user32.GetClipboardData.argtypes = [wintypes.UINT]
user32.GetClipboardData.restype = wintypes.HANDLE

user32.SetClipboardData.argtypes = [wintypes.UINT, wintypes.HANDLE]
user32.SetClipboardData.restype = wintypes.HANDLE

# Virtual keys
VK_CONTROL = 0x11
VK_V = 0x56
KEYEVENTF_KEYUP = 0x0002

class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ('dx', wintypes.LONG),
        ('dy', wintypes.LONG),
        ('mouseData', wintypes.DWORD),
        ('dwFlags', wintypes.DWORD),
        ('time', wintypes.DWORD),
        ('dwExtraInfo', ctypes.c_void_p)
    ]

class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ('wVk', wintypes.WORD),
        ('wScan', wintypes.WORD),
        ('dwFlags', wintypes.DWORD),
        ('time', wintypes.DWORD),
        ('dwExtraInfo', ctypes.c_void_p)
    ]

class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [
        ('uMsg', wintypes.DWORD),
        ('wParamL', wintypes.WORD),
        ('wParamH', wintypes.WORD)
    ]

class _INPUT_UNION(ctypes.Union):
    _fields_ = [
        ('mi', MOUSEINPUT),
        ('ki', KEYBDINPUT),
        ('hi', HARDWAREINPUT)
    ]

class INPUT(ctypes.Structure):
    _fields_ = [
        ('type', wintypes.DWORD),
        ('union', _INPUT_UNION)
    ]

user32.SendInput.argtypes = [wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int]
user32.SendInput.restype = wintypes.UINT

def ensure_default_desktop():
    try:
        DESKTOP_ALL = 0x01FF
        hDesk = user32.OpenDesktopW("Default", 0, False, DESKTOP_ALL)
        if hDesk:
            user32.SetThreadDesktop(hDesk)
    except Exception:
        pass

def set_clipboard_text(text: str) -> bool:
    """Sets the Windows Clipboard text using native CF_UNICODETEXT."""
    if text is None:
        return False

    encoded = text.encode('utf-16-le') + b'\x00\x00'
    h_mem = kernel32.GlobalAlloc(GMEM_MOVEABLE, len(encoded))
    if not h_mem:
        logger.error(f"GlobalAlloc failed: {ctypes.get_last_error()}")
        return False

    p_mem = kernel32.GlobalLock(h_mem)
    if not p_mem:
        kernel32.GlobalFree(h_mem)
        logger.error(f"GlobalLock failed: {ctypes.get_last_error()}")
        return False

    ctypes.memmove(p_mem, encoded, len(encoded))
    kernel32.GlobalUnlock(h_mem)

    # Retry opening clipboard in case another app holds it briefly
    opened = False
    for _ in range(15):
        if user32.OpenClipboard(None):
            opened = True
            break
        time.sleep(0.01)

    if not opened:
        kernel32.GlobalFree(h_mem)
        logger.error("OpenClipboard failed (timeout).")
        return False

    try:
        user32.EmptyClipboard()
        res = user32.SetClipboardData(CF_UNICODETEXT, h_mem)
        if not res:
            logger.error(f"SetClipboardData failed: {ctypes.get_last_error()}")
            return False
        return True
    finally:
        user32.CloseClipboard()

def get_clipboard_text() -> str:
    """Retrieves current text from Windows Clipboard."""
    opened = False
    for _ in range(15):
        if user32.OpenClipboard(None):
            opened = True
            break
        time.sleep(0.01)

    if not opened:
        return ""

    try:
        h_mem = user32.GetClipboardData(CF_UNICODETEXT)
        if not h_mem:
            return ""
        p_mem = kernel32.GlobalLock(h_mem)
        if not p_mem:
            return ""
        try:
            return ctypes.wstring_at(p_mem)
        finally:
            kernel32.GlobalUnlock(h_mem)
    finally:
        user32.CloseClipboard()

def send_paste_shortcut():
    """Simulates Ctrl+V keystroke into whichever application currently has focus."""
    ensure_default_desktop()

    ctrl_down = INPUT(type=1)
    ctrl_down.union.ki = KEYBDINPUT(wVk=VK_CONTROL, wScan=0, dwFlags=0, time=0, dwExtraInfo=None)
    
    v_down = INPUT(type=1)
    v_down.union.ki = KEYBDINPUT(wVk=VK_V, wScan=0, dwFlags=0, time=0, dwExtraInfo=None)
    
    v_up = INPUT(type=1)
    v_up.union.ki = KEYBDINPUT(wVk=VK_V, wScan=0, dwFlags=KEYEVENTF_KEYUP, time=0, dwExtraInfo=None)
    
    ctrl_up = INPUT(type=1)
    ctrl_up.union.ki = KEYBDINPUT(wVk=VK_CONTROL, wScan=0, dwFlags=KEYEVENTF_KEYUP, time=0, dwExtraInfo=None)

    events = (INPUT * 4)(ctrl_down, v_down, v_up, ctrl_up)
    ret = user32.SendInput(4, events, ctypes.sizeof(INPUT))
    logger.info(f"Dispatched Ctrl+V paste shortcut into active window (SendInput ret: {ret}).")

def copy_and_paste_text(text: str, auto_paste: bool = True) -> bool:
    """
    Copies text to Windows Clipboard and optionally triggers Ctrl+V.
    Used for instant, loss-free transfer of 3,000+ lines.
    """
    success = set_clipboard_text(text)
    if success and auto_paste:
        time.sleep(0.05)
        send_paste_shortcut()
    return success
