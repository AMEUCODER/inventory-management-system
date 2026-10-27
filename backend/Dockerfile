FROM python:3.11-slim

# Prevent Python from writing .pyc files and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY . /app/

EXPOSE 8000

# Demo accounts/products are only created when SEED_DEMO=1 (docker-compose sets it
# for the one-command demo; leave it unset/0 for anything real).
ENV SEED_DEMO=0

# Run migrations, optionally seed demo data, then start the server
CMD ["sh", "-c", "python manage.py migrate && if [ \"$SEED_DEMO\" = \"1\" ]; then python manage.py seed_demo; fi && python manage.py runserver 0.0.0.0:8000"]
