require('dotenv').config();
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const riot = require('./riotClient');

const TIER_VALUES = { IRON: 0, BRONZE: 400, SILVER: 800, GOLD: 1200, PLATINUM: 1600, EMERALD: 2000, DIAMOND: 2400, MASTER: 2800 };
const DIV_VALUES = { IV: 0, III: 100, II: 200, I: 300 };

function getAbsoluteLp(entry) {
  if (!entry) return 0;
  return (TIER_VALUES[entry.tier.toUpperCase()] || 0) + (DIV_VALUES[entry.rank.toUpperCase()] || 0) + entry.leaguePoints;
}

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 280, height: 460, 
    transparent: true, frame: false, resizable: false, alwaysOnTop: true,
    icon: path.join(__dirname, 'final-icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });

  // THE NUCLEAR ALWAYS-ON-TOP OPTION
  win.setAlwaysOnTop(true, 'screen-saver');

  win.loadFile('index.html');
});

ipcMain.handle('auto-detect', async () => {
  try {
    const localPlayer = await riot.detectLocalPlayer();
    const stats = await riot.fetchPlayerStats(localPlayer); 
    const recentGames = stats.matches.map(m => {
      const me = m.info.participants.find(p => p.puuid === stats.realPuuid);
      return { win: me.win, champion: me.championName, matchId: m.metadata.matchId };
    });

    const currentAbsoluteLp = getAbsoluteLp(stats.soloQ);
    return {
      success: true,
      data: {
        name: localPlayer.gameName || localPlayer.displayName,
        tier: stats.soloQ ? `${stats.soloQ.tier} ${stats.soloQ.rank}` : "UNRANKED",
        lp: stats.soloQ ? stats.soloQ.leaguePoints : 0,
        absoluteLp: currentAbsoluteLp,
        recentGames
      }
    };
  } catch (err) {
    return { success: false, error: err.message || "Failed to detect player." };
  }
});

// NEW: Pass the gameflow check to the frontend
ipcMain.handle('get-gameflow', async () => {
  return await riot.getGameflowPhase();
});