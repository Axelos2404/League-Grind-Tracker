require('dotenv').config();
const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
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

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true);

  // STATE VARIABLES
  let isLocked = true;
  let isHidden = false;

  // DRAG/INTERACT HOTKEY (Ctrl + Shift + L)
  globalShortcut.register('CommandOrControl+Shift+L', () => {
    if (isHidden) return; // THE SHIELD: Do absolutely nothing if the widget is invisible!

    isLocked = !isLocked;
    win.setIgnoreMouseEvents(isLocked);
    
    // VISUAL FEEDBACK INJECTION
    win.webContents.executeJavaScript(`
      {
        let card = document.querySelector('.tracker-card');
        if (card) {
          let overlay = document.getElementById('unlock-border');
          if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'unlock-border';
            overlay.style.cssText = 'position:absolute; top:0; bottom:0; left:0; right:0; border: 3px dashed #ff7b7b; border-radius: 10px; pointer-events:none; z-index:9999; box-sizing:border-box; transition: opacity 0.2s ease;';
            card.appendChild(overlay);
          }
          overlay.style.opacity = ${isLocked ? "'0'" : "'1'"};
        }
      }
    `).catch(err => console.log('Visual update skipped:', err.message));
  });

  // MANUAL HIDE/SHOW HOTKEY (Ctrl + Shift + H)
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    isHidden = !isHidden;

    // FORCE LOCK: If the app is hiding, make sure it locks itself!
    if (isHidden && !isLocked) {
      isLocked = true;
      win.setIgnoreMouseEvents(true);
    }

    // UNIFIED COMMAND: Wrapped in {} to prevent redeclaration errors
    win.webContents.executeJavaScript(`
      {
        document.body.style.transition = 'opacity 0.4s ease-in-out';
        document.body.style.opacity = ${isHidden ? "'0'" : "'1'"};
        document.body.style.pointerEvents = ${isHidden ? "'none'" : "''"};
        
        let ob = document.getElementById('unlock-border');
        if (ob) ob.style.opacity = ${isLocked ? "'0'" : "'1'"};
      }
    `).catch(err => console.log('Hide toggle skipped:', err.message));
  });

  // IPC LISTENER FOR AUTO-HIDE
  ipcMain.on('set-window-visibility', (event, shouldShow) => {
    if (shouldShow && isHidden) {
      isHidden = false;
      win.webContents.executeJavaScript(`
        {
          document.body.style.transition = 'opacity 0.4s ease-in-out';
          document.body.style.opacity = '1';
          document.body.style.pointerEvents = '';
          
          let ob = document.getElementById('unlock-border');
          if (ob) ob.style.opacity = ${isLocked ? "'0'" : "'1'"};
        }
      `).catch(err => console.log(err.message));
    } else if (!shouldShow && !isHidden) {
      isHidden = true;
      
      if (!isLocked) {
        isLocked = true;
        win.setIgnoreMouseEvents(true);
      }

      win.webContents.executeJavaScript(`
        {
          document.body.style.transition = 'opacity 0.4s ease-in-out';
          document.body.style.opacity = '0';
          document.body.style.pointerEvents = 'none';
          
          let ob = document.getElementById('unlock-border');
          if (ob) ob.style.opacity = '0';
        }
      `).catch(err => console.log(err.message));
    }
  });

  win.loadFile('index.html');
});

// CLEAN UP HOTKEYS WHEN THE APP CLOSES
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
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

// Pass the gameflow check to the frontend
ipcMain.handle('get-gameflow', async () => {
  return await riot.getGameflowPhase();
});