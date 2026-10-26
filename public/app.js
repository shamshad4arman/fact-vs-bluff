const socket = io();
const $ = id => document.getElementById(id);
let currentCode = null;
let currentPlayerId = null;
let currentState = null;
let toastTimer;

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 4200);
}
function copyCode() {
  if (!currentCode) return;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(currentCode).then(() => showToast("Room code copied!")).catch(() => showToast("Your room code is " + currentCode));
  } else {
    showToast("Share this room code: " + currentCode);
  }
}
$("copyCode").addEventListener("click", copyCode);
$("copyBigCode").addEventListener("click", copyCode);

$("createForm").addEventListener("submit", e => {
  e.preventDefault();
  socket.emit("createRoom", { name: $("createName").value });
});
$("joinForm").addEventListener("submit", e => {
  e.preventDefault();
  socket.emit("joinRoom", { name: $("joinName").value, code: $("roomCode").value });
});
$("roomCode").addEventListener("input", e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
$("startButton").addEventListener("click", () => socket.emit("startRound", { code: currentCode }));
$("nextButton").addEventListener("click", () => socket.emit("startRound", { code: currentCode }));
$("leaveButton").addEventListener("click", () => {
  location.reload(); // Disconnecting removes this player from the room.
});
$("bluffForm").addEventListener("submit", e => {
  e.preventDefault();
  socket.emit("submitBluff", { code: currentCode, answer: $("bluffInput").value });
});
socket.on("connect", () => {});
socket.on("joined", data => {
  currentCode = data.code;
  currentPlayerId = data.playerId;
  $("homeView").classList.add("hidden");
  $("gameView").classList.remove("hidden");
  $("roomCodeLabel").textContent = currentCode;
  $("bigRoomCode").textContent = currentCode;
});
socket.on("gameError", showToast);
socket.on("state", state => {
  currentState = state;
  render(state);
});

function setStage(name) {
  ["lobby", "bluff", "vote", "results"].forEach(n => $(n + "Panel").classList.toggle("hidden", n !== name));
}
function render(state) {
  $("roomCodeLabel").textContent = state.code;
  $("bigRoomCode").textContent = state.code;
  $("playerCountLabel").textContent = `${state.playerCount} in room`;
  $("roundLabel").textContent = state.round ? `Round ${state.round}` : "Ready to play";
  $("phasePill").textContent = state.phase.toUpperCase();
  $("playersList").innerHTML = "";
  [...state.players].sort((a,b) => b.score-a.score || a.name.localeCompare(b.name)).forEach((p, i) => {
    const row = document.createElement("div"); row.className = "player-row";
    const avatar = document.createElement("span"); avatar.className = "player-avatar"; avatar.textContent = p.name.slice(0,2).toUpperCase();
    const name = document.createElement("span"); name.className = "player-name"; name.textContent = p.name + (p.id === currentPlayerId ? " (you)" : "");
    row.append(avatar, name);
    if (p.id === state.hostId) { const host = document.createElement("span"); host.className = "host-tag"; host.textContent = "HOST"; row.append(host); }
    const score = document.createElement("strong"); score.className = "player-score"; score.textContent = p.score;
    row.append(score); $("playersList").append(row);
  });

  setStage(state.phase);
  $("startButton").disabled = !state.canStart;
  $("lobbyHint").textContent = state.playerCount < 2 ? "Waiting for another player to join…" : (state.canStart ? "Everyone's here. Let's play!" : "Waiting for the host to start the round.");
  $("startButton").textContent = state.round ? "Start round" : "Start first round";
  $("nextButton").classList.toggle("hidden", !state.canNext);
  $("resultsHint").textContent = state.canNext ? "Ready for another round?" : "Waiting for the host to start the next round.";

  if (state.phase === "bluff") {
    $("questionText").textContent = state.question;
    $("submissionCount").textContent = `${state.submittedCount} of ${state.playerCount} answers submitted`;
    $("submissionProgress").style.width = `${state.playerCount ? state.submittedCount/state.playerCount*100 : 0}%`;
    $("bluffForm").classList.toggle("hidden", state.hasSubmitted);
    $("submittedState").classList.toggle("hidden", !state.hasSubmitted);
    $("bluffInput").value = "";
  }
  if (state.phase === "vote") {
    $("voteQuestion").textContent = state.question;
    $("voteCount").textContent = `${state.playerCount ? state.votesCount || 0 : 0} votes submitted`;
    $("optionsList").innerHTML = "";
    state.options.forEach((option, i) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "answer-option";
      button.disabled = state.hasVoted;
      const letter = document.createElement("span"); letter.className = "option-letter"; letter.textContent = String.fromCharCode(65+i);
      const text = document.createElement("span"); text.textContent = option.text;
      button.append(letter, text);
      button.addEventListener("click", () => {
        [...$("optionsList").querySelectorAll("button")].forEach(b => b.classList.remove("selected"));
        button.classList.add("selected");
        socket.emit("vote", { code: currentCode, optionId: option.id });
      });
      $("optionsList").append(button);
    });
    $("votedState").classList.toggle("hidden", !state.hasVoted);
  }
  if (state.phase === "results") {
    $("correctAnswer").textContent = state.correctAnswer;
    $("resultsList").innerHTML = "";
    state.options.forEach((option, i) => {
      const item = document.createElement("div");
      item.className = "answer-option " + (option.isCorrect ? "correct" : "");
      const letter = document.createElement("span"); letter.className = "option-letter"; letter.textContent = String.fromCharCode(65+i);
      const text = document.createElement("span"); text.textContent = option.text;
      item.append(letter, text);
      if (option.isCorrect) { const tag = document.createElement("span"); tag.className = "option-tag"; tag.textContent = "✓ REAL FACT"; item.append(tag); }
      const votes = document.createElement("span"); votes.className = "result-votes"; votes.textContent = `${option.voteCount} vote${option.voteCount === 1 ? "" : "s"}`; item.append(votes);
      $("resultsList").append(item);
    });
  }
}
