# 🎙️ VoiceBridge MCP Server
> **Turn your mobile phone into an AI-powered Voice Typing Companion, Virtual Trackpad & 3,000+ line Clipboard Injector for AI IDEs.**  
> *Stream live voice dictation (Gboard/Keyboard mic), control PC cursor & sound volume, and transfer large codebases directly into Antigravity, Cursor, Claude Desktop, and VS Code.*

[![MCP Protocol](https://img.shields.io/badge/MCP-Protocol%202024--11--05%20%7C%202025--03--26-purple.svg)](https://modelcontextprotocol.io)
[![Streamable HTTP](https://img.shields.io/badge/MCP%20URL-http%3A%2F%2F127.0.0.1%3A57890%2Fmcp-blue.svg)](http://127.0.0.1:57890/mcp)
[![NPX Package](https://img.shields.io/badge/NPX-npx%20--y%20%40webskr%2Fvoicebridge-crimson.svg)](https://npmjs.com/package/@webskr/voicebridge)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%2F%2011-0078D6?style=flat&logo=windows)](https://github.com/webskr/hackthon)
[![Local Network](https://img.shields.io/badge/Network-100%25%20Local%20Wi--Fi-green.svg)](https://github.com/webskr/hackthon)
[![Bilingual](https://img.shields.io/badge/Voice-Hindi%20%7C%20English%20Unicode-orange.svg)](https://github.com/webskr/hackthon)

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

## ✨ Features & Capabilities

### 1. ⌨️ Mobile Keyboard & Voice Typing
* **Hands-Free AI Prompting**: Speak complex coding instructions, bug descriptions, or architecture plans using your phone's keyboard microphone (e.g. **Gboard**) while away from your desk.
* **Continuous Typing**: Dictate without interruptions; auto-adapts to speech pauses without manual clearing.
* **Docked Controls**: `Enter ↵`, `Pause`, `Clear`, and `Exit` buttons float directly above the virtual keyboard for quick single-tap actions.
* **3k+ Lines Clipboard Transfer**: Integrated button to transfer up to 3,500+ lines of code, logs, or stack traces directly into Windows clipboard with CRC32 integrity.

### 2. 🖱️ Virtual Trackpad & PC Sound Control
* **Smooth Trackpad Surface**: Swipe 1 finger to move the PC mouse cursor with natural acceleration.
* **Neon Footprint Trails**: Visual glowing trails trace your finger path in real time and smoothly fade out.
* **Dual-Finger Gestures**: Swipe with 2 fingers to scroll pages up/down with simultaneous double-finger neon trails.
* **Integrated Click Zones**: Horizontally divided bottom partition for dedicated **Left Click** and **Right Click** actions.
* **PC Sound Volume Bar**: Control your computer's audio directly from your phone — **Mute**, **Vol -**, and **Vol +**.

### 3. 🛡️ Resilient Mobile Connection
* **Screen Wake-Lock**: Keeps your phone display active during dictation sessions.
* **Auto-Resume**: Automatically restores dropped WebSocket connections when unlocking your phone or switching back to the browser tab without re-entering the PIN.

---

## 🔌 Manual MCP Configuration (URL & NPX)

If you prefer to configure manually, choose either **Direct HTTP URL** or **NPX**:

### Option 1: Direct MCP Streamable HTTP URL
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

When connected, VoiceBridge exposes 5 native MCP tools to your AI agent:

### 1. `voicebridge_status`
Returns real-time server health, local Wi-Fi IP, active pairing PIN, connected mobile state, and buffer length.
- **Parameters:** *None*
- **Example Agent Prompt:** *"Check VoiceBridge status and give me the phone pairing PIN."*

### 2. `voicebridge_get_live_voice`
Fetches live voice text dictated on your phone's Gboard microphone in real time.
- **Parameters:**
  - `reset_after_read` *(boolean, optional)*: Automatically resets the voice buffer after reading (default: `false`).
- **Example Agent Prompt:** *"Read what I just dictated on my phone and turn it into a React component."*

### 3. `voicebridge_get_clipboard_transfers`
Lists all large clipboard payloads transferred from the phone, or retrieves the full text of a specific 3,000+ line transfer.
- **Parameters:**
  - `transfer_id` *(string, optional)*: Specific transfer ID. If omitted, returns recent transfer history.
- **Example Agent Prompt:** *"Fetch the 3,000-line code file sent from my phone and save it to `utils.py`."*

### 4. `voicebridge_type_text`
Injects text directly into whichever desktop window currently has active cursor focus on Windows using native `SendInput` Unicode injection.
- **Parameters:**
  - `text` *(string, required)*: Text string to type.
- **Example Agent Prompt:** *"Type this SQL select query into my active database window."*

### 5. `voicebridge_set_clipboard`
Sets the Windows system clipboard and optionally triggers an immediate simulated `Ctrl+V` keystroke.
- **Parameters:**
  - `text` *(string, required)*: Text to copy to clipboard.
  - `auto_paste` *(boolean, optional)*: Whether to press `Ctrl+V` automatically (default: `false`).
- **Example Agent Prompt:** *"Copy the generated API response to my Windows clipboard and paste it."*

---

## 📱 How to Connect Your Phone (Step-by-Step)

```
[ Mobile Phone (Gboard / Mic / Trackpad) ]
                    │
                    ▼  WebSocket (Port 57890, PIN Auth)
[ Local Wi-Fi / Hotspot Network ]
                    │
                    ▼
[ VoiceBridge Server & Native Win32 Subsystem ]
      ├── Streamable HTTP Endpoint  ──> http://127.0.0.1:57890/mcp
      ├── NPX Stdio Protocol        ──> npx @webskr/voicebridge
      └── Win32 Hardware Injection  ──> SendInput, Mouse, Volume, & CF_UNICODETEXT
                    │
                    ▼
[ AI IDE (Antigravity / Cursor / Claude / VS Code) ]
```

1. **Start Your IDE or Run Setup:**
   - Run `npx -y @webskr/voicebridge setup` (automatically configures your IDE and opens the dashboard).
   - **PC Dashboard URL:** `http://localhost:57890/webskr/voice-bridge`

2. **Open the Mobile Interface:**
   - Connect your phone to the same Wi-Fi router or PC mobile hotspot.
   - Point your phone's browser to:
     ```text
     http://<YOUR_PC_IP>:57890
     ```
   - *(Tip: Ask your AI agent "What is my VoiceBridge pairing URL and PIN?" to get the link instantly).*

3. **Pair with PIN:**
   - Enter the 6-character PIN shown in your PC Dashboard (`http://localhost:57890/webskr/voice-bridge`) or provided by the agent.

4. **Dictate, Navigate or Transfer:**
   - **Keyboard Tab:** Speak in Hindi or English using keyboard mic, or tap `3k+ Lines` to paste large codebases.
   - **Trackpad Tab:** Swipe to move PC cursor, tap bottom halves for Left/Right click, and adjust PC sound volume.

---

## ⚡ Performance & Resource Footprint

VoiceBridge runs as an ultra-lightweight async service using native Win32 APIs:

| Metric | Measurement | Impact |
|---|---|---|
| **Memory / RAM** | **~24 MB to 28 MB** | Less than a single empty browser tab |
| **CPU Usage (Idle)** | **0.0%** | Zero background CPU drain |
| **CPU Usage (Active)** | **< 0.2%** | Negligible impact even during heavy compilation |
| **Internet Data** | **0 KB/s** | 100% offline local network communication |
| **3,500+ Line Transfer** | **0.03 seconds** | 11,800 KB/s chunked transfer with CRC32 integrity |

---

## ❓ Frequently Asked Questions (FAQ)

#### Q: Where is the MCP URL to add to my IDE?
The Streamable HTTP MCP URL is:
```text
http://127.0.0.1:57890/mcp
```

#### Q: How do I run it via NPX without git cloning?
In your IDE config, specify:
```json
"command": "npx",
"args": ["-y", "@webskr/voicebridge"]
```

#### Q: Does it require an active Internet connection?
**No.** VoiceBridge operates 100% locally over Wi-Fi or PC mobile hotspot. No audio, prompt, or code ever leaves your local network.

#### Q: Does it support both Hindi and English?
**Yes.** VoiceBridge has complete native UTF-16 Unicode support for Devanagari Hindi (`नमस्ते दुनिया`) as well as English punctuation, numerals, and emojis.

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).
