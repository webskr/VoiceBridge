import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, 
  Image as ImageIcon, 
  FileUp, 
  Send, 
  Pause, 
  Play, 
  XCircle, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  UploadCloud, 
  Check,
  FolderDown
} from 'lucide-react';
import { TransferProgress } from '../types';

interface ClipboardTransferProps {
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
  const [activeTab, setActiveTab] = useState<'image' | 'file' | 'text'>('image');
  
  // Text state
  const [content, setContent] = useState('');
  
  // Image state
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Settings & state
  const [autoPaste, setAutoPaste] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTransferId, setCurrentTransferId] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [successStatus, setSuccessStatus] = useState<string | null>(null);

  const chunksRef = useRef<string[]>([]);
  const nextChunkIndexRef = useRef<number>(0);
  const isPausedRef = useRef<boolean>(false);
  const isCancelledRef = useRef<boolean>(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const linesCount = content ? content.split(/\r\n|\r|\n/).length : 0;
  const charsCount = content.length;
  const bytesCount = new TextEncoder().encode(content).length;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorStatus(null);
    setSuccessStatus(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorStatus('Please select a valid image file (PNG, JPG, WEBP, etc.)');
      return;
    }

    setSelectedImage(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorStatus(null);
    setSuccessStatus(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
  };

  const handlePasteFromClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setContent(text);
          setSuccessStatus(null);
        }
      } else {
        setErrorStatus("Clipboard API not available. Please paste manually into the box.");
      }
    } catch {
      setErrorStatus("Could not read clipboard automatically. Please paste with long-press.");
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
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
  };

  const handleStartTransfer = async () => {
    setErrorStatus(null);
    setSuccessStatus(null);

    let rawPayload = '';
    let transferType: 'text' | 'image' | 'file' = 'text';
    let name = '';
    let totalBytes = 0;
    let totalLines = 0;

    if (activeTab === 'image') {
      if (!selectedImage) {
        setErrorStatus('Please pick an image first');
        return;
      }
      transferType = 'image';
      name = selectedImage.name;
      totalBytes = selectedImage.size;
      try {
        rawPayload = await readFileAsBase64(selectedImage);
      } catch (err: any) {
        setErrorStatus('Failed to read image file: ' + err.message);
        return;
      }
    } else if (activeTab === 'file') {
      if (!selectedFile) {
        setErrorStatus('Please pick a file first');
        return;
      }
      transferType = 'file';
      name = selectedFile.name;
      totalBytes = selectedFile.size;
      try {
        rawPayload = await readFileAsBase64(selectedFile);
      } catch (err: any) {
        setErrorStatus('Failed to read file: ' + err.message);
        return;
      }
    } else {
      if (!content.trim()) {
        setErrorStatus('Please enter or paste text first');
        return;
      }
      transferType = 'text';
      name = `Clipboard Transfer (${linesCount} lines)`;
      rawPayload = content;
      totalBytes = bytesCount;
      totalLines = linesCount;
    }

    setIsSending(true);
    setIsPaused(false);
    isPausedRef.current = false;
    isCancelledRef.current = false;

    const transferId = 'xfer_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
    setCurrentTransferId(transferId);

    // 16KB chunk size for optimal WebSocket frames
    const CHUNK_SIZE = 16384;
    const chunks: string[] = [];
    for (let i = 0; i < rawPayload.length; i += CHUNK_SIZE) {
      chunks.push(rawPayload.substring(i, i + CHUNK_SIZE));
    }

    chunksRef.current = chunks;
    nextChunkIndexRef.current = 0;

    const fullChecksum = crc32(rawPayload);

    onStartTransfer({
      transferId,
      name,
      transferType,
      totalChunks: chunks.length,
      totalBytes,
      totalLines,
      autoPaste,
      checksum: fullChecksum
    });

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
        sendNextChunk(currentTransferId, nextIndex);
      } else {
        setIsSending(false);
        const targetDesc = activeTab === 'image' 
          ? `Image "${selectedImage?.name}" transferred & pasted into PC!` 
          : activeTab === 'file' 
          ? `File "${selectedFile?.name}" transferred & pasted into PC!`
          : `Text (${linesCount} lines) transferred & pasted into PC!`;
        setSuccessStatus(targetDesc);
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
    <div className="mobile-container" style={{ padding: '0.75rem', maxWidth: '540px', margin: '0 auto' }}>
      {/* Tab Switcher: Image | File | Text */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.85rem', background: 'var(--bg-card)', padding: '0.35rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
        <button
          type="button"
          onClick={() => { setActiveTab('image'); setErrorStatus(null); setSuccessStatus(null); }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.35rem',
            padding: '0.55rem 0.25rem',
            fontSize: '0.82rem',
            fontWeight: activeTab === 'image' ? 700 : 500,
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'image' ? 'var(--accent-cyan)' : 'transparent',
            color: activeTab === 'image' ? '#0f172a' : 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <ImageIcon size={16} />
          <span>Image / Photo</span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('file'); setErrorStatus(null); setSuccessStatus(null); }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.35rem',
            padding: '0.55rem 0.25rem',
            fontSize: '0.82rem',
            fontWeight: activeTab === 'file' ? 700 : 500,
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'file' ? 'var(--accent-cyan)' : 'transparent',
            color: activeTab === 'file' ? '#0f172a' : 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <FileUp size={16} />
          <span>Any File</span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('text'); setErrorStatus(null); setSuccessStatus(null); }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.35rem',
            padding: '0.55rem 0.25rem',
            fontSize: '0.82rem',
            fontWeight: activeTab === 'text' ? 700 : 500,
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'text' ? 'var(--accent-cyan)' : 'transparent',
            color: activeTab === 'text' ? '#0f172a' : 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <FileText size={16} />
          <span>3k+ Lines Text</span>
        </button>
      </div>

      {/* Hidden File Inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageSelect}
        style={{ display: 'none' }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="*/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Content for IMAGE TAB */}
      {activeTab === 'image' && (
        <div>
          <div 
            onClick={() => imageInputRef.current?.click()}
            style={{
              border: '2px dashed var(--border-color)',
              borderRadius: '14px',
              padding: '1.25rem 1rem',
              textAlign: 'center',
              cursor: 'pointer',
              background: 'rgba(255, 255, 255, 0.02)',
              marginBottom: '0.85rem',
              transition: 'all 0.2s'
            }}
          >
            {imagePreview ? (
              <div>
                <img 
                  src={imagePreview} 
                  alt="Preview" 
                  style={{ maxWidth: '100%', maxHeight: '180px', borderRadius: '8px', objectFit: 'contain' }} 
                />
                <div style={{ marginTop: '0.5rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                  {selectedImage?.name} ({(selectedImage!.size / 1024).toFixed(1)} KB)
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tap to pick another image</div>
              </div>
            ) : (
              <div>
                <UploadCloud size={40} style={{ color: 'var(--accent-cyan)', margin: '0 auto 0.5rem' }} />
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Choose Image or Screenshot
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  PNG, JPG, WEBP, GIF • Automatically pastes as bitmap into PC apps
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content for ANY FILE TAB */}
      {activeTab === 'file' && (
        <div>
          <div 
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--border-color)',
              borderRadius: '14px',
              padding: '1.25rem 1rem',
              textAlign: 'center',
              cursor: 'pointer',
              background: 'rgba(255, 255, 255, 0.02)',
              marginBottom: '0.85rem'
            }}
          >
            {selectedFile ? (
              <div>
                <FileUp size={36} style={{ color: 'var(--accent-cyan)', margin: '0 auto 0.5rem' }} />
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                  {selectedFile.name}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  {(selectedFile.size / 1024).toFixed(1)} KB • Tap to change file
                </div>
              </div>
            ) : (
              <div>
                <FolderDown size={40} style={{ color: 'var(--accent-cyan)', margin: '0 auto 0.5rem' }} />
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Choose Any File to Send to PC
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  PDF, ZIP, DOCX, APK, code, etc. • Saved to Downloads/VoiceBridge/
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content for TEXT TAB */}
      {activeTab === 'text' && (
        <div>
          <div className="text-input-wrapper">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste large code or text (2,000–3,000+ lines supported)..."
              className="mobile-textarea"
              disabled={isSending}
              style={{ minHeight: '160px' }}
            />

            <div className="voice-indicator-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
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
                style={{ padding: '3px 8px', fontSize: '0.75rem' }}
              >
                <Copy size={12} />
                <span>Paste from Phone</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress Bar Display */}
      {isSending && (
        <div style={{ marginTop: '0.85rem', background: 'var(--bg-card)', padding: '0.85rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
            <span>Sending to PC: <b>{activeProgress ? activeProgress.percent : Math.round((nextChunkIndexRef.current / (chunksRef.current.length || 1)) * 100)}%</b></span>
            <span>Chunk {nextChunkIndexRef.current} of {chunksRef.current.length}</span>
          </div>

          <div style={{ width: '100%', height: '8px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
            <div 
              style={{ 
                width: `${activeProgress ? activeProgress.percent : Math.round((nextChunkIndexRef.current / (chunksRef.current.length || 1)) * 100)}%`, 
                height: '100%', 
                background: 'var(--accent-cyan)', 
                transition: 'width 0.2s' 
              }} 
            />
          </div>
        </div>
      )}

      {/* Success Notification */}
      {successStatus && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '0.75rem', borderRadius: '10px', marginTop: '0.75rem', fontSize: '0.85rem' }}>
          <CheckCircle2 size={18} />
          <div>
            <div style={{ fontWeight: 600 }}>{successStatus}</div>
            <div style={{ fontSize: '0.74rem', color: '#6ee7b7', marginTop: '0.15rem' }}>
              Saved in PC <code>Downloads/VoiceBridge/</code> & ready on clipboard!
            </div>
          </div>
        </div>
      )}

      {/* Error Notification */}
      {errorStatus && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-red)', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '0.75rem', borderRadius: '10px', marginTop: '0.75rem', fontSize: '0.85rem' }}>
          <AlertCircle size={18} />
          <span>{errorStatus}</span>
        </div>
      )}

      {/* Auto-Paste Setting Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.85rem 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
        <input
          type="checkbox"
          id="autoPasteCheck"
          checked={autoPaste}
          onChange={(e) => setAutoPaste(e.target.checked)}
          style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--accent-cyan)' }}
        />
        <label htmlFor="autoPasteCheck" style={{ cursor: 'pointer' }}>
          Auto-paste on PC (Ctrl+V) directly into active input / window
        </label>
      </div>

      {/* Transfer Action Buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        {!isSending ? (
          <button
            type="button"
            onClick={handleStartTransfer}
            className="btn btn-primary"
            style={{ flex: 1, padding: '0.75rem' }}
            disabled={
              (activeTab === 'image' && !selectedImage) ||
              (activeTab === 'file' && !selectedFile) ||
              (activeTab === 'text' && !content.trim())
            }
          >
            <Send size={16} />
            <span>
              {activeTab === 'image' 
                ? 'Send & Paste Image on PC' 
                : activeTab === 'file' 
                ? 'Send & Paste File on PC' 
                : `Send & Paste Text (${linesCount} lines)`}
            </span>
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
