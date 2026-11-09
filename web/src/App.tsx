import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, FileText, Monitor, CheckCircle2 } from 'lucide-react';
import { ConnectionState, WsMessage, TransferProgress, HistoryItem } from './types';
import { ConnectionBadge } from './components/ConnectionBadge';
import { PairingScreen } from './components/PairingScreen';
import { MobileTyping } from './components/MobileTyping';
import { ClipboardTransfer } from './components/ClipboardTransfer';
import { PcCompanion } from './components/PcCompanion';

export const App: React.FC = () => {
  const isCompanionView = window.location.pathname.includes('/webskr/voice-bridge') || window.location.pathname.includes('/companion');
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<string>('Android Phone');
  const [isPaused, setIsPaused] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Mobile mode tabs: 'voice' | 'clipboard'
  const [mobileMode, setMobileMode] = useState<'voice' | 'clipboard'>('voice');

  // Live Mirrored Text state (for PC Companion)
  const [companionText, setCompanionText] = useState('');
  const [companionRevision, setCompanionRevision] = useState(0);
  const [pin, setPin] = useState('');
  const [pairingUrl, setPairingUrl] = useState('');

  // Chunked Transfer states
  const [activeTransfer, setActiveTransfer] = useState<TransferProgress | null>(null);
  const [ackChunkIndex, setAckChunkIndex] = useState<number>(-1);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [startupEnabled, setStartupEnabled] = useState(false);

  // WebSocket reference
  const wsRef = useRef<WebSocket | null>(null);

  // Parse PIN from URL params if available (e.g. from QR scan)
  const urlParams = new URLSearchParams(window.location.search);
  const initialPin = urlParams.get('pin') || '';

  const getWsUrl = (host?: string, port?: number) => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const targetHost = host || window.location.hostname || 'localhost';
    const targetPort = port || (window.location.port ? parseInt(window.location.port) : 57890);
    return `${proto}//${targetHost}:${targetPort}/ws`;
  };

  const connectWs = useCallback((pin?: string, host?: string, port?: number) => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setConnectionState('connecting');
    setErrorMsg(null);

    const wsUrl = getWsUrl(host, port);
    console.log(`Connecting to VoiceBridge agent at ${wsUrl}`);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        if (isCompanionView) {
          ws.send(JSON.stringify({ type: 'companion_connect' }));
          setConnectionState('paired');
        } else if (pin) {
          const userAgent = navigator.userAgent.includes('Android') ? 'Android Phone' : 'Mobile Phone';
          ws.send(JSON.stringify({
            type: 'pair_request',
            pin: pin,
            deviceInfo: userAgent
          }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const data: WsMessage = JSON.parse(event.data);
          handleWsMessage(data);
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setConnectionState('disconnected');
        wsRef.current = null;
      };

      ws.onerror = (e) => {
        console.error('WebSocket error:', e);
        setErrorMsg('Unable to connect to PC Agent. Ensure both devices are on the same Wi-Fi.');
        setConnectionState('error');
      };
    } catch (err: any) {
      setErrorMsg(err.message || 'Connection failed');
      setConnectionState('error');
    }
  }, [isCompanionView]);

  const handleWsMessage = (data: WsMessage) => {
    switch (data.type) {
      case 'pair_success':
        setSessionToken(data.sessionToken);
        setConnectionState('paired');
        setErrorMsg(null);
        break;

      case 'pair_error':
        setErrorMsg(data.message || 'Invalid or expired pairing PIN');
        setConnectionState('error');
        break;

      case 'companion_init':
        setConnectionState('paired');
        if (data.canonicalText) setCompanionText(data.canonicalText);
        setIsPaused(!!data.paused);
        setStartupEnabled(!!data.startupEnabled);
        if (data.history) setHistory(data.history);
        if (data.pin) setPin(data.pin);
        if (data.pairingUrl) setPairingUrl(data.pairingUrl);
        break;

      case 'live_sync':
        setCompanionText(data.text);
        setCompanionRevision(data.revision);
        break;

      case 'device_paired':
        setDeviceInfo(`${data.deviceInfo} (${data.clientIp})`);
        break;

      case 'device_disconnected':
        setDeviceInfo('');
        break;

      case 'control_state':
        setIsPaused(!!data.paused);
        break;

      case 'control_ack':
        if (data.action === 'pause') setIsPaused(true);
        if (data.action === 'resume') setIsPaused(false);
        break;

      // Transfer progress & ACKs
      case 'chunk_ack':
        setAckChunkIndex(data.chunkIndex);
        break;

      case 'transfer_progress':
        setActiveTransfer(data as unknown as TransferProgress);
        break;

      case 'transfer_completed':
        setActiveTransfer(null);
        if (data.history) setHistory(data.history);
        break;

      default:
        break;
    }
  };

  useEffect(() => {
    if (initialPin && !isCompanionView) {
      connectWs(initialPin);
    } else if (isCompanionView) {
      connectWs();
    }
  }, [initialPin, isCompanionView, connectWs]);

  // Voice text stream
  const sendTextUpdate = (text: string, revision: number, isFinal: boolean) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'text_update',
        token: sessionToken,
        text,
        revision,
        isFinal
      }));
    }
  };

  // Chunked Large Clipboard Transfer
  const handleStartTransfer = (meta: { transferId: string; totalChunks: number; totalBytes: number; totalLines: number; autoPaste: boolean }) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'transfer_start',
        token: sessionToken,
        ...meta
      }));
    }
  };

  const handleSendChunk = (chunk: { transferId: string; chunkIndex: number; data: string; checksum: number }) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'transfer_chunk',
        token: sessionToken,
        ...chunk
      }));
    }
  };

  const handleControlTransfer = (transferId: string, action: 'pause' | 'resume' | 'cancel') => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'transfer_control',
        token: sessionToken,
        transferId,
        action
      }));
    }
  };

  // Controls
  const handlePause = () => {
    setIsPaused(true);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'control', action: 'pause' }));
    }
  };

  const handleResume = () => {
    setIsPaused(false);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'control', action: 'resume' }));
    }
  };

  const handleClear = () => {
    setCompanionText('');
    setCompanionRevision(0);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'control', action: 'clear' }));
    }
  };

  const handleDisconnect = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'control', action: 'disconnect' }));
      wsRef.current.close();
    }
    setConnectionState('disconnected');
    setSessionToken(null);
  };

  const handleToggleStartup = async (enabled: boolean) => {
    try {
      const res = await fetch('/api/startup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable: enabled })
      });
      const data = await res.json();
      setStartupEnabled(data.enabled);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyHistory = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/history/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      return !!data.success;
    } catch {
      return false;
    }
  };

  const handleInjectHistory = async (id: string, delay: number = 2): Promise<boolean> => {
    try {
      const res = await fetch('/api/history/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, delay })
      });
      const data = await res.json();
      return !!data.success;
    } catch {
      return false;
    }
  };

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <Mic className="brand-icon" size={22} />
          <div>Voice<span>Bridge</span></div>
        </div>
        <ConnectionBadge state={connectionState} />
      </header>

      {/* Mode Switcher on Mobile View */}
      {!isCompanionView && connectionState === 'paired' && (
        <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', justifyContent: 'center' }}>
          <button
            onClick={() => setMobileMode('voice')}
            style={{
              flex: 1,
              maxWidth: '300px',
              padding: '0.75rem',
              background: 'none',
              border: 'none',
              borderBottom: mobileMode === 'voice' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
              color: mobileMode === 'voice' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
              cursor: 'pointer'
            }}
          >
            <Mic size={16} />
            <span>Voice Typing</span>
          </button>

          <button
            onClick={() => setMobileMode('clipboard')}
            style={{
              flex: 1,
              maxWidth: '300px',
              padding: '0.75rem',
              background: 'none',
              border: 'none',
              borderBottom: mobileMode === 'clipboard' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
              color: mobileMode === 'clipboard' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
              cursor: 'pointer'
            }}
          >
            <FileText size={16} />
            <span>Clipboard (3000+ Lines)</span>
          </button>
        </div>
      )}

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {isCompanionView ? (
          <PcCompanion
            liveText={companionText}
            revision={companionRevision}
            deviceInfo={deviceInfo}
            connectionState={connectionState}
            isPaused={isPaused}
            activeTransfer={activeTransfer}
            history={history}
            startupEnabled={startupEnabled}
            pin={pin}
            pairingUrl={pairingUrl}
            onPause={handlePause}
            onResume={handleResume}
            onClear={handleClear}
            onDisconnect={handleDisconnect}
            onToggleStartup={handleToggleStartup}
            onCopyHistory={handleCopyHistory}
            onInjectHistory={handleInjectHistory}
          />
        ) : connectionState === 'paired' ? (
          mobileMode === 'voice' ? (
            <MobileTyping
              onSendTextUpdate={sendTextUpdate}
              onPause={handlePause}
              onResume={handleResume}
              onClear={handleClear}
              onDisconnect={handleDisconnect}
              isPaused={isPaused}
              pcStatus={connectionState}
            />
          ) : (
            <ClipboardTransfer
              onStartTransfer={handleStartTransfer}
              onSendChunk={handleSendChunk}
              onControlTransfer={handleControlTransfer}
              activeProgress={activeTransfer}
              ackChunkIndex={ackChunkIndex}
            />
          )
        ) : (
          <PairingScreen
            initialPin={initialPin}
            onPair={(pin, host, port) => connectWs(pin, host, port)}
            isConnecting={connectionState === 'connecting'}
            error={errorMsg}
          />
        )}
      </main>
    </>
  );
};
