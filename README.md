# anonychat

A simple anonymous chat that connects you with a random stranger. Nothing fancy.

## Features

* Random 1-on-1 pairing
* Typing indicator
* Automatic reconnect with the same chat partner for up to 60 seconds after a network interruption
* Clean dark UI with Tailwind

## Run it

```bash
npm install
node index.js
```

Then open [http://localhost:3000](http://localhost:3000) in two tabs.

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
