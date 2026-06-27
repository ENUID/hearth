FROM node:20-bookworm-slim

# A capable, general-purpose Linux environment. This is the user's computer —
# we ship a sensible baseline toolchain and make it easy to install anything
# else (any LLM CLI, any API client, any language) — with sudo, package
# managers, and user-level install paths that persist in the home volume.
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash coreutils sudo \
    git curl wget ca-certificates openssh-client \
    python3 python3-pip python3-venv pipx \
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
RUN useradd -m -s /bin/bash hearth \
    # Passwordless sudo: it's the user's own isolated machine; the trust
    # boundary is the container, so they get root inside it (apt install, etc.).
    && echo "hearth ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/hearth \
    && chmod 0440 /etc/sudoers.d/hearth

# Default dotfiles (seeded into the persistent home on first run by entrypoint).
COPY docker/skel.bashrc /etc/skel/.bashrc

# Fallback for shells that don't read ~/.bashrc: put user install paths on PATH
# system-wide for interactive bash too.
RUN printf '\n# Hearth user install paths\nexport NPM_CONFIG_PREFIX="$HOME/.npm-global"\nexport PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH"\n' >> /etc/bash.bashrc

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /home/hearth

ENV HOME=/home/hearth \
    SHELL=/bin/bash \
    TERM=xterm-256color \
    PORT=3001

EXPOSE 3001
USER hearth

# entrypoint seeds the persistent home, then runs the bridge (which spawns bash).
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "/app/server/dist/index.js"]
