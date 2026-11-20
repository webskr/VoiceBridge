import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  Pause, 
  Play, 
  Trash2, 
  LogOut, 
  CornerDownLeft, 
  Check, 
  Paperclip, 
  Image as ImageIcon, 
  FileUp, 
  FolderDown, 
  FileText, 
  RotateCw, 
  X
} from 'lucide-react';
import { TransferProgress } from '../types';

export interface AttachedItem {
  id: string;
  file: File;
  type: 'image' | 'file';
  name: string;
  size: number;
  previewUrl?: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
  transferId?: string;
}

interface KeyboardProps {
  onSendTextUpdate: (text: string, revision: number, isFinal: boolean) => void;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
  onDisconnect: () => void;
  isPaused: boolean;
  pcStatus: string;
  onStartTransfer: (meta: {
    transferId: string;
    name?: string;
    transferType?: 'text' | 'image' | 'file';
    totalChunks: number;
    totalBytes: number;
    totalLines?: number;
    autoPaste: boolean;
    checksum?: number;
  }) => void;
  onSendChunk: (chunk: { transferId: string; chunkIndex: number; data: string; checksum: number }) => void;
  activeProgress?: TransferProgress | null;
  ackChunkIndex: number;
  ackTransferId?: string;
  onKeyPress?: (key: string) => void;
  initialOpenAttach?: boolean;
  onClearOpenAttach?: () => void;
}

// Fast CRC32
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

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.substring(result.indexOf(',') + 1);
      resolve(base64);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
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
  ackChunkIndex,
  ackTransferId,
  onKeyPress,
  initialOpenAttach,
  onClearOpenAttach
}) => {
  const [text, setText] = useState('');
  const [revision, setRevision] = useState(0);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Attachments State
  const [attachments, setAttachments] = useState<AttachedItem[]>([]);
  const [isAttachSheetOpen, setIsAttachSheetOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // File Inputs
  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Upload Queues Map: transferId -> { itemId, chunks, total }
  const uploadQueuesRef = useRef<Map<string, { itemId: string; chunks: string[]; total: number }>>(new Map());

  // Scroll tracking to avoid jarring jump if user scrolled up manually
  const isUserScrolledUpRef = useRef(false);

  const handleScroll = () => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isUserScrolledUpRef.current = distFromBottom > 35;
  };

  // Auto-expand textarea and auto-scroll to bottom of combined flow
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.max(90, textareaRef.current.scrollHeight)}px`;
    }
    if (!isUserScrolledUpRef.current && scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [text, attachments]);

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

  useEffect(() => {
    if (initialOpenAttach) {
      setIsAttachSheetOpen(true);
      if (onClearOpenAttach) onClearOpenAttach();
    }
  }, [initialOpenAttach]);

  // Handle ACKs for chunked uploads
  useEffect(() => {
    if (ackChunkIndex >= 0 && ackTransferId) {
      const queue = uploadQueuesRef.current.get(ackTransferId);
      if (queue) {
        const nextIdx = ackChunkIndex + 1;
        const percent = Math.min(100, Math.round((nextIdx / queue.total) * 100));

        setAttachments(prev => prev.map(item => {
          if (item.id === queue.itemId) {
            return {
              ...item,
              progress: percent,
              status: nextIdx >= queue.total ? 'completed' : 'uploading'
            };
          }
          return item;
        }));

        if (nextIdx < queue.total) {
          const data = queue.chunks[nextIdx];
          onSendChunk({
            transferId: ackTransferId,
            chunkIndex: nextIdx,
            data,
            checksum: crc32(data)
          });
        } else {
          uploadQueuesRef.current.delete(ackTransferId);
        }
      }
    }
  }, [ackChunkIndex, ackTransferId]);

  const handleTextChange = (newText: string, isFromMic: boolean = false) => {
    setText(newText);
    const nextRev = revision + 1;
    setRevision(nextRev);
    onSendTextUpdate(newText, nextRev, isFromMic);
  };

  const handleClear = () => {
    setText('');
    setAttachments([]);
    const nextRev = revision + 1;
    setRevision(nextRev);
    onClear();
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleCommit = () => {
    if (onKeyPress) {
      onKeyPress('ENTER');
    } else {
      const nextRev = revision + 1;
      setRevision(nextRev);
      onSendTextUpdate(text + '\n', nextRev, true);
    }
    setText('');
    setRevision(0);
    onSendTextUpdate('', 0, false);
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

  // Upload a single attached item
  const startUploadForItem = async (item: AttachedItem) => {
    try {
      setAttachments(prev => prev.map(it => it.id === item.id ? { ...it, status: 'uploading', progress: 5 } : it));
      const rawPayload = await readFileAsBase64(item.file);
      const CHUNK_SIZE = 16384;
      const chunks: string[] = [];
      for (let i = 0; i < rawPayload.length; i += CHUNK_SIZE) {
        chunks.push(rawPayload.substring(i, i + CHUNK_SIZE));
      }

      const transferId = 'xfer_' + Math.random().toString(36).substring(2, 8) + '_' + Date.now();
      uploadQueuesRef.current.set(transferId, {
        itemId: item.id,
        chunks,
        total: chunks.length
      });

      const fullChecksum = crc32(rawPayload);
      onStartTransfer({
        transferId,
        name: item.name,
        transferType: item.type,
        totalChunks: chunks.length,
        totalBytes: item.size,
        autoPaste: true,
        checksum: fullChecksum
      });

      if (chunks.length > 0) {
        onSendChunk({
          transferId,
          chunkIndex: 0,
          data: chunks[0],
          checksum: crc32(chunks[0])
        });
      }
    } catch (err: any) {
      setAttachments(prev => prev.map(it => it.id === item.id ? { ...it, status: 'error', error: err.message } : it));
    }
  };

  // Handle files selected from file inputs
  const handleFilesSelected = (files: FileList | null, kind: 'image' | 'file') => {
    if (!files || files.length === 0) return;
    const newItems: AttachedItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = 'att_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now() + '_' + i;
      const isImg = file.type.startsWith('image/') || kind === 'image';
      const previewUrl = isImg ? URL.createObjectURL(file) : undefined;

      const item: AttachedItem = {
        id,
        file,
        type: isImg ? 'image' : 'file',
        name: file.name,
        size: file.size,
        previewUrl,
        progress: 0,
        status: 'pending'
      };

      newItems.push(item);
    }

    setAttachments(prev => [...prev, ...newItems]);

    // Start upload for each newly attached item immediately
    newItems.forEach(item => {
      startUploadForItem(item);
    });

    // Reset file input values so the same file can be picked again if desired
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';

    // Scroll to bottom of chat input
    setTimeout(() => {
      if (scrollAreaRef.current) {
        scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
      }
    }, 100);
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(item => item.id !== id));
  };

  const retryUpload = (id: string) => {
    const item = attachments.find(it => it.id === id);
    if (item) {
      startUploadForItem(item);
    }
  };

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="mobile-keyboard-screen">
      {/* Hidden File Inputs */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFilesSelected(e.target.files, 'image')}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFilesSelected(e.target.files, 'file')}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory=""
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFilesSelected(e.target.files, 'file')}
      />

      {/* FIXED CHAT INPUT BOX CONTAINER */}
      <div className="chat-input-box-container">
        {/* Scrollable Interior: chips and text scroll together as one content flow */}
        <div
          ref={scrollAreaRef}
          className="chat-input-scroll-area"
          onScroll={handleScroll}
          onClick={() => textareaRef.current?.focus()}
        >
          {/* Inline Attachment Chips */}
          {attachments.length > 0 && (
            <div className="attachments-chips-row">
              {attachments.map(item => (
                <div key={item.id} className={`attachment-chip ${item.status}`}>
                  {item.type === 'image' && item.previewUrl ? (
                    <img src={item.previewUrl} alt={item.name} className="chip-thumb" />
                  ) : (
                    <div className="chip-icon-badge">
                      <FileText size={18} />
                    </div>
                  )}

                  <div className="chip-info">
                    <span className="chip-name" title={item.name}>{item.name}</span>
                    <span className="chip-meta">
                      {(item.size / 1024).toFixed(1)} KB • {
                        item.status === 'uploading' ? `${item.progress}%` :
                        item.status === 'completed' ? 'Sent ✓' :
                        item.status === 'error' ? 'Failed' : 'Pending'
                      }
                    </span>
                  </div>

                  {item.status === 'uploading' && (
                    <div className="chip-spinner" />
                  )}
                  {item.status === 'completed' && (
                    <Check size={14} className="chip-check" />
                  )}
                  {item.status === 'error' && (
                    <button
                      type="button"
                      className="chip-retry-btn"
                      onClick={(e) => { e.stopPropagation(); retryUpload(item.id); }}
                      title="Retry upload"
                    >
                      <RotateCw size={13} />
                    </button>
                  )}

                  <button
                    type="button"
                    className="chip-remove-btn"
                    onClick={(e) => { e.stopPropagation(); removeAttachment(item.id); }}
                    title="Remove"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Typing Area */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder={attachments.length > 0 ? "Add message or keep typing live..." : "Speak or type live... Words appear instantly at your PC cursor!"}
            className="chat-textarea"
            autoFocus
          />
        </div>

        {/* Input Box Status / Counter Row */}
        <div className="input-box-status-bar">
          <span className="counter-badge">
            {wordCount} words ({text.length} chars)
            {attachments.length > 0 && ` • ${attachments.length} attached`}
          </span>

          {isSpeechSupported && (
            <button
              type="button"
              onClick={toggleBrowserMic}
              className={`btn-mic-toggle ${isListening ? 'active' : ''}`}
              title={isListening ? "Listening... Tap to stop" : "Voice Typing"}
            >
              <Mic size={13} />
              <span>{isListening ? 'Listening...' : 'Voice Mic'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ATTACH POPUP BOTTOM SHEET */}
      {isAttachSheetOpen && (
        <div className="attach-sheet-backdrop" onClick={() => setIsAttachSheetOpen(false)}>
          <div className="attach-sheet-card" onClick={(e) => e.stopPropagation()}>
            <div className="attach-sheet-header">
              <span>Attach File to PC Cursor</span>
              <button
                type="button"
                className="btn-close-sheet"
                onClick={() => setIsAttachSheetOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="attach-options-grid">
              <button
                type="button"
                className="attach-option-btn"
                onClick={() => {
                  setIsAttachSheetOpen(false);
                  photoInputRef.current?.click();
                }}
              >
                <div className="attach-icon-circle icon-photo">
                  <ImageIcon size={22} />
                </div>
                <span>Photo</span>
                <small>Image gallery</small>
              </button>

              <button
                type="button"
                className="attach-option-btn"
                onClick={() => {
                  setIsAttachSheetOpen(false);
                  fileInputRef.current?.click();
                }}
              >
                <div className="attach-icon-circle icon-file">
                  <FileUp size={22} />
                </div>
                <span>File</span>
                <small>Any document</small>
              </button>

              <button
                type="button"
                className="attach-option-btn"
                onClick={() => {
                  setIsAttachSheetOpen(false);
                  folderInputRef.current?.click();
                }}
              >
                <div className="attach-icon-circle icon-folder">
                  <FolderDown size={22} />
                </div>
                <span>Folder / ZIP</span>
                <small>Folder or zip</small>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DOCKED BOTTOM ACTIONS BAR (5 Buttons in normal flow) */}
      <div className="fixed-dock-container">
        <div className="dock-card dock-card-5">
          <button
            type="button"
            onClick={handleCommit}
            className="btn btn-primary dock-btn"
            title="Send Enter on PC"
          >
            {copiedNotification ? <Check size={15} /> : <CornerDownLeft size={15} />}
            <span className="dock-btn-label">{copiedNotification ? 'Sent!' : 'Enter'}</span>
          </button>

          {isPaused ? (
            <button
              type="button"
              onClick={onResume}
              className="btn btn-warning dock-btn"
              title="Resume Live Injection"
            >
              <Play size={15} />
              <span className="dock-btn-label">Resume</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onPause}
              className="btn btn-secondary dock-btn"
              title="Pause Live Injection"
            >
              <Pause size={15} />
              <span className="dock-btn-label">Pause</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleClear}
            className="btn btn-secondary dock-btn"
            title="Clear all"
          >
            <Trash2 size={15} />
            <span className="dock-btn-label">Clear</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAttachSheetOpen(true)}
            className="btn btn-secondary dock-btn btn-attach"
            title="Attach file or photo"
          >
            <Paperclip size={15} />
            <span className="dock-btn-label">Attach</span>
          </button>

          <button
            type="button"
            onClick={onDisconnect}
            className="btn btn-danger dock-btn"
            title="Exit session"
          >
            <LogOut size={15} />
            <span className="dock-btn-label">Exit</span>
          </button>
        </div>
      </div>
    </div>
  );
};
