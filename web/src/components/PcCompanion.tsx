import React, { useState, useEffect } from 'react';
import { Monitor, Smartphone, Pause, Play, Trash2, LogOut, Activity, Info, Copy, FileText, Check, Power, Clock, CheckCircle2, QrCode } from 'lucide-react';
import { ConnectionBadge } from './ConnectionBadge';
import { ConnectionState, TransferProgress, HistoryItem } from '../types';

interface PcCompanionProps {
  liveText: string;
  revision: number;
  deviceInfo: string;
  connectionState: ConnectionState;
  isPaused: boolean;
  activeTransfer: TransferProgress | null;
  history: HistoryItem[];
  startupEnabled: boolean;
  pin?: string;
  pairingUrl?: string;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
  onDisconnect: () => void;
  onToggleStartup: (enabled: boolean) => void;
  onCopyHistory: (id: string) => Promise<boolean>;
  onInjectHistory: (id: string, delay?: number) => Promise<boolean>;
}

export const PcCompanion: React.FC<PcCompanionProps> = ({
  liveText,
  revision,
  deviceInfo,
  connectionState,
  isPaused,
  activeTransfer,
  history,
  startupEnabled,
  pin,
  pairingUrl,
  onPause,
  onResume,
  onClear,
  onDisconnect,
  onToggleStartup,
  onCopyHistory,
  onInjectHistory
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [injectingId, setInjectingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'mirror' | 'history'>('mirror');

  const wordCount = liveText.trim() ? liveText.trim().split(/\s+/).length : 0;

  const handleCopy = async (id: string) => {
    const success = await onCopyHistory(id);
    if (success) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleInject = async (id: string) => {
    setInjectingId(id);
    // 2 second delay to let user switch focus to Notepad or another window
    await onInjectHistory(id, 2);
    setTimeout(() => setInjectingId(null), 2500);
  };

  return (
    <div className="companion-container">
      {/* Top Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Monitor className="brand-icon" size={28} />
            <span>VoiceBridge PC Dashboard</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Live text transfer, 3,000+ line clipboard engine & cursor injection
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <ConnectionBadge state={connectionState} />
          {isPaused ? (
            <button onClick={onResume} className="btn btn-warning" style={{ padding: '0.5rem 1rem' }}>
              <Play size={16} />
              <span>Resume Injection</span>
            </button>
          ) : (
            <button onClick={onPause} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>
              <Pause size={16} />
              <span>Pause Injection</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Transfer Banner (if chunked transfer in progress) */}
      {activeTransfer && activeTransfer.status !== 'completed' && (
        <div style={{ marginTop: '1.25rem', background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '1rem 1.25rem', borderRadius: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>
              <FileText size={18} />
              <span>Receiving Large Clipboard Transfer ({activeTransfer.totalLines.toLocaleString()} lines)</span>
            </div>
            <span style={{ fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '1.1rem' }}>{activeTransfer.percent}%</span>
          </div>

          <div style={{ width: '100%', height: '8px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${activeTransfer.percent}%`, height: '100%', background: 'var(--accent-cyan)', transition: 'width 0.2s' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span>{(activeTransfer.receivedBytes / 1024).toFixed(1)} KB / {(activeTransfer.totalBytes / 1024).toFixed(1)} KB</span>
            <span>Chunk {activeTransfer.receivedChunks} of {activeTransfer.totalChunks}</span>
            <span>{activeTransfer.autoPaste ? 'Auto-Pasting (Ctrl+V)' : 'Clipboard Only'}</span>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '1.25rem', borderBottom: '1px solid var(--border-color)' }}>
        <button
          onClick={() => setActiveTab('mirror')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'mirror' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            color: activeTab === 'mirror' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
            fontWeight: 600,
            padding: '0.65rem 1rem',
            cursor: 'pointer',
            fontSize: '0.95rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem'
          }}
        >
          <Activity size={16} />
          <span>Live Mirror</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'history' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            color: activeTab === 'history' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
            fontWeight: 600,
            padding: '0.65rem 1rem',
            cursor: 'pointer',
            fontSize: '0.95rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem'
          }}
        >
          <Clock size={16} />
          <span>Transfer History ({history.length})</span>
        </button>
      </div>

      <div className="companion-grid">
        {/* Main Content Area */}
        {activeTab === 'mirror' ? (
          <div className="mirror-panel">
            <div className="mirror-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                <Activity size={16} color="var(--accent-cyan)" />
                <span>Live Voice Typing Stream</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Revision #{revision}
              </div>
            </div>

            <div className="live-mirror-text">
              {liveText ? (
                <>
                  {liveText}
                  <span className="blinking-cursor" />
                </>
              ) : (
                <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Waiting for phone input... Words spoken on mobile or pasted will appear live in your active PC cursor!
                </span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {liveText.length} characters • {wordCount} words
              </span>
              <button onClick={onClear} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                <Trash2 size={14} />
                <span>Clear</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="mirror-panel">
            <div className="mirror-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                <FileText size={16} color="var(--accent-cyan)" />
                <span>Recent Transfers ({history.length})</span>
              </div>
            </div>

            {history.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)', gap: '0.75rem' }}>
                <FileText size={32} />
                <p>No transfers yet. Paste 2,000–3,000+ lines from mobile to see them here.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', overflowY: 'auto', maxHeight: '500px' }}>
                {history.map((item) => (
                  <div key={item.id} style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                        {item.totalLines.toLocaleString()} lines • {(item.totalBytes / 1024).toFixed(1)} KB
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {item.timeFormatted}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '0.5rem', borderRadius: '6px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: '70px', overflow: 'hidden' }}>
                      {item.preview}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                      <button
                        onClick={() => handleCopy(item.id)}
                        className="btn btn-secondary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                      >
                        {copiedId === item.id ? <Check size={14} color="var(--accent-green)" /> : <Copy size={14} />}
                        <span>{copiedId === item.id ? 'Copied!' : 'Copy to PC Clipboard'}</span>
                      </button>

                      <button
                        onClick={() => handleInject(item.id)}
                        className="btn btn-primary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                        disabled={injectingId === item.id}
                      >
                        <CheckCircle2 size={14} />
                        <span>{injectingId === item.id ? 'Pasting in 2s (focus window!)...' : 'Paste into Active Window'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sidebar Status & Diagnostics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* QR Code Pairing Scanner Card */}
          <div className="stats-card" style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem' }}>
              <QrCode size={18} color="var(--accent-cyan)" />
              <span>Scan to Connect Phone</span>
            </h3>

            <div style={{ background: '#ffffff', padding: '10px', borderRadius: '12px', display: 'inline-block', margin: '0.75rem auto 0.5rem' }}>
              <img src="/qr" alt="Pairing QR Code" style={{ width: '170px', height: '170px', display: 'block' }} />
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              PIN: <b style={{ color: 'var(--accent-cyan)', fontSize: '1.25rem', letterSpacing: '3px', marginLeft: '4px' }}>{pin || 'J5R3AC'}</b>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              Point your phone's camera at this QR code to connect instantly.
            </p>

            {pairingUrl && (
              <div style={{ marginTop: '0.65rem' }}>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(pairingUrl)}
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', width: '100%' }}
                >
                  <Copy size={12} />
                  <span>Copy Mobile URL</span>
                </button>
              </div>
            )}
          </div>

          <div className="stats-card">
            <h3 style={{ fontSize: '1rem', fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              Connection & System
            </h3>

            <div className="stat-item">
              <span className="stat-label">Connected Phone:</span>
              <span className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Smartphone size={14} color="var(--accent-cyan)" />
                {deviceInfo || 'Waiting for pairing...'}
              </span>
            </div>

            <div className="stat-item">
              <span className="stat-label">Windows Injection:</span>
              <span className="stat-value" style={{ color: isPaused ? 'var(--accent-amber)' : 'var(--accent-green)' }}>
                {isPaused ? 'Paused' : 'Active (SendInput + Clipboard)'}
              </span>
            </div>

            <div className="stat-item">
              <span className="stat-label">Target Applications:</span>
              <span className="stat-value">Notepad, VS Code, Chrome, etc.</span>
            </div>

            <div className="stat-item">
              <span className="stat-label">Languages Supported:</span>
              <span className="stat-value">English & Hindi Unicode</span>
            </div>

            {/* Windows Startup Toggle */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Power size={14} />
                  <span>Start with Windows:</span>
                </span>
                <input
                  type="checkbox"
                  checked={startupEnabled}
                  onChange={(e) => onToggleStartup(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
                Automatically launches VoiceBridge Agent on PC boot.
              </span>
            </div>

            <button onClick={onDisconnect} className="btn btn-danger" style={{ width: '100%', marginTop: '0.5rem' }}>
              <LogOut size={16} />
              <span>Disconnect Phone</span>
            </button>
          </div>

          <div className="callout-box">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
              <Info size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <b>Cursor Injection:</b> Select any text area in <b>Notepad</b>, <b>VS Code</b>, or <b>WhatsApp Desktop</b>. VoiceBridge automatically types or pastes into the active cursor without stealing focus.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
