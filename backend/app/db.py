from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env.production if it exists (for production), otherwise load .env (for development)
env_file = Path(__file__).parent.parent / ".env.production"
if env_file.exists():
    load_dotenv(env_file)
else:
    load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("Missing DATABASE_URL environment variable")

# Create SQLAlchemy engine
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
