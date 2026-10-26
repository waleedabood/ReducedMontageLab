#!/bin/zsh
# Double-click in Finder to launch the local Reduced Montage Lab.
cd -- "${0:A:h}" || exit 1
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"

fail() {
  print -r -- "$1"
  read -r '?Press Return to close this window.'
  exit 1
}

command -v node >/dev/null 2>&1 || fail 'Node.js 22 or newer is required. Install it, then run this launcher again.'
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' || fail 'Please update Node.js to version 22 or newer.'

export RML_PORT="${RML_PORT:-8440}"
[[ "$RML_PORT" == <1-65535> ]] || fail 'RML_PORT must be a number from 1 to 65535.'
lab_url="http://127.0.0.1:$RML_PORT/"
lab_ready() {
  curl --noproxy '*' --max-time 1 -fsS "$lab_url" 2>/dev/null | /usr/bin/grep -q '<title>Reduced Montage Lab</title>'
}

if lab_ready; then
  open "$lab_url"
  print 'Opened the running Reduced Montage Lab. You can close this terminal window.'
  exit 0
fi

node server.mjs &
lab_pid=$!
trap 'kill "$lab_pid" 2>/dev/null' EXIT
trap 'exit 130' INT TERM

for attempt in {1..50}; do
  kill -0 "$lab_pid" 2>/dev/null || fail 'The lab could not start. Check the error above; the port may already be in use.'
  if lab_ready; then
    open "$lab_url"
    print 'Reduced Montage Lab is running. Press Control-C here to stop it.'
    wait "$lab_pid"
    exit 0
  fi
  sleep 0.1
done
fail 'The lab did not become ready. Check the error above and try again.'
