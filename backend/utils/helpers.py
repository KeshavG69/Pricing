from bson import ObjectId
from datetime import datetime


def serialize_doc(doc: dict) -> dict:
    """
    Convert MongoDB document to JSON-serializable dict
    Converts ObjectIds to strings, _id to id
    """
    if not doc:
        return None

    # Convert _id to id
    if "_id" in doc:
        doc["id"] = str(doc["_id"])
        del doc["_id"]

    # Convert all ObjectId fields to strings
    for key, value in doc.items():
        if isinstance(value, ObjectId):
            doc[key] = str(value)
        elif isinstance(value, list):
            # Handle arrays of ObjectIds (like shared_with)
            doc[key] = [str(v) if isinstance(v, ObjectId) else v for v in value]
        elif isinstance(value, dict):
            # Recursive for nested documents
            doc[key] = serialize_doc(value)
        elif isinstance(value, datetime):
            # Convert datetime to ISO string
            doc[key] = value.isoformat()

    return doc


def serialize_docs(docs: list) -> list:
    """Convert list of MongoDB documents"""
    return [serialize_doc(doc.copy()) for doc in docs]
