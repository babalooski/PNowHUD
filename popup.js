// Popup script for PokerNow HUD Extension

document.addEventListener('DOMContentLoaded', function() {
    // Load saved settings
    loadSettings();
    
    // Check connection status
    checkConnectionStatus();
    
    // Load statistics summary
    loadStatsSummary();
    
    // Attach event listeners
    attachEventListeners();
    
    // Update session time
    updateSessionTime();
    setInterval(updateSessionTime, 60000); // Update every minute
});

function loadSettings() {
    chrome.storage.local.get(['hudEnabled', 'autoSave', 'showHandCount'], function(result) {
        document.getElementById('hudEnabled').checked = result.hudEnabled !== false;
        document.getElementById('autoSave').checked = result.autoSave !== false;
        document.getElementById('showHandCount').checked = result.showHandCount !== false;
    });
}

function attachEventListeners() {
    // Settings checkboxes
    document.getElementById('hudEnabled').addEventListener('change', function() {
        chrome.storage.local.set({ hudEnabled: this.checked });
        sendMessageToContentScript({ action: 'toggleHUD', enabled: this.checked });
    });
    
    document.getElementById('autoSave').addEventListener('change', function() {
        chrome.storage.local.set({ autoSave: this.checked });
    });
    
    document.getElementById('showHandCount').addEventListener('change', function() {
        chrome.storage.local.set({ showHandCount: this.checked });
        sendMessageToContentScript({ action: 'updateSettings', showHandCount: this.checked });
    });
    
    // Control buttons
    document.getElementById('toggleHUD').addEventListener('click', function() {
        sendMessageToContentScript({ action: 'toggleHUD' });
    });
    
    document.getElementById('resetPosition').addEventListener('click', function() {
        chrome.storage.local.set({ 
            hudPosition: { x: 20, y: 20 } 
        });
        sendMessageToContentScript({ action: 'resetPosition' });
        showNotification('HUD position reset to default');
    });
    
    document.getElementById('clearStats').addEventListener('click', function() {
        if (confirm('Are you sure you want to clear all statistics? This cannot be undone.')) {
            chrome.storage.local.set({ playerStats: {} });
            sendMessageToContentScript({ action: 'clearStats' });
            loadStatsSummary(); // Refresh the summary
            showNotification('All statistics cleared');
        }
    });
}

function checkConnectionStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const statusElement = document.getElementById('status');
        
        if (tabs[0] && tabs[0].url && tabs[0].url.includes('pokernow.club/games/')) {
            statusElement.textContent = 'Connected to a PokerNow table';
            statusElement.className = 'status connected';
        } else {
            statusElement.textContent = 'Not on a PokerNow table (pokernow.club/games/...)';
            statusElement.className = 'status disconnected';
        }
    });
}

function loadStatsSummary() {
    chrome.storage.local.get(['playerStats', 'sessionStart'], function(result) {
        const stats = result.playerStats || {};
        const playerCount = Object.keys(stats).length;
        
        let totalHands = 0;
        Object.values(stats).forEach(player => {
            totalHands = Math.max(totalHands, player.handsPlayed || 0);
        });
        
        document.getElementById('playersTracked').textContent = playerCount;
        document.getElementById('totalHands').textContent = totalHands;
    });
}

function updateSessionTime() {
    chrome.storage.local.get(['sessionStart'], function(result) {
        const sessionStart = result.sessionStart || Date.now();
        const now = Date.now();
        const minutes = Math.floor((now - sessionStart) / 60000);
        
        document.getElementById('sessionTime').textContent = minutes + 'm';
    });
}

function sendMessageToContentScript(message) {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs[0] && tabs[0].url && tabs[0].url.includes('pokernow.club/games/')) {
            chrome.tabs.sendMessage(tabs[0].id, message, function(response) {
                if (chrome.runtime.lastError) {
                    console.log('Error sending message:', chrome.runtime.lastError);
                }
            });
        }
    });
}

function showNotification(message) {
    // Create a temporary notification element
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: #2ecc71;
        color: white;
        padding: 10px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.3s;
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.opacity = '1';
    }, 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}