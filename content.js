/*
 * PokernowHUD - Modernized Version 1.1
 * Modernized 2024 - Fixed scraper integration and stat lookup issues
 */

// Modern ES6+ Classes with proper error handling and async/await

function normalizePlayerName(rawName = '') {
    return String(rawName)
        .replace(/[★⭐♛👑]/g, '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replaceAll(' ', '__')
        .replaceAll('(', '--')
        .replaceAll(')', '--');
}

function extractQuotedPlayerName(line = '') {
    const match = String(line).match(/"([^"]+)"/);
    return match ? normalizePlayerName(match[1]) : '';
}

class Player {
    constructor(username, x, y, height, fontSize, seat, userID = null) {
        this.username = username;
        this.x = x;
        this.y = y;
        this.seat = seat;
        this.height = height;
        this.fontSize = fontSize;
        this.userID = userID;
        this.isAway = false;
    }

    // Static method to create player from DOM element
    static fromDOMElement(playerElement, seatIndex) {
        try {
            const nameContainer = playerElement.querySelector('.table-player-name');
            if (!nameContainer) return null;

            // Premium tables render badges before the name, so read the anchor text first.
            const nameLink = nameContainer.querySelector('a');
            let rawUsername = nameLink?.textContent || nameLink?.innerText || '';

            if (!rawUsername || !rawUsername.trim()) {
                const nameClone = nameContainer.cloneNode(true);
                nameClone.querySelectorAll('svg, img, [class*="premium"], [class*="badge"], .player-badges').forEach((node) => node.remove());
                rawUsername = nameClone.textContent || nameClone.innerText || '';
            }

            const cleanUsername = normalizePlayerName(rawUsername);
            if (!cleanUsername) return null;


            const styles = window.getComputedStyle(playerElement);
            const x = styles.getPropertyValue('left');
            const y = styles.getPropertyValue('top');
            const height = styles.getPropertyValue('height');
            const fontSource = nameLink || nameContainer;
            const fontSize = window.getComputedStyle(fontSource).getPropertyValue('font-size');
            
            const isAway = playerElement.querySelector('.standing-up') !== null || 
                          playerElement.querySelector('.waiting-next-hand') !== null;
            
            const userID = playerElement.querySelector('a')?.getAttribute('href')
                ?.split('/players/')[1]?.split('">')[0];

            return new Player(cleanUsername, x, y, height, fontSize, seatIndex, userID);
        } catch (error) {
            console.error('Error creating player from DOM element:', error);
            return null;
        }
    }
}

class Settings {
    constructor() {
        this.statsToShow = [];
        this.recordBox = true;
        this.showingHUD = true;
        this.panelOffset = [0, 0];
        this.initialized = false;
    }

    async initialize() {
        try {
            const result = await this.getStorageData(['settings']);
            if (result.settings) {
                this.statsToShow = result.settings.panelSettings || [];
                this.recordBox = result.settings.recordBox ?? true;
                this.showingHUD = result.settings.showingHUD ?? true;
                this.panelOffset = result.settings.panelOffset || [0, 0];
            }
            this.initialized = true;
        } catch (error) {
            console.error('Error initializing settings:', error);
            this.initialized = true; // Continue with defaults
        }
    }

    async getStorageData(keys) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(result);
                }
            });
        });
    }

    async setStorageData(data) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set(data, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
    }

    async checkIfRecordingHands() {
        if (!this.initialized) await this.initialize();
        return this.recordBox;
    }

    async checkIfShowingHUD() {
        if (!this.initialized) await this.initialize();
        return this.showingHUD;
    }

    async getPanelOffset() {
        if (!this.initialized) await this.initialize();
        return this.panelOffset;
    }

    async updateSettings(newSettings) {
        try {
            await this.setStorageData({ settings: newSettings });
            Object.assign(this, newSettings);
        } catch (error) {
            console.error('Error updating settings:', error);
        }
    }
}

class Panel {
    constructor(player, aggregator, playerNumber, settings) {
        this.settings = settings;
        this.aggregator = aggregator;
        this.playerNumber = playerNumber;
        this.player = player;
        this.div = null;
        this.initialize();
    }

    initialize() {
        try {
            const scaleFactor = this.getScaleFactor();
            this.div = document.createElement('div');
            this.div = this.addCoordinates(this.player, this.div);
            this.div = this.addPadding(this.div, scaleFactor);
            this.div = this.addText(this.player, this.div);
            
            const ID = `${this.player.username}Stats`;
            this.div.id = ID;
            this.div.style.background = 'rgba(35, 84, 92, 0.6)';
            this.div.style.borderRadius = '5px';
            this.div.style.padding = '5px';
            this.div.style.color = 'white';
            this.div.style.fontSize = this.player.fontSize;
            this.div.style.position = 'absolute';
            this.div.style.zIndex = '99';
        } catch (error) {
            console.error('Error initializing panel:', error);
        }
    }

    addFontSize(div, player) {
        div.style.fontSize = player.fontSize;
        return div;
    }

    addStatText(player, div) {
        try {
            const stats = this.aggregator.stats;
            const lines = this.settings.statsToShow;
            const tableSize = this.aggregator.handed(this.playerNumber);
            const username = player.username;
            let string = '';


            for (let k = 0; k < lines.length - 1; k++) {
                if (lines[k].length !== 0 && k !== 0) {
                    string += '\n';
                }
                
                for (let i = 0; i < lines[k].length; i++) {
                    const statName = lines[k][i].slice(1);
                    const labelStatus = lines[k][i].slice(0, 1);
                    const dataDict = stats[statName];
                    const statText = this.aggregator.getStat(statName, dataDict, tableSize, username);
                    
                    if (labelStatus === 'l') {
                        string += `${statName}: ${statText}/`;
                    } else if (labelStatus === 'n') {
                        string += ` ${statText} /`;
                    }
                }
            }
            
            // If no stats, show a message
            if (string.trim() === '') {
                string = 'No stats available';
            }
            
            div.innerText = string;
            div.style.color = 'white';
            return div;
        } catch (error) {
            console.error('Error adding stat text:', error);
            div.innerText = 'Error loading stats';
            return div;
        }
    }

    addText(player, div) {
        div = this.addFontSize(div, player);
        div = this.addStatText(player, div);
        return div;
    }

    addPadding(div, scaleFactor) {
        const [top, right, bottom, left] = [2, 5, 2, 5];
        const scaledTop = top * scaleFactor[1];
        const scaledRight = right * scaleFactor[0];
        const scaledBottom = bottom * scaleFactor[1];
        const scaledLeft = left * scaleFactor[0];
        
        div.style.padding = '2px 5px 2px 5px';
        return div;
    }

    getScaleFactor() {
        return [1, 1];
    }

    getXOffset() {
        return this.settings.panelOffset[0];
    }

    getYOffset() {
        return -this.settings.panelOffset[1];
    }

    addCoordinates(player, div) {
        try {
            const x = parseFloat(player.x.replace('px', ''));
            const y = parseFloat(player.y.replace('px', ''));
            const yShift = 0.80 * parseFloat(player.height.replace('px', ''));
            const finalY = y + yShift + this.getYOffset();
            const finalX = x + this.getXOffset();

            div.style.position = 'absolute';
            div.style.top = `${finalY}px`;
            div.style.left = `${finalX}px`;
            div.style.zIndex = '99';

            return div;
        } catch (error) {
            console.error('Error adding coordinates:', error);
            return div;
        }
    }
}

class HUD {
    constructor(aggregator, settings, builder, scraper) {
        this.settings = settings;
        this.aggregator = aggregator;
        this.playerNumber = 0;
        this.builder = builder;
        this.scraper = scraper;
        this.tableDiv = document.body;
        this.players = [];
        this.initialized = false;
        this.logPollIntervalId = null;
    }

    async waitForGameToLoad() {
        try {
            await this.waitForPlayersToLoad();
            this.builder.getYou();
            this.tableDiv = this.getTableDiv();
            this.createHUDdiv();
            this.initializePotObserver();
            this.startLogPolling();
            
            if (this.scraper) {
                this.scraper.getFullLog();
            }
            
            // Initialize stats first
            await getStats(this.aggregator);
            
            // Start the HUD loop
            this.HUDloop(0);
        } catch (error) {
            console.error('Error waiting for game to load:', error);
        }
    }

    async waitForPlayersToLoad() {
        return new Promise((resolve) => {
            const checkPlayers = () => {
                const userDiv = document.querySelector('.table-player-name');
                if (userDiv) {
                    resolve(true);
                } else {
                    setTimeout(checkPlayers, 500);
                }
            };
            checkPlayers();
        });
    }

    initializePotObserver() {
        try {
            const targetNode = document.querySelector('.dealer-button-ctn');
            if (!targetNode) {
                return;
            }

            const config = { attributes: true, childList: true, subtree: true };
            const callback = (mutationsList) => {
                if (this.scraper && typeof this.scraper.getLog === 'function') {
                    this.scraper.getLog();
                }
            };

            const observer = new MutationObserver(callback);
            observer.observe(targetNode, config);
        } catch (error) {
            console.error('Error initializing pot observer:', error);
        }
    }

    startLogPolling() {
        if (this.logPollIntervalId !== null) {
            return;
        }
        this.logPollIntervalId = setInterval(() => {
            if (this.scraper && typeof this.scraper.getLog === 'function') {
                this.scraper.getLog();
            }
        }, 2500);
    }

    initializeHUD() {
        try {
            this.n_seats = 10;
            this.builder.setSeatNumber(this.n_seats);
            this.players = this.retrievePlayerData(this.n_seats);
            this.display(this.players, this.settings);
        } catch (error) {
            console.error('Error initializing HUD:', error);
        }
    }

    getTableDiv() {
        return document.querySelector('.table') || document.body;
    }

    createHUDdiv() {
        const tableDiv = this.tableDiv;
        const div = document.createElement('div');
        div.id = 'HUD';
        div.style.position = 'absolute';
        div.style.top = '0px';
        div.style.left = '0px';
        div.style.width = '100%';
        div.style.height = '100%';
        div.style.pointerEvents = 'none';
        tableDiv.appendChild(div);
    }

    HUDloop(iteration) {
        setTimeout(async () => {
            try {
                const showingHUD = await this.settings.checkIfShowingHUD();
                if (showingHUD) {
                    // Update stats from storage first
                    const statsLoaded = await getStats(this.aggregator);
                    if (!statsLoaded) {
                        this.HUDloop(iteration + 1);
                        return;
                    }
                    this.initializeHUD();
                } else {
                    this.clearDisplay();
                }
                this.HUDloop(iteration + 1);
            } catch (error) {
                if (recoverFromInvalidExtensionContext(error)) {
                    return;
                }
                console.error('Error in HUD loop:', error);
                this.HUDloop(iteration + 1);
            }
        }, 500);
    }

    clearDisplay() {
        const HUDdiv = document.getElementById('HUD');
        if (HUDdiv) {
            HUDdiv.innerText = '';
        }
    }

    display(players, settings) {
        try {
            const HUDdiv = document.getElementById('HUD');
            if (!HUDdiv) {
                console.error('HUD div not found!');
                return;
            }

            HUDdiv.innerText = '';
            this.playerNumber = 0;

            for (const player of players) {
                if (player.username !== null) {
                    this.playerNumber++;
                }
            }

            for (const player of players) {
                if (player.username !== null) {
                    this.createDisplay(player, settings);
                }
            }
        } catch (error) {
            console.error('Error displaying HUD:', error);
        }
    }

    createDisplay(player, settings) {
        try {
            const panel = new Panel(player, this.aggregator, this.playerNumber, settings);
            const HUDdiv = document.getElementById('HUD');
            if (HUDdiv && panel.div) {
                HUDdiv.appendChild(panel.div);
            }
        } catch (error) {
            console.error('Error creating display:', error);
        }
    }

    retrievePlayerData(n_seats) {
        try {
            const players = [];
            const playerDivs = document.querySelectorAll('.table-player');
            
            for (const playerDiv of playerDivs) {
                if (!playerDiv.classList.contains('table-player-seat')) {
                    const player = Player.fromDOMElement(playerDiv, players.length);
                    if (player) {
                        players.push(player);
                    }
                }
            }

            return players;
        } catch (error) {
            console.error('Error retrieving player data:', error);
            return [];
        }
    }
}

class HandBuilder {
    constructor(aggregator, settings) {
        this.aggregator = aggregator;
        this.currentHand = [''];
        this.currentHandForLogging = [''];
        this.dealtLine = '';
        this.handNumber = 0;
        this.hands = [];
        this.recordingHands = false;
        this.stackLines = [];
        this.seatNumber = 10;
        this.settings = settings;
        this.you = null;
    }

    getYou() {
        // Gets user's username - may need updating if site structure changes
        return 'None';
    }

    async addHand(jsonLog) {
        try {
            this.currentHand = [''];
            this.currentHandForLogging = [''];
            this.dealtLine = '';
            this.stackLines = [];
            
            const lastHandOriginal = this.extractLastHand(jsonLog);
            if (lastHandOriginal.length === 0) {
                return;
            }
            
            const lastHand = this.convertToDonkhouseFormat(lastHandOriginal);
            let previousLastLine = '';
            
            for (const lastLine of lastHand) {
                if (lastLine !== previousLastLine) {
                    let processedLine = lastLine;
                    
                    if (processedLine.includes('timed out')) {
                        processedLine = processedLine.replace('timed out and ', '');
                    }
                    
                    if (processedLine.includes('were dealt')) {
                        this.dealtLine = processedLine;
                    }
                    
                    if (processedLine.includes('(') && !processedLine.includes('showed')) {
                        this.stackLines.push(processedLine);
                    }
                    
                    if (!processedLine.includes('came through') && 
                        !processedLine.includes('added on') && 
                        !processedLine.includes('were dealt') && 
                        !processedLine.includes('stood up') && 
                        !(processedLine.includes('(') && !processedLine.includes('showed'))) {
                        
                        if (!processedLine.includes('revealed')) {
                            this.currentHand.push(processedLine);
                        }
                        this.currentHandForLogging.push(processedLine);
                    }
                    
                    previousLastLine = lastLine;
                }
            }
            
            this.currentHand[0] = `${this.stackLines.length} players are in the hand`;
            this.currentHandForLogging[0] = `${this.stackLines.length} players are in the hand`;
            
            this.createHand(this.currentHand, this.dealtLine);
            
            if (this.recordingHands) {
                await this.updateHands();
            } else {
                this.cleanup();
            }
            
            this.currentHand = [''];
        } catch (error) {
            console.error('Error adding hand:', error);
        }
    }

    position(stackLines, playerIndex) {
        const positionNames = {
            2: ['BB', 'SB'],
            3: ['SB', 'BB', 'BU'],
            4: ['SB', 'BB', 'CO', 'BU'],
            5: ['SB', 'BB', 'UTG', 'CO', 'BU'],
            6: ['SB', 'BB', 'UTG', 'MP', 'CO', 'BU'],
            7: ['SB', 'BB', 'UTG', 'MP1', 'MP2', 'CO', 'BU'],
            8: ['SB', 'BB', 'UTG', 'MP1', 'MP2', 'MP3', 'CO', 'BU'],
            9: ['SB', 'BB', 'UTG', 'UTG+1', 'MP1', 'MP2', 'MP3', 'CO', 'BU'],
            10: ['SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'MP1', 'MP2', 'MP3', 'CO', 'BU']
        };
        
        return positionNames[stackLines.length][playerIndex];
    }

    removeNameSpecialCharacters(line) {
        if (!line || typeof line !== 'string') {
            return line;
        }

        return line.replace(/"([^"]+)"/g, (_, playerName) => `"${normalizePlayerName(playerName)}"`);
    }

    convertToDonkhouseFormat(handLines) {
        const translatedHandLines = [];
        let dealer = '';
        
        for (const line of handLines) {
            // console.log('Line:', line);
            let processedLine = this.removeNameSpecialCharacters(line);
            console.log('Processed line:', processedLine);
            let player = extractQuotedPlayerName(processedLine);
            
            if (processedLine.includes('starting hand')) {
                if (processedLine.includes('dead button')) {
                    dealer = 'dead button';
                } else {
                    const dealerMatch = processedLine.match(/dealer:\s*"([^"]+)"/);
                    dealer = dealerMatch ? normalizePlayerName(dealerMatch[1]) : '';
                }
            }
            
            if (processedLine.includes('Your hand is')) {
                const hand = processedLine.replace('Your hand is ', '').replace(',', '');
                translatedHandLines.push(`you were dealt ${hand}`);
            }
            
            if (processedLine.includes('Player stacks: ')) {
                const stackLines = processedLine.replace('Player stacks: ', '').split(' | ');
                const translatedStackLines = [];
                
                for (const stackLine of stackLines) {
                    const processedStackLine = this.removeNameSpecialCharacters(stackLine);
                    player = extractQuotedPlayerName(processedStackLine);
                    const stackMatch = processedStackLine.match(/\(([^)]+)\)/);
                    const stack = stackMatch ? stackMatch[1] : '';
                    translatedStackLines.push(`${player} (${stack}, [position])`);
                }
                
                if (dealer && dealer !== 'dead button') {
                    let rotateGuard = translatedStackLines.length;
                    while (rotateGuard > 0 && translatedStackLines[translatedStackLines.length - 1].split(' ')[0] !== dealer) {
                        const firstElement = translatedStackLines[0];
                        translatedStackLines.shift();
                        translatedStackLines.push(firstElement);
                        rotateGuard -= 1;
                    }
                }
                
                for (let j = 0; j < translatedStackLines.length; j++) {
                    const position = this.position(translatedStackLines, j);
                    translatedHandLines.push(translatedStackLines[j].replace('[position]', position));
                }
            }
            
            if (processedLine.includes('posts a small blind of') || processedLine.includes('posts a big blind of')) {
                const blindSize = processedLine.split('blind of ')[1].split(' ')[0];
                translatedHandLines.push(`${player} posted ${blindSize}`);
            }
            
            if (processedLine.includes('raises to')) {
                const raiseSize = processedLine.split('raises to ')[1];
                translatedHandLines.push(`${player} raised to ${raiseSize}`);
            }
            
            if (processedLine.includes('" folds')) {
                translatedHandLines.push(`${player} folded`);
            }
            
            if (processedLine.includes('Flop: ') || processedLine.includes('Turn: ') || processedLine.includes('River: ')) {
                const strippedBoard = processedLine
                    .replace('Flop:  ', '')
                    .replace('Turn: ', '')
                    .replace('River: ', '')
                    .replace('[', '')
                    .replace(']', '')
                    .replaceAll(',', '')
                    .replace('Flop: ', '');
                translatedHandLines.push(`board: ${strippedBoard}`);
            }
            
            if (processedLine.includes(' calls ')) {
                const callSize = processedLine.split(' calls ')[1];
                translatedHandLines.push(`${player} called ${callSize}`);
            }
            
            if (processedLine.includes(' bets ')) {
                const betSize = processedLine.split(' bets ')[1];
                translatedHandLines.push(`${player} bet ${betSize}`);
            }
            
            if (processedLine.includes(' shows a ')) {
                const hand = processedLine.split(' shows a ')[1].replace(',', '').replace('.', '');
                translatedHandLines.push(`${player} showed ${hand}`);
            }
            
            if (processedLine.includes(' collected ')) {
                const wonAmount = processedLine.split(' collected ')[1].split(' ')[0];
                translatedHandLines.push(`${player} won ${wonAmount} chips`);
            }
            
            if (processedLine.includes(' checks')) {
                translatedHandLines.push(`${player} checked`);
            }
        }
        
        return translatedHandLines;
    }

    extractLastHand(jsonLog) {
        if (!jsonLog || !Array.isArray(jsonLog.logs) || jsonLog.logs.length === 0) {
            return [];
        }

        const logs = [...jsonLog.logs].sort((a, b) => {
            const aTime = Number(a?.created_at) || 0;
            const bTime = Number(b?.created_at) || 0;
            return aTime - bTime;
        });

        let handEnd = -1;
        let targetHandNumber = null;

        for (let i = logs.length - 1; i >= 0; i--) {
            const line = logs[i]?.msg || '';
            if (line.includes('ending hand #')) {
                handEnd = i;
                const parsedHandNumber = parseInt(line.split('#')[1], 10);
                targetHandNumber = Number.isNaN(parsedHandNumber) ? null : parsedHandNumber;
                break;
            }
        }

        if (handEnd === -1) {
            return [];
        }

        let handStart = -1;
        for (let i = handEnd; i >= 0; i--) {
            const line = logs[i]?.msg || '';
            if (!line.includes('starting hand #')) {
                continue;
            }

            if (targetHandNumber !== null) {
                const parsedHandNumber = parseInt(line.split('#')[1], 10);
                if (!Number.isNaN(parsedHandNumber) && parsedHandNumber === targetHandNumber) {
                    handStart = i;
                    break;
                }
            } else {
                handStart = i;
                break;
            }
        }

        if (handStart === -1 || handStart > handEnd) {
            return [];
        }

        return logs.slice(handStart, handEnd + 1).map((entry) => entry.msg);
    }

    cleanup() {
        this.currentHandForLogging = [''];
        this.dealtLine = '';
        this.stackLines = [];
    }

    async updateHands() {
        try {
            const result = await this.getStorageData(['hands']);
            this.hands = result.hands || [];
            this.storeHandHistory();
        } catch (error) {
            console.error('Error updating hands:', error);
        }
    }

    async getStorageData(keys) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(result);
                }
            });
        });
    }

    async setStorageData(data) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set(data, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
    }

    storeHandHistory() {
        try {
            let logString = '';
            if (this.currentHandForLogging.length > 0) {
                logString = this.convertToPokerStarsFormat(this.currentHandForLogging, this.dealtLine, this.stackLines);
            }
            
            this.cleanup();
            this.handNumber += 1;
            this.hands.push(logString);
            
            this.setStorageData({ hands: this.hands });
        } catch (error) {
            console.error('Error storing hand history:', error);
        }
    }

    convertToPokerStarsFormat(handLines, dealtLine, stackLines) {
        // Implementation of PokerStars format conversion
        // This is a simplified version - the full implementation would be quite long
        return handLines.join('\n');
    }

    setSeatNumber(n) {
        this.seatNumber = n;
    }

    createHand(handLines, dealtLine) {
        console.log('Hand data being sent to service worker:', handLines);
        this.aggregator.requestServerAnalysis(handLines);
    }
}

class Aggregator {
    constructor() {
        this.stats = {};
        this.you = '';
        this.initialized = false;
    }

    async initialize() {
        try {
            const result = await this.getStorageData(['stats']);
            this.stats = result.stats || {};
            this.unpackStats();
            this.initialized = true;
        } catch (error) {
            console.error('Error initializing aggregator:', error);
            this.initialized = true;
        }
    }

    async getStorageData(keys) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(result);
                }
            });
        });
    }

    async setStorageData(data) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set(data, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
    }

    setYou(you) {
        this.you = you;
    }

    handed(hand) {
        let number = 0;
        if (parseInt(hand, 10) === hand) {
            number = hand;
        } else {
            number = parseInt(hand.playerNumber, 10);
        }
        
        if (number === 2) return 'heads up';
        if (number > 2 && number < 7) return 'short handed';
        if (number > 6 || number === 1) return 'full ring';
    }

    getData(dataDict, tableSize, player) {
        dataDict = this.makePath(dataDict, tableSize, player);
        return dataDict[player][tableSize];
    }

    makePath(dataDict, tableSize, player) {
        if (dataDict === null) {
            dataDict = {};
        }
        if (!Object.keys(dataDict).includes(player)) {
            dataDict[player] = {};
        }
        if (!Object.keys(dataDict[player]).includes(tableSize)) {
            dataDict[player][tableSize] = [0, 0];
        }
        return dataDict;
    }

    getStat(statName, dataDict, tableSize, username) {
        const percentStats = ['VPIP', 'PFR', '3B', '4B', 'F3', 'WTSD', 'CB', 'CBF', '2B', '3Ba', 'FC', 'F2B', 'F3B'];
        const nonPercentStats = ['AF', 'H'];
        
        const data = this.getData(dataDict, tableSize, username);
        let string = '';
        
        // Check if we have valid data (hands played > 0)
        if (!data || data[1] === 0) {
            if (statName === 'H') {
                return '(0)';
            } else {
                return '--';
            }
        }
        
        if (statName === 'H') {
            string = `(${data[1]})`;
        } else if (percentStats.includes(statName)) {
            string = ((data[0] / data[1]) * 100).toFixed(1);
        } else {
            string = (data[0] / data[1]).toFixed(2);
        }
        
        return string;
    }

    allStats() {
        return ['H', 'VPIP', 'PFR', 'AF', '3B', '4B', 'F3', 'WTSD', 'CB', 'CBF', '2B', '3Ba', 'FC', 'F2B', 'F3B'];
    }

    unpackStats() {
        const statKeys = Object.keys(this.stats);
        const statList = this.allStats();
        
        for (const stat of statList) {
            if (!statKeys.includes(stat)) {
                this.stats[stat] = {};
            }
        }
        
        this.HandsData = this.stats['H'];
        this.VPIPdata = this.stats['VPIP'];
        this.PFRdata = this.stats['PFR'];
        this.AFdata = this.stats['AF'];
        this.threeBetData = this.stats['3B'];
        this.fourBetData = this.stats['4B'];
        this.F3data = this.stats['F3'];
        this.WTSDdata = this.stats['WTSD'];
        this.CBFdata = this.stats['CBF'] || this.stats['CB'] || {};
        this.CBdata = this.CBFdata;
        this.stats['CBF'] = this.CBFdata;
        this.stats['CB'] = this.CBFdata;
        this.twoBarrelData = this.stats['2B'];
        this.threeBarrelData = this.stats['3Ba'];
        this.FCdata = this.stats['FC'];
        this.F2Bdata = this.stats['F2B'];
        this.F3Bdata = this.stats['F3B'];
    }

    async storeStats() {
        try {
            await this.setStorageData({ stats: this.stats });
        } catch (error) {
            console.error('Error storing stats:', error);
        }
    }

    requestServerAnalysis(handLines) {
        console.log('Sending hand to service worker...');
        chrome.runtime.sendMessage({
            handLines: handLines,
            stats: this.stats,
            command: 'requestServerAnalysis',
            you: this.you
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error sending message:', chrome.runtime.lastError.message);
            } else {
                console.log('Service worker response:', response);
                // Check if stats actually changed
                console.log('Stats before refresh:', this.stats);
                // Refresh stats from storage after analysis
                setTimeout(async () => {
                    await this.initialize();
                    console.log('Stats after refresh:', this.stats);
                    console.log('Stats refreshed after hand analysis');
                    // Trigger HUD update by refreshing existing panels
                    if (window.hud) {
                        // Update existing panels with new stats
                        const HUDdiv = document.getElementById('HUD');
                        if (HUDdiv) {
                            // Clear existing panels
                            HUDdiv.innerHTML = '';
                            // Recreate panels with updated stats
                            window.hud.initializeHUD();
                        }
                    }
                }, 1000);
            }
        });
    }
}

class LogScraper {
    constructor() {
        this.lastHandNumber = 0;
        this.lastCreatedAt = 0;
    }

    removeChat(chatText) {
        const jHtmlObject = jQuery('<p>' + chatText);
        const editor = jQuery('<p>').append(jHtmlObject);
        editor.find('.speech_container_yyy').remove();
        return editor.html();
    }

    seperateIntoLines(chat) {
        const chatLines = chat.split('<br>');
        for (let i = 0; i < chatLines.length; i++) {
            chatLines[i] = chatLines[i].replace(/(<([^>]+)>)/ig, '');
        }
        return chatLines;
    }

    httpGetAsync(theUrl, callback) {
        const xmlHttp = new XMLHttpRequest();
        const self = this;
        xmlHttp.onreadystatechange = function() {
            if (xmlHttp.readyState === 4) {
                if (xmlHttp.status === 200) {
                    callback(xmlHttp.responseText, self);
                } else {
                    console.error('HTTP request failed with status:', xmlHttp.status);
                }
            }
        };
        xmlHttp.onerror = function() {
            console.error('HTTP request error');
        };
        xmlHttp.open('GET', theUrl, true);
        xmlHttp.send(null);
    }

    processLog(text, self) {
        try {
            let jsonLog;
            if (Object.prototype.toString.call(text) === '[object String]') {
                jsonLog = JSON.parse(text);
            } else if (Object.prototype.toString.call(text) === '[object Object]') {
                jsonLog = text;
            }

            if (!jsonLog.logs || jsonLog.logs.length === 0) {
                return;
            }

            const logs = [...jsonLog.logs].sort((a, b) => {
                const aTime = Number(a?.created_at) || 0;
                const bTime = Number(b?.created_at) || 0;
                return aTime - bTime;
            });

            // Scan newest-to-oldest for the most recent completed hand.
            for (let i = logs.length - 1; i >= 0; i--) {
                const message = logs[i].msg;
                if (message.includes('ending hand #')) {
                    self.lastCreatedAt = logs[i].created_at;
                    const number = parseInt(message.split('#')[1].split(' ')[0]);
                    if (number > self.lastHandNumber) {
                        self.lastHandNumber = number;
                        console.log('New hand detected #' + number + ', processing...');
                        if (window.builder) {
                            window.builder.addHand({ logs: logs });
                        } else {
                            console.error('Builder not available for hand processing');
                        }
                        // Process only the most recent hand per call
                        break;
                    }
                }
            }
        } catch (error) {
            console.error('Error processing log:', error);
        }
    }

    setInitialCreatedAt(text, self) {
        try {
            let jsonLog;
            if (Object.prototype.toString.call(text) === '[object String]') {
                jsonLog = JSON.parse(text);
            } else if (Object.prototype.toString.call(text) === '[object Object]') {
                jsonLog = text;
            }
            
            if (jsonLog.logs && jsonLog.logs.length > 0) {
                const newestCreatedAt = jsonLog.logs.reduce((latest, entry) => {
                    const createdAt = Number(entry?.created_at) || 0;
                    return createdAt > latest ? createdAt : latest;
                }, 0);
                self.lastCreatedAt = newestCreatedAt;
            }
        } catch (error) {
            console.error('Error setting initial created at:', error);
        }
    }

    getFullLog() {
        const currentURL = window.location.href;
        this.httpGetAsync(currentURL + '/log', this.setInitialCreatedAt);
    }

    async getLog() {
        try {
            if (window.builder && window.settings) {
                window.builder.recordingHands = await window.settings.checkIfRecordingHands();
            }
            const currentURL = window.location.href;
            const logURL = currentURL + '/log?after_at=' + this.lastCreatedAt;
            this.httpGetAsync(logURL, this.processLog);
        } catch (error) {
            console.error('Error getting log:', error);
        }
    }
}

// Utility functions
function isExtensionContextInvalid(error) {
    const message = error?.message || '';
    return message.includes('Extension context invalidated');
}

function recoverFromInvalidExtensionContext(error) {
    if (!isExtensionContextInvalid(error)) {
        return false;
    }

    if (!window.__pokernowHudContextRecoveryTriggered) {
        window.__pokernowHudContextRecoveryTriggered = true;
        console.warn('Extension context invalidated. Reloading page to reattach content script.');
        window.location.reload();
    }

    return true;
}

async function getStats(aggregator) {
    try {
        const result = await aggregator.getStorageData(['stats']);
        aggregator.stats = result.stats || {};
        aggregator.unpackStats();
        return true;
    } catch (error) {
        if (recoverFromInvalidExtensionContext(error)) {
            return false;
        }
        console.error('Error getting stats:', error);
        return false;
    }
}

function popup(mylink, windowname) {
    if (!window.focus) return true;
    const popupURL = chrome.runtime.getURL(mylink);
    window.open(popupURL, windowname, 'width=400,height=200,scrollbars=yes');
    return false;
}

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        try {
        if (request.command === 'updateStats2') {
            if (window.settings) {
                window.settings.statsToShow = request.stats;
            }
            sendResponse({ confirmation: 'success' });
        }
        
        if (request.command === 'record2') {
            if (window.settings) {
                window.settings.record = request.state;
            }
            sendResponse({ confirmation: 'success' });
        }
        
        if (request.command === 'restore') {
            console.log('restore');
            console.log(request.stats);
            if (window.aggregator) {
                window.aggregator.stats = JSON.parse(request.stats);
                console.log(window.aggregator.stats);
                await window.aggregator.storeStats();
            }
            sendResponse({ confirmation: 'success' });
        }
        
        if (request.command === 'assimilate') {
            console.log('assimilate');
            if (window.aggregator) {
                // Add assimilate method if it doesn't exist
                if (typeof window.aggregator.assimilate === 'function') {
                    window.aggregator.assimilate(JSON.parse(request.stats));
                } else {
                    // Simple merge for now
                    const newStats = JSON.parse(request.stats);
                    Object.assign(window.aggregator.stats, newStats);
                }
                await window.aggregator.storeStats();
            }
            sendResponse({ confirmation: 'success' });
        }
        
        if (request.command === 'cleared') {
            const confirm = window.confirm('Are you sure you want to clear your data? Without a backup it will not be recoverable.');
            if (confirm === true) {
                if (window.aggregator) {
                    await window.aggregator.setStorageData({ stats: {} });
                    console.log('cleared');
                    await getStats(window.aggregator);
                }
                sendResponse({ confirmation: 'success' });
            } else {
                sendResponse({ confirmation: 'cancelled' });
            }
        }
        
        if (request.command === 'clearedHistory') {
            const confirm = window.confirm('Are you sure you want to clear your hand history? It will not be recoverable.');
            if (confirm === true) {
                if (window.aggregator) {
                    await window.aggregator.setStorageData({ hands: [] });
                }
            }
            sendResponse({ confirmation: 'success' });
        }
        
        // Handle stats updates from service worker
        if (request.command === 'statsUpdated') {
            console.log('Stats updated from service worker');
            if (window.aggregator) {
                await getStats(window.aggregator);
                // Trigger HUD update
                if (window.hud) {
                    window.hud.initializeHUD();
                }
            }
            sendResponse({ confirmation: 'success' });
        }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ confirmation: 'error', message: error.message });
        }
    })();
    return true;
});

// Initialize the application
async function initializeApp() {
    try {
        const aggregator = new Aggregator();
        await aggregator.initialize();
        
        const settings = new Settings();
        await settings.initialize();
        
        const builder = new HandBuilder(aggregator, settings);
        const scraper = new LogScraper();
        const hud = new HUD(aggregator, settings, builder, scraper);
        
        // Set global references
        window.aggregator = aggregator;
        window.settings = settings;
        window.builder = builder;
        window.hud = hud;
        window.scraper = scraper;
        
        console.log('PokernowHUD initialized successfully');
        
        // Test service worker communication
        chrome.runtime.sendMessage({command: "test"}, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Service worker test failed:', chrome.runtime.lastError.message);
            } else {
                console.log('Service worker test successful:', response);
            }
        });
        
        // Start the HUD
        await hud.waitForGameToLoad();
        
    } catch (error) {
        console.error('Failed to initialize PokernowHUD:', error);
    }
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
