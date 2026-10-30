# Сборка фронтенда в режиме server и Python-сервер, который отдаёт API и статику.
FROM node:22-alpine AS front
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ENV VITE_BACKEND=server VITE_API_URL=
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 DATA_DIR=/data FRONTEND_DIR=/app/frontend
COPY server/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server/app ./app
COPY tools /tools
COPY --from=front /src/dist ./frontend
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
