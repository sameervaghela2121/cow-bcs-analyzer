"""
MongoDB connection and persistence layer using motor (async driver).
"""
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo.errors import ConfigurationError

from app.core.config import settings
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


async def get_bcs_analysis(analysis_id: ObjectId) -> dict[str, Any] | None:
    """Fetch a bcs_analysis record by _id. Returns None if not found or DB unconfigured."""
    db = get_db()
    if db is None:
        return None
    return await db.bcs_analysis.find_one({"_id": analysis_id})


async def update_bcs_analysis(analysis_id: ObjectId, fields: dict[str, Any]) -> None:
    """Set the given fields on a bcs_analysis record, stamping updatedAt to match Mongoose."""
    db = get_db()
    if db is None:
        logger.warning("MongoDB not configured, cannot update bcs_analysis %s.", analysis_id)
        return
    fields = {**fields, "updatedAt": datetime.now(timezone.utc)}
    await db.bcs_analysis.update_one({"_id": analysis_id}, {"$set": fields})


async def close_connection() -> None:
    """Close the MongoDB client connection (call on app shutdown)."""
    global _client, _db
    if _client is not None:
        _client.close()
        _client = None
        _db = None
        logger.info("MongoDB connection closed.")
