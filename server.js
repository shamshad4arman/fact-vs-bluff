const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true }));

const QUESTIONS = [
  { q: "Which planet has the most moons confirmed so far?", a: "Saturn" },
  { q: "What is the largest desert in the world?", a: "Antarctica" },
  { q: "What is the only mammal capable of true flight?", a: "Bat" },
  { q: "Which element has the chemical symbol Fe?", a: "Iron" },
  { q: "What is the capital city of Canada?", a: "Ottawa" },
  { q: "How many hearts does an octopus have?", a: "Three" },
  { q: "Which ocean is the largest on Earth?", a: "Pacific Ocean" },
  { q: "What is the hardest naturally occurring substance?", a: "Diamond" },
  { q: "Which country gifted the Statue of Liberty to the United States?", a: "France" },
  { q: "What is the smallest prime number?", a: "2" },
  { q: "Which gas do plants absorb from the atmosphere?", a: "Carbon dioxide" },
  { q: "What is the currency of Japan?", a: "Yen" },
  { q: "How many sides does a dodecagon have?", a: "12" },
  { q: "Which is the largest planet in our solar system?", a: "Jupiter" },
  { q: "What is the main language spoken in Brazil?", a: "Portuguese" }
];

const rooms = new Map();
const makeCode = () => {
  let code;
  do { code = crypto.randomBytes(3).toString("hex").toUpperCase(); }
  while (rooms.has(code));
  return code;
};
const cleanName = (name) => String(name || "").trim().replace(/[<>]/g, "").slice(0, 18);
const publicPlayer = (p) => ({ id: p.id, name: p.name, score: p.score, host: p.host });
const roomState = (room, viewerId) => {
  const players = [...room.players.values()].map(publicPlayer);
  const state = {
    code: room.code, players, hostId: room.hostId, phase: room.phase,
    round: room.round, question: room.question?.q || null,
    submittedCount: room.submissions.size, playerCount: room.players.size, voteCount: room.votes.size,
    hasSubmitted: room.submissions.has(viewerId), hasVoted: room.votes.has(viewerId),
    canStart: viewerId === room.hostId && room.players.size >= 2 && room.phase === "lobby",
    canNext: viewerId === room.hostId && room.phase === "results",
    options: [], correctAnswer: null, votes: {}, answerReveal: null
  };
  if (room.phase === "vote") {
    state.options = room.options.map(o => ({ id: o.id, text: o.text, authorId: o.authorId }));
  }
  if (room.phase === "results") {
    state.options = room.options.map(o => ({
      id: o.id, text: o.text, authorId: o.authorId,
      isCorrect: o.correct, voteCount: [...room.votes.values()].filter(v => v === o.id).length
    }));
    state.correctAnswer = room.question.a;
    state.votes = Object.fromEntries(room.votes);
    state.answerReveal = true;
  }
  return state;
};
function broadcast(room) {
  for (const p of room.players.values()) {
    io.to(p.id).emit("state", roomState(room, p.id));
  }
}
function sendError(socket, message) { socket.emit("gameError", message); }

io.on("connection", socket => {
  socket.on("createRoom", ({ name } = {}) => {
    name = cleanName(name);
    if (!name) return sendError(socket, "Enter your name first.");
    const code = makeCode();
    const player = { id: socket.id, name, score: 0, host: true };
    const room = {
      code, hostId: socket.id, players: new Map([[socket.id, player]]),
      phase: "lobby", round: 0, question: null, used: new Set(),
      submissions: new Map(), options: [], votes: new Map()
    };
    rooms.set(code, room);
    socket.join(code);
    socket.emit("joined", { code, playerId: socket.id });
    broadcast(room);
  });

  socket.on("joinRoom", ({ name, code } = {}) => {
    name = cleanName(name); code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!name) return sendError(socket, "Enter your name first.");
    if (!room) return sendError(socket, "Room not found. Check the code and try again.");
    if (room.phase !== "lobby" && room.phase !== "bluff") return sendError(socket, "This room is already in the middle of voting. Join next round.");
    if (room.players.size >= 12) return sendError(socket, "This room is full (12 players maximum).");
    if ([...room.players.values()].some(p => p.name.toLowerCase() === name.toLowerCase())) return sendError(socket, "That name is already in this room.");
    if (room.phase !== "lobby") return sendError(socket, "A round is already in progress. Please join the next round.");
    room.players.set(socket.id, { id: socket.id, name, score: 0, host: false });
    socket.join(code);
    socket.emit("joined", { code, playerId: socket.id });
    broadcast(room);
  });

  socket.on("startRound", ({ code } = {}) => {
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room || room.hostId !== socket.id) return sendError(socket, "Only the host can start a round.");
    if (room.players.size < 2) return sendError(socket, "At least 2 players are needed.");
    if (room.phase !== "lobby" && room.phase !== "results") return sendError(socket, "Finish the current round first.");
    let available = QUESTIONS.map((_, i) => i).filter(i => !room.used.has(i));
    if (!available.length) { room.used.clear(); available = QUESTIONS.map((_, i) => i); }
    const index = available[Math.floor(Math.random() * available.length)];
    room.used.add(index);
    room.question = QUESTIONS[index];
    room.round += 1; room.phase = "bluff";
    room.submissions = new Map(); room.options = []; room.votes = new Map();
    broadcast(room);
  });

  socket.on("submitBluff", ({ code, answer } = {}) => {
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room || room.phase !== "bluff" || !room.players.has(socket.id)) return;
    const text = String(answer || "").trim().slice(0, 120);
    if (text.length < 1) return sendError(socket, "Enter a bluff answer.");
    if (text.toLowerCase() === room.question.a.toLowerCase()) return sendError(socket, "That's the real answer! Try a bluff.");
    if (room.submissions.has(socket.id)) return sendError(socket, "You've already submitted an answer.");
    room.submissions.set(socket.id, text);
    if (room.submissions.size === room.players.size) {
      room.options = [
        { id: crypto.randomUUID(), text: room.question.a, authorId: null, correct: true },
        ...[...room.submissions.entries()].map(([authorId, text]) => ({ id: crypto.randomUUID(), text, authorId, correct: false }))
      ].sort(() => Math.random() - 0.5);
      room.phase = "vote";
    }
    broadcast(room);
  });

  socket.on("vote", ({ code, optionId } = {}) => {
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room || room.phase !== "vote" || !room.players.has(socket.id)) return;
    if (room.votes.has(socket.id)) return sendError(socket, "You've already voted.");
    const option = room.options.find(o => o.id === optionId);
    if (!option) return sendError(socket, "That answer is no longer available.");
    room.votes.set(socket.id, optionId);
    const voter = room.players.get(socket.id);
    if (option.correct) voter.score += 100;
    else if (option.authorId && option.authorId !== socket.id) {
      const author = room.players.get(option.authorId);
      if (author) author.score += 50;
    }
    if (room.votes.size === room.players.size) room.phase = "results";
    broadcast(room);
  });

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      if (!room.players.has(socket.id)) continue;
      room.players.delete(socket.id);
      room.submissions.delete(socket.id);
      room.votes.delete(socket.id);
      if (room.hostId === socket.id) {
        const next = room.players.values().next().value;
        room.hostId = next?.id || null;
        if (next) next.host = true;
      }
      if (room.players.size === 0) rooms.delete(room.code);
      else {
        // If someone leaves during bluffing, reveal once all remaining players have submitted.
        if (room.phase === "bluff" && room.submissions.size === room.players.size && room.players.size >= 2) {
          room.options = [
            { id: crypto.randomUUID(), text: room.question.a, authorId: null, correct: true },
            ...[...room.submissions.entries()].map(([authorId, text]) => ({ id: crypto.randomUUID(), text, authorId, correct: false }))
          ].sort(() => Math.random() - 0.5);
          room.phase = "vote";
        }
        if (room.phase === "vote" && room.votes.size === room.players.size && room.players.size >= 2) room.phase = "results";
        broadcast(room);
      }
      break;
    }
  });
});

server.listen(PORT, () => console.log(`Fact vs Bluff running on http://localhost:${PORT}`));