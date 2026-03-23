"""
Unstructured API Client for document text extraction.
Fresh instance per call for thread safety.
"""

import logging
from pathlib import Path
from unstructured_client import UnstructuredClient as UnstructuredAPIClient
from unstructured_client.models import shared
from app.settings import settings

logger = logging.getLogger(__name__)


class UnstructuredClient:
    """Unstructured API client for document text extraction."""

    def __init__(self):
        self.api_key = settings.UNSTRUCTURED_API_KEY
        self.api_url = settings.UNSTRUCTURED_API_URL

        if not self.api_key:
            raise ValueError("UNSTRUCTURED_API_KEY not configured in settings")

        self.client = UnstructuredAPIClient(
            api_key_auth=self.api_key,
            server_url=self.api_url if self.api_url else None
        )

        logger.info("Unstructured API client initialized")

    def cleanup(self):
        """Clean up internal HTTP client resources."""
        try:
            if hasattr(self, 'client') and self.client:
                if hasattr(self.client, 'sdk_configuration') and hasattr(self.client.sdk_configuration, 'client'):
                    self.client.sdk_configuration.client.close()
        except Exception as e:
            logger.warning(f"Error cleaning up Unstructured client: {e}")

    def extract_from_path(self, file_path: str) -> str:
        """
        Extract text from a file on disk.

        Reads the file bytes and sends them directly to the Unstructured API.
        No intermediate temp file is created.

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

            req = {
                "partition_parameters": {
                    "files": {
                        "content": content,
                        "file_name": filename,
                    },
                    "strategy": shared.Strategy.FAST,
                    "split_pdf_page": False,
                    "split_pdf_allow_failed": False,
                    "split_pdf_concurrency_level": 1,
                }
            }

            res = self.client.general.partition(request=req)

            extracted_text = "\n\n".join([
                element.get("text", "")
                for element in res.elements
                if element.get("text")
            ])

            logger.info(f"Unstructured extracted {len(extracted_text):,} chars from {filename}")
            return extracted_text

        except Exception as e:
            logger.error(f"Unstructured extraction failed for {filename}: {e}")
            raise Exception(f"Unstructured extraction failed: {e}")

    @staticmethod
    def is_supported(extension: str) -> bool:
        """Check if a file extension is supported by the Unstructured API."""
        supported = {
            ".pdf", ".docx", ".doc", ".odt", ".rtf",
            ".xlsx", ".xls", ".csv", ".tsv",
            ".txt", ".md", ".rst",
            ".html", ".htm", ".xml",
            ".ppt", ".pptx",
            ".eml", ".msg",
        }
        return extension.lower() in supported


def get_unstructured_client() -> UnstructuredClient:
    """Create a fresh UnstructuredClient instance."""
    return UnstructuredClient()
