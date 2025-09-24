// Background script for PokerNow HUD Extension

chrome.runtime.onInstalled.addListener(() => {
    console.log('PokerNow HUD Extension installed');
    
    // Initialize storage with default values
    chrome.storage.local.set({
      hudEnabled: true,
      hudPosition: { x: 20, y: 20 },
      playerStats: {},
      settings: {
        autoSave: true,
        showHandCount: true,
        colorCoding: true
      }
    });
  });
  
  // Handle extension icon click
  chrome.action.onClicked.addListener((tab) => {
    if (tab.url.includes('pokernow.club/games/')) {
      // Toggle HUD visibility
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: toggleHUD
      });
    } else {
      // Show notification if not on PokerNow
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon48.png',
        title: 'PokerNow HUD',
        message: 'Open a table at PokerNow (pokernow.club/games/...) to use the HUD'
      });
    }
  });
  
  // Function to be injected into content script
  function toggleHUD() {
    const hudElement = document.getElementById('poker-hud');
    if (hudElement) {
      const isVisible = hudElement.style.display !== 'none';
      hudElement.style.display = isVisible ? 'none' : 'block';
      
      // Save visibility state
      chrome.storage.local.set({ hudVisible: !isVisible });
    }
  }
  
  // Listen for messages from content script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'saveStats') {
      chrome.storage.local.set({ playerStats: request.data });
      sendResponse({ success: true });
    }
    
    if (request.action === 'loadStats') {
      chrome.storage.local.get(['playerStats'], (result) => {
        sendResponse({ stats: result.playerStats || {} });
      });
      return true; // Keep message channel open for async response
    }
    
    if (request.action === 'clearStats') {
      chrome.storage.local.set({ playerStats: {} });
      sendResponse({ success: true });
    }
  });
  
  // Clean up old data periodically
  chrome.alarms.create('cleanupStats', { delayInMinutes: 60, periodInMinutes: 60 });
  
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'cleanupStats') {
      chrome.storage.local.get(['playerStats'], (result) => {
        const stats = result.playerStats || {};
        const now = Date.now();
        const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000); // 7 days
        
        // Remove player stats older than a week with no recent activity
        Object.keys(stats).forEach(playerName => {
          const player = stats[playerName];
          if (player.lastSeen && player.lastSeen < oneWeekAgo) {
            delete stats[playerName];
          }
        });
        
        chrome.storage.local.set({ playerStats: stats });
      });
    }
  });
  
  // Handle tab updates to inject HUD when navigating to PokerNow
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('pokernow.club/games/')) {
      // Ensure content script is loaded
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      }).catch(() => {
        // Content script already loaded or failed to load
      });
    }
  });