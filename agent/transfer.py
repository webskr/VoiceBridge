"""
VoiceBridge - Large Clipboard & Chunked Transfer Engine
Handles chunk-based reliable transfer of 2,000-3,000+ lines of text over local Wi-Fi,
with per-chunk acknowledgements, ordered reassembly, duplicate suppression,
resumption, progress reporting, and persistent transfer history.
"""

import time
import zlib
import logging
from typing import Dict, Any, Optional, List, Tuple
try:
    from agent.clipboard import copy_and_paste_text, set_clipboard_text
except ImportError:
    from clipboard import copy_and_paste_text, set_clipboard_text

logger = logging.getLogger("VoiceBridge.Transfer")

class TransferSession:
    def __init__(self, transfer_id: str, total_chunks: int, total_bytes: int, total_lines: int, auto_paste: bool = True):
        self.transfer_id = transfer_id
        self.total_chunks = total_chunks
        self.total_bytes = total_bytes
        self.total_lines = total_lines
        self.auto_paste = auto_paste
        self.chunks: Dict[int, str] = {}
        self.status = "receiving"  # receiving, paused, completed, cancelled
        self.created_at = time.time()
        self.last_activity = time.time()
        self.received_bytes = 0

    def add_chunk(self, chunk_index: int, data: str, checksum: Optional[int] = None) -> bool:
        """Adds a chunk with duplicate checking and CRC32 verification."""
        if self.status in ("cancelled", "completed"):
            return False

        if checksum is not None:
            # Verify data integrity
            data_crc = zlib.crc32(data.encode('utf-8'))
            if data_crc != checksum:
                logger.warning(f"Checksum mismatch on chunk {chunk_index} for transfer {self.transfer_id}")
                return False

        if chunk_index not in self.chunks:
            self.chunks[chunk_index] = data
            self.received_bytes += len(data.encode('utf-8'))

        self.last_activity = time.time()
        return True

    def is_complete(self) -> bool:
        return len(self.chunks) == self.total_chunks

    def get_progress(self) -> Dict[str, Any]:
        count = len(self.chunks)
        percent = round((count / self.total_chunks) * 100, 1) if self.total_chunks > 0 else 0
        return {
            "transferId": self.transfer_id,
            "status": self.status,
            "receivedChunks": count,
            "totalChunks": self.total_chunks,
            "receivedBytes": self.received_bytes,
            "totalBytes": self.total_bytes,
            "totalLines": self.total_lines,
            "percent": percent,
            "autoPaste": self.auto_paste
        }

    def assemble(self) -> str:
        """Reassembles all chunks in strict numerical order."""
        if not self.is_complete():
            raise ValueError(f"Cannot assemble incomplete transfer {self.transfer_id}")
        ordered_parts = [self.chunks[i] for i in range(self.total_chunks)]
        return "".join(ordered_parts)


class TransferManager:
    def __init__(self, max_history: int = 50):
        self.active_transfers: Dict[str, TransferSession] = {}
        self.history: List[Dict[str, Any]] = []
        self.max_history = max_history

    def start_transfer(self, transfer_id: str, total_chunks: int, total_bytes: int, total_lines: int, auto_paste: bool = True) -> Dict[str, Any]:
        """Initializes a new chunked transfer session."""
        session = TransferSession(transfer_id, total_chunks, total_bytes, total_lines, auto_paste)
        self.active_transfers[transfer_id] = session
        logger.info(f"Started transfer {transfer_id}: {total_chunks} chunks, {total_bytes} bytes, {total_lines} lines.")
        return session.get_progress()

    def receive_chunk(self, transfer_id: str, chunk_index: int, data: str, checksum: Optional[int] = None) -> Tuple[bool, bool, Dict[str, Any]]:
        """
        Receives a chunk, stores it, and checks for completion.
        Returns (accepted, is_complete, progress_dict).
        """
        session = self.active_transfers.get(transfer_id)
        if not session:
            logger.warning(f"Unknown transfer {transfer_id}")
            return False, False, {}

        accepted = session.add_chunk(chunk_index, data, checksum)
        is_complete = session.is_complete()

        if is_complete and session.status != "completed":
            session.status = "completed"
            full_text = session.assemble()
            
            # Fast clipboard injection / paste into active window
            copy_and_paste_text(full_text, auto_paste=session.auto_paste)
            
            # Record in transfer history
            history_item = {
                "id": transfer_id,
                "timestamp": time.time(),
                "timeFormatted": time.strftime("%H:%M:%S", time.localtime()),
                "totalBytes": len(full_text.encode('utf-8')),
                "totalLines": len(full_text.splitlines()),
                "totalCharacters": len(full_text),
                "preview": full_text[:200] + ("..." if len(full_text) > 200 else ""),
                "fullText": full_text
            }
            self.history.insert(0, history_item)
            if len(self.history) > self.max_history:
                self.history.pop()

            logger.info(f"Transfer {transfer_id} COMPLETE: {history_item['totalLines']} lines, {history_item['totalBytes']} bytes injected.")

        return accepted, is_complete, session.get_progress()

    def control_transfer(self, transfer_id: str, action: str) -> Optional[Dict[str, Any]]:
        """Pauses, resumes, or cancels an active transfer."""
        session = self.active_transfers.get(transfer_id)
        if not session:
            return None

        if action == "pause":
            session.status = "paused"
        elif action == "resume":
            session.status = "receiving"
        elif action == "cancel":
            session.status = "cancelled"

        return session.get_progress()

    def get_history(self) -> List[Dict[str, Any]]:
        # Return history without fullText to keep payload lightweight for summary
        return [
            {k: v for k, v in item.items() if k != "fullText"}
            for item in self.history
        ]

    def get_history_item_full_text(self, item_id: str) -> Optional[str]:
        for item in self.history:
            if item["id"] == item_id:
                return item.get("fullText")
        return None
