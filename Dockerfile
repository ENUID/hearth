# All-in-one deployable image: builds the client + server and serves the whole
# app (UI + API + WebSocket terminal) on a single port. Suitable for Render,
# Fly.io, Railway, or any container host. The container itself is the workspace
# (LocalProvider), so it ships the baseline Linux toolchain too.
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash coreutils sudo \
    git curl wget ca-certificates openssh-client \
    python3 python3-pip python3-venv pipx \
    build-essential \
    vim nano less htop tree jq unzip zip procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies (dev deps included — needed to build).
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/
RUN npm install \
 && npm install --prefix client \
 && npm install --prefix server

# Build client + server.
COPY . .
RUN npm run build
# Make the `hearth` CLI (chat with your model in the terminal) available on PATH.
RUN chmod +x /app/bin/hearth && ln -sf /app/bin/hearth /usr/local/bin/hearth

ENV NODE_ENV=production \
    HOME=/root \
    PORT=8080
EXPOSE 8080

# Single-port server: serves client/dist + API + WS. Hosts set $PORT.
CMD ["node", "server/dist/index.js"]
