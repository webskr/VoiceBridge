import React, { useState, useEffect } from 'react';
import { Smartphone, QrCode, ArrowRight, ShieldCheck } from 'lucide-react';

interface PairingScreenProps {
  initialPin?: string;
  onPair: (pin: string, host?: string, port?: number) => void;
  isConnecting: boolean;
  error?: string | null;
}

export const PairingScreen: React.FC<PairingScreenProps> = ({
  initialPin = '',
  onPair,
  isConnecting,
  error
}) => {
  const [pin, setPin] = useState(initialPin);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customHost, setCustomHost] = useState(window.location.hostname || 'localhost');
  const [customPort, setCustomPort] = useState(window.location.port ? parseInt(window.location.port) : 57890);

  useEffect(() => {
    if (initialPin) {
      setPin(initialPin.toUpperCase());
    }
  }, [initialPin]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.trim()) {
      onPair(pin.trim().toUpperCase(), customHost, customPort);
    }
  };

  return (
    <div className="mobile-container">
      <div className="pairing-card">
        <div style={{ display: 'inline-flex', padding: '12px', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '50%', color: 'var(--accent-cyan)', marginBottom: '1rem' }}>
          <Smartphone size={36} />
        </div>
        <h2>Connect to Windows PC</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
          Enter the 6-character PIN shown on your PC Agent screen:
        </p>

        <form onSubmit={handleSubmit}>
          <div className="pin-input-group">
            <input
              type="text"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.toUpperCase())}
              placeholder="••••••"
              className="pin-input"
              autoFocus
              autoComplete="off"
              spellCheck="false"
            />
          </div>

          {error && (
            <div style={{ color: 'var(--accent-red)', fontSize: '0.85rem', marginBottom: '1rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem', borderRadius: '8px' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.9rem', fontSize: '1rem' }}
            disabled={!pin.trim() || isConnecting}
          >
            {isConnecting ? 'Connecting...' : (
              <>
                <span>Pair & Start Typing</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: '100%', fontSize: '0.85rem' }}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? 'Hide Advanced Settings' : 'Network Settings'}
          </button>

          {showAdvanced && (
            <div style={{ textAlign: 'left', background: 'var(--bg-input)', padding: '1rem', borderRadius: '10px', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label>PC LAN IP Address:</label>
              <input
                type="text"
                value={customHost}
                onChange={(e) => setCustomHost(e.target.value)}
                style={{ padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'white', borderRadius: '6px' }}
              />
              <label>Agent Port:</label>
              <input
                type="number"
                value={customPort}
                onChange={(e) => setCustomPort(parseInt(e.target.value) || 57890)}
                style={{ padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'white', borderRadius: '6px' }}
              />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            <ShieldCheck size={14} />
            <span>End-to-end Local Wi-Fi Pairing</span>
          </div>
        </div>
      </div>
    </div>
  );
};

