# 🎙️ VoiceBridge MCP Server
> **Hardware-Accelerated Model Context Protocol (MCP) Server for AI Coding Environments**  
> *Stream live phone voice dictation (Gboard/Keyboard mic) & transfer 3,000+ lines of code from mobile directly into Antigravity, Cursor, Claude Desktop, and VS Code.*

[![MCP Protocol](https://img.shields.io/badge/MCP-Protocol%202024--11--05%20%7C%202025--03--26-purple.svg)](https://modelcontextprotocol.io)
[![Streamable HTTP](https://img.shields.io/badge/MCP%20URL-http%3A%2F%2F127.0.0.1%3A57890%2Fmcp-blue.svg)](http://127.0.0.1:57890/mcp)
[![NPX Package](https://img.shields.io/badge/NPX-npx%20--y%20%40webskr%2Fvoicebridge-crimson.svg)](https://npmjs.com/package/@webskr/voicebridge)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%2F%2011-0078D6?style=flat&logo=windows)](https://github.com)
[![Local Network](https://img.shields.io/badge/Network-100%25%20Local%20Wi--Fi-green.svg)](https://github.com)
[![Bilingual](https://img.shields.io/badge/Voice-Hindi%20%7C%20English%20Unicode-orange.svg)](https://github.com)

---

## ⚡ 1-Click Automatic Setup (Recommended)

Just run this single command in your terminal to automatically detect and configure **Google Antigravity, Cursor, Claude Desktop, and VS Code**:

```bash
npx -y @webskr/voicebridge setup
```

That's it! It automatically detects your installed IDEs and adds the MCP server configuration for you without touching any JSON files.

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

## 🌟 What is VoiceBridge MCP?

Traditional MCP servers only integrate with cloud APIs (GitHub, Slack, Notion). **VoiceBridge is a Local Hardware MCP Server** designed specifically for developer workflows:

1. **Hands-Free AI Prompting:** Speak complex coding instructions, bug descriptions, or architecture plans using your phone's keyboard microphone (e.g. **Gboard**) while away from your desk. The AI agent reads your dictation directly via MCP.
2. **High-Volume Mobile Code Ingestion:** Easily paste 2,000 to 3,500+ lines of code, logs, or stack traces on your phone and instruct your AI agent to inspect, refactor, or write them to workspace files.
3. **Active Window Typing & Clipboard Control:** Instruct your AI assistant to type generated queries, commands, or code snippets directly into whichever desktop application currently has your active cursor (Notepad, VS Code, Chrome, Terminal, WhatsApp Desktop).
4. **100% Private & Cloud-Free:** All audio processing happens on-device via your phone's keyboard engine; text moves strictly across your local Wi-Fi router or PC mobile hotspot. Zero external API calls.

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
- **Example Agent Prompt:** *"Read what I just dictated on my phone and turn it into a Python function."*

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

## 📦 IDE Setup Guides

### 1. Google Antigravity IDE
VoiceBridge is already pre-configured in your workspace (`mcp_config.json`) and global config (`~/.gemini/config/mcp_config.json`).
```json
{
  "mcpServers": {
    "voicebridge": {
      "url": "http://127.0.0.1:57890/mcp"
    }
  }
}
```

### 2. Cursor IDE
1. Open **Cursor Settings** (`Ctrl + ,`).
2. Navigate to **Features** ➔ **MCP Servers** ➔ **Add New MCP Server**.
3. Choose either:
   - **Type:** `sse` / `url` ➔ **URL:** `http://127.0.0.1:57890/mcp`
   - **Type:** `command` ➔ **Command:** `npx -y voicebridge-mcp`
4. Or save `.cursor/mcp.json` in your project root:
```json
{
  "mcpServers": {
    "voicebridge": {
      "url": "http://127.0.0.1:57890/mcp"
    }
  }
}
```

### 3. Claude Desktop
Add VoiceBridge to your `%APPDATA%\Claude\claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "voicebridge": {
      "command": "npx",
      "args": ["-y", "voicebridge-mcp"]
    }
  }
}
```

### 4. VS Code (Cline / Roo Code / Continue)
Add VoiceBridge to your extension's MCP configuration (e.g. `cline_mcp_settings.json`):
```json
{
  "mcpServers": {
    "voicebridge": {
      "url": "http://127.0.0.1:57890/mcp"
    }
  }
}
```

---

## 📱 How to Connect Your Phone (Step-by-Step)

```
[ Mobile Phone (Gboard / Mic) ]
               │
               ▼  WebSocket (Port 57890, PIN Auth)
[ Local Wi-Fi / Hotspot Network ]
               │
               ▼
[ VoiceBridge MCP Server (Port 57890) ]
  ├── Streamable HTTP Endpoint  ──> http://127.0.0.1:57890/mcp
  ├── NPX Stdio Protocol        ──> npx voicebridge-mcp
  └── Win32 Hardware Injection  ──> SendInput & CF_UNICODETEXT
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

4. **Dictate or Transfer:**
   - **Voice Typing:** Tap the microphone icon on your mobile Gboard and speak in Hindi or English.
   - **Large Clipboard Transfer:** Paste up to 3,500+ lines of code and tap **Transfer**.

5. **Talk to Your AI Agent:**
   - *"VoiceBridge me jo text aaya hai usko analyze karo."*
   - *"Create unit tests for the code sent from my phone clipboard."*

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
"args": ["-y", "voicebridge-mcp"]
```

#### Q: Does it require an active Internet connection?
**No.** VoiceBridge operates 100% locally over Wi-Fi or PC mobile hotspot. No audio, prompt, or code ever leaves your local network.

#### Q: Does it support both Hindi and English?
**Yes.** VoiceBridge has complete native UTF-16 Unicode support for Devanagari Hindi (`नमस्ते दुनिया`) as well as English punctuation, numerals, and emojis.

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).
