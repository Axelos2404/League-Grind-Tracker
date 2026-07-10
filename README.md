<div align="center">
  <img src="GrindTracker.png" alt="Grind Tracker Logo" width="200"/>
  
  # League Tracker Pro
  **A simple, ranked Q tracking overlay for League of Legends.**
</div>

---

## 📖 Overview
League Tracker Pro is a lightweight desktop overlay built with Electron. It sits cleanly over your Borderless game window to give you real-time analytics on your current ranked grind session. 

Instead of constantly pinging the Riot API and risking rate-limit bans, this tracker utilizes a **Zero-Rate-Limit Architecture**. It hooks into your local League Client's gameflow phase and only requests public match data exactly when your game ends.

## ✨ Features
* **Zero-Rate-Limit Polling:** Detects game state locally; 0 requests sent to Riot during gameplay.
* **Smart LP Tracking:** Dynamically calculates your Net LP and estimates your LP gain per win.
* **Match History Tiles:** Visually displays your last 5 Solo/Duo games with dynamic, auto-updating champion portraits.
* **Session Persistence:** Saves your current grind timer, wins, losses, and LP progress to local storage so you can pick up where you left off.
* **Customization Engine:** Built-in settings menu to adjust background opacity and UI accent colors on the fly.
* **Vanguard Safe:** Uses standard Windows overlay mechanics (Borderless mode) with zero memory injection.

---

## 🛠️ Development Setup

### Prerequisites
* [Node.js](https://nodejs.org/) (v16 or higher recommended)
* A valid [Riot Games API Key](https://developer.riotgames.com/)

### 1. Clone & Install
```bash
git clone [https://github.com/YOUR_USERNAME/League-Grind-Tracker.git](https://github.com/YOUR_USERNAME/League-Grind-Tracker.git)
cd League-Grind-Tracker
npm install
```

### 2. Environment Setup
Create a .env file in the root directory and add your Riot API key:
```
RIOT_API_KEY=RGAPI-your-secret-key-here
```

### 3. Run Locally
```bash
npm start
```

### 4. Build Executables
To package the app into a standalone .exe and an Installer:
```bash
npm run dist
```
The compiled files will be generated inside the dist/ folder.

---

### ⚠️ Disclaimer
League Tracker Pro isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.