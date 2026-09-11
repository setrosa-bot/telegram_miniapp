import uvicorn
import logging
from config import HOST, PORT

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(f"Starting Telegram Mini App Server at http://{HOST}:{PORT}")
    import app
    uvicorn.run(app.app, host=HOST, port=PORT)
