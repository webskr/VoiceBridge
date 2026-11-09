import React, { useState, useEffect, useRef } from 'react';
import { Mic, Pause, Play, Trash2, LogOut, CheckCircle2, Globe } from 'lucide-react';

interface MobileTypingProps {
  onSendTextUpdate: (text: string, revision: number, isFinal: boolean) => void;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
  onDisconnect: () => void;
  isPaused: boolean;
  pcStatus: string;
}

export const MobileTyping: React.FC<MobileTypingProps> = ({
  onSendTextUpdate,
  onPause,
  onResume,
  onClear,
  onDisconnect,
  isPaused,
  pcStatus
}) => {
  const [text, setText] = useState('');
  const [revision, setRevision] = useState(0);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-focus on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }

    // Check optional Web Speech API support as an added capability
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

      recog.onerror = (e: any) => {
        console.warn('Speech recognition error:', e);
        setIsListening(false);
      };

      recog.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recog;
    }
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

  return (
    <div className="mobile-container">
      <div className="instruction-banner">
        <Mic size={18} />
        <span>Tap below and press the <b>Microphone icon</b> on your keyboard (Gboard) to speak in Hindi or English.</span>
      </div>

      <div className="text-input-wrapper">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="Speak or type here... Your words will appear live in the active PC window!"
          className="mobile-textarea"
          autoFocus
        />

        <div className="voice-indicator-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Globe size={14} />
            <span className="lang-tag">Hindi / English (Auto)</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {isSpeechSupported && (
              <button
                type="button"
                onClick={toggleBrowserMic}
                style={{
                  background: isListening ? 'var(--accent-red)' : 'var(--border-color)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer'
                }}
              >
                <Mic size={12} />
                <span>{isListening ? 'Stop Mic' : 'Browser Mic'}</span>
              </button>
            )}
            <span>{text.length} chars</span>
          </div>
        </div>
      </div>

      <div className="action-toolbar">
        {isPaused ? (
          <button type="button" onClick={onResume} className="btn btn-warning">
            <Play size={16} />
            <span>Resume</span>
          </button>
        ) : (
          <button type="button" onClick={onPause} className="btn btn-secondary">
            <Pause size={16} />
            <span>Pause PC</span>
          </button>
        )}

        <button type="button" onClick={handleClear} className="btn btn-secondary">
          <Trash2 size={16} />
          <span>Clear</span>
        </button>

        <button type="button" onClick={onDisconnect} className="btn btn-danger">
          <LogOut size={16} />
          <span>Disconnect</span>
        </button>
      </div>

      <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        PC Injection Status: <span style={{ color: isPaused ? 'var(--accent-amber)' : 'var(--accent-green)', fontWeight: 600 }}>{isPaused ? 'PAUSED' : 'ACTIVE'}</span>
      </div>
    </div>
  );
};

