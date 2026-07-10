const fs = require('fs');
const path = require('path');
const https = require('https');

const validPlatforms = ['euw1', 'eun1', 'na1', 'kr', 'br1', 'la1', 'la2', 'oc1', 'ru', 'tr1', 'jp1', 'ph2', 'sg2', 'th2', 'tw2', 'vn2'];
const platformToRegion = (p) => ['euw1','eun1','ru','tr1'].includes(p) ? 'europe' : ['na1','br1','la1','la2','oc1'].includes(p) ? 'americas' : 'asia';

function requestJson(url, authHeader = null, isLocal = false) {
  return new Promise((resolve, reject) => {
    const safeApiKey = String(process.env.RIOT_API_KEY || '').trim();
    const options = {
      headers: authHeader || { 'X-Riot-Token': safeApiKey, 'User-Agent': 'Mozilla/5.0' },
      rejectUnauthorized: !isLocal
    };
    
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } 
          catch(e) { reject(new Error(`Failed to parse Riot JSON response from ${url}`)); }
        } else {
          reject(new Error(`HTTP ${res.statusCode} on ${url}`));
        }
      });
    }).on('error', err => reject(new Error(`Network Error: ${err.message}`)));
  });
}

function getLocalClient() {
  const paths = [
    'C:\\Riot Games\\League of Legends\\lockfile',
    'D:\\Riot Games\\League of Legends\\lockfile',
    process.env.PROGRAMFILES + '\\Riot Games\\League of Legends\\lockfile'
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      const [name, pid, port, password, protocol] = fs.readFileSync(p, 'utf8').trim().split(':');
      if (name === 'LeagueClient') return { port, password };
    }
  }
  throw new Error("League Client not found. Please open the game.");
}

async function detectLocalPlayer() {
  const lockfile = getLocalClient();
  const auth = { 'Authorization': `Basic ${Buffer.from(`riot:${lockfile.password}`).toString('base64')}` };
  return requestJson(`https://127.0.0.1:${lockfile.port}/lol-summoner/v1/current-summoner`, auth, true);
}

// NEW: Zero-Rate-Limit Local Game State Checker
async function getGameflowPhase() {
  try {
    const lockfile = getLocalClient();
    const auth = { 'Authorization': `Basic ${Buffer.from(`riot:${lockfile.password}`).toString('base64')}` };
    return await requestJson(`https://127.0.0.1:${lockfile.port}/lol-gameflow/v1/gameflow-phase`, auth, true);
  } catch(e) {
    return "None"; // If the game is closed, return None
  }
}

async function fetchPlayerStats(localPlayer, preferredPlatform = 'euw1') {
  const platform = preferredPlatform;
  const region = platformToRegion(platform);
  
  const gameName = encodeURIComponent(localPlayer.gameName || localPlayer.displayName.split('#')[0]);
  const tagLine = encodeURIComponent(localPlayer.tagLine || (localPlayer.displayName.includes('#') ? localPlayer.displayName.split('#')[1] : platform.toUpperCase()));

  const accountUrl = `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${gameName}/${tagLine}`;
  const accountData = await requestJson(accountUrl);
  const realPuuid = accountData.puuid;

  const rankedUrl = `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${realPuuid}`;
  const entries = await requestJson(rankedUrl);
  const soloQ = entries.find(e => e.queueType === 'RANKED_SOLO_5x5') || entries[0] || null;

  const matchIdsUrl = `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${realPuuid}/ids?start=0&count=5&queue=420`;
  const matchIds = await requestJson(matchIdsUrl);
  const matches = await Promise.all(matchIds.map(id => requestJson(`https://${region}.api.riotgames.com/lol/match/v5/matches/${id}`)));

  return { soloQ, matches, realPuuid };
}

module.exports = { detectLocalPlayer, fetchPlayerStats, getGameflowPhase };