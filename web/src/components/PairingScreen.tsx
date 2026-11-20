import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, QrCode, ArrowRight, X, Camera } from 'lucide-react';
import jsQR from 'jsqr';

interface PairingScreenProps {
  initialPin?: string;
  onPair: (pin: string, host?: string, port?: number) => void;
  isConnecting: boolean;
  error?: string | null;
}

async function decodeQrFromCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  // 1. Try native browser BarcodeDetector API if supported
  if ('BarcodeDetector' in window) {
    try {
      const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      const barcodes = await detector.detect(canvas);
      if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
        return barcodes[0].rawValue;
      }
    } catch {}
  }

  // 2. Robust fallback using jsQR
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code && code.data) {
      return code.data;
    }
  } catch (err) {
    console.warn('QR decode error:', err);
  }

  return null;
}

function extractPinFromQrData(data: string): { pin: string; host?: string; port?: number } | null {
  if (!data) return null;
  const clean = data.trim();

  // If it's a URL like http://192.168.1.15:57890/?pin=BR3C2R or /?pin=BR3C2R
  try {
    const parsed = new URL(clean, window.location.origin);
    const pinParam = parsed.searchParams.get('pin');
    if (pinParam) {
      return {
        pin: pinParam.toUpperCase(),
        host: parsed.hostname || undefined,
        port: parsed.port ? parseInt(parsed.port) : undefined
      };
    }
  } catch {}

  const urlMatch = clean.match(/[?&]pin=([a-zA-Z0-9]+)/i);
  if (urlMatch) {
    return { pin: urlMatch[1].toUpperCase() };
  }

  const pinMatch = clean.match(/\b([A-Za-z0-9]{6})\b/);
  if (pinMatch) {
    return { pin: pinMatch[1].toUpperCase() };
  }

  if (clean.length >= 4 && clean.length <= 8 && /^[A-Za-z0-9]+$/.test(clean)) {
    return { pin: clean.toUpperCase() };
  }

  return null;
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

  // QR Scanner States
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (initialPin) {
      setPin(initialPin.toUpperCase());
    }
  }, [initialPin]);

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setIsScannerOpen(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const handleOpenScanner = async () => {
    setScannerError(null);

    // Detect if live camera getUserMedia is available (only works in secure context HTTPS/localhost)
    const hasGetUserMedia =
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function';

    if (!hasGetUserMedia) {
      // Insecure HTTP origin on LAN (e.g. http://192.168.x.x:57890) -> fallback to camera capture input
      if (photoInputRef.current) {
        photoInputRef.current.click();
      }
      return;
    }

    try {
      setIsScannerOpen(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();

        const canvas = document.createElement('canvas');
        scanIntervalRef.current = window.setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

          const rawData = await decodeQrFromCanvas(canvas);
          if (rawData) {
            const parsed = extractPinFromQrData(rawData);
            if (parsed && parsed.pin) {
              stopCamera();
              setPin(parsed.pin);
              onPair(parsed.pin, parsed.host || customHost, parsed.port || customPort);
            }
          }
        }, 220);
      }
    } catch (err: any) {
      console.warn('Camera stream error, falling back to camera photo input:', err);
      stopCamera();
      if (photoInputRef.current) {
        photoInputRef.current.click();
      }
    }
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setScannerError(null);
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      ctx.drawImage(img, 0, 0);

      URL.revokeObjectURL(objectUrl);
      const rawData = await decodeQrFromCanvas(canvas);

      if (rawData) {
        const parsed = extractPinFromQrData(rawData);
        if (parsed && parsed.pin) {
          setPin(parsed.pin);
          onPair(parsed.pin, parsed.host || customHost, parsed.port || customPort);
          return;
        }
      }
      setScannerError('QR not detected, try again');
    } catch (err) {
      setScannerError('QR not detected, try again');
    } finally {
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.trim()) {
      onPair(pin.trim().toUpperCase(), customHost, customPort);
    }
  };

  return (
    <div className="mobile-container">
      {/* Hidden camera capture input fallback for HTTP LAN origins */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handlePhotoCapture}
      />

      <div className="pairing-card">
        <div
          style={{
            display: 'inline-flex',
            padding: '12px',
            background: 'rgba(56, 189, 248, 0.1)',
            borderRadius: '50%',
            color: 'var(--accent-cyan)',
            marginBottom: '1rem'
          }}
        >
          <Smartphone size={36} />
        </div>
        <h2>Connect to Windows PC</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
          Scan the QR code on your PC or enter the 6-character PIN:
        </p>

        {/* Scan QR Button */}
        <div style={{ margin: '1rem 0 0.5rem' }}>
          <button
            type="button"
            onClick={handleOpenScanner}
            className="btn btn-secondary"
            style={{
              width: '100%',
              padding: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              fontWeight: 600,
              fontSize: '0.95rem',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              background: 'rgba(56, 189, 248, 0.08)',
              color: 'var(--accent-cyan)'
            }}
          >
            <QrCode size={20} />
            <span>Scan QR Code</span>
          </button>
        </div>

        {scannerError && (
          <div
            style={{
              color: 'var(--accent-red)',
              fontSize: '0.85rem',
              marginBottom: '0.85rem',
              background: 'rgba(239, 68, 68, 0.1)',
              padding: '0.5rem',
              borderRadius: '8px'
            }}
          >
            {scannerError}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', margin: '0.75rem 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
          <span style={{ padding: '0 0.75rem' }}>OR ENTER PIN</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
        </div>

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
            <div
              style={{
                color: 'var(--accent-red)',
                fontSize: '0.85rem',
                marginBottom: '1rem',
                background: 'rgba(239, 68, 68, 0.1)',
                padding: '0.5rem',
                borderRadius: '8px'
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.9rem', fontSize: '1rem' }}
            disabled={!pin.trim() || isConnecting}
          >
            {isConnecting ? (
              'Connecting...'
            ) : (
              <>
                <span>Pair & Start Typing</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div
          style={{
            marginTop: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: '100%', fontSize: '0.85rem' }}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? 'Hide Advanced Settings' : 'Network Settings'}
          </button>

          {showAdvanced && (
            <div
              style={{
                textAlign: 'left',
                background: 'var(--bg-input)',
                padding: '1rem',
                borderRadius: '10px',
                fontSize: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}
            >
              <label>PC LAN IP Address:</label>
              <input
                type="text"
                value={customHost}
                onChange={(e) => setCustomHost(e.target.value)}
                style={{
                  padding: '0.5rem',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  color: 'white',
                  borderRadius: '6px'
                }}
              />

              <label style={{ marginTop: '0.5rem' }}>Port:</label>
              <input
                type="number"
                value={customPort}
                onChange={(e) => setCustomPort(parseInt(e.target.value) || 57890)}
                style={{
                  padding: '0.5rem',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  color: 'white',
                  borderRadius: '6px'
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Live Camera Scanner Overlay Modal */}
      {isScannerOpen && (
        <div className="qr-scanner-overlay">
          <div className="qr-scanner-header">
            <span>Scan VoiceBridge PC QR</span>
            <button type="button" onClick={stopCamera} className="qr-scanner-close-btn">
              <X size={20} />
            </button>
          </div>

          <div className="qr-scanner-viewfinder">
            <video ref={videoRef} className="qr-scanner-video" playsInline autoPlay muted />
            <div className="qr-scanner-frame">
              <div className="qr-scanner-corner top-left" />
              <div className="qr-scanner-corner top-right" />
              <div className="qr-scanner-corner bottom-left" />
              <div className="qr-scanner-corner bottom-right" />
              <div className="qr-scanner-laser" />
            </div>
          </div>

          <div className="qr-scanner-footer">
            <p>Point camera at the QR code on your PC dashboard</p>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                photoInputRef.current?.click();
              }}
              className="btn btn-secondary"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', marginTop: '0.5rem' }}
            >
              <Camera size={14} style={{ marginRight: '4px' }} />
              Upload QR Photo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
