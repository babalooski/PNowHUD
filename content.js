// content.js
// PokerNow HUD – VPIP & PFR
// Injects a HUD under each player name showing VPIP and PFR stats.
// DOM selectors and logic are documented inline.

// --- Data Structures ---
const playerStats = {}; // { playerName: { handsSeen, vpipCount, pfrCount } }
let currentHandPlayers = new Set();
let isPreflop = true;
let perHandFlags = {}; // { playerName: { vpip: false, pfr: false } }

// --- Utility Functions ---
function getPlayerNameEl(playerEl) {
  return playerEl.querySelector('.table-player-name');
}

function getPlayerName(playerEl) {
  return playerEl.querySelector('.table-player-name a')?.textContent.trim() || '';
}

// --- HUD Injection ---
function updatePlayerStatsDisplay() {
  document.querySelectorAll('.table-player').forEach(playerEl => {
    const name = getPlayerName(playerEl);
    if (!name || !playerStats[name] || playerStats[name].handsSeen === 0) return;
    const vpipPct = ((playerStats[name].vpipCount / playerStats[name].handsSeen) * 100).toFixed(1);
    const pfrPct = ((playerStats[name].pfrCount / playerStats[name].handsSeen) * 100).toFixed(1);
    const nameEl = getPlayerNameEl(playerEl);
    if (!nameEl) return;
    let hud = nameEl.querySelector('.pnc-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.className = 'pnc-hud';
      nameEl.appendChild(hud);
    }
    hud.textContent = `VPIP: ${vpipPct} | PFR: ${pfrPct}`;
  });
}

// --- Hand Tracking ---
function detectNewHand() {
  // Called at the start of each hand
  const playerElements = document.querySelectorAll('.table-player');
  currentHandPlayers = new Set();
  perHandFlags = {};
  isPreflop = true;
  playerElements.forEach(playerEl => {
    const name = getPlayerName(playerEl);
    if (!name) return;
    if (!playerStats[name]) {
      playerStats[name] = { handsSeen: 0, vpipCount: 0, pfrCount: 0 };
    }
    playerStats[name].handsSeen++;
    currentHandPlayers.add(name);
    perHandFlags[name] = { vpip: false, pfr: false };
  });
  updatePlayerStatsDisplay();
}

function detectFlopDealt(node) {
  // End preflop when flop is dealt (by chat message or community cards)
  const text = node.textContent || '';
  if (/flop:/i.test(text)) isPreflop = false;
  if (node.classList && node.classList.contains('table-cards')) {
    const cardEls = node.querySelectorAll('.card-container');
    if (cardEls.length >= 3) isPreflop = false;
  }
}

function parsePlayerAction(node) {
  if (!isPreflop) return;
  const text = node.textContent;
  if (!text) return;
  // Match "Name action ..." (e.g., "Alice raises to 100")
  const match = text.match(/^(\w+)\s+(raises|calls|bets|all-in|folds|checks)/i);
  if (!match) return;
  const name = match[1];
  const action = match[2].toLowerCase();
  if (!playerStats[name] || !perHandFlags[name]) return;
  if (!currentHandPlayers.has(name)) return;
  // VPIP: first call/raise/bet/all-in preflop
  if (["calls", "raises", "bets", "all-in"].includes(action) && !perHandFlags[name].vpip) {
    playerStats[name].vpipCount++;
    perHandFlags[name].vpip = true;
    updatePlayerStatsDisplay();
  }
  // PFR: first raise preflop
  if (action === "raises" && !perHandFlags[name].pfr) {
    playerStats[name].pfrCount++;
    perHandFlags[name].pfr = true;
    updatePlayerStatsDisplay();
  }
}

// --- MutationObserver Setup ---
function observeTable() {
  const mainContainer = document.getElementById('main-container');
  if (!mainContainer) return;
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        // New hand: look for new dealer button
        if (node.querySelector && node.querySelector('.dealer-button-ctn')) detectNewHand();
        // Flop dealt
        detectFlopDealt(node);
        // Player actions in chat/log
        if (node.classList && node.classList.contains('chat-message')) parsePlayerAction(node);
        node.querySelectorAll && node.querySelectorAll('.chat-message').forEach(parsePlayerAction);
      });
    });
  });
  observer.observe(mainContainer, { childList: true, subtree: true });
}

// --- Start Observing on Page Load ---
window.addEventListener('DOMContentLoaded', observeTable); 