"""
VoiceBridge - Windows SendInput Keyboard Injection Engine
Provides clean, direct Unicode typing into whichever application currently has focus,
without stealing focus or switching windows. Supports English, Hindi (Devanagari),
emojis, punctuation, and dynamic backspace correction.
"""

import ctypes
from ctypes import wintypes
import time
import logging

logger = logging.getLogger("VoiceBridge.Keyboard")

user32 = ctypes.WinDLL('user32', use_last_error=True)
kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)

INPUT_KEYBOARD = 1
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004
VK_BACK = 0x08
VK_RETURN = 0x0D

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

class WindowsKeyboard:
    def __init__(self):
        self.is_paused = False
        self.ensure_default_desktop()

    def ensure_default_desktop(self):
        """Attaches the thread to the user's interactive 'Default' desktop."""
        try:
            DESKTOP_ALL = 0x01FF
            hDesk = user32.OpenDesktopW("Default", 0, False, DESKTOP_ALL)
            if hDesk:
                user32.SetThreadDesktop(hDesk)
        except Exception as e:
            logger.debug(f"Desktop attach info: {e}")

    def pause(self):
        self.is_paused = True
        logger.info("Keyboard injection paused.")

    def resume(self):
        self.is_paused = False
        logger.info("Keyboard injection resumed.")

    def type_unicode_string(self, text: str):
        """Types a string into the currently focused window using SendInput UNICODE events."""
        if self.is_paused or not text:
            return

        self.ensure_default_desktop()

        for char in text:
            if char == '\n':
                self.send_virtual_key(VK_RETURN)
                continue

            encoded = char.encode('utf-16-le')
            for i in range(0, len(encoded), 2):
                code_unit = int.from_bytes(encoded[i:i+2], 'little')
                
                # Key down
                inp_down = INPUT(type=INPUT_KEYBOARD)
                inp_down.union.ki = KEYBDINPUT(wVk=0, wScan=code_unit, dwFlags=KEYEVENTF_UNICODE, time=0, dwExtraInfo=None)
                
                # Key up
                inp_up = INPUT(type=INPUT_KEYBOARD)
                inp_up.union.ki = KEYBDINPUT(wVk=0, wScan=code_unit, dwFlags=KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, time=0, dwExtraInfo=None)
                
                events = (INPUT * 2)(inp_down, inp_up)
                ret = user32.SendInput(2, events, ctypes.sizeof(INPUT))
                if ret == 0:
                    logger.warning(f"SendInput returned 0 for char '{char}', err {ctypes.get_last_error()}")
                
                time.sleep(0.002)

    def send_backspaces(self, count: int):
        """Sends Backspace keystrokes to erase provisional / revised characters."""
        if self.is_paused or count <= 0:
            return

        self.ensure_default_desktop()

        actual_count = min(count, 1000)
        for _ in range(actual_count):
            self.send_virtual_key(VK_BACK)
            time.sleep(0.002)

    def send_virtual_key(self, vk_code: int):
        """Sends a standard virtual key code down and up."""
        self.ensure_default_desktop()

        inp_down = INPUT(type=INPUT_KEYBOARD)
        inp_down.union.ki = KEYBDINPUT(wVk=vk_code, wScan=0, dwFlags=0, time=0, dwExtraInfo=None)
        
        inp_up = INPUT(type=INPUT_KEYBOARD)
        inp_up.union.ki = KEYBDINPUT(wVk=vk_code, wScan=0, dwFlags=KEYEVENTF_KEYUP, time=0, dwExtraInfo=None)
        
        events = (INPUT * 2)(inp_down, inp_up)
        user32.SendInput(2, events, ctypes.sizeof(INPUT))
