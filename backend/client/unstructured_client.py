"""
Document text extraction using LiteParse (LlamaIndex).
Local parsing — no API keys, no cloud dependencies.
"""

import logging
from pathlib import Path
from liteparse import LiteParse

logger = logging.getLogger(__name__)

# Reusable parser instance (no state, thread-safe)
_parser = LiteParse()


class UnstructuredClient:
    """Document text extractor using LiteParse.

    Kept as UnstructuredClient class name for backward compatibility
    with existing imports (intelligent_parser, gsa_parser).
    """

    def cleanup(self):
        """No-op — LiteParse has no resources to clean up."""
        pass

    def extract_from_path(self, file_path: str) -> str:
        """
        Extract text from a file on disk using LiteParse.

        Args:
            file_path: Absolute path to the file on disk

        Returns:
            Extracted text as a single string

        Raises:
            Exception: If extraction fails
        """
        filename = Path(file_path).name

        try:
            with open(file_path, "rb") as f:
                content = f.read()

            result = _parser.parse(content)
            extracted_text = result.text or ""

            logger.info(f"LiteParse extracted {len(extracted_text):,} chars from {filename}")
            return extracted_text

        except Exception as e:
            logger.error(f"LiteParse extraction failed for {filename}: {e}")
            raise Exception(f"LiteParse extraction failed: {e}")

    @staticmethod
    def is_supported(extension: str) -> bool:
        """Check if a file extension is supported."""
        supported = {
            ".pdf", ".docx", ".doc", ".odt", ".rtf",
            ".xlsx", ".xls", ".csv", ".tsv",
            ".txt", ".md", ".rst",
            ".html", ".htm", ".xml",
            ".ppt", ".pptx",
            ".png", ".jpg", ".jpeg",
        }
        return extension.lower() in supported


def get_unstructured_client() -> UnstructuredClient:
    """Create an UnstructuredClient instance (LiteParse-backed)."""
    return UnstructuredClient()
