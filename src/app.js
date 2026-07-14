// --- LOAD USER PREFERENCES ---
const savedColor = localStorage.getItem('accentColor') || '#ffd166';
const savedOpacity = localStorage.getItem('bgOpacity') || '0.88';
const shouldSaveSession = localStorage.getItem('saveSession') === 'true';
const shouldAutoHideInit = localStorage.getItem('autoHide') === 'true';

// --- LOAD LP HISTORY ---
let lpHistory = JSON.parse(localStorage.getItem('lpHistory')) || [];

// Apply saved settings to the UI instantly
document.documentElement.style.setProperty('--accent-color', savedColor);
document.documentElement.style.setProperty('--bg-opacity', savedOpacity);

// Setup the settings menu inputs
document.getElementById('colorPicker').value = savedColor;
document.getElementById('opacitySlider').value = savedOpacity;
document.getElementById('saveSessionToggle').checked = shouldSaveSession;
document.getElementById('autoHideToggle').checked = shouldAutoHideInit;
// --- SESSION STATE ---
let session = {
  active: false, startTime: null, startAbsoluteLp: 0, lastAbsoluteLp: 0,
  wins: 0, losses: 0, seenMatchIds: new Set(), estimatedWinGain: 20
};

// --- RESTORE SAVED SESSION (IF ENABLED) ---
if (shouldSaveSession) {
  const savedSessionData = localStorage.getItem('leagueSession');
  if (savedSessionData) {
    try {
      const parsed = JSON.parse(savedSessionData);
      session.active = parsed.active;
      // We store elapsed time instead of a hard timestamp so the timer doesn't count time while the app was closed!
      session.startTime = Date.now() - parsed.elapsedMs;
      session.startAbsoluteLp = parsed.startAbsoluteLp;
      session.lastAbsoluteLp = parsed.lastAbsoluteLp;
      session.wins = parsed.wins;
      session.losses = parsed.losses;
      session.seenMatchIds = new Set(parsed.seenMatchIds); // Sets don't stringify well, so we convert back and forth
      session.estimatedWinGain = parsed.estimatedWinGain;
    } catch(e) { console.error("Could not parse saved session"); }
  }
}

// Helper to save the current session state
function saveSessionToStorage() {
  if (localStorage.getItem('saveSession') === 'true' && session.active) {
    const dataToSave = {
      active: session.active,
      elapsedMs: Date.now() - session.startTime,
      startAbsoluteLp: session.startAbsoluteLp,
      lastAbsoluteLp: session.lastAbsoluteLp,
      wins: session.wins,
      losses: session.losses,
      seenMatchIds: Array.from(session.seenMatchIds),
      estimatedWinGain: session.estimatedWinGain
    };
    localStorage.setItem('leagueSession', JSON.stringify(dataToSave));
  } else {
    localStorage.removeItem('leagueSession');
  }
}

// --- UI EVENT LISTENERS ---
document.getElementById('settingsBtn').addEventListener('click', () => {
  document.getElementById('settingsOverlay').style.display = 'flex';
});

document.getElementById('closeSettingsBtn').addEventListener('click', () => {
  document.getElementById('settingsOverlay').style.display = 'none';
});

document.getElementById('colorPicker').addEventListener('input', (e) => {
  document.documentElement.style.setProperty('--accent-color', e.target.value);
  localStorage.setItem('accentColor', e.target.value);
});

document.getElementById('opacitySlider').addEventListener('input', (e) => {
  document.documentElement.style.setProperty('--bg-opacity', e.target.value);
  localStorage.setItem('bgOpacity', e.target.value);
});

document.getElementById('saveSessionToggle').addEventListener('change', (e) => {
  localStorage.setItem('saveSession', e.target.checked);
  saveSessionToStorage(); // Save immediately or wipe depending on the box
});

document.getElementById('autoHideToggle').addEventListener('change', (e) => {
  localStorage.setItem('autoHide', e.target.checked);
  // Note: requires app restart to fully apply to the gameflow loop
});

// --- GRIND TIMER LOGIC ---
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const hours = String(Math.floor(s / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const seconds = String(s % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

setInterval(() => {
  if (session.active) {
    document.getElementById('grindTimer').textContent = formatTime(Date.now() - session.startTime);
    saveSessionToStorage(); // Continually save progress so nothing is lost if you Alt+F4
  }
}, 1000);

// --- MAIN FETCH AND RENDER LOGIC ---
async function updateTracker() {
  const res = await window.api.autoDetect();
  if (!res.success) {
    document.getElementById('status').textContent = "ERROR: PLAY A GAME FIRST";
    return;
  }

  const data = res.data;

  // Extract the Tier Name EARLY so we can save it to history for the graph colors!
  const tierParts = data.tier.split(' ');
  const tierName = tierParts[0] || 'GOLD';
  const division = tierParts[1] || 'IV';

  // 1. INITIALIZE OR UPDATE SESSION
  if (!session.active) {
    session.active = true;
    session.startTime = Date.now();
    session.startAbsoluteLp = data.absoluteLp;
    session.lastAbsoluteLp = data.absoluteLp;
    data.recentGames.forEach(g => session.seenMatchIds.add(g.matchId));

    // RECORD SESSION START
    if (lpHistory.length === 0 || lpHistory[lpHistory.length - 1].absoluteLp !== data.absoluteLp) {
      lpHistory.push({ 
        lp: data.absoluteLp, 
        label: `${data.tier} ${data.lp}LP`, 
        isNewSession: true, 
        delta: 0,
        tierName: tierName 
      });
      localStorage.setItem('lpHistory', JSON.stringify(lpHistory));
    }
  } else {
    // Check for newly completed matches
    data.recentGames.forEach(game => {
      if (!session.seenMatchIds.has(game.matchId)) {
        session.seenMatchIds.add(game.matchId);
        if (game.win) session.wins++;
        else session.losses++;
      }
    });

    // RECORD LP CHANGES
    const lpDelta = data.absoluteLp - session.lastAbsoluteLp;
    if (lpDelta !== 0) {
      if (lpDelta > 0 && data.recentGames[0]?.win) session.estimatedWinGain = lpDelta;
      
      lpHistory.push({ 
        lp: data.absoluteLp, 
        label: `${data.tier} ${data.lp}LP`, 
        isNewSession: false, 
        delta: lpDelta,
        tierName: tierName
      });
      localStorage.setItem('lpHistory', JSON.stringify(lpHistory));
      session.lastAbsoluteLp = data.absoluteLp;
    }
  }

  // 2. DYNAMIC "WINS UNTIL" CALCULATION
  const currentLp = data.lp;
  const lpNeeded = Math.max(0, 100 - currentLp);
  const gamesLeft = Math.ceil(lpNeeded / session.estimatedWinGain) || 1;
  
  const apexTiers = ['MASTER', 'GRANDMASTER', 'CHALLENGER'];
  if (apexTiers.includes(tierName.toUpperCase())) {
    document.getElementById('status').textContent = `APEX TIER GRIND`;
  } else {
    const targetDisplay = division === 'I' ? 'NEXT TIER' : 'NEXT DIVISION';
    document.getElementById('status').textContent = `${gamesLeft} ${gamesLeft === 1 ? 'WIN' : 'WINS'} TILL ${targetDisplay}`;
  }

  // 3. RENDER TOP SECTION
  document.getElementById('tier').textContent = data.tier;
  document.getElementById('lp').textContent = `${data.lp} LP`;
  document.getElementById('bar').style.width = `${data.lp}%`;
  document.getElementById('percentLabel').textContent = `${Math.round(data.lp)}%`;

  const nextTierMap = { BRONZE: 'SILVER', SILVER: 'GOLD', GOLD: 'PLATINUM', PLATINUM: 'DIAMOND', DIAMOND: 'MASTER' };
  document.getElementById('leftLabel').textContent = `${tierName} IV`;
  document.getElementById('rightLabel').textContent = `${nextTierMap[tierName.toUpperCase()] || tierName} IV`;

  // 4. RENDER MATCH HISTORY
  const gamesRow = document.getElementById('gamesRow');
  gamesRow.innerHTML = '';
  data.recentGames.forEach(game => {
    const tile = document.createElement('div');
    tile.className = 'game-tile';
    tile.style.boxShadow = `inset 0 0 0 2px ${game.win ? '#4bbf73' : '#ff7b7b'}`;
    tile.innerHTML = `
      <img src="https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${game.champion}.png" style="width:100%; height:100%; border-radius:4px;">
      <div class="badge" style="background: ${game.win ? '#4bbf73' : '#ff7b7b'}">${game.win ? 'W' : 'L'}</div>
    `;
    gamesRow.appendChild(tile);
  });

  // 5. RENDER SESSION STATS
  const totalGames = session.wins + session.losses;
  const winRate = totalGames > 0 ? Math.round((session.wins / totalGames) * 100) : 0;
  const netLp = data.absoluteLp - session.startAbsoluteLp;

  document.getElementById('sessionRecord').textContent = `${session.wins}-${session.losses}`;
  document.getElementById('winRate').textContent = `${winRate}%`;
  
  const netLpEl = document.getElementById('netLp');
  netLpEl.textContent = `${netLp >= 0 ? '+' : ''}${netLp}`;
  netLpEl.style.color = netLp >= 0 ? '#4bbf73' : '#ff7b7b';
  
  document.getElementById('gamesCount').textContent = totalGames;
}

let ddragonVersion = '14.4.1'; // Fallback

// Fetch the absolute newest patch version from Riot on startup
fetch('https://ddragon.leagueoflegends.com/api/versions.json')
  .then(res => res.json())
  .then(versions => { ddragonVersion = versions[0]; });

// Automatically sync the data on startup
updateTracker();

// THE SMART POST-GAME POLLER
let matchFoundTime = null;

async function waitForRiotServer(attempts = 0) {
  if (attempts > 60) {
    matchFoundTime = null;
    return; // Failsafe timeout after 10 minutes
  }

  const res = await window.api.autoDetect();
  if (res.success && res.data) {
    const latestMatch = res.data.recentGames[0];
    const isNewMatch = latestMatch && !session.seenMatchIds.has(latestMatch.matchId);
    const lpChanged = res.data.absoluteLp !== session.lastAbsoluteLp;

    if (isNewMatch) {
      if (!matchFoundTime) matchFoundTime = Date.now();

      // Riot's LP server is slower than the Match server. 
      // We wait until LP changes, OR 90 seconds have passed (in case of a +0 LP dodge/remake).
      if (lpChanged || (Date.now() - matchFoundTime > 90000)) {
        updateTracker(); 
        matchFoundTime = null;
        return; 
      }
    }
  }
  
  // Check again in 10 seconds
  setTimeout(() => waitForRiotServer(attempts + 1), 10000);
}

// Open Graph Event Listener
document.getElementById('graphBtn').addEventListener('click', () => {
  window.api.openGraph();
});

// THE ZERO RATE-LIMIT GAMEFLOW TRACKER
let lastPhase = "None";

setInterval(async () => {
  try {
    const currentPhase = await window.api.getGameflow();
    const isAutoHideEnabled = localStorage.getItem('autoHide') !== 'false'; 
    const graphBtn = document.getElementById('graphBtn');
    
    // GRAPH WINDOW & BUTTON LOGIC
    if (currentPhase === "InProgress") {
      graphBtn.style.display = 'none'; // Hide button in-game
      window.api.closeGraph();         // Force close the 2nd window
    } else {
      graphBtn.style.display = 'block'; // Show button out of game
    }
    
    // AUTO-HIDE LOGIC
    if (isAutoHideEnabled && lastPhase !== currentPhase) {
      if (currentPhase === "InProgress") {
        window.api.setVisibility(false); // Hide when game starts
      } else if (lastPhase === "InProgress") {
        window.api.setVisibility(true);  // Show when game ends
      }
    }

    // CHECK: If it was active, and now it's literally anything else (Lobby, EndOfGame, etc.)
    if (lastPhase === "InProgress" && currentPhase !== "InProgress") {
      waitForRiotServer(); // Start the smart polling loop
    }
    
    lastPhase = currentPhase;
  } catch (e) {
    // FAILSAFE: If the League client crashes/closes immediately after the Nexus explodes
    if (lastPhase === "InProgress") {
      const isAutoHideEnabled = localStorage.getItem('autoHide') !== 'false';
      if (isAutoHideEnabled) window.api.setVisibility(true); // Ensure it un-hides!
      waitForRiotServer();
    }
    lastPhase = "None"; // Reset state safely
  }
}, 5000);