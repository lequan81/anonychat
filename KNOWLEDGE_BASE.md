# AnonyChat Project Knowledge Base

## What this project is

AnonyChat is a lightweight anonymous chat application that pairs two random users together in a 1:1 conversation. It is intentionally simple: one Node.js server, one WebSocket layer for live chat, and a small front-end UI that lets a user connect, wait in a queue, and exchange text messages or images with a stranger.

The project is built around a minimal real-time architecture rather than a full social platform. It has no user accounts or moderation; chat history stays in the client during the conversation and is preserved across reconnects, while message content is separately written to server-side JSONL logs by default.

## High-level architecture

The project has two main parts:

- Root server (`index.js`): Node.js + Express + `ws` WebSocket server
- Front-end (`anonychat-fe/src/AnonyChat.jsx`): React client that connects to the same host over a WebSocket and renders the chat UI

### Runtime flow

1. The server starts an Express app and a WebSocket server.
2. Every client connection gets a UUID and is added to a global `connections` set.
3. New clients are placed into a `waiting` queue until another user is available.
4. The server matches waiting users while skipping UUID pairs temporarily blocked by an end-conversation cooldown.
5. Once paired, the server forwards validated text or JPEG image messages, delivery receipts, typing notifications, and allowlisted emoji reactions between the two sockets.
6. A heartbeat system sends ping/pong checks to detect dead or stale connections. On an unexpected disconnect, the partner session can be resumed within the configured reconnect grace period.
7. Application/metrics logs are written through `logger.js`; message content is written separately through `messageLog.js` to dated, size-rotated JSONL files when message logging is enabled.

## How it achieves the core behavior

### 1. Random pairing

The server’s core logic is in `index.js`.

- `waiting` stores unpaired users.
- `connections` stores live sockets; `clients` tracks client UUID sessions and prevents multiple active tabs from taking over the same identity.
- `blockedPairs` tracks UUID pairs temporarily excluded after a user ends a conversation.
- `cleanupWaiting()` removes stale sockets from the queue.
- `matchWaiting()` searches for an eligible pair rather than allowing a temporarily blocked pair to prevent other waiting users from matching.
- `pair(a, b)` marks each socket as paired and links their sessions.
- `PAIR_REMATCH_COOLDOWN_SECONDS` defaults to 15 seconds. Ending a conversation returns both users to matching immediately, but excludes that UUID pair until the cooldown expires. A network reconnect does not trigger this cooldown.
- Only a four-character peer UUID prefix is sent to the other client for display; the full UUID remains client/server session data used for reconnect.

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

The client can reconnect to the same chat session after a transient network interruption, with an exponential retry delay and a server-configured grace period (`RECONNECT_GRACE_SECONDS`, default 30). The client keeps the conversation history during reconnect. A second active connection using the same client UUID is rejected with close code 4001; the client does not retry that duplicate-tab rejection.

Text and JPEG image messages are echoed to the sender and forwarded to the partner. Images are limited to 5 MiB by the server and are resized on the client before sending. The “Thoát” action ends the conversation for both participants and places them back in matching.

A local message counter tracks sent and received text/image messages for the current conversation. Both participants see playful milestone copy at 10, 25, 50, 100, 250, 500, and 1,000 messages, then every additional 1,000 messages. A local event counter also tracks text/image packets, reactions, typing notifications, and delivery receipts; both participants see a matching milestone for event activity. Celebration copy and toast motion grow more dramatic across four milestone tiers; the event's representative icon is used in both the toast and its canvas-confetti particles. The toast remains visible for 7.8 seconds near the top of the screen. Reduced-motion preferences disable celebration animations and confetti. Each client derives these counts from its chat history and WebSocket activity; no extra server message or persistent message log is needed.

Each text or image message gets a monotonically increasing index local to each client. Messages also carry the sender's local index so reactions can target the same message even if the two clients have different local ordering. Each participant can set one reaction per message from ❤️, 😂, 😮, 😢, and 👍, or use the remove button to clear it. From the local user's point of view, their reaction is shown as a count-free icon attached to the bottom-right corner, while the other participant's reaction is attached to the top-left corner. A reaction event springs its icon from small through an overshoot to its final size; reduced-motion preferences disable the animation. On desktop, the picker appears when a message is hovered or focused; on touch layouts, tap the message itself to open it. The server only validates the reaction packet shape and forwards it; clients maintain reaction state.

### 3. Typing and delivery signals

The app sends typing events from the client when the user types in the input field. On the server, typing is routed to the partner socket.

The client also uses message receipts to mark outbound messages as delivered after the remote end acknowledges receipt.

### 4. Logging and metrics

`logger.js` uses Winston to write structured JSON logs to:

- `logs/app.log`
- `logs/error.log`
- `logs/metrics.log`

It tracks connection counts, waiting users, active pairs, message counts, errors, heartbeat checks, and memory stats. These are logged periodically and on key lifecycle events. `messageLog.js` separately writes message records as JSONL, organized by UTC date under `logs/messages/YYYY/MM/DD` and rotated at 20 MiB per file. Content logging is enabled by default and can be disabled with `MESSAGE_LOGGING_ENABLED=false`; image records contain JPEG data URLs. These files contain plaintext message content and identifiers.

## Important files and responsibilities

- `index.js` — primary server logic, queue management, pairing, WebSocket flow, heartbeat, graceful shutdown
- `logger.js` — Winston-based logging and stats tracking
- `messageLog.js` — dated, size-rotated JSONL message content logging
- `public/index.html` — static page shell that loads the browser bundle
- `anonychat-fe/src/AnonyChat.jsx` — front-end UI and WebSocket client behavior
- `anonychat-fe/src/main.jsx` — app bootstrap
- `anonychat-fe/src/index.css` — Tailwind-based styling layer for the React app
- `README.md` — project overview and running instructions
- `.env.example` — example server configuration, including reconnect and rematch cooldown settings

## How the project is deployed or run

The root project is a Node app with these main dependencies:

- `express`
- `ws`
- `uuid`
- `winston`

At the root level, the package is configured as an ES module (`"type": "module"`).

There are two practical ways to run the app:

1. Server-only mode for the built static client:

```bash
npm install
node index.js
```

2. Front-end development mode for the React/Vite client:

```bash
cd anonychat-fe
npm install
npm run dev -- --host 0.0.0.0 --port 4173
```

The app is expected to be available at:

```text
http://localhost:3000
```

for the production-built static server, or:

```text
http://localhost:4173
```

for the Vite dev build.

## What the project does well

- Very small and easy to understand
- Uses WebSockets for minimal-latency chat
- Includes heartbeats to clean up dead clients
- Tracks simple metrics and logs for debugging
- UI is polished enough for a demo or prototype

## Project limitations

This project is intentionally minimal and not production-grade. Key limitations include:

- No user accounts or queryable conversation-history feature. Message content is nevertheless persisted in server-side JSONL logs by default; those logs are not a chat-history database.
- No user identity management beyond the client UUID used for an active chat session.
- No content moderation, abuse prevention, or rate limiting. WebSocket payloads have a 7 MiB transport limit and JPEG images have a 5 MiB application limit, but text has no separate application-level length limit.
- No multi-room or multi-session management.
- No real database or auth layer.
- No Redis, clustering, or horizontal scaling support.
- No HTTPS enforcement or TLS configuration in the app itself.
- Pairing is random among eligible users; there is no compatibility or safety matching.
- Minimal operational resilience beyond heartbeat cleanup.

## Known issues and bugs

### 1. The project is structured with two different front-end flows

There is a root static app and a Vite React app under `anonychat-fe`.

The server serves static files from `public/`, but the UI source under `anonychat-fe` appears to be a separate frontend project that is not wired into the Node server as a development build step. The project’s runtime behavior depends on the built static assets being present in `public/`, which creates a split between source and served output.

Impact: it is easy to get confused about which front-end is the real active app.

### 2. Incoming text has no application-level length limit

The WebSocket server limits an entire payload to 7 MiB and validates text as a non-empty string. JPEG images are validated and limited to 5 MiB. Text does not have a separate application-level size limit or content moderation.

Impact: a client can still send large text messages within the WebSocket payload limit, and abusive content is forwarded without moderation.

### 3. The queue cleanup logic is useful but incomplete

`cleanupWaiting()` removes stale sockets from the waiting queue, but the queue is still best-effort and highly dependent on the WebSocket lifecycle being clean.

Impact: the queue can still contain stale references if there are edge cases around disconnect timing or error races.

### 4. Heartbeat and disconnect logic can overlap

The server calls `disconnect(ws)` from multiple places: `close`, `error`, and heartbeat cleanup.

The logic is defensive but not fully idempotent across all paths. Some state updates happen in multiple places and could duplicate cleanup-related work.

Impact: minor logging/stat drift or redundant queue updates are possible, especially under network instability.

### 5. Browser input and typing logic are noisy

The `handleKeyDown` logic in the message input will call `handleTyping()` for any key press except Enter, even when the user is not intentionally typing or when the message is empty.

Impact: typing notifications can fire more often than intended.

### 6. The server has no content moderation or safety layer

It forwards arbitrary text between users without checking for harassment, abuse, or explicit content.

Impact: the product has no built-in safety mechanisms beyond the simple random pairing itself.

## Security and privacy notes

This project is not designed around privacy hardening or secure communications.

- It does not authenticate users.
- It does not encrypt beyond the transport layer used by the browser (e.g. HTTPS/WSS is environment-dependent).
- It does not protect against abuse, spam, or harassment.
- Message JSONL logs contain plaintext messages, sender/recipient UUIDs, and potentially JPEG data URLs. Log access and retention must be managed by the operator.
- The four-character peer UUID prefix shown in the UI is not a formal anonymity guarantee.

The anonymous nature is social and technical, but not a formal anonymity or safety guarantee.

## Practical summary

This is a small anonymous stranger chat demo rather than a production-ready messaging platform. It keeps a queue of waiting clients, pairs eligible users, and forwards real-time messages over WebSockets. It includes reconnect support and message logging, but has notable gaps in queue robustness, safety, text-size validation, and scaling.

The project is best thought of as a prototype or learning example for:

- WebSocket server design
- Random matching flows
- Minimal real-time chat architecture
- Lightweight UI + backend integration

It is not a complete or hardened chat application.
