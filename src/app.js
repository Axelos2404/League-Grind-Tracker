// --- LOAD USER PREFERENCES ---
const savedColor = localStorage.getItem('accentColor') || '#ffd166';
const savedOpacity = localStorage.getItem('bgOpacity') || '0.88';
const shouldSaveSession = localStorage.getItem('saveSession') === 'true';
const shouldAutoHideInit = localStorage.getItem('autoHide') === 'true';
const shouldFillGraph = localStorage.getItem('fillGraph') === 'true';

document.documentElement.style.setProperty('--accent-color', savedColor);
document.documentElement.style.setProperty('--bg-opacity', savedOpacity);

document.getElementById('colorPicker').value = savedColor;
document.getElementById('opacitySlider').value = savedOpacity;
document.getElementById('saveSessionToggle').checked = shouldSaveSession;
document.getElementById('autoHideToggle').checked = shouldAutoHideInit;
document.getElementById('fillGraphToggle').checked = shouldFillGraph;

// Initialize custom path from backend
window.api.getCustomPath().then(p => document.getElementById('customPathInput').value = p);

// --- MULTI-ACCOUNT STATE ---
let activePuuid = null;
let lpHistory = [];
let session = {
  active: false, startTime: null, startAbsoluteLp: 0, lastAbsoluteLp: 0,
  wins: 0, losses: 0, seenMatchIds: new Set(), estimatedWinGain: 20
};

function saveSessionToStorage() {
  if (!activePuuid) return;
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
    localStorage.setItem(`session_${activePuuid}`, JSON.stringify(dataToSave));
  } else {
    localStorage.removeItem(`session_${activePuuid}`);
  }
}

// --- UI EVENT LISTENERS ---
document.getElementById('settingsBtn').addEventListener('click', () => { document.getElementById('settingsOverlay').style.display = 'flex'; });
document.getElementById('closeSettingsBtn').addEventListener('click', () => { document.getElementById('settingsOverlay').style.display = 'none'; });

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
  saveSessionToStorage(); 
});

document.getElementById('autoHideToggle').addEventListener('change', (e) => localStorage.setItem('autoHide', e.target.checked));
document.getElementById('fillGraphToggle').addEventListener('change', (e) => localStorage.setItem('fillGraph', e.target.checked));

document.getElementById('customPathInput').addEventListener('change', (e) => {
  window.api.setCustomPath(e.target.value.trim());
});

// NEW: Safely deletes the graph and session data for the CURRENT account only
document.getElementById('resetDataBtn').addEventListener('click', () => {
  if (activePuuid && confirm("Are you sure you want to permanently wipe the graph and session history for THIS account?")) {
    localStorage.removeItem(`lpHistory_${activePuuid}`);
    localStorage.removeItem(`session_${activePuuid}`);
    location.reload(); 
  }
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
    saveSessionToStorage(); 
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

  // --- THE MULTI-ACCOUNT NAMESPACE SWITCHER ---
  if (activePuuid !== data.puuid) {
    activePuuid = data.puuid;
    localStorage.setItem('activeAccountPuuid', activePuuid); // Let graph.html know who is playing!
    
    // Pull this specific account's history folder
    lpHistory = JSON.parse(localStorage.getItem(`lpHistory_${activePuuid}`)) || [];
    
    // Wipe current session and pull this specific account's session folder
    session = { active: false, startTime: null, startAbsoluteLp: 0, lastAbsoluteLp: 0, wins: 0, losses: 0, seenMatchIds: new Set(), estimatedWinGain: 20 };
    if (localStorage.getItem('saveSession') === 'true') {
      const savedSessionData = localStorage.getItem(`session_${activePuuid}`);
      if (savedSessionData) {
        try {
          const parsed = JSON.parse(savedSessionData);
          session.active = parsed.active;
          session.startTime = Date.now() - parsed.elapsedMs;
          session.startAbsoluteLp = parsed.startAbsoluteLp;
          session.lastAbsoluteLp = parsed.lastAbsoluteLp;
          session.wins = parsed.wins;
          session.losses = parsed.losses;
          session.seenMatchIds = new Set(parsed.seenMatchIds); 
          session.estimatedWinGain = parsed.estimatedWinGain;
        } catch(e) {}
      }
    }
  }

  const tierParts = data.tier.split(' ');
  const tierName = tierParts[0] || 'GOLD';
  const division = tierParts[1] || 'IV';

  if (!session.active) {
    session.active = true;
    session.startTime = Date.now();
    session.startAbsoluteLp = data.absoluteLp;
    session.lastAbsoluteLp = data.absoluteLp;
    data.recentGames.forEach(g => session.seenMatchIds.add(g.matchId));

    if (lpHistory.length === 0 || lpHistory[lpHistory.length - 1].absoluteLp !== data.absoluteLp) {
      lpHistory.push({ lp: data.absoluteLp, label: `${data.tier} ${data.lp}LP`, isNewSession: true, delta: 0, tierName: tierName });
      localStorage.setItem(`lpHistory_${activePuuid}`, JSON.stringify(lpHistory));
    }
  } else {
    data.recentGames.forEach(game => {
      if (!session.seenMatchIds.has(game.matchId)) {
        session.seenMatchIds.add(game.matchId);
        if (game.win) session.wins++;
        else session.losses++;
      }
    });

    const lpDelta = data.absoluteLp - session.lastAbsoluteLp;
    if (lpDelta !== 0) {
      if (lpDelta > 0 && data.recentGames[0]?.win) session.estimatedWinGain = lpDelta;
      
      lpHistory.push({ lp: data.absoluteLp, label: `${data.tier} ${data.lp}LP`, isNewSession: false, delta: lpDelta, tierName: tierName });
      localStorage.setItem(`lpHistory_${activePuuid}`, JSON.stringify(lpHistory));
      session.lastAbsoluteLp = data.absoluteLp;
    }
  }

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

  document.getElementById('tier').textContent = data.tier;
  document.getElementById('lp').textContent = `${data.lp} LP`;
  document.getElementById('bar').style.width = `${data.lp}%`;
  document.getElementById('percentLabel').textContent = `${Math.round(data.lp)}%`;

  const nextTierMap = { BRONZE: 'SILVER', SILVER: 'GOLD', GOLD: 'PLATINUM', PLATINUM: 'DIAMOND', DIAMOND: 'MASTER' };
  document.getElementById('leftLabel').textContent = `${tierName} IV`;
  document.getElementById('rightLabel').textContent = `${nextTierMap[tierName.toUpperCase()] || tierName} IV`;

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

let ddragonVersion = '14.4.1'; 
fetch('https://ddragon.leagueoflegends.com/api/versions.json')
  .then(res => res.json())
  .then(versions => { ddragonVersion = versions[0]; });

updateTracker();

let matchFoundTime = null;

async function waitForRiotServer(attempts = 0) {
  if (attempts > 60) { matchFoundTime = null; return; }

  const res = await window.api.autoDetect();
  if (res.success && res.data) {
    const latestMatch = res.data.recentGames[0];
    const isNewMatch = latestMatch && !session.seenMatchIds.has(latestMatch.matchId);
    const lpChanged = res.data.absoluteLp !== session.lastAbsoluteLp;

    if (isNewMatch) {
      if (!matchFoundTime) matchFoundTime = Date.now();
      if (lpChanged || (Date.now() - matchFoundTime > 90000)) {
        updateTracker(); 
        matchFoundTime = null;
        return; 
      }
    }
  }
  setTimeout(() => waitForRiotServer(attempts + 1), 10000);
}

document.getElementById('graphBtn').addEventListener('click', () => window.api.openGraph());

let lastPhase = "None";
setInterval(async () => {
  try {
    const currentPhase = await window.api.getGameflow();
    const isAutoHideEnabled = localStorage.getItem('autoHide') !== 'false'; 
    const graphBtn = document.getElementById('graphBtn');
    
    if (currentPhase === "InProgress") {
      graphBtn.style.display = 'none'; 
      window.api.closeGraph();         
    } else {
      graphBtn.style.display = 'block'; 
    }
    
    if (isAutoHideEnabled && lastPhase !== currentPhase) {
      if (currentPhase === "InProgress") window.api.setVisibility(false);
      else if (lastPhase === "InProgress") window.api.setVisibility(true); 
    }

    if (lastPhase === "InProgress" && currentPhase !== "InProgress") waitForRiotServer(); 
    lastPhase = currentPhase;
  } catch (e) {
    if (lastPhase === "InProgress") {
      const isAutoHideEnabled = localStorage.getItem('autoHide') !== 'false';
      if (isAutoHideEnabled) window.api.setVisibility(true); 
      waitForRiotServer();
    }
    lastPhase = "None"; 
  }
}, 5000);