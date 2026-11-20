import React, { useState, useRef, useEffect } from 'react';
import {
  Activity,
  Mic,
  QrCode,
  Smartphone,
  Copy,
  Check,
  CheckCircle2,
  Trash2,
  FileText,
  X,
  ExternalLink,
  ShieldCheck,
  Image as ImageIcon
} from 'lucide-react';
import { ConnectionState, StreamAttachment } from '../types';

interface PcCompanionProps {
  liveText: string;
  revision: number;
  deviceInfo: string;
  connectionState: ConnectionState;
  isPaused: boolean;
  pin: string;
  pairingUrl: string;
  streamAttachments: StreamAttachment[];
  onRemoveAttachment: (id: string) => void;
  onClear: () => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export const PcCompanion: React.FC<PcCompanionProps> = ({
  liveText,
  revision,
  deviceInfo,
  connectionState,
  isPaused,
  pin,
  pairingUrl,
  streamAttachments,
  onRemoveAttachment,
  onClear
}) => {
  const [liveCopied, setLiveCopied] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [liveCountdown, setLiveCountdown] = useState<number | null>(null);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);

  const streamBoxRef = useRef<HTMLDivElement>(null);
  const streamTextareaRef = useRef<HTMLTextAreaElement>(null);
  const isUserScrolledUpRef = useRef(false);

  const handleStreamScroll = () => {
    const el = streamBoxRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isUserScrolledUpRef.current = distFromBottom > 35;
  };

  // Keep textarea expanded so stream-box-container does ALL scrolling (chips + text together)
  useEffect(() => {
    if (streamTextareaRef.current) {
      streamTextareaRef.current.style.height = 'auto';
      streamTextareaRef.current.style.height = `${Math.max(120, streamTextareaRef.current.scrollHeight)}px`;
    }
    if (!isUserScrolledUpRef.current && streamBoxRef.current) {
      streamBoxRef.current.scrollTop = streamBoxRef.current.scrollHeight;
    }
  }, [liveText, streamAttachments]);

  // Copy plain text only from stream
  const handleCopyLive = async () => {
    if (!liveText) return;
    try {
      await navigator.clipboard.writeText(liveText);
      setLiveCopied(true);
      setTimeout(() => setLiveCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy stream text:', err);
    }
  };

  // Inject stream text into active cursor with 2-second countdown
  const handleInjectLive = async (delaySec: number = 2) => {
    if (!liveText || liveCountdown !== null) return;
    setLiveCountdown(delaySec);
    try {
      await fetch('/api/paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: liveText, delay: delaySec })
      });
    } catch (err) {
      console.error('Failed to inject text:', err);
    }

    let rem = delaySec;
    const interval = setInterval(() => {
      rem--;
      if (rem <= 0) {
        clearInterval(interval);
        setLiveCountdown(null);
      } else {
        setLiveCountdown(rem);
      }
    }, 1000);
  };

  const handleCopyUrl = async () => {
    if (!pairingUrl) return;
    try {
      await navigator.clipboard.writeText(pairingUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const wordCount = liveText.trim() ? liveText.trim().split(/\s+/).length : 0;

  return (
    <div className="companion-full-viewport">
      {/* LEFT COLUMN: Live Voice Typing Stream card (70%) */}
      <section className="companion-left-column">
        {/* Stream Header */}
        <div className="stream-header-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Activity size={18} color="var(--accent-cyan)" />
            <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>
              Live Voice Typing Stream
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Revision #{revision}
            </span>
          </div>
        </div>

        {/* Live Stream Box: Single unified scroll container for chips + text */}
        <div className="stream-box-container" ref={streamBoxRef} onScroll={handleStreamScroll}>
          {/* Chat-style Attachment Chips */}
          {streamAttachments.length > 0 && (
            <div className="stream-chips-container">
              {streamAttachments.map((item) => (
                <div key={item.id} className="stream-chip">
                  {item.type === 'image' ? (
                    item.url ? (
                      <img
                        src={item.url}
                        alt={item.name}
                        className="stream-chip-img-thumb"
                        title="Click to enlarge"
                        onClick={() => setPreviewModalUrl(item.url || null)}
                      />
                    ) : (
                      <ImageIcon size={22} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
                    )
                  ) : (
                    <FileText size={20} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
                  )}

                  <div className="stream-chip-info">
                    <span className="stream-chip-name" title={item.name}>
                      {item.name}
                    </span>
                    <span className="stream-chip-status">
                      {formatBytes(item.size)} •{' '}
                      {item.status === 'receiving' ? (
                        <span style={{ color: 'var(--accent-cyan)' }}>
                          Receiving {item.progress || 0}%
                        </span>
                      ) : item.status === 'saved' ? (
                        <span style={{ color: 'var(--accent-green)' }}>Saved on PC</span>
                      ) : (
                        <span style={{ color: 'var(--accent-red)' }}>Failed</span>
                      )}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(item.id)}
                    className="stream-chip-close"
                    title="Remove attachment"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Text Area for Live Typing: auto-expands, never scrolls internally */}
          <textarea
            ref={streamTextareaRef}
            className="stream-live-textarea"
            value={liveText}
            readOnly
            placeholder="Waiting for phone input... Words spoken on mobile or typed on virtual keyboard will stream here live and inject directly into your active PC cursor!"
          />
        </div>

        {/* Stream Actions & Info Bar */}
        <div className="stream-action-bar">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
            <button
              onClick={handleCopyLive}
              disabled={!liveText}
              className="btn btn-secondary"
              style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
            >
              {liveCopied ? <Check size={15} color="var(--accent-green)" /> : <Copy size={15} />}
              <span>{liveCopied ? 'Copied Text!' : 'Copy Stream Text'}</span>
            </button>

            <button
              onClick={() => handleInjectLive(2)}
              disabled={!liveText || liveCountdown !== null}
              className="btn btn-primary"
              style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
            >
              <CheckCircle2 size={15} />
              <span>
                {liveCountdown !== null
                  ? `Click target input box now... (${liveCountdown}s)`
                  : 'Paste into Active Window (Ctrl+V)'}
              </span>
            </button>

            <button
              onClick={onClear}
              disabled={!liveText && streamAttachments.length === 0}
              className="btn btn-secondary"
              style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
            >
              <Trash2 size={15} />
              <span>Clear</span>
            </button>
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {liveText.length} characters • {wordCount} words
          </div>
        </div>
      </section>

      {/* RIGHT COLUMN: Direct Voice & Pairing Cards (30%) */}
      <aside className="companion-right-column">
        {/* Direct PC Voice Dictation Card */}
        <div className="compact-side-card" style={{ border: '1px solid rgba(56, 189, 248, 0.4)', background: 'linear-gradient(135deg, rgba(19, 27, 46, 0.95), rgba(56, 189, 248, 0.08))' }}>
          <h3 className="side-card-title">
            <Mic size={17} color="var(--accent-cyan)" />
            <span>PC Direct Voice (Zero Phone)</span>
          </h3>

          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Press global hotkey anywhere to speak & direct-type into cursor:
            <div style={{ marginTop: '0.4rem', background: 'var(--bg-input)', padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Global Hotkey:</span>
              <kbd style={{ background: 'var(--accent-cyan)', color: '#090d16', padding: '0.2rem 0.55rem', borderRadius: '4px', fontWeight: 700, fontSize: '0.8rem' }}>Ctrl + Alt + V</kbd>
            </div>
          </div>

          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: '1.45', marginTop: '0.35rem' }}>
            • Works in VS Code, Notepad, Browser, Antigravity<br />
            • Supports Hindi, Hinglish & English mixed speech
          </div>
        </div>

        {/* Scan to Connect Phone Card */}
        <div className="compact-side-card" style={{ textAlign: 'center' }}>
          <h3 className="side-card-title" style={{ justifyContent: 'center' }}>
            <QrCode size={17} color="var(--accent-cyan)" />
            <span>Scan to Connect Phone</span>
          </h3>

          <div style={{ background: '#ffffff', padding: '8px', borderRadius: '10px', display: 'inline-block', margin: '0.45rem auto 0.35rem' }}>
            <img src="/qr" alt="Pairing QR Code" style={{ width: '130px', height: '130px', display: 'block' }} />
          </div>

          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            PIN: <b style={{ color: 'var(--accent-cyan)', fontSize: '1.15rem', letterSpacing: '2.5px', marginLeft: '4px' }}>{pin || 'J5R3AC'}</b>
          </div>

          {pairingUrl && (
            <div style={{ marginTop: '0.45rem' }}>
              <button
                type="button"
                onClick={handleCopyUrl}
                className="btn btn-secondary"
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
              >
                {copiedUrl ? <Check size={13} color="var(--accent-green)" /> : <Copy size={13} />}
                <span>{copiedUrl ? 'Copied URL!' : 'Copy Mobile URL'}</span>
              </button>
            </div>
          )}
        </div>

        {/* System & Connection Status Card */}
        <div className="compact-side-card">
          <h3 className="side-card-title">
            <ShieldCheck size={17} color="var(--accent-cyan)" />
            <span>Connection & Status</span>
          </h3>

          <div className="compact-stat-row">
            <span style={{ color: 'var(--text-secondary)' }}>Phone:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.3rem', maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <Smartphone size={13} color="var(--accent-cyan)" />
              {deviceInfo || 'Waiting for pairing...'}
            </span>
          </div>

          <div className="compact-stat-row">
            <span style={{ color: 'var(--text-secondary)' }}>Injection:</span>
            <span style={{ fontWeight: 600, color: isPaused ? 'var(--accent-amber)' : 'var(--accent-green)' }}>
              {isPaused ? 'Paused' : 'Active (Direct Cursor)'}
            </span>
          </div>
        </div>
      </aside>

      {/* Enlarged Image Lightbox Modal */}
      {previewModalUrl && (
        <div className="image-modal-overlay" onClick={() => setPreviewModalUrl(null)}>
          <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="image-modal-close"
              onClick={() => setPreviewModalUrl(null)}
              title="Close preview"
            >
              <X size={18} />
            </button>
            <img src={previewModalUrl} alt="Preview" />
          </div>
        </div>
      )}
    </div>
  );
};
