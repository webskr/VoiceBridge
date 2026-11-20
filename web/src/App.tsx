import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Keyboard as KeyboardIcon, MousePointer, Paperclip, Play, Pause } from 'lucide-react';
import { ConnectionState, WsMessage, TransferProgress, HistoryItem, StreamAttachment } from './types';
import { ConnectionBadge } from './components/ConnectionBadge';
import { PairingScreen } from './components/PairingScreen';
import { Keyboard } from './components/Keyboard';
import { ClipboardTransfer } from './components/ClipboardTransfer';
import { MobileMouse } from './components/MobileMouse';
import { PcCompanion } from './components/PcCompanion';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('VoiceBridge UI Crash Prevented:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#f87171', background: '#0f172a', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h2>VoiceBridge Dashboard Recovered</h2>
          <p style={{ color: '#94a3b8', margin: '1rem 0' }}>An unexpected render glitch occurred, but your session is safe.</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            className="btn btn-primary"
            style={{ padding: '0.6rem 1.2rem' }}
          >
            Refresh Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const App: React.FC = () => {
  const isCompanionView = window.location.pathname.includes('/webskr/voice-bridge') || window.location.pathname.includes('/companion');
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<string>('Android Phone');
  const [isPaused, setIsPaused] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 2 Mobile Modes: 'keyboard' | 'trackpad'
  const [mobileMode, setMobileMode] = useState<'keyboard' | 'trackpad'>('keyboard');
  const [shouldOpenAttachOnKeyboard, setShouldOpenAttachOnKeyboard] = useState(false);

  // Live Mirrored Text state (for PC Companion)
  const [companionText, setCompanionText] = useState('');
  const [companionRevision, setCompanionRevision] = useState(0);
  const [pin, setPin] = useState('');
  const [pairingUrl, setPairingUrl] = useState('');
  const [streamAttachments, setStreamAttachments] = useState<StreamAttachment[]>([]);

  // Chunked Transfer states
  const [activeTransfer, setActiveTransfer] = useState<TransferProgress | null>(null);
  const [ackChunkIndex, setAckChunkIndex] = useState<number>(-1);
  const [ackTransferId, setAckTransferId] = useState<string>('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [startupEnabled, setStartupEnabled] = useState(false);

  // Dynamic Visual Viewport height for mobile keyboard
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    const handleViewport = () => {
      if (window.visualViewport) {
        setViewportHeight(window.visualViewport.height);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewport);
      window.visualViewport.addEventListener('scroll', handleViewport);
      handleViewport();
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewport);
        window.visualViewport.removeEventListener('scroll', handleViewport);
      }
    };
  }, []);

  // Keep track of active pin in ref for auto-reconnection
  const activePinRef = useRef<string>('');
  const userExplicitDisconnectRef = useRef<boolean>(false);
  const sessionTokenRef = useRef<string | null>(null);
  // WebSocket reference
  const wsRef = useRef<WebSocket | null>(null);
  const wakeLockRef = useRef<any>(null);

  // Parse PIN from URL params or localStorage
  const urlParams = new URLSearchParams(window.location.search);
  const initialPin = urlParams.get('pin') || localStorage.getItem('vb_pin') || '';

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
      try { localStorage.setItem('vb_pin', currentPin); } catch {}
    }

    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // Clean up any stale socket to prevent duplicate event loops
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }

    setConnectionState('connecting');
    setErrorMsg(null);

    const wsUrl = getWsUrl(host, port);
    console.log(`Connecting to VoiceBridge agent at ${wsUrl}`);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        console.log('WebSocket connected');
        if (isCompanionView) {
          ws.send(JSON.stringify({ type: 'companion_connect' }));
          setConnectionState('paired');
        } else if (currentPin) {
          const userAgent = navigator.userAgent.includes('Android') ? 'Android Phone' : 'Mobile Phone';
          ws.send(JSON.stringify({
            type: 'pair_request',
            pin: currentPin,
            token: sessionTokenRef.current,
            deviceInfo: userAgent
          }));
        }
      };

      ws.onmessage = (event) => {
        if (wsRef.current !== ws) return;
        try {
          const data: WsMessage = JSON.parse(event.data);
          handleWsMessage(data);
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };

      ws.onclose = () => {
        if (wsRef.current !== ws) return; // Prevent stale socket from triggering reconnect
        console.log('WebSocket disconnected');
        wsRef.current = null;
        if (!userExplicitDisconnectRef.current && activePinRef.current) {
          setConnectionState('reconnecting');
          setTimeout(() => {
            if (!userExplicitDisconnectRef.current && activePinRef.current) {
              connectWs(activePinRef.current);
            }
          }, 2000);
        } else {
          setConnectionState('disconnected');
        }
      };

      ws.onerror = (e) => {
        if (wsRef.current !== ws) return;
        console.error('WebSocket error:', e);
        setErrorMsg('Unable to connect to PC Agent. Ensure both devices are on the same Wi-Fi.');
        setConnectionState('error');
      };
    } catch (err: any) {
      setErrorMsg(err.message || 'Connection failed');
      setConnectionState('error');
    }
  }, [isCompanionView, initialPin]);

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
        sessionTokenRef.current = data.sessionToken;
        setSessionToken(data.sessionToken);
        setConnectionState('paired');
        setErrorMsg(null);
        break;

      case 'pair_error':
        setErrorMsg(data.message || 'Invalid or expired pairing PIN');
        setConnectionState('error');
        activePinRef.current = '';
        try { localStorage.removeItem('vb_pin'); } catch {}
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
        if (data.action === 'clear') {
          setCompanionText('');
          setCompanionRevision(0);
          setStreamAttachments([]);
        }
        break;

      // Transfer progress & ACKs
      case 'chunk_ack':
        setAckChunkIndex(data.chunkIndex);
        setAckTransferId(data.transferId || '');
        break;

      case 'transfer_progress': {
        const progData = data as any;
        setActiveTransfer(progData as unknown as TransferProgress);
        if (progData.transferId) {
          setStreamAttachments((prev) => {
            const existing = prev.find((a) => a.id === progData.transferId);
            if (existing) {
              return prev.map((a) =>
                a.id === progData.transferId
                  ? {
                      ...a,
                      progress: progData.percent !== undefined ? progData.percent : a.progress,
                      status: progData.status || a.status
                    }
                  : a
              );
            } else {
              return [
                ...prev,
                {
                  id: progData.transferId,
                  name: progData.name || 'Attachment',
                  type: progData.transferType === 'image' ? 'image' : 'file',
                  size: progData.totalBytes,
                  status: 'receiving',
                  progress: progData.percent || 0
                }
              ];
            }
          });
        }
        break;
      }

      case 'transfer_completed': {
        setActiveTransfer(null);
        if (data.history) setHistory(data.history);
        const compData = data as any;
        if (compData.transferId) {
          const rawName =
            (compData.item && compData.item.name) ||
            (compData.savedPath ? compData.savedPath.split(/[/\\]/).pop() : '') ||
            'Attachment';
          const fileUrl = rawName ? `/api/uploads/${encodeURIComponent(rawName)}` : undefined;
          setStreamAttachments((prev) => {
            const existing = prev.find((a) => a.id === compData.transferId);
            if (existing) {
              return prev.map((a) =>
                a.id === compData.transferId
                  ? {
                      ...a,
                      status: 'saved',
                      progress: 100,
                      url: fileUrl || a.url,
                      path: compData.savedPath || a.path
                    }
                  : a
              );
            } else {
              return [
                ...prev,
                {
                  id: compData.transferId,
                  name: rawName,
                  type: compData.item && compData.item.type === 'image' ? 'image' : 'file',
                  size: compData.item?.size,
                  status: 'saved',
                  progress: 100,
                  url: fileUrl,
                  path: compData.savedPath
                }
              ];
            }
          });
        }
        break;
      }

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
  }, []); // Connect once on mount

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

  // Chunked Large Clipboard, Image & File Transfer
  const handleStartTransfer = (meta: {
    transferId: string;
    name?: string;
    transferType?: 'text' | 'image' | 'file';
    totalChunks: number;
    totalBytes: number;
    totalLines?: number;
    autoPaste: boolean;
    checksum?: number;
  }) => {
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
    setStreamAttachments([]);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'control', action: 'clear' }));
    }
  };

  const handleDisconnect = () => {
    userExplicitDisconnectRef.current = true;
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

  const handleMouseDown = (button: 'left' | 'right') => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'mouse_down', button }));
    }
  };

  const handleMouseUp = (button: 'left' | 'right') => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'mouse_up', button }));
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
    <div
      className="mobile-app-root"
      style={!isCompanionView && viewportHeight ? { height: `${viewportHeight}px`, maxHeight: `${viewportHeight}px` } : {}}
    >
      <header className="app-header">
        <div className="brand">
          <Mic className="brand-icon" size={22} />
          <div>Voice<span>Bridge</span></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isCompanionView && (
            <button
              onClick={isPaused ? handleResume : handlePause}
              className={`btn ${isPaused ? 'btn-warning' : 'btn-secondary'}`}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              {isPaused ? <Play size={14} /> : <Pause size={14} />}
              <span>{isPaused ? 'Resume' : 'Pause'}</span>
            </button>
          )}
          <ConnectionBadge state={connectionState} />
        </div>
      </header>

      {/* ONLY 2 Tabs: Keyboard & Trackpad */}
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

      <main className="mobile-content-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <ErrorBoundary>
          {isCompanionView ? (
            <PcCompanion
              liveText={companionText}
              revision={companionRevision}
              deviceInfo={deviceInfo}
              connectionState={connectionState}
              isPaused={isPaused}
              pin={pin}
              pairingUrl={pairingUrl}
              streamAttachments={streamAttachments}
              onRemoveAttachment={(id) => setStreamAttachments((prev) => prev.filter((a) => a.id !== id))}
              onClear={handleClear}
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
                ackTransferId={ackTransferId}
                onKeyPress={handleKeyPress}
                initialOpenAttach={shouldOpenAttachOnKeyboard}
                onClearOpenAttach={() => setShouldOpenAttachOnKeyboard(false)}
              />
            ) : (
              <MobileMouse
                onMouseMove={handleMouseMove}
                onMouseClick={handleMouseClick}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseScroll={handleMouseScroll}
                onKeyPress={handleKeyPress}
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
        </ErrorBoundary>
      </main>
    </div>
  );
};
