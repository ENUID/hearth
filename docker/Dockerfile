FROM node:20-bookworm-slim

# A capable, general-purpose Linux environment. This is the user's computer —
# we ship a sensible baseline toolchain; they install whatever else they want
# (any LLM CLI, any API client, any language, anything) just like on any machine.
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash coreutils \
    git curl wget ca-certificates openssh-client \
    python3 python3-pip python3-venv \
    build-essential \
    vim nano less htop tree jq unzip zip procps man-db \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- the terminal bridge (server): WebSocket <-> PTY ---
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev
COPY server/ ./server/
RUN cd server && npm run build

# --- the user's workspace ---
RUN useradd -m -s /bin/bash hearth
WORKDIR /home/hearth

ENV HOME=/home/hearth \
    SHELL=/bin/bash \
    TERM=xterm-256color \
    PORT=3001

EXPOSE 3001
USER hearth

# The bridge spawns /bin/bash for each web terminal session.
CMD ["node", "/app/server/dist/index.js"]
