from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional
import asyncio
from app.settings import settings

# Users collection name
USERS_COLLECTION = "users"


class MongoDB:
    """Async MongoDB singleton with Motor driver"""
    client: Optional[AsyncIOMotorClient] = None
    database = None
    _lock = asyncio.Lock()

    @classmethod
    async def connect_to_mongo(cls):
        """Create database connection (async, thread-safe)"""
        async with cls._lock:
            # Double-check locking pattern to prevent multiple connections
            if cls.database is not None:
                return

            try:
                cls.client = AsyncIOMotorClient(
                    settings.MONGODB_URL,
                    # Connection pool tuning for Railway MongoDB proxy
                    maxPoolSize=50,          # Reasonable max pool
                    minPoolSize=0,           # Don't keep warm connections (Railway proxy issue)
                    maxIdleTimeMS=300000,    # 5min idle timeout
                    socketTimeoutMS=30000,   # 30s socket timeout
                    connectTimeoutMS=20000,  # 20s connection timeout
                    serverSelectionTimeoutMS=20000,  # 20s server selection
                    retryWrites=True,
                    retryReads=True,
                    # Reduce background heartbeat checks (Railway proxy flakiness)
                    heartbeatFrequencyMS=120000,  # Check every 2min instead of default 10s
                )
                cls.database = cls.client[settings.MONGODB_DATABASE]
                print("✅ Connected to MongoDB (async)")
            except Exception as e:
                print(f"❌ Error connecting to MongoDB: {e}")
                raise e

    @classmethod
    async def close_mongo_connection(cls):
        """Close database connection (async, thread-safe)"""
        async with cls._lock:
            if cls.client:
                cls.client.close()
                cls.database = None
                print("✅ MongoDB connection closed")

    @classmethod
    async def get_database(cls):
        """Get the database instance (async, thread-safe)"""
        if cls.database is None:
            await cls.connect_to_mongo()
        return cls.database

    @classmethod
    async def get_collection(cls, collection_name: str):
        """Get a collection from the database (async, thread-safe)"""
        if cls.database is None:
            await cls.connect_to_mongo()
        return cls.database[collection_name]

    @classmethod
    async def get_users_collection(cls):
        """Get the users collection (async)"""
        return await cls.get_collection(USERS_COLLECTION)


# MongoDB instance (connection will be initialized on first use)
mongo_db = MongoDB()
