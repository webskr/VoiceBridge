---
name: voicebridge
description: Start VoiceBridge server, display connection QR code and PIN, and fetch live voice dictation or clipboard transfers from connected phone.
metadata:
  version: "1.2.0"
---

# VoiceBridge (/voicebridge)

VoiceBridge connects your mobile phone to your AI coding IDE (Antigravity, Cursor, VS Code, Claude) with real-time Gboard voice typing, 3,000+ line chunked clipboard sync, and zero-latency Windows injection.

## What to do when the user types `/voicebridge`:

1. **Check Server & Phone Pairing Status**:
   - Call MCP tool `voicebridge_status`.
   - Provide the user with:
     - **PC Companion Dashboard**: [http://localhost:57890/webskr/voice-bridge](http://localhost:57890/webskr/voice-bridge)
     - **Mobile Connection Link**: `http://<HOST_IP>:57890/?pin=<PIN>`
     - **Pairing PIN**: Highlight the 6-character PIN.
     - **Mobile Status**: State whether a phone is currently connected.

2. **Check Live Voice Dictation**:
   - If the user has just spoken on their phone, call `voicebridge_get_live_voice` to retrieve the latest transcribed voice text.
   - Summarize or execute whatever instructions the user dictated.

3. **Check Large Clipboard Transfers**:
   - If the user sent code or clipboard text from their phone, call `voicebridge_get_clipboard_transfers` to retrieve the content.

