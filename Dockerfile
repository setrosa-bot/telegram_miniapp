FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Create directory for persistent SQLite data and uploads
RUN mkdir -p /app/data /app/uploads

# Expose port
EXPOSE 8000

# Start FastAPI and Telegram Bot Polling runner
CMD ["python", "start.py"]
