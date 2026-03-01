# PokerNow HUD

A comprehensive Chrome extension that tracks and displays poker statistics for all players at PokerNow.club tables in real-time.

## Features

### Real-Time Statistics Tracking
- **VPIP (Voluntarily Put In Pot)**: Percentage of hands where a player voluntarily puts money in the pot (calls, bets, or raises)
- **PFR (Pre-Flop Raise)**: Percentage of hands where a player raises pre-flop
- **3B (3-Bet)**: Percentage of hands where a player makes a 3-bet pre-flop
- **CBF (C-bet Frequency)**: Percentage of flop opportunities where the pre-flop aggressor makes a continuation bet
- **AF (Aggression Factor)**: Post-flop aggression ratio calculated as (Bets + Raises) / Calls

### Advanced Functionality
- **Multi-street hand processing**: Tracks stats for hands that go to flop, turn, and river
- **Full ring support**: Works with 2-10 player tables (heads-up, short-handed, full ring)
- **Real-time HUD overlay**: Displays stats directly on the poker table
- **Persistent data storage**: Stats are saved and maintained across sessions
- **Customizable display**: Configurable stat panels with drag-and-drop positioning

### Technical Features
- **Modern Chrome Extension**: Built with Manifest V3
- **Service Worker architecture**: Efficient background processing
- **Real-time DOM monitoring**: Automatically detects new hands and player actions
- **Error handling**: Robust error handling and logging
- **Clean codebase**: Modern ES6+ JavaScript with proper separation of concerns

## Statistics Explained

### VPIP (Voluntarily Put In Pot)
- **Formula**: (Hands where player called/bet/raised) / (Total hands) × 100
- **Range**: 0-100%
- **Interpretation**: Higher VPIP = looser player, Lower VPIP = tighter player

### PFR (Pre-Flop Raise)
- **Formula**: (Hands where player raised pre-flop) / (Total hands) × 100
- **Range**: 0-100%
- **Interpretation**: Higher PFR = more aggressive pre-flop, Lower PFR = more passive

### 3B (3-Bet)
- **Formula**: (Hands where player 3-bet) / (Opportunities to 3-bet) × 100
- **Range**: 0-100%
- **Interpretation**: Higher 3B = more aggressive 3-betting, Lower 3B = more selective

### AF (Aggression Factor)
- **Formula**: (Bets + Raises) / Calls
- **Range**: 0 to ∞
- **Interpretation**: 
  - AF = 0: Only calls, never bets/raises
  - AF = 1: Equal bets/raises and calls
  - AF = 2+: Very aggressive post-flop
  - AF = ∞: Never calls, only bets/raises

## Setup

1. **Clone or download** this repository
2. **Open Chrome** and navigate to `chrome://extensions/`
3. **Enable "Developer mode"** (toggle in top right)
4. **Click "Load unpacked"** and select the PokernowHUD folder
5. **Navigate to PokerNow.club** and join a game
6. **The HUD will automatically appear** with real-time statistics

## Usage

- **Automatic detection**: The extension automatically detects new hands and updates statistics
- **Real-time updates**: Stats update immediately after each hand
- **Persistent tracking**: Statistics are maintained across browser sessions
- **Multi-table support**: Works on any PokerNow.club table
- **Customizable display**: Right-click on stat panels to drag and reposition

## Technical Architecture

- **Content Script**: Monitors the poker table and extracts hand data
- **Service Worker**: Processes hand data and calculates statistics
- **Storage API**: Persists statistics and settings
- **Real-time Communication**: Uses Chrome messaging for data flow
- **DOM Observation**: MutationObserver for detecting table changes

## Development

This extension is built with modern web technologies:
- **Manifest V3** for Chrome extension compatibility
- **ES6+ JavaScript** with classes and modern syntax
- **Chrome Storage API** for data persistence
- **Chrome Runtime Messaging** for communication
- **CSS3** for styling and animations

## License

MIT License - See LICENSE file for details 
