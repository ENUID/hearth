#!/bin/bash
# Hearth container entrypoint.
#
# The home directory is a persistent volume that starts empty, which shadows the
# image's /etc/skel. So on first run we seed the user's dotfiles and the
# directories that user-level package installs (pip --user, npm -g, pipx) write
# into — everything here lives under $HOME and therefore persists across sessions.
set -e

HOME="${HOME:-/home/hearth}"

# Seed dotfiles from skel if the persistent home doesn't have them yet.
for f in .bashrc .profile; do
  if [ ! -e "$HOME/$f" ] && [ -e "/etc/skel/$f" ]; then
    cp "/etc/skel/$f" "$HOME/$f"
  fi
done

# Ensure user-writable install locations exist (these are on PATH; see .bashrc).
mkdir -p "$HOME/.local/bin" "$HOME/.npm-global/bin" "$HOME/projects"

exec "$@"
