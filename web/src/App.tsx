import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Keyboard as KeyboardIcon, MousePointer } from 'lucide-react';
import { ConnectionState, WsMessage, TransferProgress, HistoryItem } from './types';
import { ConnectionBadge } from './components/ConnectionBadge';
import { PairingScreen } from './components/PairingScreen';
import { Keyboard } from './components/Keyboard';
import { MobileMouse } from './components/MobileMouse';
import { PcCompanion } from './components/PcCompanion';

export const App: React.FC = () => {
  const isCompanionView = window.location.pathname.includes('/webskr/voice-bridge') || window.location.pathname.includes('/companion');
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<string>('Android Phone');
  const [isPaused, setIsPaused] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 2 Mobile Modes: 'keyboard' | 'trackpad'
  const [mobileMode, setMobileMode] = useState<'keyboard' | 'trackpad'>('keyboard');

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

  // Keep track of active pin in ref for auto-reconnection
  const activePinRef = useRef<string>('');
  // WebSocket reference
  const wsRef = useRef<WebSocket | null>(null);
  const wakeLockRef = useRef<any>(null);

  // Parse PIN from URL params if available (e.g. from QR scan)
  const urlParams = new URLSearchParams(window.location.search);
  const initialPin = urlParams.get('pin') || '';

  const getWsUrl = (host?: string, port?: number) => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const targetHost = host || window.location.hostname || 'localhost';
    const targetPort = port || (window.location.port ? parseInt(window.location.port) : 57890);
    return `${proto}//${targetHost}:${targetPort}/ws`;
  };

  const connectWs = useCallback((pinToUse?: string, host?: string, port?: number) => {
    const currentPin = pinToUse || activePinRef.current || initialPin;
    if (currentPin) {
      activePinRef.current = currentPin;
    }

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
        } else if (currentPin) {
          const userAgent = navigator.userAgent.includes('Android') ? 'Android Phone' : 'Mobile Phone';
          ws.send(JSON.stringify({
            type: 'pair_request',
            pin: currentPin,
            token: sessionToken,
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
  }, [isCompanionView, initialPin, sessionToken]);

  // Keep screen awake (WakeLock API) so phone does not sleep and drop socket
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err) {
        console.warn('Wake lock not granted', err);
      }
    };

    if (connectionState === 'paired') {
      requestWakeLock();
    }

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [connectionState]);

  // Handle mobile app switching back from background / screen off
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('Page visible again - verifying connection health');
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED || wsRef.current.readyState === WebSocket.CLOSING) {
          console.log('Reconnecting dropped socket upon screen wake...');
          connectWs(activePinRef.current);
        } else if (wsRef.current.readyState === WebSocket.OPEN) {
          // Send a keep-alive ping
          wsRef.current.send(JSON.stringify({ type: 'ping' }));
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [connectWs]);

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

  // Mouse event dispatchers
  const handleMouseMove = (dx: number, dy: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'mouse_move', dx, dy }));
    }
  };

  const handleMouseClick = (button: 'left' | 'right') => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'mouse_click', button }));
    }
  };

  const handleMouseScroll = (dy: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'mouse_scroll', dy }));
    }
  };

  const handleKeyPress = (key: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'key_press', key }));
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

      {/* 2 Clean Mobile Tabs: Keyboard & Trackpad */}
      {!isCompanionView && connectionState === 'paired' && (
        <div className="mobile-tabs-header">
          <button
            onClick={() => setMobileMode('keyboard')}
            className={`tab-btn ${mobileMode === 'keyboard' ? 'active' : ''}`}
          >
            <KeyboardIcon size={18} />
            <span>Keyboard</span>
          </button>

          <button
            onClick={() => setMobileMode('trackpad')}
            className={`tab-btn ${mobileMode === 'trackpad' ? 'active' : ''}`}
          >
            <MousePointer size={18} />
            <span>Trackpad</span>
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
          mobileMode === 'keyboard' ? (
            <Keyboard
              onSendTextUpdate={sendTextUpdate}
              onPause={handlePause}
              onResume={handleResume}
              onClear={handleClear}
              onDisconnect={handleDisconnect}
              isPaused={isPaused}
              pcStatus={connectionState}
              onStartTransfer={handleStartTransfer}
              onSendChunk={handleSendChunk}
              activeProgress={activeTransfer}
              ackChunkIndex={ackChunkIndex}
            />
          ) : (
            <MobileMouse
              onMouseMove={handleMouseMove}
              onMouseClick={handleMouseClick}
              onMouseScroll={handleMouseScroll}
              onKeyPress={handleKeyPress}
              onPause={handlePause}
              onResume={handleResume}
              onDisconnect={handleDisconnect}
              isPaused={isPaused}
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
