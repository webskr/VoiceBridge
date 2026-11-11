import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Pause, Play, Trash2, LogOut, Globe, Send, CornerDownLeft, Sparkles, Check } from 'lucide-react';

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
  const [autoClearOnSend, setAutoClearOnSend] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const bottomBarRef = useRef<HTMLDivElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }

    // Optional Web Speech API support
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

  // Visual Viewport tracking for mobile virtual keyboard
  useEffect(() => {
    const handleViewportChange = () => {
      if (!window.visualViewport) return;
      const vv = window.visualViewport;
      // Calculate how much keyboard has pushed up
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

  // Explicit Commit/Flush sentence on PC
  const handleCommit = () => {
    if (!text.trim()) return;
    // Sending enter or newline or flushing
    const nextRev = revision + 1;
    setRevision(nextRev);
    onSendTextUpdate(text + '\n', nextRev, true);
    
    if (autoClearOnSend) {
      setText('');
      onClear();
    } else {
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 1200);
    }

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

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="mobile-typing-screen">
      {/* Top Banner */}
      <div className="instruction-banner">
        <Mic size={18} className="pulse-icon" />
        <span>Tap below and use the <b>Microphone</b> icon on your keyboard (Gboard) to dictate.</span>
      </div>

      {/* Main Textarea Area */}
      <div className="text-input-wrapper">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="Start speaking or type here... Your words stream live into your active PC cursor!"
          className="mobile-textarea"
          autoFocus
        />

        {/* Word/Char Counter & Speech Status */}
        <div className="voice-indicator-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Globe size={14} />
            <span className="lang-tag">Hindi / English (Bilingual)</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {wordCount >= 45 && (
              <span className="counter-badge counter-warning" title="Large dictation buffer">
                {wordCount} words
              </span>
            )}
            {wordCount < 45 && (
              <span className="counter-badge">
                {wordCount} words ({text.length} chars)
              </span>
            )}

            {isSpeechSupported && (
              <button
                type="button"
                onClick={toggleBrowserMic}
                className={`btn-micro ${isListening ? 'active' : ''}`}
              >
                <Mic size={12} />
                <span>{isListening ? 'Listening' : 'Web Mic'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* FIXED DOCKED ACTION TOOLBAR (Floats above mobile virtual keyboard) */}
      <div className="fixed-dock-container" ref={bottomBarRef}>
        <div className="dock-card">
          {/* Quick Commit / Send Button for long dictation */}
          <button
            type="button"
            onClick={handleCommit}
            className="btn btn-primary dock-btn"
            title="Send Newline / Commit to PC"
          >
            {copiedNotification ? <Check size={16} /> : <CornerDownLeft size={16} />}
            <span>{copiedNotification ? 'Sent!' : 'Enter ↵'}</span>
          </button>

          {/* Pause / Resume Button */}
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

          {/* Clear Button */}
          <button
            type="button"
            onClick={handleClear}
            className="btn btn-secondary dock-btn"
          >
            <Trash2 size={16} />
            <span>Clear</span>
          </button>

          {/* Disconnect Button */}
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

