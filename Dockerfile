# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

# Copy package files and install dependencies
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source and build
COPY frontend/ ./
# Vite is configured to output to ../backend/static
RUN npm run build 

# Stage 2: Setup Python Backend
FROM python:3.12-slim
WORKDIR /app/backend

# Install LibreOffice (needed by docx2pdf for DOCX→PDF conversion on Linux)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./

# Copy report templates (handover.docx, return.docx) into backend dir
COPY handover.docx ./
COPY return.docx ./

# Copy built frontend from Stage 1 into backend/static
COPY --from=frontend-builder /app/backend/static ./static

# Ensure data directory exists for SQLite
RUN mkdir -p data

# Expose port
EXPOSE 8000

ENV PYTHONUNBUFFERED=1

# Command to run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
