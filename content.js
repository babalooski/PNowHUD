// PokerNow HUD Content Script
class PokerHUD {
  constructor() {
    this.players = new Map();
    this.currentHand = 0;
    this.settings = {
      hudEnabled: true,
      showHandCount: true
    };
    this.gameId = null;
    this.lastTimestamp = null; // for incremental log polling
    this.inHandFlags = new Map(); // per-hand flags: { hasVPIP:boolean, hasPFR:boolean }
    this.gameState = {
      preflop: false,
      postflop: false,
      handInProgress: false
    };
    this.hudElement = null;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    
    this.init();
  }

  init() {
    this.createHUD();
    this.attachEventListeners();
    this.startMonitoring();
    this.loadStoredData();
    this.applySettings();
    this.detectGameId();
    this.startLogPolling();
  }

  createHUD() {
    // Create main HUD container
    this.hudElement = document.createElement('div');
    this.hudElement.id = 'poker-hud';
    this.hudElement.className = 'poker-hud-container';
    
    // Create header
    const header = document.createElement('div');
    header.className = 'poker-hud-header';
    header.innerHTML = `
      <span>Poker HUD</span>
      <button class="hud-minimize" id="minimize-hud">−</button>
      <button class="hud-close" id="close-hud">×</button>
    `;
    
    // Create stats container
    const statsContainer = document.createElement('div');
    statsContainer.className = 'poker-hud-stats';
    statsContainer.id = 'hud-stats';
    
    this.hudElement.appendChild(header);
    this.hudElement.appendChild(statsContainer);
    
    // Add to page
    document.body.appendChild(this.hudElement);
    
    // Load saved position
    this.loadHUDPosition();
  }

  attachEventListeners() {
    const header = this.hudElement.querySelector('.poker-hud-header');
    
    // Drag functionality
    header.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      this.isDragging = true;
      const rect = this.hudElement.getBoundingClientRect();
      this.dragOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      document.addEventListener('mousemove', this.handleDrag);
      document.addEventListener('mouseup', this.handleDragEnd);
    });

    // Control buttons
    document.getElementById('minimize-hud').addEventListener('click', () => {
      this.toggleMinimize();
    });

    document.getElementById('close-hud').addEventListener('click', () => {
      this.toggleVisibility();
    });
  }

  handleDrag = (e) => {
    if (!this.isDragging) return;
    
    const x = e.clientX - this.dragOffset.x;
    const y = e.clientY - this.dragOffset.y;
    
    this.hudElement.style.left = x + 'px';
    this.hudElement.style.top = y + 'px';
  }

  handleDragEnd = () => {
    this.isDragging = false;
    document.removeEventListener('mousemove', this.handleDrag);
    document.removeEventListener('mouseup', this.handleDragEnd);
    this.saveHUDPosition();
  }

  startMonitoring() {
    // Monitor chat for game actions
    this.observeGameChat();
    
    // Monitor player list changes
    this.observePlayerList();
    
    // Periodic updates
    setInterval(() => {
      this.updateHUD();
    }, 1000);
  }

  observeGameChat() {
    const chatContainer =
      document.querySelector('.messages-container') ||
      document.querySelector('.messages') ||
      document.querySelector('#messages') ||
      document.querySelector('#room-messages');
    if (!chatContainer) {
      setTimeout(() => this.observeGameChat(), 1000);
      return;
    }

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          // Accept common message item shapes (div.message, li, p)
          const isMessage = node.classList?.contains('message') || node.tagName === 'LI' || node.tagName === 'P' || node.tagName === 'DIV';
          if (isMessage) {
            this.parseGameMessage(node);
          }
        });
      });
    });

    observer.observe(chatContainer, {
      childList: true,
      subtree: true
    });
  }

  observePlayerList() {
    const gameContainer = document.querySelector('.game-container') || document.body;
    if (!gameContainer) {
      setTimeout(() => this.observePlayerList(), 1000);
      return;
    }

    const observer = new MutationObserver(() => {
      this.updatePlayerList();
    });

    observer.observe(gameContainer, {
      childList: true,
      subtree: true,
      attributes: true
    });
  }

  parseGameMessage(messageNode) {
    const rawText = (messageNode.textContent || '').trim();
    if (!rawText) return;
    const messageText = rawText;
    
    // Detect hand start
    if (/hand\s*#?\s*\d+/i.test(messageText) || /starting new hand/i.test(messageText)) {
      this.currentHand++;
      this.gameState.handInProgress = true;
      this.gameState.preflop = true;
      this.gameState.postflop = false;
      this.resetHandTracking();
    }
    
    // Detect preflop actions
    if (this.gameState.preflop) {
      this.parsePreFlopAction(messageText);
    }
    
    // Detect flop
    if (/\bflop\b/i.test(messageText)) {
      this.gameState.preflop = false;
      this.gameState.postflop = true;
    }
    
    // Detect hand end
    if (/wins\b/i.test(messageText) || /collected\b/i.test(messageText) || /hand\s+ended/i.test(messageText)) {
      this.gameState.handInProgress = false;
      this.finalizeHandStats();
    }
  }

  detectGameId() {
    try {
      // Prefer window.gameID when available
      // Fallback to URL path /games/<id>
      this.gameId = (window && window.gameID) || (location.pathname.match(/\/games\/([^/]+)/) || [])[1] || null;
    } catch (_) {
      this.gameId = null;
    }
  }

  startLogPolling() {
    if (!this.gameId) {
      setTimeout(() => this.startLogPolling(), 1000);
      return;
    }
    if (this._logPollTimer) return;
    const poll = async () => {
      try {
        const base = `/api/games/${this.gameId}/log_v3?hand_number=${Math.max(this.currentHand, 1)}`;
        const url = this.lastTimestamp ? `${base}&after_at=${encodeURIComponent(this.lastTimestamp)}` : base;
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const entries = Array.isArray(json?.data) ? json.data : [];
        for (const entry of entries) {
          if (entry?.createdAt) this.lastTimestamp = entry.createdAt;
          const line = entry?.msg || '';
          this.processLogLine(line);
        }
      } catch (err) {
        // Swallow errors to keep polling; could add backoff
        // console.error('log_v3 polling failed', err);
      } finally {
        this._logPollTimer = setTimeout(poll, 3000);
      }
    };
    poll();
  }

  processLogLine(line) {
    if (!line) return;
    // Hand boundaries
    if (/(^[-–—]+\s*)?starting hand/i.test(line)) {
      this.onHandStart();
      return;
    }
    if (/(^[-–—]+\s*)?ending hand/i.test(line)) {
      this.onHandEnd();
      return;
    }

    // Stop VPIP/PFR tracking after flop is dealt
    if (/^(flop:|turn:|river:)/i.test(line)) {
      this.gameState.preflop = false;
      this.gameState.postflop = true;
      return;
    }

    // Only parse preflop actions
    if (!this.gameState.preflop) return;

    // Extract "Name" @ playerId
    const idMatch = line.match(/"([^"]+)"\s*@\s*([^\s]+)/);
    if (!idMatch) return;
    const displayName = idMatch[1];
    const playerId = idMatch[2];

    // Ensure player entry (key by persistent id, store display name)
    if (!this.players.has(playerId)) {
      this.players.set(playerId, {
        name: displayName,
        handsPlayed: 0,
        vpipHands: 0,
        pfrHands: 0,
        vpip: 0,
        pfr: 0
      });
    }

    // Per-hand flags
    if (!this.inHandFlags.has(playerId)) {
      this.inHandFlags.set(playerId, { hasVPIP: false, hasPFR: false });
    }
    const flags = this.inHandFlags.get(playerId);

    // Classification regexes (from PokerNow client logic)
    const RAISE_RE = /(raises to|bets|big blind of|small blind of) [0-9.]+/i;
    const CALL_RE  = / calls [0-9.]+/i;
    const FOLD_RE  = /folds$/i;
    const CHECK_RE = / checks$/i;

    if (RAISE_RE.test(line)) {
      flags.hasVPIP = true;
      flags.hasPFR = true;
    } else if (CALL_RE.test(line)) {
      flags.hasVPIP = true;
    } else if (FOLD_RE.test(line) || CHECK_RE.test(line)) {
      // no-op for VPIP/PFR
    }
  }

  onHandStart() {
    this.currentHand = this.currentHand + 1;
    this.gameState.handInProgress = true;
    this.gameState.preflop = true;
    this.gameState.postflop = false;
    // Reset per-hand flags
    this.inHandFlags.clear();
  }

  onHandEnd() {
    // For each player that appeared in this hand, increment handsPlayed
    this.inHandFlags.forEach((_, playerId) => {
      const player = this.players.get(playerId);
      if (player) player.handsPlayed++;
    });

    // Commit per-hand flags to totals
    this.inHandFlags.forEach((flags, playerId) => {
      const player = this.players.get(playerId);
      if (!player) return;
      if (flags.hasVPIP) player.vpipHands++;
      if (flags.hasPFR) player.pfrHands++;
    });

    // Recompute percentages
    this.players.forEach(player => {
      if (player.handsPlayed > 0) {
        player.vpip = ((player.vpipHands / player.handsPlayed) * 100).toFixed(1);
        player.pfr = ((player.pfrHands / player.handsPlayed) * 100).toFixed(1);
      }
    });

    this.gameState.handInProgress = false;
    this.gameState.preflop = false;
    this.gameState.postflop = false;

    this.savePlayerStats();
    this.updateHUD();
  }

  parsePreFlopAction(messageText) {
    // Parse actions like: "Alice raises to ...", "Bob calls", "Charlie folds", "Dana checks"
    const match = messageText.match(/^(.+?)\s+(calls|raises|folds|checks)\b/i);
    if (!match) return;

    const playerName = match[1].trim();
    const action = match[2].toLowerCase();

    if (!this.players.has(playerName)) {
      this.players.set(playerName, {
        handsPlayed: 0,
        vpipHands: 0,
        pfrHands: 0,
        threeBetHands: 0,
        vpip: 0,
        pfr: 0,
        threeBet: 0
      });
    }

    const player = this.players.get(playerName);
    
    // Track VPIP (any voluntary money put in pot preflop)
    if (action === 'calls' || action === 'raises') {
      player.vpipHands++;
    }
    
    // Track PFR (preflop raise)
    if (action === 'raises') {
      player.pfrHands++;
    }
    
    // We are not tracking 3-bet in the rudimentary version
  }

  updatePlayerList() {
    // Get current players from the game UI
    const playerElements = document.querySelectorAll('.table-player-name, .player-name');
    const currentPlayers = new Set();
    
    playerElements.forEach(element => {
      const playerName = element.textContent.trim();
      if (playerName) {
        currentPlayers.add(playerName);
        
        if (!this.players.has(playerName)) {
          this.players.set(playerName, {
            handsPlayed: 0,
            vpipHands: 0,
            pfrHands: 0,
            vpip: 0,
            pfr: 0,
          });
        }
      }
    });

    // Inline badges removed; central HUD only
  }

  resetHandTracking() {
    // Reset hand-specific tracking
    this.players.forEach(player => {
      player.handsPlayed++;
    });
  }

  finalizeHandStats() {
    // Calculate percentages
    this.players.forEach(player => {
      if (player.handsPlayed > 0) {
        player.vpip = ((player.vpipHands / player.handsPlayed) * 100).toFixed(1);
        player.pfr = ((player.pfrHands / player.handsPlayed) * 100).toFixed(1);
      }
    });
    
    this.savePlayerStats();
  }

  updateHUD() {
    const statsContainer = document.getElementById('hud-stats');
    if (!statsContainer) return;

    let html = '';
    
    if (this.players.size === 0) {
      html = '<div class="no-data">No player data yet. Play some hands!</div>';
    } else {
      this.players.forEach((stats, playerId) => {
        html += `
          <div class="player-stats">
            <span class="player-name">${stats.name || playerId}</span>
            <span class="stats-line">
              VPIP ${stats.vpip || 0}%  |  PFR ${stats.pfr || 0}%${this.settings.showHandCount ? `  |  ${stats.handsPlayed || 0} hands` : ''}
            </span>
          </div>
        `;
      });
    }
    
    statsContainer.innerHTML = html;
  }

  // Inline HUD badges removed

  toggleMinimize() {
    const statsContainer = document.getElementById('hud-stats');
    if (statsContainer.style.display === 'none') {
      statsContainer.style.display = 'block';
    } else {
      statsContainer.style.display = 'none';
    }
  }

  toggleVisibility() {
    this.hudElement.style.display = this.hudElement.style.display === 'none' ? 'block' : 'none';
  }

  saveHUDPosition() {
    const rect = this.hudElement.getBoundingClientRect();
    chrome.storage.local.set({
      hudPosition: {
        x: rect.left,
        y: rect.top
      }
    });
  }

  loadHUDPosition() {
    chrome.storage.local.get(['hudPosition'], (result) => {
      if (result.hudPosition) {
        this.hudElement.style.left = result.hudPosition.x + 'px';
        this.hudElement.style.top = result.hudPosition.y + 'px';
      } else {
        // Default position
        this.hudElement.style.left = '20px';
        this.hudElement.style.top = '20px';
      }
    });
  }

  savePlayerStats() {
    const statsData = {};
    this.players.forEach((stats, playerName) => {
      statsData[playerName] = stats;
    });
    
    chrome.storage.local.set({ playerStats: statsData });
  }

  loadStoredData() {
    chrome.storage.local.get(['playerStats', 'hudPosition', 'hudEnabled', 'showHandCount'], (result) => {
      if (result.playerStats) {
        Object.entries(result.playerStats).forEach(([playerName, stats]) => {
          this.players.set(playerName, stats);
        });
        this.updateHUD();
      }
      if (typeof result.hudEnabled === 'boolean') {
        this.settings.hudEnabled = result.hudEnabled;
      }
      if (typeof result.showHandCount === 'boolean') {
        this.settings.showHandCount = result.showHandCount;
      }
      this.applySettings();
    });
  }

  applySettings() {
    if (!this.hudElement) return;
    this.hudElement.style.display = this.settings.hudEnabled ? 'block' : 'none';
  }
}

// Initialize HUD when page loads and expose a singleton for messaging handlers
let __pokerHudInstance = null;
function initPokerHud() {
  if (!__pokerHudInstance) {
    __pokerHudInstance = new PokerHUD();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initPokerHud();
  });
} else {
  initPokerHud();
}

// Handle messages from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const hud = __pokerHudInstance;
  if (!hud) return;

  if (message.action === 'toggleHUD') {
    if (typeof message.enabled === 'boolean') {
      hud.settings.hudEnabled = message.enabled;
      chrome.storage.local.set({ hudEnabled: message.enabled });
    } else {
      hud.settings.hudEnabled = !hud.settings.hudEnabled;
      chrome.storage.local.set({ hudEnabled: hud.settings.hudEnabled });
    }
    hud.applySettings();
    sendResponse && sendResponse({ ok: true, hudEnabled: hud.settings.hudEnabled });
    return;
  }

  if (message.action === 'updateSettings') {
    if (typeof message.showHandCount === 'boolean') {
      hud.settings.showHandCount = message.showHandCount;
      chrome.storage.local.set({ showHandCount: message.showHandCount });
      hud.updateHUD();
    }
    sendResponse && sendResponse({ ok: true });
    return;
  }

  if (message.action === 'resetPosition') {
    hud.hudElement.style.left = '20px';
    hud.hudElement.style.top = '20px';
    hud.saveHUDPosition();
    sendResponse && sendResponse({ ok: true });
    return;
  }

  if (message.action === 'clearStats') {
    hud.players.clear();
    chrome.storage.local.set({ playerStats: {} });
    hud.updateHUD();
    sendResponse && sendResponse({ ok: true });
    return;
  }
});