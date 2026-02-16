import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
PORT = int(os.getenv("PORT", 8000))

if not DATABASE_URL:
    raise RuntimeError("Missing DATABASE_URL environment variable")

