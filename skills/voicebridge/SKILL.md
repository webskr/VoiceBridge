---
name: voicebridge
description: Start VoiceBridge server, control Direct PC Voice Dictation (Ctrl+Alt+V), display phone pairing QR code and PIN, and retrieve live voice dictation or 3k+ line clipboard transfers from connected devices.
metadata:
  version: "1.3.0"
---

# VoiceBridge (/voicebridge)

VoiceBridge is the all-in-one developer voice dictation and hardware input bridge for Google Antigravity, Cursor, VS Code, and Claude Desktop.

It supports **two powerful modes**:
1. **Direct PC Voice Dictation (Zero Phone Needed)**:
   - Global Hotkey: `Ctrl + Alt + V` to toggle dictation anywhere on Windows.
   - Smart Bilingual & Hinglish Engine: Accurately transcribes Hindi, English, and mixed coding instructions directly at the active cursor with 100% clipboard safety.
   - Launch Command: `npm run pc-voice` or double-click `bin/VoiceBridge-PC-Voice.bat` (or silent background runner `bin/VoiceBridge-Silent.vbs`).
2. **Mobile Companion Mode (Wireless over Wi-Fi)**:
   - Turns your phone into a remote wireless microphone (Gboard dictation), virtual trackpad with PC sound volume control, and 3,000+ line chunked clipboard injector.

---

## What to do when the user triggers `/voicebridge` or asks about VoiceBridge:

### 1. Check Server & Connection Status
Call MCP tool `voicebridge_status`:
- **PC Dashboard**: [http://localhost:57890/webskr/voice-bridge](http://localhost:57890/webskr/voice-bridge)
- **Mobile Pairing URL**: `http://<HOST_IP>:57890/?pin=<PIN>`
- **Active PIN**: Highlight the 6-character PIN.
- **Direct PC Voice Shortcut**: Highlight `Ctrl + Alt + V`.

### 2. Retrieve Live Voice Dictation
Call MCP tool `voicebridge_get_live_voice`:
- Fetches whatever the user just dictated (either from the PC microphone or the connected mobile phone).
- Set `reset_after_read: true` if you want to consume and clear the buffer.
- Interpret the transcribed text as actionable instructions (e.g. generate code, fix bugs, create components).

### 3. Handle Large Codebase Transfers (3k+ Lines)
Call MCP tool `voicebridge_get_clipboard_transfers`:
- If the user sent a massive code snippet, stack trace, or log file from their mobile phone, fetch the payload and process or save it.

### 4. Direct Text Injection
Call MCP tool `voicebridge_type_text` to type directly into the user's active window using Windows Unicode keystrokes.
