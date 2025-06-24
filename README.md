# PokerNow HUD

A Chrome extension that tracks VPIP, PFR, and 3-bet percentages for all players at a PokerNow.club table.

## Features
- Observes player actions in real time
- Lays the groundwork for tracking poker statistics (VPIP, PFR, 3-bet)

## Setup
1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable "Developer mode" (top right).
4. Click "Load unpacked" and select the `pokernow HUD` folder.

## Customization
- **Important:** You must update the placeholder selectors in `content.js` to match the actual PokerNow.club DOM structure for player names and action logs.

## Next Steps
- Implement logic to parse player actions and update statistics.
- Inject UI elements to display stats at the table. 