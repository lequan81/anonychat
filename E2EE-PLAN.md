# End-to-end encryption plan

## Protocol decision

Use a maintained implementation of the Signal Protocol that supports browsers and persisted session state. Start a new Signal session for every newly paired chat. Reconnecting to the same pair during the reconnect grace period restores the existing session.

Signal's Double Ratchet rotates message keys and provides forward secrecy. A stable client identity key can support authentication, but it is separate from the per-chat session keys. Without verifying public keys, a malicious server could substitute keys and perform a man-in-the-middle attack. Add a safety number or fingerprint verification flow if protection against that threat is required.

## Threat model and library

- Select and validate a maintained browser-compatible Signal implementation, including its license, APIs, persistence support, and security history.
- Define which payloads are encrypted. The server will still see connection metadata such as IP address, timing, message sizes, and pair membership.
- Decide whether typing indicators and delivery receipts are encrypted or left visible as metadata.
- Never fall back to plaintext if encryption or decryption fails.
- Keep the server relay-only: do not persist client UUIDs, identity keys, prekeys, session state, chat IDs, message history, or ciphertext to disk or a database.
- Keep only the transient in-memory routing state required to relay a live chat and, if reconnect is enabled, its configured grace period. Delete that state when the grace period expires or the chat ends.
- Complete key exchange only between clients that are simultaneously connected. Do not add a server-side prekey directory, offline mailbox, or message queue.
- Minimize or disable persistent chat event logs. In particular, do not log client UUIDs, pair identifiers, message contents, ciphertext, or per-message metadata. Keep only operational counters that cannot be tied back to a client where practical.

## Session identity and key establishment

- Establish a fresh client-side Signal session when the server pairs two clients; relay only the minimum transient session-routing identifier needed to associate their messages.
- Preserve the in-memory pairing route during reconnects to the same pair within the grace period, then erase it on expiry.
- Create a new `chatId` and cryptographic session when a pair ends or a client is matched with a different partner.
- Keep the local client UUID for reconnect lookup only; do not use it as a cryptographic key or authenticated identity.
- Exchange the minimum Signal handshake material directly through the live relay, then establish a Signal session. Handle handshake failures explicitly.
- Reject or discard messages associated with the wrong live pairing or session.

## Encrypted message relay

- Encrypt message content on the sender before it reaches the server.
- Relay only encrypted envelopes through the WebSocket server in `index.js`.
- Decrypt on the receiving client and expose plaintext only to the chat UI.
- Keep server logs free of plaintext, keys, and sensitive envelope contents.
- Encrypt typing events and receipts too if their metadata should not be visible to the server.

## Client persistence and reconnect

- Persist the client identity and ratchet/session state only on the client in IndexedDB so it can resume after a refresh or network interruption.
- Do not store private keys in plaintext in `localStorage`.
- Resume the ratchet state only for the same `chatId`. If the grace period expires or a new pair is created, delete the old session state and establish a fresh session.
- Define client-side cleanup behavior for abandoned or expired sessions. Server-side reconnect and pairing records remain memory-only and expire automatically.

## Verification and tests

- Confirm two clients can establish a session and exchange ciphertext that only the intended client can decrypt.
- Verify each newly paired chat gets a fresh session and that reconnects within the grace period restore the existing session.
- Test refresh persistence, expiry, changed or replayed ciphertext, wrong session IDs, out-of-order messages, invalid keys, exhausted prekeys, and handshake failures.
- Confirm the server never receives plaintext and that failures never cause plaintext fallback.
- Inspect server storage and logs to confirm no chat/session data is written to disk or a database.
- Test the key-verification flow if protection against a malicious server impersonating a chat partner is in scope.
