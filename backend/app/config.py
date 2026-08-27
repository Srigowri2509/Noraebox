import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
PORT = int(os.getenv("PORT", 8000))
WEBSITE_API_URL = os.getenv("WEBSITE_API_URL", "").strip()
WEBSITE_TABLET_API_KEY = os.getenv("WEBSITE_TABLET_API_KEY", "").strip()

if not DATABASE_URL:
    raise RuntimeError("Missing DATABASE_URL environment variable")
