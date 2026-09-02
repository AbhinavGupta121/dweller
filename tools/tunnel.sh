#!/usr/bin/env bash
#
# Serve the built app on a public HTTPS URL you can open on a phone.
#
#   npm run tunnel
#
# Why a tunnel at all: the browser only hands out geolocation and compass
# readings in a secure context, so http://<lan-ip> will not work, and this
# machine is on a private network the phone cannot reach from outside anyway. A
# Cloudflare quick tunnel gives an HTTPS hostname with no account and no DNS.
#
# The URL changes every run and dies with this process. That is the right
# trade-off for a walk this morning; for anything permanent, deploy the static
# build instead (see README).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-4173}"
CLOUDFLARED="${CLOUDFLARED:-$HOME/.local/bin/cloudflared}"

if [[ ! -x "$CLOUDFLARED" ]]; then
  if command -v cloudflared >/dev/null 2>&1; then
    CLOUDFLARED="$(command -v cloudflared)"
  else
    echo "cloudflared not found. Install it with:" >&2
    echo "  curl -fsSL -o ~/.local/bin/cloudflared \\" >&2
    echo "    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64" >&2
    echo "  chmod +x ~/.local/bin/cloudflared" >&2
    exit 1
  fi
fi

# Everything below runs from the app package: vite resolves dist relative to the
# working directory, and `npm --prefix` alone does not change it.
cd "$ROOT/app"

echo "Building…"
npm run build >/dev/null

# Serve the built output rather than the dev server: the service worker, the
# manifest and the hashed asset URLs only behave like the real thing here, and
# offline caching is the feature most likely to break silently.
echo "Serving dist on :$PORT"
npx vite preview --port "$PORT" --strictPort --host 127.0.0.1 \
  >/tmp/wander-preview.log 2>&1 &
PREVIEW_PID=$!
TUNNEL_PID=""

cleanup() {
  [[ -n "$PREVIEW_PID" ]] && kill "$PREVIEW_PID" 2>/dev/null || true
  [[ -n "$TUNNEL_PID" ]] && kill "$TUNNEL_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

ready=""
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/"; then
    ready=1
    break
  fi
  sleep 0.5
done

if [[ -z "$ready" ]]; then
  echo "Preview server did not come up. See /tmp/wander-preview.log" >&2
  exit 1
fi

echo "Opening tunnel…"
"$CLOUDFLARED" tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate \
  >/tmp/wander-tunnel.log 2>&1 &
TUNNEL_PID=$!

URL=""
for _ in $(seq 1 80); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/wander-tunnel.log | head -1 || true)"
  [[ -n "$URL" ]] && break
  sleep 0.5
done

if [[ -z "$URL" ]]; then
  echo "Tunnel did not report a URL. See /tmp/wander-tunnel.log" >&2
  exit 1
fi

cat <<EOF

  Open this on your phone:

      $URL

  Then: Chrome menu -> Add to Home screen, and launch it from the icon.
  Installed, it runs without browser chrome and keeps the screen awake.

  Allow location when asked. Say yes to motion sensors too if prompted;
  without the compass you lose "on your left" but nothing else.

  Leave this terminal open. Ctrl-C ends the tunnel.

EOF

wait "$TUNNEL_PID"
