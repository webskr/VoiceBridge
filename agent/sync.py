"""
VoiceBridge - Text Synchronization Engine
Manages document revisions, computes minimal diffs between consecutive voice updates,
and drives the keyboard injector without generating duplicate text or missing corrections.
"""

import logging
from typing import Tuple, Dict, Any
try:
    from agent.keyboard import WindowsKeyboard
except ImportError:
    from keyboard import WindowsKeyboard

logger = logging.getLogger("VoiceBridge.Sync")

class DocumentSyncEngine:
    def __init__(self, keyboard: WindowsKeyboard):
        self.keyboard = keyboard
        self.canonical_text = ""
        self.last_revision = -1
        self.is_active = True

    def reset(self):
        """Resets the synchronized document state."""
        self.canonical_text = ""
        self.last_revision = -1
        logger.info("Document state reset.")

    def compute_diff(self, old_text: str, new_text: str) -> Tuple[int, str]:
        """
        Calculates the common prefix between old and new text.
        Returns:
            delete_count: number of characters to backspace from old_text
            insert_text: new characters to append after common prefix
        """
        min_len = min(len(old_text), len(new_text))
        prefix_len = 0
        while prefix_len < min_len and old_text[prefix_len] == new_text[prefix_len]:
            prefix_len += 1

        delete_count = len(old_text) - prefix_len
        insert_text = new_text[prefix_len:]
        return delete_count, insert_text

    def apply_update(self, new_text: str, revision: int, is_final: bool = False, inject: bool = True) -> Dict[str, Any]:
        """
        Processes a document update from mobile.
        Ensures revisions are strictly increasing.
        Drives keyboard backspaces and Unicode typing.
        """
        if revision <= self.last_revision:
            logger.warning(f"Dropping stale revision {revision} (current: {self.last_revision})")
            return {
                "applied": False,
                "reason": "stale_revision",
                "canonical_text": self.canonical_text,
                "revision": self.last_revision
            }

        delete_count, insert_text = self.compute_diff(self.canonical_text, new_text)

        if inject and self.is_active:
            if delete_count > 0:
                self.keyboard.send_backspaces(delete_count)
            if insert_text:
                self.keyboard.type_unicode_string(insert_text)

        self.canonical_text = new_text
        self.last_revision = revision

        logger.debug(f"Revision {revision}: deleted {delete_count}, inserted {len(insert_text)} chars. Final: {is_final}")

        return {
            "applied": True,
            "revision": revision,
            "delete_count": delete_count,
            "inserted_len": len(insert_text),
            "canonical_text": self.canonical_text,
            "is_final": is_final
        }

