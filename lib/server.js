/**
 * VoiceBridge - Pure Node.js Native Windows Engine
 * Handles HTTP, WebSocket, QR code generation, document diff sync,
 * chunked 3,000+ line clipboard transfer, and native SendInput Unicode injection.
 * Completely replaces Python dependencies.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const { WebSocketServer, WebSocket } = require('ws');
const QRCode = require('qrcode');

const PORT = 57890;

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

function computeCrc32(str) {
  let table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = 0 ^ (-1);
  const buf = Buffer.from(str, 'utf-8');
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

// Windows Native Keyboard & Clipboard Injector wrapper
class NativeInjector {
  constructor() {
    this.process = null;
    this.isPaused = false;
    this.initProcess();
  }

  initProcess() {
    const rootDir = path.resolve(__dirname, '..');
    const binPath = path.join(rootDir, 'bin', 'win_inject.exe');

    if (!fs.existsSync(binPath)) {
      console.warn(`[VoiceBridge] Native injector not found at ${binPath}`);
      return;
    }

    try {
      this.process = spawn(binPath, [], {
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true
      });
      this.process.on('error', (err) => console.error('[VoiceBridge] Injector process error:', err.message));
      this.process.on('exit', () => {
        this.process = null;
      });
    } catch (e) {
      console.error('[VoiceBridge] Failed to spawn win_inject.exe:', e.message);
    }
  }

  sendCommand(cmd) {
    if (!this.process || this.process.killed) {
      this.initProcess();
    }
    if (this.process && this.process.stdin.writable) {
      try {
        this.process.stdin.write(cmd + '\n');
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  typeString(text) {
    if (this.isPaused || !text) return false;
    return this.sendCommand(`TYPE:${text}`);
  }

  backspace(count) {
    if (this.isPaused || count <= 0) return false;
    return this.sendCommand(`BS:${count}`);
  }

  setClipboard(text) {
    if (!text) return false;
    return this.sendCommand(`CLIP:${text}`);
  }

  mouseMove(dx, dy) {
    if (this.isPaused) return false;
    return this.sendCommand(`MOUSE_MOVE:${dx},${dy}`);
  }

  mouseClick(button = 'LEFT') {
    if (this.isPaused) return false;
    return this.sendCommand(`MOUSE_CLICK:${button.toUpperCase()}`);
  }

  mouseDown(button = 'LEFT') {
    if (this.isPaused) return false;
    return this.sendCommand(`MOUSE_DOWN:${button.toUpperCase()}`);
  }

  mouseUp(button = 'LEFT') {
    if (this.isPaused) return false;
    return this.sendCommand(`MOUSE_UP:${button.toUpperCase()}`);
  }

  mouseScroll(dy) {
    if (this.isPaused) return false;
    return this.sendCommand(`MOUSE_SCROLL:${dy}`);
  }

  sendKey(keyName) {
    if (this.isPaused || !keyName) return false;
    return this.sendCommand(`KEY:${keyName.toUpperCase()}`);
  }
}

// Diff Engine for real-time Gboard voice sync
class SyncEngine {
  constructor(injector) {
    this.injector = injector;
    this.canonicalText = '';
    this.lastRevision = -1;
  }

  reset() {
    this.canonicalText = '';
    this.lastRevision = -1;
  }

  computeDiff(oldText, newText) {
    let minLen = Math.min(oldText.length, newText.length);
    let prefixLen = 0;
    while (prefixLen < minLen && oldText[prefixLen] === newText[prefixLen]) {
      prefixLen++;
    }
    const deleteCount = oldText.length - prefixLen;
    const insertText = newText.slice(prefixLen);
    return { deleteCount, insertText };
  }

  applyUpdate(newText, revision, inject = true) {
    // If incoming text is identical, ignore
    if (newText === this.canonicalText) {
      return { applied: false, reason: 'identical' };
    }

    // Always accept newer revision, OR if a fresh dictation session begins (e.g. text starts afresh or user cleared on phone)
    if (revision <= this.lastRevision && Math.abs(newText.length - this.canonicalText.length) <= 2) {
      return { applied: false, reason: 'stale_revision' };
    }

    const { deleteCount, insertText } = this.computeDiff(this.canonicalText, newText);

    if (inject && !this.injector.isPaused) {
      if (deleteCount > 0) this.injector.backspace(deleteCount);
      if (insertText) this.injector.typeString(insertText);
    }

    this.canonicalText = newText;
    this.lastRevision = revision;
    return { applied: true, deleteCount, insertText, length: newText.length };
  }
}

// Transfer Manager for large 3,000+ line clipboard payloads
class TransferManager {
  constructor(injector) {
    this.injector = injector;
    this.history = [];
    this.fullTextStore = new Map();
    this.activeTransfers = new Map();
  }

  startTransfer(transferId, name, size, totalChunks, checksum) {
    this.activeTransfers.set(transferId, {
      id: transferId,
      name,
      size,
      totalChunks,
      expectedChecksum: checksum,
      chunks: new Array(totalChunks),
      receivedCount: 0,
      startTime: Date.now()
    });
    return true;
  }

  receiveChunk(transferId, chunkIndex, data) {
    const t = this.activeTransfers.get(transferId);
    if (!t) return false;

    if (!t.chunks[chunkIndex]) {
      t.chunks[chunkIndex] = data;
      t.receivedCount++;
    }
    return true;
  }

  finishTransfer(transferId) {
    const t = this.activeTransfers.get(transferId);
    if (!t) return null;

    const fullText = t.chunks.join('');
    const calculatedCrc = computeCrc32(fullText);

    if (t.expectedChecksum && calculatedCrc !== t.expectedChecksum) {
      console.warn(`[VoiceBridge] CRC mismatch for transfer ${transferId}`);
      this.activeTransfers.delete(transferId);
      return { success: false, error: 'Checksum mismatch' };
    }

    // Set Windows clipboard
    this.injector.setClipboard(fullText);

    // Save to history
    const lines = fullText.split('\n').length;
    const historyItem = {
      id: t.id,
      name: t.name || `Clipboard Transfer (${lines} lines)`,
      size: Buffer.byteLength(fullText, 'utf8'),
      lines,
      time: new Date().toLocaleTimeString(),
      preview: fullText.slice(0, 80).replace(/\r?\n/g, ' ')
    };

    this.history.unshift(historyItem);
    if (this.history.length > 50) {
      const removed = this.history.pop();
      if (removed) this.fullTextStore.delete(removed.id);
    }
    this.fullTextStore.set(t.id, fullText);
    this.activeTransfers.delete(transferId);

    return { success: true, item: historyItem, fullText };
  }

  getHistory() {
    return this.history;
  }

  getFullText(id) {
    return this.fullTextStore.get(id) || null;
  }
}

// Windows Startup registry integration
function isStartupEnabled() {
  try {
    const out = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "VoiceBridge"', { stdio: 'pipe' }).toString();
    return out.includes('voicebridge');
  } catch {
    return false;
  }
}

function setStartup(enable) {
  try {
    if (enable) {
      execSync('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "VoiceBridge" /t REG_SZ /d "npx -y @webskr/voicebridge" /f', { stdio: 'ignore' });
    } else {
      execSync('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "VoiceBridge" /f', { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}

class VoiceBridgeServer {
  constructor(port = PORT) {
    this.port = port;
    this.host = getLocalIp();
    this.pin = this.generatePin();
    this.tokens = new Set();
    this.injector = new NativeInjector();
    this.sync = new SyncEngine(this.injector);
    this.transfers = new TransferManager(this.injector);
    
    this.webDistDir = path.resolve(__dirname, '..', 'web', 'dist');
    this.server = null;
    this.wss = null;
    this.mobileWs = null;
    this.companionSockets = new Set();
  }

  generatePin() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let pin = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) {
      pin += chars[bytes[i] % chars.length];
    }
    return pin;
  }

  generateToken() {
    const token = crypto.randomBytes(16).toString('hex');
    this.tokens.add(token);
    return token;
  }

  validatePin(input) {
    return input && input.toUpperCase().trim() === this.pin;
  }

  validateToken(token) {
    return token && this.tokens.has(token);
  }

  broadcastToCompanions(msg) {
    const data = JSON.stringify(msg);
    for (const ws of this.companionSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data);
        } catch {
          this.companionSockets.delete(ws);
        }
      }
    }
  }

  start() {
    this.server = http.createServer(async (req, res) => {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = parsedUrl.pathname;

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // JSON helper
      const sendJson = (data, status = 200) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      };

      // Read JSON body helper
      const getJsonBody = () => new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try { resolve(JSON.parse(body)); } catch { resolve({}); }
        });
      });

      // Routes
      if (pathname === '/status' && req.method === 'GET') {
        return sendJson({
          service: 'VoiceBridge Windows Agent (Pure Node.js)',
          version: '1.2.0',
          host: this.host,
          port: this.port,
          pin: this.pin,
          active_mobile: this.mobileWs !== null && this.mobileWs.readyState === WebSocket.OPEN,
          connected_companions: this.companionSockets.size,
          paused: this.injector.isPaused,
          canonical_length: this.sync.canonicalText.length,
          canonical_text: this.sync.canonicalText,
          startup_enabled: isStartupEnabled(),
          history_count: this.transfers.history.length
        });
      }

      if (pathname === '/qr' && req.method === 'GET') {
        const pairingUrl = `http://${this.host}:${this.port}/?pin=${this.pin}`;
        try {
          const qrBuf = await QRCode.toBuffer(pairingUrl, { type: 'png', margin: 2, width: 250 });
          res.writeHead(200, { 'Content-Type': 'image/png' });
          res.end(qrBuf);
          return;
        } catch (err) {
          return sendJson({ error: err.message }, 500);
        }
      }

      if (pathname === '/mcp') {
        if (req.method === 'GET') {
          return sendJson({
            service: 'VoiceBridge MCP Streamable HTTP Endpoint',
            protocol: 'Model Context Protocol (MCP)',
            endpoint: `http://${this.host}:${this.port}/mcp`,
            status: 'ready'
          });
        }
        if (req.method === 'POST') {
          const body = await getJsonBody();
          const { id, method, params } = body;

          if (method === 'initialize') {
            return sendJson({
              jsonrpc: '2.0',
              id,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'voicebridge-mcp', version: '1.2.0' }
              }
            });
          }
          if (method === 'notifications/initialized') {
            res.writeHead(204);
            return res.end();
          }
          if (method === 'ping') {
            return sendJson({ jsonrpc: '2.0', id, result: {} });
          }
          if (method === 'tools/list') {
            return sendJson({
              jsonrpc: '2.0',
              id,
              result: {
                tools: [
                  { name: 'voicebridge_status', description: 'Check status and phone pairing PIN.', inputSchema: { type: 'object', properties: {} } },
                  { name: 'voicebridge_get_live_voice', description: 'Get live text from mobile voice typing.', inputSchema: { type: 'object', properties: { reset_after_read: { type: 'boolean' } } } },
                  { name: 'voicebridge_get_clipboard_transfers', description: 'Fetch 3,000+ line clipboard transfers.', inputSchema: { type: 'object', properties: { transfer_id: { type: 'string' } } } },
                  { name: 'voicebridge_type_text', description: 'Type text into active Windows cursor.', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
                  { name: 'voicebridge_set_clipboard', description: 'Copy text to Windows clipboard.', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }
                ]
              }
            });
          }
          if (method === 'tools/call') {
            const { name, arguments: toolArgs = {} } = params || {};
            if (name === 'voicebridge_status') {
              const info = {
                service: 'VoiceBridge Windows Agent',
                host: this.host,
                port: this.port,
                pin: this.pin,
                active_mobile: this.mobileWs !== null && this.mobileWs.readyState === WebSocket.OPEN,
                canonical_length: this.sync.canonicalText.length
              };
              return sendJson({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }], isError: false } });
            }
            if (name === 'voicebridge_get_live_voice') {
              const text = this.sync.canonicalText;
              if (toolArgs.reset_after_read && text) {
                this.sync.reset();
              }
              return sendJson({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: text || '(No voice text dictated yet)' }], isError: false } });
            }
            if (name === 'voicebridge_get_clipboard_transfers') {
              if (toolArgs.transfer_id) {
                const text = this.transfers.getFullText(toolArgs.transfer_id);
                return sendJson({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: text || 'Not found' }], isError: !text } });
              }
              return sendJson({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(this.transfers.getHistory(), null, 2) }], isError: false } });
            }
            if (name === 'voicebridge_type_text') {
              const success = this.injector.typeString(toolArgs.text);
              return sendJson({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: success ? 'Typed successfully' : 'Failed' }], isError: !success } });
            }
            if (name === 'voicebridge_set_clipboard') {
              const success = this.injector.setClipboard(toolArgs.text);
              return sendJson({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: success ? 'Copied' : 'Failed' }], isError: !success } });
            }
          }
        }
      }

      if (pathname === '/api/voice/get') {
        return sendJson({ text: this.sync.canonicalText, length: this.sync.canonicalText.length, revision: this.sync.lastRevision });
      }

      if (pathname === '/api/voice/reset' && req.method === 'POST') {
        this.sync.reset();
        this.broadcastToCompanions({ type: 'doc_update', text: '', revision: 0, is_final: true });
        return sendJson({ success: true });
      }

      if (pathname === '/api/history' && req.method === 'GET') {
        return sendJson(this.transfers.getHistory());
      }

      if (pathname === '/api/history/item' && req.method === 'GET') {
        const id = parsedUrl.searchParams.get('id');
        const text = this.transfers.getFullText(id);
        if (text) return sendJson({ id, text });
        return sendJson({ success: false, error: 'Item not found' }, 404);
      }

      if (pathname === '/api/history/copy' && req.method === 'POST') {
        const body = await getJsonBody();
        const text = this.transfers.getFullText(body.id);
        if (text) {
          const success = this.injector.setClipboard(text);
          return sendJson({ success });
        }
        return sendJson({ success: false, error: 'Item not found' }, 404);
      }

      if (pathname === '/api/history/inject' && req.method === 'POST') {
        const body = await getJsonBody();
        const text = this.transfers.getFullText(body.id);
        if (text) {
          const success = this.injector.setClipboard(text);
          return sendJson({ success });
        }
        return sendJson({ success: false, error: 'Item not found' }, 404);
      }

      if (pathname === '/api/startup' && req.method === 'GET') {
        return sendJson({ enabled: isStartupEnabled() });
      }

      if (pathname === '/api/startup' && req.method === 'POST') {
        const body = await getJsonBody();
        const success = setStartup(!!body.enable);
        return sendJson({ success, enabled: isStartupEnabled() });
      }

      if (pathname === '/api/type' && req.method === 'POST') {
        const body = await getJsonBody();
        const success = this.injector.typeString(body.text);
        return sendJson({ success });
      }

      if (pathname === '/api/clipboard' && req.method === 'POST') {
        const body = await getJsonBody();
        const success = this.injector.setClipboard(body.text);
        return sendJson({ success });
      }

      // Serve Frontend static files
      if (pathname.startsWith('/assets/')) {
        const assetPath = path.join(this.webDistDir, pathname);
        if (fs.existsSync(assetPath)) {
          const ext = path.extname(assetPath);
          const mimeTypes = { '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
          res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
          return fs.createReadStream(assetPath).pipe(res);
        }
      }

      // Route /webskr/voice-bridge, /companion, or / to index.html
      const indexPath = path.join(this.webDistDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return fs.createReadStream(indexPath).pipe(res);
      }

      // Fallback minimal HTML
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="font-family:sans-serif;background:#0f172a;color:#fff;text-align:center;padding:2rem;">
        <h1>VoiceBridge Agent</h1>
        <p>PIN: <strong style="font-size:2rem;color:#f43f5e;">${this.pin}</strong></p>
        <p><a style="color:#38bdf8;" href="/webskr/voice-bridge">Open PC Dashboard</a></p>
      </body></html>`);
    });

    // WebSocket Server
    this.wss = new WebSocketServer({ server: this.server, path: '/ws' });
    this.wss.on('connection', (ws, req) => {
      let clientRole = null;
      let authenticated = false;
      const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace(/^.*:/, '');

      ws.on('message', (dataStr) => {
        try {
          const msg = JSON.parse(dataStr);
          const type = msg.type;

          // Companion PC Dashboard Connection
          if (type === 'companion_connect') {
            authenticated = true;
            clientRole = 'companion';
            this.companionSockets.add(ws);
            ws.send(JSON.stringify({
              type: 'companion_init',
              pin: this.pin,
              pairingUrl: `http://${this.host}:${this.port}/?pin=${this.pin}`,
              canonicalText: this.sync.canonicalText,
              paused: this.injector.isPaused,
              startupEnabled: isStartupEnabled(),
              history: this.transfers.getHistory()
            }));
            return;
          }

          // Mobile Pairing Request
          if (type === 'pair_request' || type === 'pair') {
            const pinAttempt = (msg.pin || '').toString().toUpperCase().trim();
            const tokenAttempt = msg.token || msg.sessionToken;
            const role = msg.role || 'mobile';

            if (role === 'companion') {
              authenticated = true;
              clientRole = 'companion';
              this.companionSockets.add(ws);
              ws.send(JSON.stringify({
                type: 'companion_init',
                pin: this.pin,
                pairingUrl: `http://${this.host}:${this.port}/?pin=${this.pin}`,
                canonicalText: this.sync.canonicalText,
                paused: this.injector.isPaused,
                startupEnabled: isStartupEnabled(),
                history: this.transfers.getHistory()
              }));
              return;
            }

            if (this.validateToken(tokenAttempt) || this.validatePin(pinAttempt)) {
              authenticated = true;
              clientRole = 'mobile';
              const token = this.generateToken();

              ws.send(JSON.stringify({
                type: 'pair_success',
                sessionToken: token,
                status: 'connected',
                isPaused: this.injector.isPaused,
                canonicalText: this.sync.canonicalText,
                revision: this.sync.lastRevision
              }));

              if (this.mobileWs && this.mobileWs !== ws) {
                try { this.mobileWs.close(); } catch {}
              }
              this.mobileWs = ws;

              this.broadcastToCompanions({
                type: 'device_paired',
                deviceInfo: msg.deviceInfo || msg.device || 'Android Phone',
                clientIp: clientIp || this.host
              });
            } else {
              ws.send(JSON.stringify({
                type: 'pair_error',
                message: `Invalid pairing PIN (${pinAttempt}). Check PIN on PC screen.`
              }));
              ws.close();
            }
            return;
          }

          if (!authenticated) {
            ws.send(JSON.stringify({ type: 'error', error: 'Unauthenticated' }));
            ws.close();
            return;
          }

          // Voice typing live update
          if (type === 'text_update' || type === 'doc_update') {
            const text = msg.text || '';
            const rev = typeof msg.revision === 'number' ? msg.revision : (this.sync.lastRevision + 1);
            this.sync.applyUpdate(text, rev, !this.injector.isPaused);
            this.broadcastToCompanions({
              type: 'live_sync',
              text: text,
              revision: rev
            });
            return;
          }

          // Mouse Trackpad Controls
          if (type === 'mouse_move') {
            const dx = typeof msg.dx === 'number' ? msg.dx : 0;
            const dy = typeof msg.dy === 'number' ? msg.dy : 0;
            this.injector.mouseMove(dx, dy);
            return;
          }

          if (type === 'mouse_click') {
            this.injector.mouseClick(msg.button || 'LEFT');
            return;
          }

          if (type === 'mouse_down') {
            this.injector.mouseDown(msg.button || 'LEFT');
            return;
          }

          if (type === 'mouse_up') {
            this.injector.mouseUp(msg.button || 'LEFT');
            return;
          }

          if (type === 'mouse_scroll') {
            const dy = typeof msg.dy === 'number' ? msg.dy : 0;
            this.injector.mouseScroll(dy);
            return;
          }

          if (type === 'key_press') {
            this.injector.sendKey(msg.key);
            return;
          }

          // Controls
          if (type === 'control') {
            const action = msg.action;
            if (action === 'pause') {
              this.injector.isPaused = true;
              this.broadcastToCompanions({ type: 'control_state', paused: true });
              this.broadcastToCompanions({ type: 'control_ack', action: 'pause' });
            } else if (action === 'resume') {
              this.injector.isPaused = false;
              this.broadcastToCompanions({ type: 'control_state', paused: false });
              this.broadcastToCompanions({ type: 'control_ack', action: 'resume' });
            } else if (action === 'clear') {
              this.sync.reset();
              this.broadcastToCompanions({ type: 'live_sync', text: '', revision: 0 });
            } else if (action === 'disconnect') {
              if (this.mobileWs === ws) {
                this.mobileWs = null;
                this.broadcastToCompanions({ type: 'device_disconnected' });
              }
            }
            return;
          }

          // Large Clipboard Transfer
          if (type === 'transfer_start' || type === 'chunk_start') {
            const transferId = msg.transferId || msg.transfer_id;
            const name = msg.name || `Clipboard Transfer (${msg.totalLines || 0} lines)`;
            const size = msg.totalBytes || msg.size || 0;
            const totalChunks = msg.totalChunks || msg.total_chunks || 1;
            this.transfers.startTransfer(transferId, name, size, totalChunks, msg.checksum);
            ws.send(JSON.stringify({ type: 'chunk_ack', transferId, chunkIndex: -1 }));
            this.broadcastToCompanions({
              type: 'transfer_progress',
              transferId,
              progress: 0,
              totalBytes: size
            });
            return;
          }

          if (type === 'transfer_chunk' || type === 'chunk_data') {
            const transferId = msg.transferId || msg.transfer_id;
            const chunkIndex = typeof msg.chunkIndex === 'number' ? msg.chunkIndex : msg.chunk_index;
            this.transfers.receiveChunk(transferId, chunkIndex, msg.data);
            ws.send(JSON.stringify({ type: 'chunk_ack', transferId, chunkIndex }));
            
            const t = this.transfers.activeTransfers.get(transferId);
            if (t && t.receivedCount >= t.totalChunks) {
              const res = this.transfers.finishTransfer(transferId);
              if (res && res.success) {
                if (msg.autoPaste) {
                  // Simulate Ctrl+V after copy
                  this.injector.sendCommand('KEY:CTRL+V');
                }
                this.broadcastToCompanions({
                  type: 'transfer_completed',
                  history: this.transfers.getHistory()
                });
              }
            } else {
              this.broadcastToCompanions({
                type: 'transfer_progress',
                transferId,
                chunkIndex
              });
            }
            return;
          }
        } catch (err) {
          console.error('[VoiceBridge] WebSocket message error:', err.message);
        }
      });

      ws.on('close', () => {
        if (clientRole === 'companion') {
          this.companionSockets.delete(ws);
        } else if (ws === this.mobileWs) {
          this.mobileWs = null;
          this.broadcastToCompanions({ type: 'device_disconnected' });
        }
      });
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      console.error(`[VoiceBridge] Pure Node.js Server listening on http://0.0.0.0:${this.port}`);
      console.error(`[VoiceBridge] PC Dashboard : http://localhost:${this.port}/webskr/voice-bridge`);
      console.error(`[VoiceBridge] Mobile URL   : http://${this.host}:${this.port}/?pin=${this.pin}`);
      console.error(`[VoiceBridge] Pairing PIN  : ${this.pin}`);
    });
  }
}

module.exports = { VoiceBridgeServer };

if (require.main === module) {
  const noBrowser = process.argv.includes('--no-browser');
  const server = new VoiceBridgeServer();
  server.start();
  if (!noBrowser) {
    const openCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawn(openCmd, [`http://localhost:${PORT}/webskr/voice-bridge`], { shell: true, detached: true, stdio: 'ignore' }).unref();
  }
}
