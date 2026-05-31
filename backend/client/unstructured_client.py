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

    def parse_full(self, file_path: str) -> dict:
        """
        Parse a file once and return BOTH views the rest of the pipeline needs:
          {"text": <flat full-doc text>, "pages": [{"page_num": int, "text": str}, ...]}

        The pricing LLM uses `text`; the chat-retriever indexer uses `pages`.
        Keeping them in one call means we never parse the same file twice.

        For non-paginated formats (txt, csv, rtf, …), `pages` is a single
        synthetic page with page_num=1 holding the whole document. The indexer
        treats that identically to a real one-page doc.
        """
        filename = Path(file_path).name
        ext = Path(file_path).suffix.lower()

        try:
            if ext in _PLAIN_TEXT_EXTS:
                text = _read_plain_text(file_path)
                logger.info(f"Plain-text read {len(text):,} chars from {filename}")
                return {"text": text, "pages": [{"page_num": 1, "text": text}]}

            if ext in _RTF_EXTS:
                text = _read_rtf(file_path)
                logger.info(f"RTF stripped to {len(text):,} chars from {filename}")
                return {"text": text, "pages": [{"page_num": 1, "text": text}]}

            if ext in _LITEPARSE_EXTS:
                # Pass the Path (not raw bytes) so liteparse can sniff the
                # file extension. Reading bytes first strips that signal and
                # liteparse then errors with "unsupported file format: ."
                # LiteParse v2 uses snake_case (page.page_num).
                result = _parser.parse(Path(file_path))
                text = result.text or ""
                pages = [
                    {"page_num": p.page_num, "text": p.text or ""}
                    for p in (result.pages or [])
                ]
                # Fall back to a synthetic single page if LiteParse didn't
                # split (rare — happens on some image OCR paths).
                if not pages and text:
                    pages = [{"page_num": 1, "text": text}]
                logger.info(
                    f"LiteParse extracted {len(text):,} chars / {len(pages)} pages from {filename}"
                )
                return {"text": text, "pages": pages}

            # Unknown extension — try plain text as a last resort (covers
            # extension-less files and odd cases). If it's binary, this will
            # raise UnicodeDecodeError and we'll surface it.
            logger.warning(
                f"Unknown extension {ext!r} for {filename} — falling back to plain-text read"
            )
            text = _read_plain_text(file_path)
            return {"text": text, "pages": [{"page_num": 1, "text": text}]}

        except Exception as e:
            logger.error(f"Text extraction failed for {filename}: {e}")
            raise Exception(f"Text extraction failed: {e}")

    def extract_from_path(self, file_path: str) -> str:
        """
        Back-compat shim: returns just the flat text. Existing callers
        (intelligent_parser, gsa_parser) keep working unchanged. New callers
        that also need per-page structure should use `parse_full` directly.
        """
        return self.parse_full(file_path)["text"]

    @staticmethod
    def is_supported(extension: str) -> bool:
        """Check if a file extension is supported."""
        ext = extension.lower()
        return ext in _LITEPARSE_EXTS or ext in _PLAIN_TEXT_EXTS or ext in _RTF_EXTS


def get_unstructured_client() -> UnstructuredClient:
    """Create an UnstructuredClient instance."""
    return UnstructuredClient()
