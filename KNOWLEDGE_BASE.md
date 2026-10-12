# AnonyChat Project Knowledge Base

## What this project is

AnonyChat is a lightweight anonymous chat application that pairs two random users together in a 1:1 conversation. It is intentionally simple: one Node.js server, one WebSocket layer for live chat, and a small front-end UI that lets a user connect, wait in a queue, and exchange text messages with a stranger.

The project is built around a very minimal real-time architecture rather than a full social platform. It aims to provide the experience of instant anonymous chat without implementing accounts, persistence, moderation, or multi-room features.

## High-level architecture

The project has two main parts:

- Root server (`index.js`): Node.js + Express + `ws` WebSocket server
- Front-end (`anonychat-fe/src/AnonyChat.jsx`): React client that connects to the same host over a WebSocket and renders the chat UI

### Runtime flow

1. The server starts an Express app and a WebSocket server.
2. Every client connection gets a UUID and is added to a global `connections` set.
3. New clients are placed into a `waiting` queue until another user is available.
4. When two users are available, the server randomly picks one waiting user and pairs the two connections.
5. Once paired, the server forwards text messages and typing notifications between the two sockets.
6. A heartbeat system sends ping/pong checks to detect dead or stale connections and removes them safely.
7. Logs are written through `logger.js` to files in the `logs/` folder and also to the console.

## How it achieves the core behavior

### 1. Random pairing

The server’s core logic is in `index.js`.

- `waiting` stores unpaired users.
- `connections` stores all live sockets.
- `cleanupWaiting()` removes stale sockets from the queue.
- `pair(a, b)` marks each socket as paired and links them using `a.partner = b` and `b.partner = a`.
- When a new client arrives, the server tries to match them against a random existing waiting socket.

This creates a simple “join queue, then get paired with a random stranger” flow.

### 2. Real-time messaging with WebSockets

The browser client creates a WebSocket connection to the same host:

- `const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';`
- `const wsUrl = \`${protocol}//\${window.location.host}\`;`

The client listens for messages such as:

- `stats` updates
- `system` messages
- `text` messages
- `typing` notifications
- `receipt` acknowledgements

When the server receives a `text` message, it broadcasts the same payload to the partner socket and also echoes the message back to the sender with `from: 'self'`.

### 3. Typing and delivery signals

The app sends typing events from the client when the user types in the input field. On the server, typing is routed to the partner socket.

The client also uses message receipts to mark outbound messages as delivered after the remote end acknowledges receipt.

### 4. Logging and metrics

`logger.js` uses Winston to write structured JSON logs to:

- `logs/app.log`
- `logs/error.log`
- `logs/metrics.log`

It tracks connection counts, waiting users, active pairs, message counts, errors, heartbeat checks, and memory stats. These are logged periodically and on key lifecycle events.

## Important files and responsibilities

- `index.js` — primary server logic, queue management, pairing, WebSocket flow, heartbeat, graceful shutdown
- `logger.js` — Winston-based logging and stats tracking
- `public/index.html` — static page shell that loads the browser bundle
- `anonychat-fe/src/AnonyChat.jsx` — front-end UI and WebSocket client behavior
- `anonychat-fe/src/main.jsx` — app bootstrap
- `anonychat-fe/src/index.css` — Tailwind-based styling layer for the React app
- `README.md` — project overview and running instructions

## How the project is deployed or run

The root project is a Node app with these main dependencies:

- `express`
- `ws`
- `uuid`
- `winston`

At the root level, the package is configured as an ES module (`"type": "module"`).

The README says:

```bash
npm install
node server.js
```

However, the actual server entry file in the project is `index.js`, not `server.js`. The README is therefore stale and will not run correctly as written.

The app is expected to be started in practice with:

```bash
npm install
node index.js
```

Then users open the app in a browser at:

```text
http://localhost:3000
```

## What the project does well

- Very small and easy to understand
- Uses WebSockets for minimal-latency chat
- Includes heartbeats to clean up dead clients
- Tracks simple metrics and logs for debugging
- UI is polished enough for a demo or prototype

## Project limitations

This project is intentionally minimal and not production-grade. Key limitations include:

- No persistent storage: conversations are not saved, logged, or searchable.
- No user accounts or identity management.
- No moderation, blocklist, or abuse control.
- No rate limiting or spam prevention for message volume.
- No message length limits, content filtering, or sanitization.
- No multi-room or multi-session management.
- No real database or auth layer.
- No Redis, clustering, or horizontal scaling support.
- No HTTPS enforcement or TLS configuration in the app itself.
- Strictly random pairing; there is no compatibility or safety matching.
- Minimal operational resilience beyond heartbeat cleanup.

## Known issues and bugs

### 1. README startup instructions are stale

The README references `server.js`, but the project’s real server entry is `index.js`.

Impact: users following the README will attempt to start a non-existent file.

### 2. The project is structured with two different front-end flows

There is a root static app and a Vite React app under `anonychat-fe`.

The server serves static files from `public/`, but the UI source under `anonychat-fe` appears to be a separate frontend project that is not wired into the Node server as a development build step. The project’s runtime behavior depends on the built static assets being present in `public/`, which creates a split between source and served output.

Impact: it is easy to get confused about which front-end is the real active app.

### 3. No validation on incoming message payloads

The server accepts any JSON message and checks only `msg.type === 'text' && msg.data` plus `msg.type === 'typing'`.

It does not enforce a maximum message size or validate the shape of `msg.data` beyond truthiness. It also does not sanitize content before forwarding it to a partner.

Impact: a malicious or buggy client can send extremely large or malformed payloads, leading to abuse or noisy behavior.

### 4. The queue cleanup logic is useful but incomplete

`cleanupWaiting()` removes stale sockets from the waiting queue, but the queue is still best-effort and highly dependent on the WebSocket lifecycle being clean.

Impact: the queue can still contain stale references if there are edge cases around disconnect timing or error races.

### 5. Heartbeat and disconnect logic can overlap

The server calls `disconnect(ws)` from multiple places: `close`, `error`, and heartbeat cleanup.

The logic is defensive but not fully idempotent across all paths. Some state updates happen in multiple places and could duplicate cleanup-related work.

Impact: minor logging/stat drift or redundant queue updates are possible, especially under network instability.

### 6. Front-end online counter is artificially offset

In `anonychat-fe/src/AnonyChat.jsx` the online counter displays:

```js
<span> {count+121} online </span>
```

This adds a hardcoded offset to the count instead of displaying the actual server-provided value directly.

Impact: the counter is misleading and design-wise inconsistent with the real online statistics.

### 7. WebSocket reconnect behavior is minimal

The client creates a single WebSocket connection once and does not attempt reconnect logic if the connection drops.

Impact: a temporary network loss or server restart can leave the browser tab disconnected until a refresh.

### 8. Browser input and typing logic are noisy

The `handleKeyDown` logic in the message input will call `handleTyping()` for any key press except Enter, even when the user is not intentionally typing or when the message is empty.

Impact: typing notifications can fire more often than intended.

### 9. The server has no content moderation or safety layer

It forwards arbitrary text between users without checking for harassment, abuse, or explicit content.

Impact: the product has no built-in safety mechanisms beyond the simple random pairing itself.

## Security and privacy notes

This project is not designed around privacy hardening or secure communications.

- It does not authenticate users.
- It does not encrypt beyond the transport layer used by the browser (e.g. HTTPS/WSS is environment-dependent).
- It does not protect against abuse, spam, or harassment.
- It does not store message history or user metadata securely.

The anonymous nature is social and technical, but not a formal anonymity or safety guarantee.

## Practical summary

This is a tiny anonymous stranger chat demo rather than a production-ready messaging platform. It works by keeping a queue of waiting clients, pairing them at random, and forwarding real-time messages over WebSockets. It includes basic logging and a clean UX, but it has notable gaps in startup instructions, queue robustness, safety, validation, scaling, and resilience.

The project is best thought of as a prototype or learning example for:

- WebSocket server design
- Random matching flows
- Minimal real-time chat architecture
- Lightweight UI + backend integration

It is not a complete or hardened chat application.
