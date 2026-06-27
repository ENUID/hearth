FROM node:20-bookworm-slim

# System deps: build tools for node-pty, plus a baseline dev toolchain that
# users get inside the terminal (git, python, curl). Install more at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip make g++ git bash curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- build the terminal bridge (server) ---
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev
COPY server/ ./server/
RUN cd server && npm run build

# --- build and globally install the hermes CLI agent ---
# This makes `hermes` available on PATH the moment the web terminal opens.
COPY hermes-cli/package*.json ./hermes-cli/
RUN cd hermes-cli && npm install
COPY hermes-cli/ ./hermes-cli/
RUN cd hermes-cli && npm run build && npm install -g .

# --- user workspace ---
RUN useradd -m -s /bin/bash hearth
WORKDIR /home/hearth

ENV HOME=/home/hearth \
    SHELL=/bin/bash \
    PORT=3001 \
    STUB_INFERENCE=true

EXPOSE 3001
USER hearth

# The bridge spawns /bin/bash for each web terminal session.
CMD ["node", "/app/server/dist/index.js"]
