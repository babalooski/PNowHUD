// PokerNow HUD Content Script
class PokerHUD {
  constructor() {
    this.players = new Map();
    this.currentHand = 0;
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
    const chatContainer = document.querySelector('.messages-container');
    if (!chatContainer) {
      setTimeout(() => this.observeGameChat(), 1000);
      return;
    }

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && node.classList.contains('message')) {
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
    const gameContainer = document.querySelector('.game-container');
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
    const messageText = messageNode.textContent.toLowerCase();
    
    // Detect hand start
    if (messageText.includes('hand #')) {
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
    if (messageText.includes('flop')) {
      this.gameState.preflop = false;
      this.gameState.postflop = true;
    }
    
    // Detect hand end
    if (messageText.includes('wins') || messageText.includes('collected')) {
      this.gameState.handInProgress = false;
      this.finalizeHandStats();
    }
  }

  parsePreFlopAction(messageText) {
    // Parse different actions
    const playerNameMatch = messageText.match(/(\w+)\s+(calls|raises|folds|checks)/);
    if (!playerNameMatch) return;

    const playerName = playerNameMatch[1];
    const action = playerNameMatch[2];

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
    
    // Track 3-bet (need more context for this)
    // This would require more sophisticated parsing
  }

  updatePlayerList() {
    // Get current players from the game UI
    const playerElements = document.querySelectorAll('.player-name');
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
            threeBetHands: 0,
            vpip: 0,
            pfr: 0,
            threeBet: 0
          });
        }
      }
    });
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
        player.threeBet = ((player.threeBetHands / player.handsPlayed) * 100).toFixed(1);
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
      this.players.forEach((stats, playerName) => {
        html += `
          <div class="player-stats">
            <span class="player-name">${playerName}</span>
            <span class="stats-line">
              VPIP|${stats.vpip}% PFR|${stats.pfr}% 3!|${stats.threeBet}% (${stats.handsPlayed} hands)
            </span>
          </div>
        `;
      });
    }
    
    statsContainer.innerHTML = html;
  }

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
    chrome.storage.local.get(['playerStats'], (result) => {
      if (result.playerStats) {
        Object.entries(result.playerStats).forEach(([playerName, stats]) => {
          this.players.set(playerName, stats);
        });
        this.updateHUD();
      }
    });
  }
}

// Initialize HUD when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new PokerHUD();
  });
} else {
  new PokerHUD();
}