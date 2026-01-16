# Shelley (anoworl fork): a coding agent for exe.dev

This repository is a fork of [boldsoftware/shelley](https://github.com/boldsoftware/shelley) (forked from `6bfc75b`, regularly synced with upstream).
Fork goal: Battle-tested tweaks from heavy daily use. See `FORK_NOTES.md` for details.

---

Shelley is a mobile-friendly, web-based, multi-conversation, multi-modal,
multi-model, single-user coding agent built for but not exclusive to
[exe.dev](https://exe.dev/). It does not come with authorization or sandboxing:
bring your own.

*Mobile-friendly* because ideas can come any time.

*Web-based*, because terminal-based scroll back is punishment for shoplifting in some countries.

*Multi-modal* because screenshots, charts, and graphs are necessary, not to mention delightful.

*Multi-model* to benefit from all the innovation going on.

*Single-user* because it makes sense to bring the agent to the compute.

# Installation

## exe.dev VM (Recommended)

### First Time Setup

1. If you don't have a VM yet, create one at https://exe.dev/new

2. Go to the VM list at https://exe.dev/ and click the **Terminal** button for your VM

3. Install, setup, and deploy:
   ```bash
   # Install nvm (Node Version Manager) if needed
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
   source ~/.bashrc

   # Clone the repository
   git clone https://github.com/anoworl/shelley.git
   cd shelley/ui

   # Setup Node.js environment
   nvm install
   corepack enable pnpm
   cd ..

   # Build and deploy (on first run, press Enter when prompted to download pnpm)
   make deploy
   ```

4. Go to https://exe.dev/ and click the **Agent** button for your VM

### Updating

Ask Shelley to update itself:

```
cd /home/exedev/shelley && git pull && make build-linux, then deploy_self
```

Shelley will build and use the `deploy_self` tool to restart itself.

## Build from Source

You'll need Go and Node.

```bash
git clone https://github.com/anoworl/shelley.git
cd shelley
make
```

# Releases

New releases are automatically created on every commit to `main`. Versions
follow the pattern `v0.N.9OCTAL` where N is the total commit count and 9OCTAL is the commit SHA encoded as octal (prefixed with 9).

# Architecture 

The technical stack is Go for the backend, SQLite for storage, and Typescript
and React for the UI. 

The data model is that Conversations have Messages, which might be from the
user, the model, the tools, or the harness. All of that is stored in the
database, and we use a SSE endpoint to keep the UI updated. 

# History

Shelley is partially based on our previous coding agent effort, [Sketch](https://github.com/boldsoftware/sketch). 

Unsurprisingly, much of Shelley is written by Shelley, Sketch, Claude Code, and Codex. 

# Shelley's Name

Shelley is so named because the main tool it uses is the shell, and I like
putting "-ey" at the end of words. It is also named after Percy Bysshe Shelley,
with an appropriately ironic nod at
"[Ozymandias](https://www.poetryfoundation.org/poems/46565/ozymandias)."
Shelley is a computer program, and, it's an it.

# Open source

Shelley is Apache licensed. We require a CLA for contributions.

# Building Shelley

Run `make`. Run `make serve` to start Shelley locally.

## Dev Tricks

If you want to see how mobile looks, and you're on your home
network where you've got mDNS working fine, you can
run 

```
socat TCP-LISTEN:9001,fork TCP:localhost:9000
```
