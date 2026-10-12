# anonychat

A simple anonymous chat that connects you with a random stranger. Nothing fancy.

## Features

* Random 1-on-1 pairing
* Typing indicator
* Send images by selecting a file or pasting one from the clipboard in the message field
* Automatic reconnect with the same chat partner for up to 30 seconds after a network interruption by default
* Shows the first four characters of the other participant's UUID in the chat header; the full UUID is only used between the client and server for reconnect
* Allows only one active connection per client UUID; opening the same chat in another tab is rejected without disconnecting the active tab
* Clean dark UI with Tailwind

## Run it

```bash
npm install
node index.js
```

Then open [http://localhost:3000](http://localhost:3000) in two tabs.

Set `RECONNECT_GRACE_SECONDS` to change how long a disconnected chat session is kept. It defaults to `30` and must be a positive integer. The chat timeline shows a countdown using this server setting while reconnecting. In PowerShell, for example:

```powershell
$env:RECONNECT_GRACE_SECONDS = "60"
node index.js
```

Message content logging is enabled by default. JSONL files are grouped under `logs/messages/YYYY/MM/DD` and rotated at 20 MiB per file. Records include sender and recipient client UUIDs and the message content; images are logged as JPEG data URLs after client-side resizing. These logs contain plaintext and should be protected and deleted according to your retention policy. Set `MESSAGE_LOGGING_ENABLED=false` to disable content logging, or `MESSAGE_LOG_DIR` to change its location. Environment variables must be set in the shell before starting the server.

If you want to work on the Vite client interface, use the frontend project separately:

Start the backend from the project root in one terminal:

```bash
node index.js
```

Then start Vite in a second terminal:

```bash
cd anonychat-fe
npm install
npm run dev -- --host 0.0.0.0 --port 4173
```

Open the Vite URL in two tabs. Its `/ws` WebSocket connection is proxied to the backend on port `3000`.

## Folder layout

```
index.js
logger.js
public/
  ├── index.html
  ├── fonts/MapleMono.ttf
  └── sounds/
anonychat-fe/
  ├── src/
  ├── package.json
  └── vite.config.js
```

## Fonts

Thanks for the authors of Maple Mono fonts

https://github.com/subframe7536/maple-font
