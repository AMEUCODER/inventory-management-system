FROM node:20-alpine

WORKDIR /app

# Install dependencies first so this layer is cached until package*.json changes
COPY package*.json ./
RUN npm ci

# Copy the frontend source (node_modules/.next are excluded by .dockerignore)
COPY . .

# Where the /api/* proxy sends requests. Inside Docker this must be the backend's
# SERVICE NAME from docker-compose (not 127.0.0.1, which is this container itself).
# Override at runtime with `environment:` in compose; no rebuild needed.
ENV BACKEND_URL=http://backend:8000
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 5173

# Development server bound to 0.0.0.0 so the host can reach it
CMD ["npm", "run", "dev", "--", "-H", "0.0.0.0", "-p", "5173"]
