"""
MongoDB connection and persistence layer using motor (async driver).
"""
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo.errors import ConfigurationError

from app.core.config import settings
from app.core.exceptions import MongoNotConfiguredError
from app.core.logging import get_logger

logger = get_logger(__name__)

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


def get_db() -> AsyncIOMotorDatabase | None:
    """Return the cached database handle, or None if MongoDB is not configured."""
    global _client, _db
    if _db is not None:
        return _db
    if not settings.MONGODB_URL:
        return None
    _client = AsyncIOMotorClient(settings.MONGODB_URL)
    try:
        _db = _client.get_default_database()
    except ConfigurationError:
        _db = _client["bcs_analyzer"]
    logger.info("MongoDB connection initialised: %s", _db.name)
    return _db


async def save_assessment(record: dict[str, Any]) -> str | None:
    """
    Insert a BCS assessment record into MongoDB.
    Returns the inserted document ID as a string, or None if DB is not configured.
    """
    db = get_db()
    if db is None:
        logger.debug("MongoDB not configured, skipping persistence.")
        return None

    record["created_at"] = datetime.now(timezone.utc)
    result = await db.bcs_assessments.insert_one(record)
    logger.info("Assessment saved to MongoDB with _id=%s", result.inserted_id)
    return str(result.inserted_id)


async def get_cow_bcs_analysis(analysis_id: str) -> dict[str, Any] | None:
    """
    Look up a document in the `cow_bcs_analysis` collection by _id.
    Raises MongoNotConfiguredError if MONGODB_URL isn't set. Returns None
    (not an error) if the id is malformed or no matching document exists -
    the caller turns that into a 404.

    Expected shape (collection is populated by another service - this app
    only reads it): { "_id": ObjectId(...), "cow_images": ["https://...", ...] }
    """
    db = get_db()
    if db is None:
        raise MongoNotConfiguredError()
    try:
        object_id = ObjectId(analysis_id)
    except (InvalidId, TypeError):
        return None
    return await db.cow_bcs_analysis.find_one({"_id": object_id})


async def close_connection() -> None:
    """Close the MongoDB client connection (call on app shutdown)."""
    global _client, _db
    if _client is not None:
        _client.close()
        _client = None
        _db = None
        logger.info("MongoDB connection closed.")
