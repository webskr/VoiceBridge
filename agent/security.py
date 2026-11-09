"""
VoiceBridge - Security & Session Management
Handles cryptographically random pairing PINs, one-time tokens, session lifecycle,
origin checking, and rate limiting.
"""

import secrets
import string
import time
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger("VoiceBridge.Security")

class SecurityManager:
    def __init__(self, pin_length: int = 6, pin_expiry_seconds: int = 600):
        self.pin_length = pin_length
        self.pin_expiry_seconds = pin_expiry_seconds
        self.active_pin = ""
        self.pin_created_at = 0.0
        
        # Maps session_token -> session_info
        self.sessions: Dict[str, Dict[str, Any]] = {}
        
        # Rate limiting: client_id -> (timestamp, count)
        self.rate_limits: Dict[str, list] = {}
        
        self.generate_new_pin()

    def generate_new_pin(self) -> str:
        """Generates a secure 6-character pairing PIN."""
        chars = string.ascii_uppercase + string.digits
        # Avoid visually ambiguous characters: O, 0, I, 1
        safe_chars = [c for c in chars if c not in "OI01"]
        self.active_pin = "".join(secrets.choice(safe_chars) for _ in range(self.pin_length))
        self.pin_created_at = time.time()
        logger.info(f"Generated new pairing PIN: {self.active_pin}")
        return self.active_pin

    def is_pin_valid(self, candidate_pin: str) -> bool:
        if not candidate_pin:
            return False
        if time.time() - self.pin_created_at > self.pin_expiry_seconds:
            logger.warning("Pairing PIN has expired.")
            return False
        return secrets.compare_digest(self.active_pin.strip().upper(), candidate_pin.strip().upper())

    def create_session(self, device_info: str = "Mobile Browser", client_ip: str = "Unknown") -> str:
        token = secrets.token_urlsafe(32)
        self.sessions[token] = {
            "device_info": device_info,
            "client_ip": client_ip,
            "created_at": time.time(),
            "last_seen": time.time(),
            "active": True
        }
        logger.info(f"Created session {token[:8]}... for device '{device_info}' ({client_ip})")
        return token

    def validate_session(self, token: str) -> bool:
        if not token or token not in self.sessions:
            return False
        session = self.sessions[token]
        if not session.get("active", False):
            return False
        session["last_seen"] = time.time()
        return True

    def revoke_session(self, token: str):
        if token in self.sessions:
            self.sessions[token]["active"] = False
            logger.info(f"Revoked session {token[:8]}...")

    def revoke_all_sessions(self):
        for token in self.sessions:
            self.sessions[token]["active"] = False
        self.generate_new_pin()
        logger.info("All active sessions revoked.")

    def check_rate_limit(self, client_id: str, max_requests: int = 60, window_seconds: float = 1.0) -> bool:
        """Sliding-window rate limiter."""
        now = time.time()
        timestamps = self.rate_limits.setdefault(client_id, [])
        # Evict old timestamps
        cutoff = now - window_seconds
        self.rate_limits[client_id] = [t for t in timestamps if t > cutoff]
        
        if len(self.rate_limits[client_id]) >= max_requests:
            return False
        
        self.rate_limits[client_id].append(now)
        return True

