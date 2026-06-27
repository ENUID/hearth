# ~/.bashrc for the Hearth workspace.
# This file persists in your home directory — edit it freely.

# Stop here if not running interactively.
case $- in
  *i*) ;;
    *) return;;
esac

# --- User-level install locations (persist in your home dir) ---
# npm global installs go here instead of the system prefix (no sudo needed):
export NPM_CONFIG_PREFIX="$HOME/.npm-global"
# pip --user / pipx installs land in ~/.local/bin.
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH"

# --- API keys & secrets ---
# Add your keys here so they persist across sessions, e.g.:
#   export OPENAI_API_KEY="sk-..."
#   export ANTHROPIC_API_KEY="sk-ant-..."
# (Anything you export here is available to every CLI you run.)

# --- Quality-of-life ---
export EDITOR="${EDITOR:-vim}"
export HISTSIZE=10000
export HISTFILESIZE=20000
shopt -s histappend checkwinsize
alias ll='ls -alF'
alias la='ls -A'

# Prompt: user@hearth:cwd$
PS1='\[\e[35m\]\u\[\e[0m\]@\[\e[36m\]hearth\[\e[0m\]:\[\e[33m\]\w\[\e[0m\]\$ '

[ -d "$HOME/projects" ] && cd "$HOME/projects" 2>/dev/null || true
