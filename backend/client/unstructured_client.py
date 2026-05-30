"""
Document text extraction.

Routes by file extension:
- LiteParse handles binary formats it actually supports: PDF, DOCX, XLSX,
  PPTX, images. (LiteParse's CLI returns empty stdout on unsupported types,
  which causes a JSON-decode crash — so we never give it those.)
- Plain-text formats (txt, md, csv, tsv, log, json, xml, html, htm, rst) are
  read directly with encoding fallback.
- RTF is stripped via striprtf to plain text.
"""

import logging
from pathlib import Path

from liteparse import LiteParse
from striprtf.striprtf import rtf_to_text

logger = logging.getLogger(__name__)

# Reusable LiteParse instance (no state, thread-safe)
_parser = LiteParse()

# Per the LiteParse CLI: "supports PDF, DOCX, XLSX, PPTX, images, and more."
# These are the extensions we actually route to LiteParse.
_LITEPARSE_EXTS = {
    ".pdf",
    ".docx", ".doc",
    ".xlsx", ".xls",
    ".pptx", ".ppt",
    ".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp", ".webp",
}

# Plain text — read directly. UTF-8 first, latin-1 as a forgiving fallback.
_PLAIN_TEXT_EXTS = {
    ".txt", ".md", ".rst", ".log",
    ".csv", ".tsv",
    ".json", ".xml", ".yaml", ".yml",
    ".html", ".htm",
}

# RTF — strip control words via striprtf.
_RTF_EXTS = {".rtf"}


def _read_plain_text(file_path: str) -> str:
    """Read a plain-text file with encoding fallback."""
    try:
        return Path(file_path).read_text(encoding="utf-8")
    except UnicodeDecodeError:
        # Fall back to latin-1 — never raises on byte content
        return Path(file_path).read_text(encoding="latin-1")


def _read_rtf(file_path: str) -> str:
    """Read an RTF file and strip control words to plain text."""
    raw = _read_plain_text(file_path)
    return rtf_to_text(raw, errors="ignore")


class UnstructuredClient:
    """Document text extractor.

    Kept as UnstructuredClient class name for backward compatibility
    with existing imports (intelligent_parser, gsa_parser).
    """

    def cleanup(self):
        """No-op — no resources to clean up."""
        pass

    def extract_from_path(self, file_path: str) -> str:
        """
        Extract text from a file on disk.

        Args:
            file_path: Absolute path to the file on disk

        Returns:
            Extracted text as a single string

        Raises:
            Exception: If extraction fails
        """
        filename = Path(file_path).name
        ext = Path(file_path).suffix.lower()

        try:
            if ext in _PLAIN_TEXT_EXTS:
                text = _read_plain_text(file_path)
                logger.info(f"Plain-text read {len(text):,} chars from {filename}")
                return text

            if ext in _RTF_EXTS:
                text = _read_rtf(file_path)
                logger.info(f"RTF stripped to {len(text):,} chars from {filename}")
                return text

            if ext in _LITEPARSE_EXTS:
                # Pass the Path (not raw bytes) so liteparse can sniff the
                # file extension. Reading bytes first strips that signal and
                # liteparse then errors with "unsupported file format: ."
                result = _parser.parse(Path(file_path))
                text = result.text or ""
                logger.info(f"LiteParse extracted {len(text):,} chars from {filename}")
                return text

            # Unknown extension — try plain text as a last resort (covers
            # extension-less files and odd cases). If it's binary, this will
            # raise UnicodeDecodeError and we'll surface it.
            logger.warning(
                f"Unknown extension {ext!r} for {filename} — falling back to plain-text read"
            )
            return _read_plain_text(file_path)

        except Exception as e:
            logger.error(f"Text extraction failed for {filename}: {e}")
            raise Exception(f"Text extraction failed: {e}")

    @staticmethod
    def is_supported(extension: str) -> bool:
        """Check if a file extension is supported."""
        ext = extension.lower()
        return ext in _LITEPARSE_EXTS or ext in _PLAIN_TEXT_EXTS or ext in _RTF_EXTS


def get_unstructured_client() -> UnstructuredClient:
    """Create an UnstructuredClient instance."""
    return UnstructuredClient()
