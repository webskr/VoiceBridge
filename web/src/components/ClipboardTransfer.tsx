import React, { useState, useRef, useEffect } from 'react';
import { Clipboard, Send, Pause, Play, XCircle, CheckCircle2, FileText, AlertCircle, Copy } from 'lucide-react';
import { TransferProgress } from '../types';

interface ClipboardTransferProps {
  onStartTransfer: (meta: { transferId: string; totalChunks: number; totalBytes: number; totalLines: number; autoPaste: boolean }) => void;
  onSendChunk: (chunk: { transferId: string; chunkIndex: number; data: string; checksum: number }) => void;
  onControlTransfer: (transferId: string, action: 'pause' | 'resume' | 'cancel') => void;
  activeProgress?: TransferProgress | null;
  ackChunkIndex: number;
}

// Simple fast CRC32 in JS
function crc32(str: string): number {
  let crc = 0 ^ (-1);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    crc = (crc >>> 8) ^ table[(crc ^ code) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  table[i] = c;
}

export const ClipboardTransfer: React.FC<ClipboardTransferProps> = ({
  onStartTransfer,
  onSendChunk,
  onControlTransfer,
  activeProgress,
  ackChunkIndex
}) => {
  const [content, setContent] = useState('');
  const [autoPaste, setAutoPaste] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTransferId, setCurrentTransferId] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [successStatus, setSuccessStatus] = useState(false);

  const chunksRef = useRef<string[]>([]);
  const nextChunkIndexRef = useRef<number>(0);
  const isPausedRef = useRef<boolean>(false);
  const isCancelledRef = useRef<boolean>(false);

  const linesCount = content ? content.split(/\r\n|\r|\n/).length : 0;
  const charsCount = content.length;
  const bytesCount = new TextEncoder().encode(content).length;

  const handlePasteFromClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setContent(text);
          setSuccessStatus(false);
        }
      } else {
        setErrorStatus("Clipboard API not available. Please paste manually into the box.");
      }
    } catch (err: any) {
      setErrorStatus("Could not read clipboard automatically. Please paste with long-press.");
    }
  };

  const handleStartTransfer = () => {
    if (!content.trim()) return;

    setErrorStatus(null);
    setSuccessStatus(false);
    setIsSending(true);
    setIsPaused(false);
    isPausedRef.current = false;
    isCancelledRef.current = false;

    const transferId = 'xfer_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
    setCurrentTransferId(transferId);

    // Split text into 16KB chunks (safe size for WebSocket frames)
    const CHUNK_SIZE = 16384;
    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += CHUNK_SIZE) {
      chunks.push(content.substring(i, i + CHUNK_SIZE));
    }

    chunksRef.current = chunks;
    nextChunkIndexRef.current = 0;

    // Send transfer_start metadata
    onStartTransfer({
      transferId,
      totalChunks: chunks.length,
      totalBytes: bytesCount,
      totalLines: linesCount,
      autoPaste
    });

    // Send first chunk immediately
    sendNextChunk(transferId, 0);
  };

  const sendNextChunk = (transferId: string, index: number) => {
    if (isCancelledRef.current || isPausedRef.current) return;
    if (index >= chunksRef.current.length) return;

    const data = chunksRef.current[index];
    const checksum = crc32(data);

    onSendChunk({
      transferId,
      chunkIndex: index,
      data,
      checksum
    });
  };

  // React to incoming ACK from agent
  useEffect(() => {
    if (!isSending || isPausedRef.current || isCancelledRef.current || !currentTransferId) return;

    if (ackChunkIndex >= 0) {
      const nextIndex = ackChunkIndex + 1;
      nextChunkIndexRef.current = nextIndex;

      if (nextIndex < chunksRef.current.length) {
        // Send next chunk
        sendNextChunk(currentTransferId, nextIndex);
      } else {
        // Complete!
        setIsSending(false);
        setSuccessStatus(true);
      }
    }
  }, [ackChunkIndex]);

  const handlePause = () => {
    setIsPaused(true);
    isPausedRef.current = true;
    if (currentTransferId) {
      onControlTransfer(currentTransferId, 'pause');
    }
  };

  const handleResume = () => {
    setIsPaused(false);
    isPausedRef.current = false;
    if (currentTransferId) {
      onControlTransfer(currentTransferId, 'resume');
      sendNextChunk(currentTransferId, nextChunkIndexRef.current);
    }
  };

  const handleCancel = () => {
    isCancelledRef.current = true;
    setIsSending(false);
    setIsPaused(false);
    if (currentTransferId) {
      onControlTransfer(currentTransferId, 'cancel');
    }
    setCurrentTransferId(null);
  };

  return (
    <div className="mobile-container">
      <div className="instruction-banner" style={{ background: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.25)', color: '#34d399' }}>
        <FileText size={18} />
        <span>Paste large texts or code (<b>2,000–3,000+ lines</b>) below to transfer to your Windows PC with 100% accuracy.</span>
      </div>

      <div className="text-input-wrapper">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste large text or clipboard content here (2,000–3,000+ lines supported)..."
          className="mobile-textarea"
          disabled={isSending}
          style={{ minHeight: '200px' }}
        />

        <div className="voice-indicator-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span><b>{linesCount.toLocaleString()}</b> lines</span>
            <span>•</span>
            <span><b>{charsCount.toLocaleString()}</b> chars</span>
            <span>•</span>
            <span><b>{(bytesCount / 1024).toFixed(1)}</b> KB</span>
          </div>

          <button
            type="button"
            onClick={handlePasteFromClipboard}
            className="btn btn-secondary"
            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
          >
            <Copy size={12} />
            <span>Paste from Phone</span>
          </button>
        </div>
      </div>

      {/* Progress Bar Display */}
      {isSending && activeProgress && (
        <div style={{ marginTop: '1rem', background: 'var(--bg-card)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
            <span>Transferring: <b>{activeProgress.percent}%</b></span>
            <span>Chunk {activeProgress.receivedChunks} of {activeProgress.totalChunks}</span>
          </div>

          <div style={{ width: '100%', height: '8px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${activeProgress.percent}%`, height: '100%', background: 'var(--accent-cyan)', transition: 'width 0.2s' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span>{(activeProgress.receivedBytes / 1024).toFixed(1)} KB / {(activeProgress.totalBytes / 1024).toFixed(1)} KB</span>
            <span>{activeProgress.totalLines.toLocaleString()} lines</span>
          </div>
        </div>
      )}

      {successStatus && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-green)', background: 'rgba(16, 185, 129, 0.1)', padding: '0.75rem', borderRadius: '8px', marginTop: '1rem', fontSize: '0.9rem' }}>
          <CheckCircle2 size={18} />
          <span>Transferred {linesCount.toLocaleString()} lines successfully to Windows PC!</span>
        </div>
      )}

      {errorStatus && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-red)', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '8px', marginTop: '1rem', fontSize: '0.85rem' }}>
          <AlertCircle size={18} />
          <span>{errorStatus}</span>
        </div>
      )}

      {/* Settings & Options */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '1rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        <input
          type="checkbox"
          id="autoPasteCheck"
          checked={autoPaste}
          onChange={(e) => setAutoPaste(e.target.checked)}
          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
        />
        <label htmlFor="autoPasteCheck" style={{ cursor: 'pointer' }}>
          Auto-paste directly into active PC cursor (Ctrl+V) upon transfer
        </label>
      </div>

      {/* Control Buttons */}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        {!isSending ? (
          <button
            type="button"
            onClick={handleStartTransfer}
            className="btn btn-primary"
            style={{ flex: 1, padding: '0.85rem' }}
            disabled={!content.trim()}
          >
            <Send size={18} />
            <span>Transfer to PC ({linesCount.toLocaleString()} lines)</span>
          </button>
        ) : (
          <>
            {isPaused ? (
              <button type="button" onClick={handleResume} className="btn btn-warning" style={{ flex: 1 }}>
                <Play size={16} />
                <span>Resume</span>
              </button>
            ) : (
              <button type="button" onClick={handlePause} className="btn btn-secondary" style={{ flex: 1 }}>
                <Pause size={16} />
                <span>Pause</span>
              </button>
            )}

            <button type="button" onClick={handleCancel} className="btn btn-danger" style={{ flex: 1 }}>
              <XCircle size={16} />
              <span>Cancel</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};

