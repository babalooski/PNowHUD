// content.js

// Track stats for each player
const playerStats = {};
let currentHandPlayers = new Set();
let isPreflop = true;
let perHandFlags = {}; // { playerName: { vpip: false, pfr: false } }

// Helper: Get player name from a player element
function getPlayerName(playerEl) {
  return playerEl.querySelector('.table-player-name a')?.textContent.trim() || '';
}

// Display VPIP and PFR stats for each player
function updatePlayerStatsDisplay() {
  document.querySelectorAll('.table-player').forEach(playerEl => {
    const name = getPlayerName(playerEl);
    if (!playerStats[name] || playerStats[name].handsPlayed === 0) return;

    // Calculate percentages
    const vpipPct = ((playerStats[name].vpip / playerStats[name].handsPlayed) * 100).toFixed(1);
    const pfrPct = ((playerStats[name].pfr / playerStats[name].handsPlayed) * 100).toFixed(1);

    // Find or create the stat display element
    let statEl = playerEl.querySelector('.pokernow-hud-stats');
    if (!statEl) {
      statEl = document.createElement('div');
      statEl.className = 'pokernow-hud-stats';
      // Style it (customize as you like)
      statEl.style.fontSize = '12px';
      statEl.style.color = '#FFD700';
      statEl.style.background = 'rgba(0,0,0,0.6)';
      statEl.style.padding = '2px 4px';
      statEl.style.borderRadius = '4px';
      statEl.style.marginTop = '2px';
      playerEl.appendChild(statEl);
    }
    statEl.textContent = `VPIP: ${vpipPct}% | PFR: ${pfrPct}%`;
  });
}

// Helper: Detect new hand start
function detectNewHand() {
  // When a new hand starts, reset currentHandPlayers and increment hands played
  const playerElements = document.querySelectorAll('.table-player');
  currentHandPlayers = new Set();
  perHandFlags = {};
  isPreflop = true;
  playerElements.forEach(playerEl => {
    const name = getPlayerName(playerEl);
    if (!playerStats[name]) {
      playerStats[name] = { handsPlayed: 0, vpip: 0, pfr: 0 };
    }
    playerStats[name].handsPlayed++;
    currentHandPlayers.add(name);
    perHandFlags[name] = { vpip: false, pfr: false };
  });
  updatePlayerStatsDisplay();
}

// Helper: Detect when the flop is dealt (end of preflop)
function detectFlopDealt(node) {
  // Look for a message or DOM change indicating the flop is dealt
  // Example: chat message like "Flop: ..." or community cards update
  const text = node.textContent || '';
  if (/flop:/i.test(text)) {
    isPreflop = false;
  }
  // Or, if community cards are revealed
  if (node.classList && node.classList.contains('table-cards')) {
    const cardEls = node.querySelectorAll('.card-container');
    if (cardEls.length >= 3) {
      isPreflop = false;
    }
  }
}

// Helper: Parse player action from action log node
function parsePlayerAction(node) {
  if (!isPreflop) return;
  const text = node.textContent;
  if (!text) return;
  // Try to match "Name action ..."
  const match = text.match(/^(\w+)\s+(raises|calls|bets|folds|checks)/i);
  if (!match) return;
  const name = match[1];
  const action = match[2].toLowerCase();
  if (!playerStats[name] || !perHandFlags[name]) return;
  // Only count actions for players in the current hand
  if (!currentHandPlayers.has(name)) return;
  // VPIP: first call/raise/bet preflop
  if (["calls", "raises", "bets"].includes(action) && !perHandFlags[name].vpip) {
    playerStats[name].vpip++;
    perHandFlags[name].vpip = true;
    updatePlayerStatsDisplay();
  }
  // PFR: first raise preflop
  if (action === "raises" && !perHandFlags[name].pfr) {
    playerStats[name].pfr++;
    perHandFlags[name].pfr = true;
    updatePlayerStatsDisplay();
  }
}

// Set up MutationObserver on the main game container
window.addEventListener('load', () => {
  const mainContainer = document.getElementById('main-container');
  if (mainContainer) {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            // Detect new hand start (look for a new dealer button or similar event)
            if (node.querySelector && node.querySelector('.dealer-button-ctn')) {
              detectNewHand();
            }
            // Detect when the flop is dealt
            detectFlopDealt(node);
            // Detect player actions in action log/chat
            if (node.classList && node.classList.contains('chat-message')) {
              parsePlayerAction(node);
            }
            // Some sites use a log area, so check children too
            node.querySelectorAll && node.querySelectorAll('.chat-message').forEach(parsePlayerAction);
          }
        });
      });
    });
    observer.observe(mainContainer, { childList: true, subtree: true });
  }
});

// Helper: Get all player names from the table (update selector if needed)
function getPlayerNames() {
  return Array.from(document.querySelectorAll('.player-name')).map(el => el.textContent.trim());
}

// Helper: Parse player actions from DOM nodes
function parseAction(nodes) {
  nodes.forEach(node => {
    // Example: parse the text for player actions
    // let text = node.textContent;
    // TODO: Extract player name and action from text
    // Example: if (text.includes('raises')) { ... }
  });
} 