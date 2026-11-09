#!/usr/bin/env node

/**
 * VoiceBridge MCP Server CLI
 * Model Context Protocol (MCP) server runnable directly via npx.
 * Bridges AI IDEs (Antigravity, Cursor, VS Code, Claude) to the VoiceBridge engine.
 */

const readline = require('readline');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const VOICEBRIDGE_PORT = 57890;
const SERVER_URL = `http://127.0.0.1:${VOICEBRIDGE_PORT}`;

// Log to stderr exclusively so stdout is dedicated to MCP JSON-RPC
function log(...args) {
  process.stderr.write(`[VoiceBridge-MCP] ${args.join(' ')}\n`);
}

function httpRequest(method, endpoint, payload = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, SERVER_URL);
    const bodyStr = payload ? JSON.stringify(payload) : null;
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      },
      timeout: 3000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', err => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function isServerRunning() {
  try {
    const res = await httpRequest('GET', '/status');
    return !!(res && (res.service || res.status === 'ok'));
  } catch {
    return false;
  }
}

let inProcessServer = null;

async function ensureBackendRunning() {
  if (await isServerRunning()) {
    log('VoiceBridge background engine is already running on port 57890.');
    return;
  }

  log('VoiceBridge engine not detected. Starting in-process Pure Node.js engine on port 57890...');
  try {
    const { VoiceBridgeServer } = require('../lib/server.js');
    inProcessServer = new VoiceBridgeServer(VOICEBRIDGE_PORT);
    inProcessServer.start();
    log(`VoiceBridge pure Node engine listening on port ${VOICEBRIDGE_PORT}. Pairing PIN: ${inProcessServer.pin}`);
  } catch (err) {
    log(`Failed to start in-process server: ${err.message}`);
  }
}

// Tool definitions for MCP
const TOOLS = [
  {
    name: 'voicebridge_status',
    description: 'Check VoiceBridge connection status, active mobile pairing, PIN, local Wi-Fi IP, and server health.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'voicebridge_get_live_voice',
    description: "Get the current live text dictated from the phone's voice typing (Gboard/keyboard microphone).",
    inputSchema: {
      type: 'object',
      properties: {
        reset_after_read: {
          type: 'boolean',
          description: 'Whether to clear the voice buffer after retrieving it (default: false).'
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'voicebridge_get_clipboard_transfers',
    description: 'List clipboard transfers received from the phone or fetch full content of a specific transfer (supports 3,000+ lines).',
    inputSchema: {
      type: 'object',
      properties: {
        transfer_id: {
          type: 'string',
          description: 'Optional ID of a specific transfer to retrieve full text. If omitted, returns list of recent transfers.'
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'voicebridge_type_text',
    description: 'Directly type text into whichever window currently has the active cursor on Windows using SendInput Unicode injection.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to inject at the current cursor position.'
        }
      },
      required: ['text'],
      additionalProperties: false
    }
  },
  {
    name: 'voicebridge_set_clipboard',
    description: 'Copy text to Windows system clipboard and optionally trigger Ctrl+V to paste into active window.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to copy to Windows clipboard.'
        },
        auto_paste: {
          type: 'boolean',
          description: 'Whether to simulate Ctrl+V keystroke immediately (default: false).'
        }
      },
      required: ['text'],
      additionalProperties: false
    }
  }
];

async function handleToolCall(name, args = {}) {
  try {
    if (name === 'voicebridge_status') {
      if (inProcessServer) {
        const info = {
          service: 'VoiceBridge Windows Agent (Pure Node.js)',
          version: '1.2.0',
          host: inProcessServer.host,
          port: inProcessServer.port,
          pin: inProcessServer.pin,
          active_mobile: inProcessServer.mobileWs !== null && inProcessServer.mobileWs.readyState === 1,
          connected_companions: inProcessServer.companionSockets.size,
          paused: inProcessServer.injector.isPaused,
          canonical_length: inProcessServer.sync.canonicalText.length,
          canonical_text: inProcessServer.sync.canonicalText,
          history_count: inProcessServer.transfers.history.length,
          dashboard_url: `http://localhost:${inProcessServer.port}/webskr/voice-bridge`,
          mobile_url: `http://${inProcessServer.host}:${inProcessServer.port}/?pin=${inProcessServer.pin}`
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
          isError: false
        };
      }
      const res = await httpRequest('GET', '/status');
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
        isError: false
      };
    }

    if (name === 'voicebridge_get_live_voice') {
      let text = '';
      if (inProcessServer) {
        text = inProcessServer.sync.canonicalText || '';
        if (args.reset_after_read && text) {
          inProcessServer.sync.reset();
        }
      } else {
        const res = await httpRequest('GET', '/api/voice/get');
        text = res.text || '';
        if (args.reset_after_read && text) {
          await httpRequest('POST', '/api/voice/reset', {});
        }
      }
      return {
        content: [{ type: 'text', text: text || '(No voice text dictated yet)' }],
        isError: false
      };
    }

    if (name === 'voicebridge_get_clipboard_transfers') {
      if (args.transfer_id) {
        let text = '';
        if (inProcessServer) {
          text = inProcessServer.transfers.getFullText(args.transfer_id);
        } else {
          const res = await httpRequest('GET', `/api/history/item?id=${encodeURIComponent(args.transfer_id)}`);
          text = res.text;
        }
        return {
          content: [{ type: 'text', text: text || `Transfer '${args.transfer_id}' not found.` }],
          isError: !text
        };
      } else {
        let history = [];
        if (inProcessServer) {
          history = inProcessServer.transfers.getHistory();
        } else {
          history = await httpRequest('GET', '/api/history');
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(history, null, 2) }],
          isError: false
        };
      }
    }

    if (name === 'voicebridge_type_text') {
      const text = args.text || '';
      let success = false;
      let error = null;
      if (inProcessServer) {
        success = inProcessServer.injector.typeString(text);
      } else {
        const res = await httpRequest('POST', '/api/type', { text });
        success = res.success;
        error = res.error;
      }
      return {
        content: [{ type: 'text', text: success ? `Successfully typed ${text.length} characters into active window.` : `Failed: ${error || 'Native typing failed'}` }],
        isError: !success
      };
    }

    if (name === 'voicebridge_set_clipboard') {
      const text = args.text || '';
      const auto_paste = !!args.auto_paste;
      let success = false;
      let error = null;
      if (inProcessServer) {
        success = inProcessServer.injector.setClipboard(text);
      } else {
        const res = await httpRequest('POST', '/api/clipboard', { text, auto_paste });
        success = res.success;
        error = res.error;
      }
      const action = auto_paste ? 'Copied and pasted' : 'Copied to clipboard';
      return {
        content: [{ type: 'text', text: success ? `${action} (${text.length} characters).` : `Failed: ${error || 'Clipboard copy failed'}` }],
        isError: !success
      };
    }

    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error calling ${name}: ${err.message}` }],
      isError: true
    };
  }
}

function sendResponse(resp) {
  if (resp !== null && resp !== undefined) {
    process.stdout.write(JSON.stringify(resp) + '\n');
  }
}

async function processMessage(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'voicebridge-mcp',
          version: '1.2.0'
        }
      }
    };
  }

  if (method === 'notifications/initialized') {
    return null;
  }

  if (method === 'ping') {
    return { jsonrpc: '2.0', id, result: {} };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: { tools: TOOLS }
    };
  }

  if (method === 'tools/call') {
    const { name, arguments: toolArgs } = params || {};
    const result = await handleToolCall(name, toolArgs);
    return {
      jsonrpc: '2.0',
      id,
      result
    };
  }

  if (id !== undefined) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` }
    };
  }

  return null;
}

function injectMcpConfig(filePath, mcpKey = 'mcpServers') {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let config = {};
    if (fs.existsSync(filePath)) {
      try {
        config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch {
        config = {};
      }
    }

    if (!config[mcpKey]) {
      config[mcpKey] = {};
    }

    config[mcpKey].voicebridge = process.platform === 'win32'
      ? {
          command: 'cmd.exe',
          args: ['/d', '/c', 'npx', '-y', '@webskr/voicebridge']
        }
      : {
          command: 'npx',
          args: ['-y', '@webskr/voicebridge']
        };

    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function runSetup() {
  console.log('\n======================================================');
  console.log('   🎙️   VoiceBridge MCP Automatic Installer (@webskr)   ');
  console.log('======================================================\n');

  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');

  const targets = [
    {
      name: 'Google Antigravity IDE',
      path: path.join(home, '.gemini', 'config', 'mcp_config.json'),
      key: 'mcpServers'
    },
    {
      name: 'Cursor IDE',
      path: path.join(home, '.cursor', 'mcp.json'),
      key: 'mcpServers'
    },
    {
      name: 'Claude Desktop',
      path: path.join(appData, 'Claude', 'claude_desktop_config.json'),
      key: 'mcpServers'
    },
    {
      name: 'VS Code (Cline / Roo Code)',
      path: path.join(appData, 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
      key: 'mcpServers'
    },
    {
      name: 'Current Workspace',
      path: path.join(process.cwd(), 'mcp_config.json'),
      key: 'mcpServers'
    }
  ];

  let successCount = 0;
  for (const target of targets) {
    const parentDir = path.dirname(target.path);
    if (fs.existsSync(parentDir) || target.name === 'Current Workspace' || target.name.includes('Antigravity')) {
      const ok = injectMcpConfig(target.path, target.key);
      if (ok) {
        console.log(`  ✔  ${target.name.padEnd(26)} -> Configured (${path.basename(target.path)})`);
        successCount++;
      }
    }
  }

  // Install Antigravity slash command skill (/voicebridge)
  const skillsDir = path.join(home, '.gemini', 'config', 'skills', 'voicebridge');
  try {
    if (!fs.existsSync(skillsDir)) {
      fs.mkdirSync(skillsDir, { recursive: true });
    }
    const skillContent = `---
name: voicebridge
description: Start VoiceBridge server, display connection QR code and PIN, and fetch live voice dictation or clipboard transfers from connected phone.
metadata:
  version: "1.2.0"
---

# VoiceBridge (/voicebridge)

VoiceBridge connects your mobile phone to your AI coding IDE (Antigravity, Cursor, VS Code, Claude) with real-time Gboard voice typing, 3,000+ line chunked clipboard sync, and zero-latency Windows injection.

## What to do when the user types /voicebridge:
1. Call MCP tool 'voicebridge_status' to fetch connection PIN and server health.
2. Provide clickable link to PC Dashboard (http://localhost:57890/webskr/voice-bridge) and mobile QR code URL.
3. If user dictated voice text, retrieve it with 'voicebridge_get_live_voice'.
`;
    fs.writeFileSync(path.join(skillsDir, 'SKILL.md'), skillContent, 'utf8');
    console.log(`  ✔  Antigravity Skill          -> Installed (/voicebridge)`);
    successCount++;
  } catch (err) {
    // Non-fatal
  }

  // Ensure background engine is running before opening dashboard
  console.log('\nStarting VoiceBridge pure Node.js background engine...');
  await ensureBackendRunning();

  let status = null;
  try {
    status = await httpRequest('GET', '/status');
  } catch {}

  const hostIp = (status && status.host) ? status.host : 'YOUR_PC_IP';
  const pin = (status && status.pin) ? status.pin : '------';

  console.log('\n------------------------------------------------------');
  console.log(`✨ Successfully installed VoiceBridge into ${successCount} configuration(s)!`);
  console.log(`💻 PC Dashboard : http://localhost:57890/webskr/voice-bridge`);
  console.log(`📱 Mobile URL   : http://${hostIp}:57890/?pin=${pin}`);
  console.log(`🔑 Pairing PIN  : ${pin}`);
  console.log(`⚡ Slash Command: /voicebridge (in Antigravity)`);
  console.log(`🤖 MCP Server   : npx -y @webskr/voicebridge`);
  console.log('======================================================\n');

  // Automatically open the PC Dashboard in user's default browser
  const openCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(openCmd, ['http://localhost:57890/webskr/voice-bridge'], { shell: true, detached: true, stdio: 'ignore' }).unref();

  process.exit(0);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('setup') || args.includes('--setup') || args.includes('install')) {
    return runSetup();
  }

  if (args.includes('start') || args.includes('server')) {
    const { VoiceBridgeServer } = require('../lib/server.js');
    const server = new VoiceBridgeServer();
    server.start();
    return;
  }

  if (args.includes('status')) {
    const running = await isServerRunning();
    if (!running) {
      console.log('VoiceBridge server is NOT running. Run "npx @webskr/voicebridge start" or "setup".');
      process.exit(1);
    }
    const res = await httpRequest('GET', '/status');
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  }

  log('Starting VoiceBridge NPX MCP Server (@webskr/voicebridge)...');
  await ensureBackendRunning();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const msg = JSON.parse(trimmed);
      const resp = await processMessage(msg);
      sendResponse(resp);
    } catch (err) {
      log(`Error parsing message: ${err.message}`);
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

main().catch(err => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});

