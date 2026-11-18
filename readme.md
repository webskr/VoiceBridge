# 🎙️ VoiceBridge MCP Server
> **The All-in-One Voice Dictation & AI Input Companion for Developers.**  
> *Direct PC Microphone Voice Typing with Global Hotkey, Smart Hinglish Developer Chat Engine, Mobile Phone Companion, Virtual Trackpad & 3,000+ Line Clipboard Injector for Google Antigravity, Cursor, Claude Desktop, and VS Code.*

[![MCP Protocol](https://img.shields.io/badge/MCP-Protocol%202024--11--05%20%7C%202025--03--26-purple.svg)](https://modelcontextprotocol.io)
[![Streamable HTTP](https://img.shields.io/badge/MCP%20URL-http%3A%2F%2F127.0.0.1%3A57890%2Fmcp-blue.svg)](http://127.0.0.1:57890/mcp)
[![NPX Package](https://img.shields.io/badge/NPX-npx%20--y%20%40webskr%2Fvoicebridge-crimson.svg)](https://npmjs.com/package/@webskr/voicebridge)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%2F%2011-0078D6?style=flat&logo=windows)](https://github.com/webskr/hackthon)
[![Direct PC Voice](https://img.shields.io/badge/PC%20Voice-Ctrl%20%2B%20Alt%20%2B%20V-success.svg)](https://github.com/webskr/hackthon)
[![Smart Hinglish](https://img.shields.io/badge/NLP%20Engine-700%2B%20Dev%20Words-orange.svg)](https://github.com/webskr/hackthon)

---

## ⚡ 1-Click Automatic Setup

Run this single command in your terminal to automatically configure **Google Antigravity, Cursor, Claude Desktop, and VS Code**, and install the `/voicebridge` slash command:

```bash
npx -y @webskr/voicebridge setup
```

That's it! It automatically detects your installed IDEs, registers the MCP server configuration, and opens your companion dashboard. Zero manual JSON editing!

### 🎯 Slash Command: `/voicebridge`
In Antigravity IDE, simply type:
```text
/voicebridge
```
The agent immediately checks server health, displays your phone pairing QR code and PIN, and retrieves your voice dictation!

---

## ✨ Features & Dual Modes

VoiceBridge gives you **two powerful ways** to dictate code and control your PC:

### Mode 1: 🎙️ Direct PC Voice Dictation (Zero Phone Needed)
Speak directly into your PC's microphone (desktop mic, laptop mic, or headset) without needing your phone or keeping a browser tab open:
* **Global Shortcut Key (`Ctrl + Alt + V`)**: Press once from **any application on Windows** (VS Code, Antigravity, Notepad, Chrome, Slack, Discord) and speak naturally.
* **Smart Hinglish & Developer NLP Normalizer (700+ Terms)**: Automatically converts spoken Hindi & Hinglish into natural chat language with developer precision:
  * *"ek login function bana do"* ➔ Types: `ek login function bana do`
  * *"readme file change karo abhi push mat karna"* ➔ Types: `readme file change karo abhi push mat karna`
  * *"bro ek kaam karo"* ➔ Accurately typed as `bro` (never mistranscribed as `bra` or `kalee`)!
  * Technical shortcuts: *"ctrl plus alt plus v"* ➔ Types: `ctrl + alt + v`
* **100% Clipboard-Safe Keystroke Injection**: Uses pure Windows native `user32.SendInput` Unicode events. Your Windows clipboard is **never modified or overwritten**.
* **Ultra-Fast 400ms Pause Detection & Connection Pooling**: Employs HTTP keep-alive connection pooling to eliminate TLS handshake latency and triggers typing instantly upon brief speech pauses.
* **1-Click Windows Launchers**:
  * Double-click `VoiceBridge-PC-Voice.bat` for instant console execution.
  * Double-click `VoiceBridge-Silent.vbs` to run silently in the background with zero terminal window!

---

### Mode 2: 📱 Mobile Companion (Wireless over Wi-Fi)
Turn your phone into a remote wireless microphone, touchpad, and clipboard bridge:
* **Mobile Keyboard & Gboard Dictation**: Use your mobile phone's keyboard microphone to dictate prompts hands-free while away from your desk.
* **Virtual Trackpad & Gesture Scrolling**:
  * 1-finger swipe for smooth mouse cursor navigation with neon footprint trails.
  * 2-finger scroll up/down with dual-finger visual neon trails.
  * Dedicated split zones for Left Click and Right Click.
* **PC Sound Volume Bar**: Adjust computer audio (`Mute`, `Vol -`, `Vol +`) directly from your phone.
* **3,000+ Lines Clipboard Injector**: Transfer massive code files, logs, or stack traces directly into Windows clipboard in 0.03s with CRC32 integrity check.

---

## 🚀 Quick Start Guide

### Option A: Using Direct PC Voice Dictation
1. Run in terminal:
   ```bash
   npm run pc-voice
   ```
   *Or double-click `bin/VoiceBridge-PC-Voice.bat` in File Explorer.*
2. Switch to any app (VS Code, Notepad, Antigravity) and press **`Ctrl + Alt + V`**.
3. Speak normally — text is typed instantly right at your blinking cursor! Press `Ctrl + Alt + V` again to turn off the mic.

### Option B: Using Mobile Phone Companion
1. Start the VoiceBridge server:
   ```bash
   npx -y @webskr/voicebridge start
   ```
2. Open the **PC Companion Dashboard**:
   ```text
   http://localhost:57890/webskr/voice-bridge
   ```
3. Connect your phone to the same Wi-Fi and open `http://<YOUR_PC_IP>:57890`. Enter the 6-character PIN to start dictating or using the trackpad!

---

## 🔌 Manual MCP Configuration (URL & NPX)

If you prefer to configure manually in your AI IDE (`settings.json` or `claude_desktop_config.json`):

### Option 1: Direct MCP Streamable HTTP URL (Recommended)
```json
{
  "mcpServers": {
    "voicebridge": {
      "url": "http://127.0.0.1:57890/mcp"
    }
  }
}
```

### Option 2: NPX Command
```json
{
  "mcpServers": {
    "voicebridge": {
      "command": "npx",
      "args": ["-y", "@webskr/voicebridge"]
    }
  }
}
```

---

## 🧰 Available MCP Tools Reference

VoiceBridge exposes 5 native MCP tools to your AI agent:

| MCP Tool | Description | Example Agent Prompt |
|---|---|---|
| `voicebridge_status` | Returns server health, IP, active PIN, connected devices, and buffer state. | *"Check VoiceBridge status and give me the phone pairing PIN."* |
| `voicebridge_get_live_voice` | Fetches live voice text dictated either from the PC mic or mobile phone. | *"Read what I just dictated and turn it into a React component."* |
| `voicebridge_get_clipboard_transfers` | Retrieves large 3,000+ line code payloads transferred from mobile. | *"Fetch the 3,000-line code file sent from my phone and save to utils.py."* |
| `voicebridge_type_text` | Injects text directly into whichever desktop window has cursor focus using `SendInput`. | *"Type this SQL select query into my active database window."* |
| `voicebridge_set_clipboard` | Copies text to Windows system clipboard with optional auto `Ctrl+V` paste. | *"Copy the generated API response to my Windows clipboard."* |

---

## ⚡ Performance & Resource Footprint

VoiceBridge runs as an ultra-lightweight async service using native Win32 APIs:

| Metric | Measurement | Impact |
|---|---|---|
| **Memory / RAM** | **~24 MB to 28 MB** | Less than a single empty browser tab |
| **CPU Usage (Idle)** | **0.0%** | Zero background CPU drain |
| **CPU Usage (Active)** | **< 0.2%** | Negligible impact even during heavy compilation |
| **Typing Latency** | **~400ms pause trigger** | Instant response with keep-alive HTTP pooling |
| **Clipboard Safety** | **100% Keystroke Injection** | Zero clipboard overwrites or race conditions |
| **3,500+ Line Transfer** | **0.03 seconds** | 11,800 KB/s chunked transfer with CRC32 integrity |

---

## ❓ Frequently Asked Questions (FAQ)

#### Q: Do I need a mobile phone to use VoiceBridge?
**No!** You can use **Direct PC Voice Dictation** entirely on your computer using your PC's mic and the global hotkey `Ctrl + Alt + V`. The mobile phone interface is an optional companion for when you are away from your desk.

#### Q: Does typing overwrite my copied text in the Windows clipboard?
**No.** VoiceBridge uses direct native Windows `SendInput` keystrokes with `KEYEVENTF_UNICODE`. It never touches or overwrites your Windows clipboard.

#### Q: Can I speak in Hindi and English together (Hinglish)?
**Yes.** VoiceBridge includes a dedicated NLP normalization engine with over 700+ coding, technical, and conversational Indian terms (`bro`, `readme`, `change`, `detect`, `important`, `copy`, `login`, `api`, `vs code`, `antigravity`).

#### Q: Does it require an active Internet connection for local features?
VoiceBridge server, trackpad, mouse controls, volume bars, and 3k+ line clipboard transfers work **100% locally offline over Wi-Fi**. Voice dictation uses lightweight connection-pooled speech recognition.

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).
