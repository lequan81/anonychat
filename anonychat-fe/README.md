# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

---

## TODO Roadmap

### ~~Basic Improvement #1 (done)~~

- ~~Refactor and modularize AnonyChat into components/hooks~~
- ~~Implement lazy loading (React.lazy/Suspense)~~
- ~~Add error handling (ErrorPage, ErrorBoundary)~~
- ~~Improve accessibility (aria-labels, etc.)~~
- ~~Optimize font and sound loading~~
- ~~Fix duplicate imports and update to alias/barrel imports~~
- ~~Support emoji/icon-only messages in validation (basic implement)~~
- ~~auto-resize text chatting content box with max height and scrollable~~

### WebSocket 2.0 (WIP)

- Advanced reconnect logic (client-side) (configurable backoff, ~~max attempts, cooldown, debounce~~)
- Request/skip modal logic for chat partner
- Smarter heartbeat/ping-pong and connection status
- Server error and disconnect reason handling
- (Optional) WebSocket message queue, status (send, seen,...)

### Chat 2.0 (planned)

- Input validation feedback (warning/shake on invalid send)
- Add Toast notification for better UI/UX
- Disable send button during sending
- Smooth auto-resize with max height and scroll
- Enhanced keyboard accessibility (ARIA, navigation)
- Paste sanitization
- Emoji picker and file/image support
- Input history navigation (Up/Down)
- Character counter/limit
- Debounced typing indicator improvements
- UI/UX polish (animations, timestamps, message status, etc.)

---
