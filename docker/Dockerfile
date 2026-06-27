FROM node:20-bookworm-slim

# system deps for node-pty
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ git bash curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# install server deps
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

COPY server/ ./server/
RUN cd server && npm run build

# create hearth user home
RUN useradd -m -s /bin/bash hearth
WORKDIR /home/hearth

ENV HOME=/home/hearth \
    SHELL=/bin/bash \
    PORT=3001 \
    STUB_INFERENCE=true

EXPOSE 3001

USER hearth

CMD ["node", "/app/server/dist/index.js"]
