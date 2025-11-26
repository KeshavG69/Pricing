"""
iDrive e2 S3-compatible storage client for document management.

Provides simple interface for uploading and deleting proposal documents.
Thread-safe singleton pattern with RLock.
"""

import boto3
from botocore.exceptions import ClientError
import threading
from typing import Optional
from app.settings import settings


class IDriveStorage:
    """
    S3-compatible storage client for iDrive e2.

    Manages document uploads and deletions with organized folder structure:
    user_id/proposal_id/filename.pdf

    Thread-safe with internal locking for concurrent operations.
    """

    def __init__(self):
        """Initialize S3 client with iDrive e2 credentials and thread lock."""
        self.s3 = boto3.client(
            's3',
            endpoint_url=settings.IDRIVE_E2_ENDPOINT,
            aws_access_key_id=settings.IDRIVE_E2_ACCESS_KEY,
            aws_secret_access_key=settings.IDRIVE_E2_SECRET_KEY
        )
        self.bucket = settings.IDRIVE_E2_BUCKET
        self._lock = threading.RLock()  # Thread lock for concurrent operations

    def upload_document(
        self,
        file_path: str,
        user_id: str,
        proposal_id: str,
        filename: str
    ) -> tuple[str, str]:
        """
        Upload a document to iDrive e2 storage (thread-safe).

        Args:
            file_path: Local path to the file to upload
            user_id: User's MongoDB ObjectId (as string)
            proposal_id: Proposal's MongoDB ObjectId (as string)
            filename: Original filename (e.g., "solicitation.pdf")

        Returns:
            Tuple of (public_url, object_key)
            - public_url: Full URL to access the document
            - object_key: S3 object key for deletion (user_id/proposal_id/filename)

        Raises:
            ClientError: If upload fails
        """
        # Object key pattern: user_id/proposal_id/filename.pdf
        object_key = f"{user_id}/{proposal_id}/{filename}"

        with self._lock:
            try:
                # Upload file to S3
                self.s3.upload_file(file_path, self.bucket, object_key)

                # Construct public URL
                url = f"{settings.IDRIVE_E2_ENDPOINT}/{self.bucket}/{object_key}"

                return url, object_key

            except ClientError as e:
                print(f"Error uploading {filename} to iDrive e2: {e}")
                raise

    def delete_document(self, object_key: str) -> bool:
        """
        Delete a document from iDrive e2 storage (thread-safe).

        Args:
            object_key: S3 object key (e.g., "user_id/proposal_id/filename.pdf")

        Returns:
            True if deletion succeeded

        Raises:
            ClientError: If deletion fails
        """
        with self._lock:
            try:
                self.s3.delete_object(Bucket=self.bucket, Key=object_key)
                return True

            except ClientError as e:
                print(f"Error deleting {object_key} from iDrive e2: {e}")
                raise

    def delete_proposal_documents(self, user_id: str, proposal_id: str) -> int:
        """
        Delete all documents for a proposal (thread-safe).

        Args:
            user_id: User's MongoDB ObjectId (as string)
            proposal_id: Proposal's MongoDB ObjectId (as string)

        Returns:
            Number of documents deleted

        Raises:
            ClientError: If deletion fails
        """
        prefix = f"{user_id}/{proposal_id}/"

        with self._lock:
            try:
                # List all objects with this prefix
                response = self.s3.list_objects_v2(
                    Bucket=self.bucket,
                    Prefix=prefix
                )

                if 'Contents' not in response:
                    return 0  # No documents found

                # Delete all objects
                objects_to_delete = [{'Key': obj['Key']} for obj in response['Contents']]

                if objects_to_delete:
                    self.s3.delete_objects(
                        Bucket=self.bucket,
                        Delete={'Objects': objects_to_delete}
                    )

                return len(objects_to_delete)

            except ClientError as e:
                print(f"Error deleting documents for proposal {proposal_id}: {e}")
                raise


# Global singleton instance with thread-safe lazy initialization
_idrive_storage_client: Optional[IDriveStorage] = None
_client_lock = threading.RLock()


def get_idrive_storage() -> IDriveStorage:
    """
    Get or create iDrive storage client (singleton pattern).

    Returns:
        IDriveStorage instance
    """
    global _idrive_storage_client
    with _client_lock:
        if _idrive_storage_client is None:
            _idrive_storage_client = IDriveStorage()
        return _idrive_storage_client
