import os
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "")

# Parse Admin IDs
_admin_raw = os.getenv("ADMIN_IDS", "")
ADMIN_IDS = [int(x.strip()) for x in _admin_raw.split(",") if x.strip().isdigit()]

def get_admin_ids() -> list:
    try:
        load_dotenv(override=True)
        raw = os.getenv("ADMIN_IDS", "")
        return [int(x.strip()) for x in raw.split(",") if x.strip().isdigit()]
    except Exception:
        return []

def is_admin(user_id: int) -> bool:
    try:
        return int(user_id) in get_admin_ids()
    except Exception:
        return False


_raw_webapp_url = os.getenv("WEBAPP_URL", "").strip()
if not _raw_webapp_url or "localhost" in _raw_webapp_url:
    # Auto-detect Railway public domain
    railway_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN", "").strip() or os.getenv("RAILWAY_STATIC_URL", "").strip()
    if railway_domain:
        _raw_webapp_url = f"https://{railway_domain}"
    elif not _raw_webapp_url:
        _raw_webapp_url = "http://localhost:8000"

if _raw_webapp_url and not _raw_webapp_url.startswith("http://") and not _raw_webapp_url.startswith("https://"):
    WEBAPP_URL = f"https://{_raw_webapp_url}"
else:
    WEBAPP_URL = _raw_webapp_url


HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", 8000))

# Persistent database and upload path for Railway Volume support
_env_db_path = os.getenv("DATABASE_PATH", "").strip()
_env_upload_dir = os.getenv("UPLOAD_DIR", "").strip()

if _env_db_path:
    DATABASE_PATH = _env_db_path
elif os.path.exists("/data"):
    DATABASE_PATH = "/data/app.db"
else:
    DATABASE_PATH = "data/app.db"

if _env_upload_dir:
    UPLOAD_DIR = _env_upload_dir
elif os.path.exists("/data"):
    UPLOAD_DIR = "/data/uploads"
else:
    UPLOAD_DIR = "data/uploads"

try:
    _db_dir = os.path.dirname(DATABASE_PATH)
    if _db_dir:
        os.makedirs(_db_dir, exist_ok=True)
    os.makedirs(UPLOAD_DIR, exist_ok=True)
except Exception:
    pass


PAYMENT_INFO = {
    "ABA": {
        "name": os.getenv("ABA_NAME", "DIGITAL STORE"),
        "number": os.getenv("ABA_NUMBER", "000 123 456"),
        "icon": "🔵",
    },
    "ACLEDA": {
        "name": "ACLEDA Bank",
        "number": os.getenv("ACLEDA_NUMBER", "012345678"),
        "icon": "🟢",
    },
    "WING": {
        "name": "Wing Bank",
        "number": os.getenv("WING_NUMBER", "012345678"),
        "icon": "🟡",
    },
    "USDT": {
        "name": "USDT (TRC20)",
        "address": os.getenv("USDT_ADDRESS", "TYourUsdtAddressHere"),
        "icon": "🟣",
    }
}
