---
name: dev
description: Start or stop all BIM IDE local development servers
user_invocable: true
---

# /dev — Run BIM IDE locally

This skill manages the local development environment for the BIM IDE platform.

## Usage

When the user says `/dev` (or asks to start/run the app locally):

1. Run `./scripts/dev.sh` from the project root to start all servers
2. Report the URLs back to the user

When the user says `/dev --kill` (or asks to stop the servers):

1. Run `./scripts/dev.sh --kill` from the project root

## Services started

| Service | Port | Command |
|---------|------|---------|
| Shell + Viewer | 3000 | `npm run dev` |
| Extension Store | 4000 | `npm run dev:store` |

## Notes

- The script kills any existing processes on ports 3000 and 4000 before starting
- Logs are written to `/tmp/bim-ide-shell.log` and `/tmp/bim-ide-store.log`
- The standalone viewer can be started separately with `npm run dev:viewer` (port 3001) if needed
