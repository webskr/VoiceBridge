import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  Pause, 
  Play, 
  Trash2, 
  LogOut, 
  Globe, 
  CornerDownLeft, 
  Check, 
  Clipboard, 
  Send, 
  FileText, 
  Copy,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { TransferProgress } from '../types';

interface KeyboardProps {
  onSendTextUpdate: (text: string, revision: number, isFinal: boolean) => void;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
  onDisconnect: () => void;
  isPaused: boolean;
  pcStatus: string;
  // Clipboard integration
  onStartTransfer: (meta: { transferId: string; totalChunks: number; totalBytes: number; totalLines: number; autoPaste: boolean }) => void;
  onSendChunk: (chunk: { transferId: string; chunkIndex: number; data: string; checksum: number }) => void;
  activeProgress?: TransferProgress | null;
  ackChunkIndex: number;
}

// Simple fast CRC32
function crc32(str: string): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = 0 ^ (-1);
  for (let i = 0; i < str.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ str.charCodeAt(i)) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

export const Keyboard: React.FC<KeyboardProps> = ({
  onSendTextUpdate,
  onPause,
  onResume,
  onClear,
  onDisconnect,
  isPaused,
  onStartTransfer,
  onSendChunk,
  activeProgress,
  ackChunkIndex
}) => {
  const [text, setText] = useState('');
  const [revision, setRevision] = useState(0);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [showClipboardBox, setShowClipboardBox] = useState(false);
  
  // Clipboard transfer state
  const [clipboardPayload, setClipboardPayload] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const bottomBarRef = useRef<HTMLDivElement>(null);
  const chunksRef = useRef<string[]>([]);
  const nextChunkRef = useRef<number>(0);
  const transferIdRef = useRef<string>('');

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setIsSpeechSupported(true);
      const recog = new SpeechRecognition();
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = 'hi-IN, en-IN, en-US';

      recog.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        handleTextChange(currentTranscript, true);
      };

      recog.onerror = () => setIsListening(false);
      recog.onend = () => setIsListening(false);
      recognitionRef.current = recog;
    }
  }, []);

  // Visual Viewport tracking for mobile virtual keyboard
  useEffect(() => {
    const handleViewportChange = () => {
      if (!window.visualViewport) return;
      const vv = window.visualViewport;
      const offsetBottom = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      if (bottomBarRef.current) {
        bottomBarRef.current.style.bottom = `${offsetBottom}px`;
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
      window.visualViewport.addEventListener('scroll', handleViewportChange);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
        window.visualViewport.removeEventListener('scroll', handleViewportChange);
      }
    };
  }, []);

  const handleTextChange = (newText: string, isFromMic: boolean = false) => {
    setText(newText);
    const nextRev = revision + 1;
    setRevision(nextRev);
    onSendTextUpdate(newText, nextRev, isFromMic);
  };

  const handleClear = () => {
    setText('');
    const nextRev = revision + 1;
    setRevision(nextRev);
    onClear();
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleCommit = () => {
    if (!text.trim()) return;
    const nextRev = revision + 1;
    setRevision(nextRev);
    onSendTextUpdate(text + '\n', nextRev, true);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 1200);

    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const toggleBrowserMic = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Large Chunked Clipboard Transfer
  const handleFastPasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const clipText = await navigator.clipboard.readText();
        if (clipText) {
          setClipboardPayload(clipText);
          setShowClipboardBox(true);
        }
      }
    } catch {
      setShowClipboardBox(true);
    }
  };

  const startTransfer = () => {
    if (!clipboardPayload.trim() || isTransferring) return;

    setIsTransferring(true);
    setTransferSuccess(false);

    const CHUNK_SIZE = 16384; // 16KB
    const chunks: string[] = [];
    for (let i = 0; i < clipboardPayload.length; i += CHUNK_SIZE) {
      chunks.push(clipboardPayload.slice(i, i + CHUNK_SIZE));
    }

    chunksRef.current = chunks;
    nextChunkRef.current = 0;
    const transferId = 'tr_' + Math.random().toString(36).substring(2, 9);
    transferIdRef.current = transferId;

    const lines = clipboardPayload.split('\n').length;
    const bytes = new Blob([clipboardPayload]).size;

    onStartTransfer({
      transferId,
      totalChunks: chunks.length,
      totalBytes: bytes,
      totalLines: lines,
      autoPaste: true
    });

    sendNextChunk();
  };

  const sendNextChunk = () => {
    const idx = nextChunkRef.current;
    if (idx < chunksRef.current.length) {
      const data = chunksRef.current[idx];
      const checksum = crc32(data);
      onSendChunk({
        transferId: transferIdRef.current,
        chunkIndex: idx,
        data,
        checksum
      });
      nextChunkRef.current++;
    } else {
      setIsTransferring(false);
      setTransferSuccess(true);
      setTimeout(() => {
        setTransferSuccess(false);
        setClipboardPayload('');
        setShowClipboardBox(false);
      }, 2000);
    }
  };

  useEffect(() => {
    if (isTransferring && ackChunkIndex >= 0) {
      sendNextChunk();
    }
  }, [ackChunkIndex]);

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="mobile-typing-screen">
      {/* Main Typing Area */}
      <div className="text-input-wrapper">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="Speak or type live... Words appear instantly at your PC cursor!"
          className="mobile-textarea"
          autoFocus
        />

        {/* Counter & 3k+ Lines Bar */}
        <div className="voice-indicator-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className={`counter-badge ${wordCount >= 45 ? 'counter-warning' : ''}`}>
              {wordCount} words ({text.length} chars)
            </span>
          </div>

          <button
            type="button"
            className="btn-micro"
            onClick={handleFastPasteClipboard}
            title="Paste large 3000+ line code"
          >
            <Clipboard size={12} />
            <span>3k+ Lines Clipboard</span>
          </button>
        </div>
      </div>

      {/* Expandable 3,000+ Lines Large Clipboard Section */}
      {showClipboardBox && (
        <div className="clipboard-modal-card">
          <div className="clipboard-modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <FileText size={16} className="text-cyan" />
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Send Large Clipboard / Code (3,000+ Lines)</span>
            </div>
            <button 
              type="button" 
              className="btn-close-modal"
              onClick={() => setShowClipboardBox(false)}
            >
              ✕
            </button>
          </div>

          <textarea
            value={clipboardPayload}
            onChange={(e) => setClipboardPayload(e.target.value)}
            placeholder="Paste massive code, logs, or multi-thousand line document here..."
            className="clipboard-modal-textarea"
            rows={4}
          />

          <div className="clipboard-modal-footer">
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {clipboardPayload.split('\n').length} lines • {clipboardPayload.length} chars
            </span>

            <button
              type="button"
              className="btn btn-primary btn-transfer-now"
              onClick={startTransfer}
              disabled={isTransferring || !clipboardPayload.trim()}
            >
              {transferSuccess ? <Check size={14} /> : <Send size={14} />}
              <span>{transferSuccess ? 'Pasted on PC!' : isTransferring ? 'Sending...' : 'Send to PC Clipboard'}</span>
            </button>
          </div>
        </div>
      )}

      {/* DOCKED FIXED ACTIONS TOOLBAR */}
      <div className="fixed-dock-container" ref={bottomBarRef}>
        <div className="dock-card">
          <button
            type="button"
            onClick={handleCommit}
            className="btn btn-primary dock-btn"
            title="Commit / Enter on PC"
          >
            {copiedNotification ? <Check size={16} /> : <CornerDownLeft size={16} />}
            <span>{copiedNotification ? 'Sent!' : 'Enter ↵'}</span>
          </button>

          {isPaused ? (
            <button
              type="button"
              onClick={onResume}
              className="btn btn-warning dock-btn"
            >
              <Play size={16} />
              <span>Resume</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onPause}
              className="btn btn-secondary dock-btn"
            >
              <Pause size={16} />
              <span>Pause</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleClear}
            className="btn btn-secondary dock-btn"
          >
            <Trash2 size={16} />
            <span>Clear</span>
          </button>

          <button
            type="button"
            onClick={onDisconnect}
            className="btn btn-danger dock-btn"
          >
            <LogOut size={16} />
            <span>Exit</span>
          </button>
        </div>
      </div>
    </div>
  );
};

