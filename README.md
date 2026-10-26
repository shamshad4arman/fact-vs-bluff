# Fact vs Bluff — Version 1

A responsive, real-time multiplayer trivia prototype built with HTML, CSS, browser JavaScript, Node.js, Express, and Socket.IO.

## Requirements
- Node.js 18 or newer
- Internet connection for the Google Fonts stylesheet (the game itself does not depend on fonts loading)

## Run locally
1. Install Node.js from https://nodejs.org/
2. Extract this folder.
3. Open a terminal in this folder.
4. Run:

   ```bash
   npm install
   npm start
   ```

5. Open http://localhost:3000
6. To test multiplayer, open the URL in two separate browsers or devices. For a second device on the same Wi-Fi, use your computer's local IP address, for example `http://192.168.1.20:3000`.

## Deploy to a public URL
This project can be deployed to a Node.js host that supports WebSockets, such as Render, Railway, or another Node-compatible service.

Typical deployment steps:
1. Create a new web service and upload this project folder to a Git repository.
2. Set the build/install command to `npm install`.
3. Set the start command to `npm start`.
4. Deploy, then open the HTTPS URL provided by the host.

Socket.IO uses WebSockets where available and falls back to HTTP long-polling. Make sure your host supports persistent Node.js processes and WebSocket connections. For multi-instance production deployments, add a shared Socket.IO adapter and shared room storage; this V1 stores rooms in server memory and rooms disappear when the server restarts.

## How to play
- One player creates a room and becomes host.
- Friends join using the six-character room code.
- The host starts a round.
- Everyone submits a fake answer (the real answer is rejected).
- Once all players submit, everyone votes for the answer they think is true.
- Correct guess: +100 points. A bluff earns its author +50 each time another player votes for it.
- The host starts the next round after the results appear.

## Current prototype limits
- Up to 12 players per room.
- All players must submit before voting starts, and all players must vote before results appear.
- The included trivia list is a small curated starter set; it is not fetched from a live trivia API.
- Room state is held in memory. Add persistence, rate limiting, moderation, reconnection handling, and a shared adapter before a large public launch.
