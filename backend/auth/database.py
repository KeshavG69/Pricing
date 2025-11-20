from pymongo import MongoClient
from typing import Optional
from app.settings import settings

# Users collection name
USERS_COLLECTION = "users"


class MongoDB:
    client: Optional[MongoClient] = None
    database = None

    @classmethod
    def connect_to_mongo(cls):
        """Create database connection"""
        try:
            cls.client = MongoClient(settings.MONGODB_URL)
            cls.database = cls.client[settings.MONGODB_DATABASE]
            print("Connected to MongoDB for authentication")
        except Exception as e:
            print(f"Error connecting to MongoDB: {e}")
            raise e

    @classmethod
    def close_mongo_connection(cls):
        """Close database connection"""
        if cls.client:
            cls.client.close()
            print("MongoDB auth connection closed")

    @classmethod
    def get_collection(cls, collection_name: str):
        """Get a collection from the database"""
        if cls.database is None:
            cls.connect_to_mongo()
        return cls.database[collection_name]

    @classmethod
    def get_users_collection(cls):
        """Get the users collection"""
        return cls.get_collection(USERS_COLLECTION)


# Initialize MongoDB connection
mongo_db = MongoDB()
mongo_db.connect_to_mongo()
