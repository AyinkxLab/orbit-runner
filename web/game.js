/* ORBIT RUNNER - mobile/web version (port of orbit_runner.py)
 *
 * Controls
 *   Touch:    swipe UP = outer ring, swipe DOWN = inner ring, TAP = reverse
 *   Keyboard: Up/W, Down/S, Space  (same as the desktop version)
 *             P = pause, M = mute, V = ship, 1/2/3 = contract, D = daily
 *
 * Ads: the game only talks to `ads` (an AdProvider). MockAdProvider fakes a
 * 5-second rewarded video. To ship real ads, see the AdMobProvider sketch.
 */
"use strict";

const W = 720, H = 1280, CX = W / 2, CY = H / 2 + 40;
const RINGS = [130, 215, 300];
const RING_NAMES = ["INNER", "MID", "OUTER"];
const SHIELD_COST = 25;
const CONTINUE_BASE_COST = 5;
const CONTINUE_MAX_COST = 320;
const GEM_AD_REWARD = 5;
const GEM_MISSION_REWARD = 10;
const MAX_GEMS = 1000000000;
const COMBO_TIME = 6;
const MAGNET_TIME = 8;
const SLOW_TIME = 6;
const MAX_COMBO = 8;
const MAX_ADS = 4;
const POWERUP_TIME = 10;
const TAU = Math.PI * 2;
const LEVEL_NAMES = ["DUST", "EMBER", "FLARE", "CORONA", "NOVA", "PULSAR", "QUASAR", "VOID"];

// Persistent meta-progression. Unlock thresholds are lifetime crystals.
const SHIPS = [
  { id: "scout", name: "SCOUT", desc: "Balanced", unlock: 0, ringSpeed: 1, comboTime: 1,
    magnetBonus: 0, crystalMul: 1, scoreMul: 1, startShield: false },
  { id: "warden", name: "WARDEN", desc: "Starts with a shield - longer combo", unlock: 250, ringSpeed: 1,
    comboTime: 1.35, magnetBonus: 0, crystalMul: 1, scoreMul: 0.95, startShield: true },
  { id: "drifter", name: "DRIFTER", desc: "Wider magnet - faster ring shifts", unlock: 700, ringSpeed: 1.18,
    comboTime: 1, magnetBonus: 50, crystalMul: 1, scoreMul: 1, startShield: false },
  { id: "gambler", name: "GAMBLER", desc: "Crystals worth 2x - no shield", unlock: 1500, ringSpeed: 1,
    comboTime: 1, magnetBonus: 0, crystalMul: 2, scoreMul: 0.9, startShield: false },
];

const CONTRACTS = [
  { id: "standard", name: "STANDARD", desc: "Classic orbit", scoreMul: 1, crystalMul: 1, meteorMul: 1, flareRate: 0 },
  { id: "blaze", name: "BLAZE", desc: "Flares every ~9s - +40% score", scoreMul: 1.4, crystalMul: 1, meteorMul: 1, flareRate: 9 },
  { id: "void", name: "VOID", desc: "Meteors +25% faster - 2x crystals", scoreMul: 1, crystalMul: 2, meteorMul: 1.25, flareRate: 0 },
];

const BIOMES = [
  { id: "nebula", name: "NEBULA", star: ["#501e0a", "#b45014", "#ffb43c"], ring: "#7a7ad0", ringDim: "#3c3c6e",
    tint: "rgba(48,22,92,0.20)", meteorSpeed: 1, gemRate: 1, scoreMul: 1, flareRate: 1 },
  { id: "pulsar", name: "PULSAR", star: ["#0a2a50", "#146ab4", "#3cc8ff"], ring: "#3c9edc", ringDim: "#244a6a",
    tint: "rgba(14,58,120,0.20)", meteorSpeed: 1.12, gemRate: 0.9, scoreMul: 1.10, flareRate: 1.15 },
  { id: "ember", name: "RED GIANT", star: ["#50100a", "#b43414", "#ff7a3c"], ring: "#b4503c", ringDim: "#5a2a24",
    tint: "rgba(96,20,10,0.18)", meteorSpeed: 0.94, gemRate: 1.20, scoreMul: 1, flareRate: 0.95 },
  { id: "void", name: "VOID", star: ["#140a28", "#3a1a68", "#9a6aff"], ring: "#7a5ac8", ringDim: "#3a2a5a",
    tint: "rgba(60,20,96,0.20)", meteorSpeed: 1.06, gemRate: 1, scoreMul: 1.15, flareRate: 1.05 },
  { id: "ice", name: "ICE FIELD", star: ["#0a2a38", "#14708a", "#6ae8ff"], ring: "#4aa8c8", ringDim: "#24505a",
    tint: "rgba(10,60,80,0.20)", meteorSpeed: 0.88, gemRate: 1.10, scoreMul: 1, flareRate: 1 },
];

const METEOR_TYPES = [
  { id: "normal", weight: 66, size: 1, speed: 1, near: 1, color: "#8c6e64", shade: "#5a463c" },
  { id: "iron", weight: 8, size: 1.35, speed: 0.90, near: 2, color: "#8a7a6a", shade: "#4a3e34" },
  { id: "ice", weight: 8, size: 0.95, speed: 0.65, near: 1, color: "#6a9ab0", shade: "#3a5a6a" },
  { id: "gold", weight: 7, size: 0.80, speed: 1.05, near: 1, color: "#c8a04a", shade: "#7a5a20" },
  { id: "volatile", weight: 6, size: 1.05, speed: 0.95, near: 1, color: "#a05a3c", shade: "#602a1a" },
  { id: "splitter", weight: 5, size: 1.10, speed: 0.90, near: 1, color: "#7a8a6a", shade: "#4a5a3a" },
];

const GEM_PACKS = [
  { id: "pocket", name: "POCKET", gems: 80, price: "$0.99", productId: "orbit_gems_80" },
  { id: "pouch", name: "POUCH", gems: 240, price: "$2.99", productId: "orbit_gems_240" },
  { id: "vault", name: "VAULT", gems: 650, price: "$6.99", productId: "orbit_gems_650" },
  { id: "treasury", name: "TREASURY", gems: 1800, price: "$14.99", productId: "orbit_gems_1800" },
];

const SHOP_ITEMS = [
  { id: "trail_default", type: "trail", name: "Ion Trail", cost: 0, value: "#78c8ff" },
  { id: "trail_ember", type: "trail", name: "Ember Trail", cost: 120, value: "#ff8a3c" },
  { id: "trail_void", type: "trail", name: "Void Trail", cost: 260, value: "#b48cff" },
  { id: "trail_gold", type: "trail", name: "Comet Trail", cost: 500, value: "#ffd45a" },
  { id: "skin_scout", type: "skin", name: "Scout Frame", cost: 0, value: "scout" },
  { id: "skin_interceptor", type: "skin", name: "Interceptor", cost: 300, value: "interceptor" },
  { id: "skin_stealth", type: "skin", name: "Stealth", cost: 450, value: "stealth" },
  { id: "skin_rescue", type: "skin", name: "Rescue", cost: 600, value: "rescue" },
  { id: "title_rookie", type: "title", name: "Rookie", cost: 0, value: "ROOKIE" },
  { id: "title_flare", type: "title", name: "Flare Dodger", cost: 150, value: "FLARE DODGER" },
  { id: "title_surge", type: "title", name: "Surge Breaker", cost: 300, value: "SURGE BREAKER" },
  { id: "title_ghost", type: "title", name: "Ghost Chaser", cost: 450, value: "GHOST CHASER" },
  { id: "title_legend", type: "title", name: "Orbit Legend", cost: 900, value: "ORBIT LEGEND" },
];

const SKIN_LIVERIES = {
  scout: { hull: "#e8eef8", wing: "#9fb3cc", trim: "#78d8ff", accent: "#ff6a6a" },
  interceptor: { hull: "#eef6ff", wing: "#c0d4e8", trim: "#78d8ff", accent: "#ff6a6a" },
  stealth: { hull: "#aab4c8", wing: "#4a5568", trim: "#b48cff", accent: "#78ff8c" },
  rescue: { hull: "#fff4d8", wing: "#d9b45a", trim: "#ffd45a", accent: "#ff8a3c" },
};

const MISSION_POOL = [
  { id: "run_crystals", text: "Crystals in one run", metric: "run_crystals", target: 15, reward: 30 },
  { id: "run_near", text: "Near-misses in one run", metric: "run_near", target: 8, reward: 35 },
  { id: "run_flares", text: "Flares dodged in one run", metric: "run_flares", target: 2, reward: 40 },
  { id: "run_level", text: "Reach level", metric: "run_level", target: 4, reward: 40 },
  { id: "run_combo", text: "Max combo", metric: "run_maxcombo", target: 6, reward: 35 },
  { id: "run_score", text: "Score in one run", metric: "run_score", target: 1500, reward: 45 },
  { id: "total_crystals", text: "Crystals collected", metric: "total_crystals", target: 40, reward: 25 },
  { id: "total_runs", text: "Runs completed", metric: "total_runs", target: 5, reward: 25 },
  { id: "total_flares", text: "Flares dodged", metric: "total_flares", target: 5, reward: 50 },
  { id: "total_near", text: "Near-misses", metric: "total_near", target: 25, reward: 40 },
  { id: "total_bosses", text: "Corona Surges cleared", metric: "total_bosses", target: 2, reward: 60 },
  { id: "total_powerups", text: "Power-ups collected", metric: "total_powerups", target: 6, reward: 35 },
];

const CONFIG = (typeof window !== "undefined" && window.ORBIT_CONFIG) || {};

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pad2 = n => String(n).padStart(2, "0");
const dateKey = (d = new Date()) => {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};
const weekKey = (d = new Date()) => {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad2(week)}`;
};
const hashStr = s => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const mulberry32 = seed => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const seededPick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ------------------------------------------------------------ persistence --
// Campaign navigation: destinations reuse existing biome IDs and classic-run rules.
const CAMPAIGN_SECTORS = [
  { id: "sol-frontier", name: "SOL FRONTIER", subtitle: "THE FIRST BEACON", biome: "nebula",
    description: "A quiet frontier. An ancient beacon has begun transmitting again.",
    objective: "Complete a run here to chart the frontier.", unlockAfter: null, position: [0.16, 0.22] },
  { id: "ember-reach", name: "EMBER REACH", subtitle: "SIGNAL IN THE FIRE", biome: "ember",
    description: "A red giant illuminates the last known route of a missing expedition.",
    objective: "Complete Sol Frontier to open this route.", unlockAfter: "sol-frontier", position: [0.39, 0.36] },
  { id: "silent-expanse", name: "THE SILENT EXPANSE", subtitle: "FROZEN ECHOES", biome: "ice",
    description: "Frozen stations drift beneath an atmosphere of blue ice and static.",
    objective: "Complete Ember Reach to open this route.", unlockAfter: "ember-reach", position: [0.64, 0.19] },
  { id: "void-crown", name: "THE VOID CROWN", subtitle: "EDGE OF THE UNKNOWN", biome: "void",
    description: "A dark anomaly bends starlight around the source of the signal.",
    objective: "Complete the Silent Expanse to open this route.", unlockAfter: "silent-expanse", position: [0.83, 0.39] },
];
const STORY_ENTRIES = [
  { id: "beacon-awake", sectorId: "sol-frontier", title: "The Beacon Wakes", classification: "FIRST CONTACT",
    teaser: "A signal older than the frontier itself.", body: "The beacon did not wake by accident. Its repeating pulse predates every mapped station in Sol Frontier, yet its power source is still warm. Someone—or something—has been waiting for a receiver." },
  { id: "ember-expedition", sectorId: "ember-reach", title: "The Last Expedition", classification: "RECOVERED TRANSMISSION",
    teaser: "A missing crew left one message behind.", body: "The expedition followed the beacon's pulse into Ember Reach. Their final transmission mentions a second signal beneath the red giant's magnetic storms. The crew's route ends at the edge of a region no chart records." },
  { id: "silent-echo", sectorId: "silent-expanse", title: "An Echo in the Ice", classification: "BLACK-BOX FRAGMENT",
    teaser: "Something answered from beneath the frozen stations.", body: "The black box records a response to the beacon—three tones, repeated from far beyond the ice field. The expedition did not build the signal. They found its trail, and the trail points inward." },
  { id: "void-origin", sectorId: "void-crown", title: "The Signal's Origin", classification: "FRONTIER ARCHIVE",
    teaser: "The source lies beyond the mapped systems.", body: "At the edge of the Void Crown, the signal resolves into a navigational pattern. The four sectors are not separate destinations; together they form a route. The beacon was never a warning. It was a map." },
];
const EXPLORATION_OBJECTIVES = [
  { id: "sol-signal", sectorId: "sol-frontier", title: "Trace the Beacon", detail: "Triangulate the repeating signal across the orbital debris.", reward: 20, color: "#78c8ff" },
  { id: "sol-wreckage", sectorId: "sol-frontier", title: "Survey the Wreckage", detail: "Scan a derelict relay drifting beyond the inner ring.", reward: 25, color: "#a7b8d8" },
  { id: "sol-minerals", sectorId: "sol-frontier", title: "Map Crystal Veins", detail: "Record the mineral deposits beneath the dust clouds.", reward: 30, color: "#8dffce" },
  { id: "ember-core", sectorId: "ember-reach", title: "Read the Star", detail: "Measure the red giant's unstable magnetic pulse.", reward: 25, color: "#ff874f" },
  { id: "ember-flight", sectorId: "ember-reach", title: "Find Flight Recorder", detail: "Recover telemetry from the missing expedition.", reward: 30, color: "#ffd783" },
  { id: "ember-ruins", sectorId: "ember-reach", title: "Chart the Ruins", detail: "Map the remains of an abandoned orbital station.", reward: 35, color: "#ffb49a" },
  { id: "ice-echo", sectorId: "silent-expanse", title: "Listen Beneath the Ice", detail: "Separate a faint reply from the sector's static.", reward: 30, color: "#8deaff" },
  { id: "ice-station", sectorId: "silent-expanse", title: "Survey the Station", detail: "Scan the frozen station's sealed research wing.", reward: 35, color: "#bcecff" },
  { id: "ice-fragment", sectorId: "silent-expanse", title: "Recover Black Box", detail: "Locate the fragment that recorded the first reply.", reward: 40, color: "#9fd5ff" },
  { id: "void-lens", sectorId: "void-crown", title: "Measure the Anomaly", detail: "Map the distortion at the edge of known space.", reward: 35, color: "#b48cff" },
  { id: "void-pattern", sectorId: "void-crown", title: "Decode the Pattern", detail: "Compare the anomaly's pulses with the beacon.", reward: 40, color: "#d9c4ff" },
  { id: "void-origin", sectorId: "void-crown", title: "Find the Source", detail: "Pinpoint the final coordinate in the signal map.", reward: 50, color: "#8dffce" },
];
const freshCampaign = () => ({ version: 3, completed: [], selected: "sol-frontier", discoveries: [], exploration: {
  "sol-frontier": [], "ember-reach": [], "silent-expanse": [], "void-crown": [],
} });
function sanitizeCampaign(raw) {
  const out = freshCampaign();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const requested = new Set(Array.isArray(raw.completed) ? raw.completed.filter(id =>
    typeof id === "string" && CAMPAIGN_SECTORS.some(s => s.id === id)) : []);
  for (const sector of CAMPAIGN_SECTORS) {
    if (requested.has(sector.id) && (!sector.unlockAfter || out.completed.includes(sector.unlockAfter)))
      out.completed.push(sector.id);
  }
  if (CAMPAIGN_SECTORS.some(s => s.id === raw.selected)) out.selected = raw.selected;
  const knownDiscoveries = new Set(Array.isArray(raw.discoveries) ? raw.discoveries.filter(id =>
    typeof id === "string" && STORY_ENTRIES.some(entry => entry.id === id)) : []);
  // Completed sectors from older saves receive their corresponding story entries during migration.
  for (const entry of STORY_ENTRIES) {
    if (out.completed.includes(entry.sectorId) || knownDiscoveries.has(entry.id)) {
      if (out.completed.includes(entry.sectorId)) out.discoveries.push(entry.id);
    }
  }
  const rawExploration = raw.exploration && typeof raw.exploration === "object" && !Array.isArray(raw.exploration)
    ? raw.exploration : {};
  for (const sector of CAMPAIGN_SECTORS) {
    const validIds = new Set(EXPLORATION_OBJECTIVES.filter(o => o.sectorId === sector.id).map(o => o.id));
    const claimed = Array.isArray(rawExploration[sector.id]) ? rawExploration[sector.id] : [];
    out.exploration[sector.id] = [...new Set(claimed.filter(id => typeof id === "string" && validIds.has(id)))];
  }
  return out;
}

const Save = {
  key: "orbit_runner_save",
  fresh() {
    return {
      best: 0, bank: 0, gems: 10, muted: false, lifetime: 0,
      campaign: freshCampaign(),
      ships: ["scout"], ship: "scout", contract: "standard",
      missions: [], missionDay: "", missionsDone: 0,
      daily: { date: "", best: 0 }, ranked: { week: "", best: 0 },
      profile: null, ghost: null,
      tutorial: { done: false, step: 0 },
      cosmetics: {
        owned: ["trail_default", "skin_scout", "title_rookie"],
        equipped: { trail: "trail_default", skin: "skin_scout", title: "title_rookie" },
      },
      settings: { colorblind: false, reducedMotion: false, lowFx: false, music: true, sfx: true },
      analytics: { runs: 0, deathsMeteor: 0, deathsFlare: 0, maxLevel: 0, ads: 0, boardOpens: 0, installClicks: 0,
        gemPurchases: 0, gemAds: 0 },
      league: { week: "", tier: 0, leagueId: "", rank: 0 },
      stats: { runs: 0, flares: 0, near: 0, bosses: 0, powerups: 0 },
    };
  },
  load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(this.key)); } catch (e) { /* unavailable/corrupt */ }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) raw = {};
    const out = this.fresh();
    out.campaign = sanitizeCampaign(raw.campaign);
    const num = v => (typeof v === "number" && Number.isFinite(v) && v >= 0) ? Math.floor(v) : 0;

    out.best = num(raw.best); out.bank = num(raw.bank); out.muted = raw.muted === true;
    out.lifetime = num(raw.lifetime);
    // Gems are premium continues. Old continue tokens convert at 5 gems each;
    // brand-new and pre-gem saves also get a small welcome balance.
    out.gems = "gems" in raw ? Math.min(MAX_GEMS, num(raw.gems)) : 10 + 5 * Math.min(3, num(raw.continueTokens));
    // migrate pre-v3 saves: approximate lifetime crystals from the old score/bank
    if (!("lifetime" in raw)) out.lifetime = Math.max(out.bank, Math.floor(out.best / 10));
    if (Array.isArray(raw.ships)) {
      out.ships = raw.ships.filter(id => SHIPS.some(s => s.id === id));
      if (!out.ships.includes("scout")) out.ships.unshift("scout");
    }
    if (SHIPS.some(s => s.id === raw.ship)) out.ship = raw.ship;
    if (!out.ships.includes(out.ship)) out.ship = "scout";
    if (CONTRACTS.some(c => c.id === raw.contract)) out.contract = raw.contract;
    out.missionsDone = num(raw.missionsDone);
    if (raw.daily && typeof raw.daily === "object") {
      out.daily.date = typeof raw.daily.date === "string" ? raw.daily.date : "";
      out.daily.best = num(raw.daily.best);
    }
    if (raw.ranked && typeof raw.ranked === "object") {
      out.ranked.week = typeof raw.ranked.week === "string" ? raw.ranked.week : "";
      out.ranked.best = num(raw.ranked.best);
    }
    if (raw.profile && typeof raw.profile === "object" && raw.profile.provider === "facebook" &&
        typeof raw.profile.id === "string" && typeof raw.profile.name === "string") {
      out.profile = {
        provider: "facebook",
        id: raw.profile.id.slice(0, 80),
        name: raw.profile.name.slice(0, 60),
        picture: typeof raw.profile.picture === "string" ? raw.profile.picture.slice(0, 500) : "",
      };
    }
    if (raw.tutorial && typeof raw.tutorial === "object") {
      out.tutorial.done = raw.tutorial.done === true;
      out.tutorial.step = Math.min(5, num(raw.tutorial.step));
    }
    if (raw.cosmetics && typeof raw.cosmetics === "object") {
      const ids = new Set(SHOP_ITEMS.map(i => i.id));
      const owned = Array.isArray(raw.cosmetics.owned) ? raw.cosmetics.owned.filter(id => ids.has(id)) : [];
      for (const id of ["trail_default", "skin_scout", "title_rookie"]) if (!owned.includes(id)) owned.push(id);
      out.cosmetics.owned = [...new Set(owned)];
      const eq = raw.cosmetics.equipped;
      if (eq && typeof eq === "object") {
        for (const type of ["trail", "skin", "title"]) {
          const item = SHOP_ITEMS.find(i => i.id === eq[type] && i.type === type);
          if (item && out.cosmetics.owned.includes(item.id)) out.cosmetics.equipped[type] = item.id;
        }
      }
    }
    if (raw.settings && typeof raw.settings === "object") {
      for (const key of Object.keys(out.settings)) {
        if (typeof raw.settings[key] === "boolean") out.settings[key] = raw.settings[key];
      }
    }
    if (raw.analytics && typeof raw.analytics === "object") {
      for (const key of Object.keys(out.analytics)) out.analytics[key] = num(raw.analytics[key]);
    }
    if (raw.league && typeof raw.league === "object") {
      out.league.week = typeof raw.league.week === "string" ? raw.league.week : "";
      out.league.tier = num(raw.league.tier);
      out.league.leagueId = typeof raw.league.leagueId === "string" ? raw.league.leagueId.slice(0, 80) : "";
      out.league.rank = num(raw.league.rank);
    }
    if (raw.ghost && Array.isArray(raw.ghost.samples)) {
      const samples = raw.ghost.samples
        .filter(s => Array.isArray(s) && s.length >= 3 && s.slice(0, 3).every(Number.isFinite))
        .slice(0, 2000);
      if (samples.length) out.ghost = { score: num(raw.ghost.score), samples };
    }
    if (raw.stats && typeof raw.stats === "object") {
      for (const k of Object.keys(out.stats)) out.stats[k] = num(raw.stats[k]);
    }
    if (typeof raw.missionDay === "string") out.missionDay = raw.missionDay;
    if (Array.isArray(raw.missions)) {
      out.missions = raw.missions.map(m => {
        const template = m && MISSION_POOL.find(t => t.id === m.id);
        if (!template) return null;
        return { ...template, progress: num(m.progress), completed: m.completed === true };
      }).filter(Boolean).slice(0, 3);
    }
    return out;
  },
  write(d) { try { localStorage.setItem(this.key, JSON.stringify(d)); } catch (e) {} },
};

// --------------------------------------------------------- social / boards --
const Social = {
  token: null,
  get configured() { return !!(CONFIG.facebookAppId && String(CONFIG.facebookAppId).trim()); },
  async loadSdk() {
    if (typeof window === "undefined" || typeof document === "undefined")
      throw new Error("Facebook login is only available in the browser.");
    if (window.FB) return;
    await new Promise((resolve, reject) => {
      const existing = document.getElementById("facebook-jssdk");
      if (existing) { existing.addEventListener("load", resolve); existing.addEventListener("error", reject); return; }
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.async = true; script.defer = true;
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load the Facebook SDK."));
      document.head.appendChild(script);
    });
    window.FB.init({ appId: CONFIG.facebookAppId, cookie: true, xfbml: false, version: "v20.0" });
  },
  async login(withFriends = false) {
    if (!this.configured) throw new Error("Facebook login is not configured. Add facebookAppId to web/config.js.");
    await this.loadSdk();
    const scope = withFriends ? "public_profile,user_friends" : "public_profile";
    const auth = await new Promise(resolve => window.FB.login(resolve, { scope, return_scopes: true }));
    if (!auth || !auth.authResponse) throw new Error("Facebook login was cancelled.");
    this.token = auth.authResponse.accessToken;
    const me = await new Promise((resolve, reject) => {
      window.FB.api("/me", { fields: "id,name,picture.type(large)" }, result => {
        if (!result || result.error) reject(new Error("Could not read your Facebook profile."));
        else resolve(result);
      });
    });
    return {
      provider: "facebook",
      id: String(me.id || ""),
      name: String(me.name || "Player"),
      picture: (me.picture && me.picture.data && me.picture.data.url) || "",
    };
  },
  logout() { this.token = null; },
};

const Leaderboard = {
  localKey: "orbit_runner_boards_v1",
  apiBase() { return String(CONFIG.apiBase || "").replace(/\/+$/, ""); },
  localRead() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.localKey));
      if (raw && typeof raw === "object") return raw;
    } catch (e) { /* unavailable */ }
    return {};
  },
  localWrite(data) { try { localStorage.setItem(this.localKey, JSON.stringify(data)); } catch (e) {} },
  clearLocal() { try { localStorage.removeItem(this.localKey); } catch (e) {} },
  boardKey(run) {
    if (run.mode === "daily") return `daily:${run.date || dateKey()}`;
    return `ranked:${run.week || weekKey()}`;
  },
  localSubmit(run, name) {
    const boards = this.localRead();
    const key = this.boardKey(run);
    const entry = {
      name: name || "YOU",
      score: Math.floor(run.score),
      time: Math.round(run.time || 0),
      date: run.date || dateKey(),
      week: run.week || "",
      title: run.title || "",
      you: true,
    };
    let list = Array.isArray(boards[key]) ? boards[key].filter(e => !e.you) : [];
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    list = list.slice(0, CONFIG.leaderboardSize || 20);
    boards[key] = list;
    this.localWrite(boards);
    const rank = list.indexOf(entry) + 1;
    return { source: "local", entries: list, you: { rank: rank || null, score: entry.score }, rank: rank || null, total: list.length };
  },
  localFetch(scope, opts = {}) {
    const boards = this.localRead();
    const key = scope === "daily" ? `daily:${opts.date || dateKey()}` : `ranked:${opts.week || weekKey()}`;
    const list = Array.isArray(boards[key]) ? boards[key] : [];
    const you = list.find(e => e.you) || null;
    return { source: "local", entries: list, you: you ? { rank: list.indexOf(you) + 1, score: you.score } : null };
  },
  async sendEvents(events, profile) {
    if (!this.apiBase() || !profile || !Social.token) return;
    try {
      await fetch(`${this.apiBase()}/api/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "facebook", accessToken: Social.token, events }),
      });
    } catch (e) { /* analytics must never break the game */ }
  },
  async startRun(mode, week, date) {
    if (!this.apiBase() || !Social.token) return null;
    try {
      const res = await fetch(`${this.apiBase()}/api/runs/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "facebook", accessToken: Social.token, mode, week, date }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      return data.runToken || null;
    } catch (e) {
      return null;
    }
  },
  async fetchGhost(scope, week = weekKey(), date = dateKey()) {
    if (!this.apiBase()) return null;
    try {
      const q = new URLSearchParams({ scope, week, date });
      const res = await fetch(`${this.apiBase()}/api/ghost?${q.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      return data;
    } catch (e) {
      return null;
    }
  },
  async submit(run, profile) {
    const local = this.localSubmit(run, profile ? profile.name : "YOU");
    if (!this.apiBase()) return local;
    if (!profile || !Social.token) {
      return { ...local, error: "Connect Facebook to submit to the global board." };
    }
    try {
      const res = await fetch(`${this.apiBase()}/api/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "facebook", accessToken: Social.token, run }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      return { source: "remote", ...data };
    } catch (e) {
      return { ...local, error: e.message || "Could not submit score." };
    }
  },
  async fetch(scope, opts = {}) {
    if (!this.apiBase()) return this.localFetch(scope, opts);
    try {
      const q = new URLSearchParams({
        scope, week: opts.week || weekKey(), date: opts.date || dateKey(),
        limit: String(CONFIG.leaderboardSize || 20),
      });
      const headers = {};
      if ((scope === "friends" || scope === "league") && Social.token) {
        headers.Authorization = `Bearer ${Social.token}`;
      }
      const res = await fetch(`${this.apiBase()}/api/leaderboard?${q.toString()}`, { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      return { source: "remote", ...data };
    } catch (e) {
      return { ...this.localFetch(scope, opts), error: e.message || "Could not load leaderboard." };
    }
  },
};

// ----------------------------------------------------------------- sound ---
const Sfx = {
  ctx: null,
  master: null,
  muted: false,
  musicEnabled: true,
  sfxEnabled: true,
  isMusic(name) { return name === "beat" || name === "beat2" || name === "arp" || name === "pad"; },
  unlock() {
    const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!this.ctx && AC) this.ctx = new AC();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    if (this.ctx && !this.master) {
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
    }
  },
  tone(freq, ms, vol = 0.2, slide = 0, type = "square") {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.linearRampToValueAtTime(Math.max(40, freq + slide), t + ms / 1000);
    g.gain.setValueAtTime(vol * 0.3, t);
    g.gain.linearRampToValueAtTime(0, t + ms / 1000);
    o.connect(g).connect(this.master || this.ctx.destination);
    o.start(t); o.stop(t + ms / 1000);
  },
  noise(ms, vol = 0.12, cutoff = 1400) {
    if (!this.ctx || this.muted || !this.sfxEnabled) return;
    const t = this.ctx.currentTime, rate = this.ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * ms / 1000));
    const buffer = this.ctx.createBuffer(1, length, rate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) channel[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    source.buffer = buffer;
    filter.type = "lowpass"; filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
    source.connect(filter).connect(gain).connect(this.master || this.ctx.destination);
    source.start(t); source.stop(t + ms / 1000);
  },
  play(n, pitch = 1) {
    if (this.muted) return;
    if (this.isMusic(n) ? !this.musicEnabled : !this.sfxEnabled) return;
    const s = { gem: [880, 80, .2, 400], gem2: [1040, 80, .2, 420], gem3: [1240, 90, .2, 460],
      jump: [300, 60, .15, 200], near: [1200, 50, .12, 0],
      die: [200, 500, .35, -170], reward: [523, 300, .25, 520], shield: [400, 200, .25, -200],
      power: [660, 180, .25, 260], flare: [110, 420, .3, -50], warn: [520, 130, .16, -90],
      level: [700, 220, .2, 320], pause: [400, 80, .12, 0], boss: [70, 620, .3, -20],
      beat: [90, 120, .06, 0], beat2: [120, 110, .07, 0],
      arp: [392, 160, .12, 120, "triangle"], pad: [196, 700, .10, 80, "sine"] }[n];
    if (s) this.tone(s[0] * pitch, s[1], s[2], s[3], s[4] || "square");
  },
};
const vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

// ------------------------------------------------------------- ad system ---
class MockAdProvider {
  constructor() {
    this.DURATION = 5; this.showing = false; this.t = 0;
    this.brands = [
      ["GALAXY GRUB", "Snacks that are out of this world.", "#ffaa3c"],
      ["NEBULA NAPS", "Mattresses tested in zero gravity.", "#8c78ff"],
      ["COMET COLA", "Fizz at the speed of light.", "#ff506e"],
      ["STARLIGHT VPN", "Browse privately across 9 galaxies.", "#3cdcb4"],
      ["MOON BOOTS", "Grip that defies gravity.", "#ffd45a"],
      ["ASTEROID INSURANCE", "Because space is full of surprises.", "#78c8ff"],
    ];
  }
  isReady() { return !this.showing; }
  showRewarded(onReward, onClosed) {
    Object.assign(this, { showing: true, t: 0, brand: pick(this.brands), onReward, onClosed });
  }
  finish(rewarded) {
    this.showing = false;
    if (rewarded && this.onReward) this.onReward();
    if (this.onClosed) this.onClosed();
  }
  update(dt) { if (this.showing && (this.t += dt) >= this.DURATION + 0.6) this.finish(true); }
  handleTap(x, y) { if (this.showing && x > W - 140 && y < 140) this.finish(this.t >= this.DURATION); }
  handleKey(k) { if (this.showing && (k === "x" || k === "X" || k === "Escape")) this.finish(this.t >= this.DURATION); }
  draw(c) {
    const [name, slogan, col] = this.brand, t = this.t;
    c.fillStyle = "#0c0a14"; c.fillRect(0, 0, W, H);
    const r = 130 * (1 + 0.08 * Math.sin(t * 6));
    circle(c, W / 2, 470, r, col); circle(c, W / 2, 470, r, "#fff", 5);
    for (let i = 0; i < 8; i++) { const a = t * 2 + i * TAU / 8; circle(c, W / 2 + Math.cos(a) * 210, 470 + Math.sin(a) * 210, 9, col); }
    text(c, "AD - simulated rewarded video", W / 2, 70, 24, "#787890");
    text(c, name, W / 2, 800, 64, "#fff", true);
    text(c, slogan, W / 2, 860, 28, "#c8c8dc");
    c.fillStyle = "#323246"; c.fillRect(110, 960, W - 220, 18);
    c.fillStyle = col; c.fillRect(110, 960, (W - 220) * Math.min(1, t / this.DURATION), 18);
    const left = this.DURATION - t;
    text(c, left > 0 ? `Reward in ${Math.ceil(left)}...` : "Reward earned!", W / 2, 1040, 36, left > 0 ? "#fff" : "#78ff8c", true);
    text(c, "X", W - 70, 85, 56, left > 0 ? "#555" : "#fff", true);
    if (left > 0) text(c, "close = no reward", W - 110, 135, 18, "#555");
  }
}

/* Real rewarded ads through @capacitor-community/admob. The provider is used
 * only when a native AdMob plugin is present and an ad unit id is configured;
 * the browser build falls back to MockAdProvider. The reward is granted from
 * the SDK's reward event, never from a resolved show() promise. */
class AdMobProvider {
  constructor(plugin) {
    this.plugin = plugin;
    this.adId = CONFIG.admobRewardedId;
    this.testing = CONFIG.admobTestMode !== false;
    this.showing = false;
    this.ready = false;
    this.loading = false;
    this.listeners = [];
    this.timer = null;
    this.lastError = "";
    this.init();
  }
  async init() {
    try {
      const p = this.plugin;
      if (CONFIG.admobConsent && p.requestConsentInfo) {
        try {
          const info = await p.requestConsentInfo();
          if (info && info.isConsentFormAvailable && p.showConsentForm) await p.showConsentForm();
        } catch (e) { /* consent is optional for non-EEA test builds */ }
      }
      if (p.initialize) {
        await p.initialize({ initializeForTesting: this.testing });
      }
      await this.load();
    } catch (e) {
      this.lastError = e && e.message ? e.message : String(e);
      this.ready = false;
    }
  }
  isReady() { return this.ready && !this.showing; }
  async load() {
    if (!this.plugin || this.loading || this.showing) return;
    this.loading = true;
    try {
      const prepare = this.plugin.prepareRewardVideoAd || this.plugin.prepareRewardAds;
      if (!prepare) throw new Error("AdMob plugin has no reward prepare method");
      await prepare.call(this.plugin, { adId: this.adId, isTesting: this.testing });
      this.ready = true;
    } catch (e) {
      this.lastError = e && e.message ? e.message : String(e);
      this.ready = false;
    } finally {
      this.loading = false;
    }
  }
  listen(event, fn) {
    if (!this.plugin.addListener) return null;
    try { return this.plugin.addListener(event, fn); } catch (e) { return null; }
  }
  cleanup() {
    for (const handle of this.listeners) {
      try { if (handle && handle.remove) handle.remove(); } catch (e) {}
    }
    this.listeners = [];
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }
  showRewarded(onReward, onClosed) {
    if (!this.isReady()) { onClosed(); return; }
    const p = this.plugin;
    this.showing = true; this.ready = false;
    let finished = false, rewarded = false;
    const reward = () => {
      if (rewarded) return;
      rewarded = true;
      onReward();
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      this.showing = false;
      this.cleanup();
      onClosed();
      this.load();
    };
    this.listeners = [
      this.listen("onRewarded", reward),
      this.listen("onRewardedDismissed", finish),
      this.listen("onRewardedFailedToShow", finish),
      this.listen("onRewardedFailedToLoad", finish),
    ].filter(Boolean);
    // safety net if an SDK version resolves without emitting a dismiss event
    this.timer = setTimeout(finish, 45000);
    try {
      const show = p.showRewardVideoAd || p.showRewardAds;
      if (!show) throw new Error("AdMob plugin has no reward show method");
      Promise.resolve(show.call(p)).catch(() => finish());
    } catch (e) {
      finish();
    }
  }
  update(dt) {
    if (this.ready || this.loading || this.showing) return;
    this.retryT = (this.retryT || 0) - dt;
    if (this.retryT <= 0) { this.retryT = 12; this.load(); }
  }
  handleTap() {}
  handleKey() {}
  draw(c) {
    c.fillStyle = "#07070d"; c.fillRect(0, 0, W, H);
    text(c, "ADVERTISEMENT", W / 2, H / 2 - 20, 26, "#6a6a80", true);
    text(c, "Reward video playing", W / 2, H / 2 + 20, 20, "#454558");
  }
}

function createAdProvider() {
  const plugin = typeof window !== "undefined" && window.Capacitor &&
    window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob;
  if (CONFIG.admobRewardedId && plugin) return new AdMobProvider(plugin);
  return new MockAdProvider();
}

// ------------------------------------------------------------- gem store ----
/* Purchases go through an IapProvider. Browsers use a clearly-labelled demo
 * store; a Capacitor build with cordova-plugin-purchase uses the real store.
 * Consumable gem products must also exist in the App Store / Play Console. */
class DemoIapProvider {
  constructor() {
    this.demo = true;
    this.available = true;
    this.name = "DEMO";
  }
  async buy(pack) { return { ok: true, demo: true, transactionId: `demo-${pack.id}-${Date.now()}` }; }
}

class DisabledIapProvider {
  constructor() {
    this.demo = false;
    this.available = false;
    this.name = "UNAVAILABLE";
  }
  async buy() { throw new Error("Gem purchases are not configured."); }
}

class CdvIapProvider {
  constructor(plugin) {
    this.plugin = plugin;
    this.store = plugin.store;
    this.demo = false;
    this.available = true;
    this.name = "STORE";
    this.pending = new Map();
    this.initPromise = null;
    this.ready = false;
    const Platform = plugin.Platform || {};
    const ProductType = plugin.ProductType || {};
    const cap = typeof window !== "undefined" && window.Capacitor && window.Capacitor.getPlatform
      ? window.Capacitor.getPlatform() : "android";
    this.platform = cap === "ios" ? Platform.APPLE_APPSTORE : Platform.GOOGLE_PLAY;
    try {
      for (const pack of GEM_PACKS) {
        this.store.register({
          id: pack.productId,
          type: ProductType.CONSUMABLE,
          platform: this.platform,
        });
      }
      this.store.when().approved(tx => this.approved(tx));
    } catch (e) {
      this.available = false;
      this.lastError = e && e.message ? e.message : String(e);
    }
  }
  async init() {
    if (!this.available) throw new Error(this.lastError || "Store is not available.");
    if (!this.initPromise) this.initPromise = Promise.resolve(this.store.initialize([this.platform]));
    await this.initPromise;
    this.ready = true;
  }
  async buy(pack) {
    await this.init();
    const product = (this.store.get && (this.store.get(pack.productId, this.platform) ||
      this.store.get(pack.productId))) || null;
    if (!product) throw new Error("This gem pack is not available in the store yet.");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(pack.productId);
        reject(new Error("The store did not finish the purchase."));
      }, 120000);
      this.pending.set(pack.productId, { resolve, reject, timer });
      try {
        const order = this.store.order(product);
        if (!order) throw new Error("The store could not start the purchase.");
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(pack.productId);
        reject(e);
      }
    });
  }
  approved(tx) {
    let pack = null;
    try {
      const id = tx && tx.products && tx.products[0] && tx.products[0].id;
      pack = GEM_PACKS.find(p => p.productId === id) || null;
      const pending = pack && this.pending.get(pack.productId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(pack.productId);
        pending.resolve({ ok: true, transactionId: (tx && tx.transactionId) || "" });
      }
    } catch (e) { /* still finish the transaction below */ }
    try { if (tx && tx.finish) tx.finish(); } catch (e) {}
  }
}

function createIapProvider() {
  const plugin = typeof window !== "undefined" && window.CdvPurchase;
  if (plugin && plugin.store) return new CdvIapProvider(plugin);
  if (CONFIG.gemStoreDemo !== false) return new DemoIapProvider();
  return new DisabledIapProvider();
}

// --------------------------------------------------------- draw helpers ----
function circle(c, x, y, r, col, line = 0) {
  c.beginPath(); c.arc(x, y, Math.max(0.5, r), 0, TAU);
  if (line) { c.lineWidth = line; c.strokeStyle = col; c.stroke(); } else { c.fillStyle = col; c.fill(); }
}
function text(c, s, x, y, size, col, bold = false, align = "center") {
  c.font = `${bold ? "bold " : ""}${size}px ui-monospace, Menlo, Consolas, monospace`;
  c.fillStyle = col; c.textAlign = align; c.textBaseline = "middle"; c.fillText(s, x, y);
}
function panel(c, x, y, w, h, fill = "rgba(10,14,28,0.74)", stroke = "rgba(120,200,255,0.18)", radius = 18) {
  c.save();
  c.beginPath();
  if (c.roundRect) c.roundRect(x, y, w, h, radius); else c.rect(x, y, w, h);
  c.fillStyle = fill; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = stroke; c.stroke();
  c.globalAlpha = 0.35;
  c.beginPath(); c.moveTo(x + radius, y + 1); c.lineTo(x + w - radius, y + 1);
  c.lineWidth = 1; c.strokeStyle = "rgba(255,255,255,0.55)"; c.stroke();
  c.globalAlpha = 1;
  c.restore();
}
function gemIcon(c, x, y, r, col = "#78e6ff") {
  c.beginPath();
  c.moveTo(x, y - r); c.lineTo(x + r * 0.7, y); c.lineTo(x, y + r); c.lineTo(x - r * 0.7, y);
  c.closePath(); c.fillStyle = col; c.fill();
  c.lineWidth = 1; c.strokeStyle = "rgba(255,255,255,0.65)"; c.stroke();
}
function tierFor(score) {
  if (score >= 20000) return { name: "DIAMOND", col: "#9fe8ff" };
  if (score >= 10000) return { name: "PLATINUM", col: "#b8ffed" };
  if (score >= 6000) return { name: "GOLD", col: "#ffd45a" };
  if (score >= 3000) return { name: "SILVER", col: "#c8d0e0" };
  if (score >= 1000) return { name: "BRONZE", col: "#d8996a" };
  return { name: "ROOKIE", col: "#828296" };
}
function gradeFor(score, level, maxCombo) {
  const power = score + level * 250 + maxCombo * 300;
  if (power >= 25000) return { letter: "S", col: "#ffd45a", label: "LEGENDARY" };
  if (power >= 14000) return { letter: "A", col: "#ff9a5a", label: "ACE" };
  if (power >= 7000) return { letter: "B", col: "#78e6ff", label: "SOLID" };
  if (power >= 3000) return { letter: "C", col: "#b48cff", label: "PROMISING" };
  if (power >= 1000) return { letter: "D", col: "#9696aa", label: "ROOKIE" };
  return { letter: "E", col: "#828296", label: "TRY AGAIN" };
}
function weekResetText() {
  const now = new Date();
  const day = now.getUTCDay() || 7;
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (8 - day)));
  const ms = Math.max(0, next - now);
  const days = Math.floor(ms / 86400000), hours = Math.floor(ms % 86400000 / 3600000);
  return `${days}d ${hours}h`;
}
function dayResetText() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const ms = Math.max(0, next - now);
  const hours = Math.floor(ms / 3600000), mins = Math.floor(ms % 3600000 / 60000);
  return `${hours}h ${mins}m`;
}
function nameColor(name) {
  const palette = ["#78c8ff", "#ff78dc", "#b48cff", "#ffd45a", "#78ff8c", "#ff8a4a"];
  let h = 0;
  for (const ch of String(name || "?")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}
function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
function glowBlob(c, x, y, r, col) {
  if (typeof c.createRadialGradient === "function") {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    if (g && g.addColorStop) {
      g.addColorStop(0, col);
      g.addColorStop(0.55, col.replace(/[\d.]+\)$/, "0.04)"));
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      return;
    }
  }
  circle(c, x, y, r, col);
}

const POWERUP_COLORS = { shield: "#78c8ff", magnet: "#ff78dc", slow: "#b48cff" };
const POWERUP_LABELS = { shield: "S", magnet: "M", slow: "T" };
const SHIP_LIVERIES = {
  scout: { hull: "#e8eef8", wing: "#9fb3cc", trim: "#78d8ff", accent: "#ff6a6a" },
  warden: { hull: "#dce8ff", wing: "#7fa8de", trim: "#5c9cff", accent: "#ffd45a" },
  drifter: { hull: "#f0e6ff", wing: "#b48cff", trim: "#e0b8ff", accent: "#78ff8c" },
  gambler: { hull: "#ffe9c8", wing: "#d9a24a", trim: "#ffb43c", accent: "#ff5a5a" },
};

function drawAircraft(c, x, y, angle, livery, time, thrust = 0) {
  const L = livery || SHIP_LIVERIES.scout;
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  // engine exhaust
  const flick = 13 + 5 * Math.sin(time * 42) + Math.min(8, thrust * 2);
  c.fillStyle = "rgba(120,210,255,0.18)";
  c.beginPath(); c.moveTo(-13, -5); c.lineTo(-13 - flick - 6, 0); c.lineTo(-13, 5); c.closePath(); c.fill();
  c.fillStyle = L.trim;
  c.beginPath(); c.moveTo(-13, -3); c.lineTo(-13 - flick, 0); c.lineTo(-13, 3); c.closePath(); c.fill();
  // tail fin
  c.fillStyle = L.wing;
  c.beginPath(); c.moveTo(-7, 0); c.lineTo(-18, 0); c.lineTo(-12, 4); c.closePath(); c.fill();
  // swept wings
  c.fillStyle = L.wing;
  c.beginPath();
  c.moveTo(5, 0); c.lineTo(-4, -15); c.lineTo(-10, -15); c.lineTo(-7, -2); c.closePath(); c.fill();
  c.beginPath();
  c.moveTo(5, 0); c.lineTo(-4, 15); c.lineTo(-10, 15); c.lineTo(-7, 2); c.closePath(); c.fill();
  // tailplanes
  c.fillStyle = L.hull;
  c.beginPath(); c.moveTo(-8, -1); c.lineTo(-14, -8); c.lineTo(-18, -8); c.lineTo(-15, -1); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(-8, 1); c.lineTo(-14, 8); c.lineTo(-18, 8); c.lineTo(-15, 1); c.closePath(); c.fill();
  // fuselage
  c.fillStyle = L.hull;
  c.beginPath();
  c.moveTo(18, 0); c.lineTo(8, -4); c.lineTo(-10, -5); c.lineTo(-14, -3);
  c.lineTo(-14, 3); c.lineTo(-10, 5); c.lineTo(8, 4); c.closePath(); c.fill();
  c.lineWidth = 1.5; c.strokeStyle = "rgba(8,12,20,0.8)"; c.stroke();
  // canopy
  c.fillStyle = L.trim; c.beginPath();
  c.ellipse(6, 0, 5.5, 3, 0, 0, TAU); c.fill();
  c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = 1; c.stroke();
  // engine nozzles
  c.fillStyle = "#2a3648";
  c.fillRect(-15, -4, 3, 2.5); c.fillRect(-15, 1.5, 3, 2.5);
  // wingtip navigation lights
  c.fillStyle = L.accent; c.beginPath(); c.arc(-3.5, -15, 1.6, 0, TAU); c.fill();
  c.fillStyle = "#78ff8c"; c.beginPath(); c.arc(-3.5, 15, 1.6, 0, TAU); c.fill();
  c.restore();
}

// ----------------------------------------------------------------- game ----
class Game {
  constructor(ads, iap) {
    this.ads = ads; this.iap = iap || new DemoIapProvider();
    this.save = Save.load(); Sfx.muted = !!this.save.muted;
    this.state = "title"; this.time = 0;
    this.campaignSelectedSector = this.save.campaign.selected;
    this.currentCampaignSector = null;
    this.campaignMessage = "";
    this.storyReturnState = "title";
    this.buyShield = false; this.message = ""; this.buttons = []; this.paused = false;
    this.gemStoreReturn = "title"; this.storeMessage = ""; this.storeBusy = false;
    this.mode = "classic"; this.contract = CONTRACTS[0]; this.ship = SHIPS[0];
    this.biome = BIOMES[0];
    this.rng = Math.random; this.ghost = this.save.ghost; this.rivalGhost = null; this.adsUsed = 0;
    this.newDailyBest = false; this.dailyBestAtStart = 0;
    this.profile = this.save.profile;
    this.ranked = false; this.competitive = false; this.rankedWeek = ""; this.dailyDate = dateKey();
    this.submission = null;
    this.challenge = null;
    this.boardTab = "weekly"; this.boardData = null; this.boardLoading = false; this.boardError = "";
    this.socialMessage = "";
    this.shareMessage = "";
    this.settingsMessage = "";
    this.shopMessage = "";
    this.tutorialActive = false; this.tutorialStep = this.save.tutorial.step || 0;
    this.shopTab = "trail"; this.deleteArmed = false;
    this.trailColor = "#78c8ff"; this.skinLivery = SKIN_LIVERIES.scout; this.playerTitle = "ROOKIE";
    this.applyCosmetics();
    this.applySettings();
    this.installPrompt = null;
    this.fullscreenAvailable = typeof document !== "undefined" && !!document.documentElement.requestFullscreen;
    this.stars = Array.from({ length: 170 }, () => [Math.random() * W, Math.random() * H, Math.random(), 0.25 + Math.random() * 0.75]);
    this.ensureMissions();
    this.refreshUnlocks();
    this.reset();
  }
  reset() {
    Object.assign(this, {
      ring: 1, ringVis: RINGS[1], angularVel: 0, radialVel: 0, angle: -Math.PI / 2, dir: 1,
      meteors: [], gems: [], parts: [], floats: [], score: 0, crystals: 0, bankedCrystals: 0,
      combo: 1, comboT: 0, comboTime: COMBO_TIME, maxCombo: 1, elapsed: 0, runTime: 0,
      spawnT: 1, gemT: 1.5, powerupT: 10, powerup: null, magnetT: 0, slowT: 0,
      invuln: 1, shield: false, shake: 0, continues: 0, doubleUsed: false,
      paused: false, flareT: 0, flareRing: -1, flareCD: 12,
      nearMisses: 0, gemsCollected: 0, crystalGain: 0, powerupsTaken: 0, flaresDodged: 0,
      bossesCleared: 0, boss: null, hitStop: 0, flash: 0, musicT: 0.7, musicBeat: 0, trailT: 0,
      shocks: [], shooting: [], shootingT: 2.5, shipTrail: [],
      ghostSamples: [], lastGhostSample: -1, runCounted: false, runToken: null,
      missionReward: 0, scoreMul: 1, crystalMul: 1, meteorMul: 1, gemRate: 1, magnetBonus: 0,
      newBest: false, newDailyBest: false, submission: null, shareMessage: "", message: "", lastCampaignDiscovery: "",
    });
  }
  goTitle() {
    this.currentCampaignSector = null;
    this.reset();
    this.ghost = this.save.ghost;
    this.rivalGhost = null;
    this.state = "title";
    this.paused = false;
  }
  start(mode = "classic") {
    this.currentCampaignSector = null;
    this.ensureMissions();
    this.rotateCompletedMissions();
    this.refreshUnlocks();
    this.mode = mode;
    this.save.analytics.runs++;
    const today = dateKey();
    if (mode === "ranked") {
      const week = (this.challenge && this.challenge.mode === "ranked" && this.challenge.week) || weekKey();
      this.rankedWeek = week;
      this.seed = hashStr("orbit-ranked-" + week);
      this.contract = CONTRACTS[0];
      this.ship = SHIPS[0];
      this.dailyBestAtStart = 0;
    } else if (mode === "daily") {
      const day = (this.challenge && this.challenge.mode === "daily" && this.challenge.date) || today;
      this.dailyDate = day;
      this.seed = hashStr("orbit-daily-" + day);
      this.contract = CONTRACTS[0];
      this.ship = SHIPS[0];
      this.dailyBestAtStart = this.save.daily.date === day ? this.save.daily.best : 0;
    } else {
      this.seed = (Math.random() * 0xFFFFFFFF) >>> 0;
      this.contract = CONTRACTS.find(c => c.id === this.save.contract) || CONTRACTS[0];
      this.ship = SHIPS.find(s => s.id === this.save.ship) || SHIPS[0];
      this.dailyBestAtStart = 0;
    }
    this.ranked = mode === "ranked";
    this.competitive = mode === "ranked" || mode === "daily";
    this.biome = this.competitive ? BIOMES[this.seed % BIOMES.length] : pick(BIOMES);
    this.rng = mulberry32(this.seed);
    this.applyCosmetics();
    this.reset();
    this.applyLoadout();
    this.runToken = null;
    this.tutorialActive = mode === "classic" && !this.save.tutorial.done;
    this.tutorialStep = this.save.tutorial.step || 0;
    if (this.tutorialActive) {
      this.flareCD = 18;
      this.gems.push({ ring: 1, angle: this.angle + 0.9, life: 20 });
    }
    if (!this.competitive && this.buyShield && this.save.bank >= SHIELD_COST) {
      this.save.bank -= SHIELD_COST; this.shield = true; Save.write(this.save);
    }
    this.buyShield = false;
    this.ghost = mode === "classic" ? this.save.ghost : null;
    this.state = "play"; this.message = "";
    Leaderboard.sendEvents([{ name: "run_start", props: { mode, biome: this.biome.id } }], this.profile);
  }
  applyLoadout() {
    this.scoreMul = this.contract.scoreMul * this.ship.scoreMul * this.biome.scoreMul;
    this.crystalMul = this.contract.crystalMul * this.ship.crystalMul;
    this.meteorMul = this.contract.meteorMul * this.biome.meteorSpeed;
    this.gemRate = this.biome.gemRate;
    this.comboTime = COMBO_TIME * this.ship.comboTime;
    this.magnetBonus = this.ship.magnetBonus;
    if (this.ship.startShield) this.shield = true;
    this.flareCD = (this.contract.flareRate || 12) * this.biome.flareRate;
    // orbital speed at the current radius, with inertia added in update()
    this.angularVel = this.dir * (1.6 + 0.08) * this.ship.ringSpeed;
  }
  applyCosmetics() {
    const eq = this.save.cosmetics.equipped;
    const trail = SHOP_ITEMS.find(i => i.id === eq.trail);
    const skin = SHOP_ITEMS.find(i => i.id === eq.skin);
    const title = SHOP_ITEMS.find(i => i.id === eq.title);
    this.trailColor = trail ? trail.value : "#78c8ff";
    this.skinLivery = SKIN_LIVERIES[(skin && skin.value) || "scout"] || SKIN_LIVERIES.scout;
    this.playerTitle = title ? title.value : "ROOKIE";
  }
  applySettings() {
    const st = this.save.settings;
    Sfx.musicEnabled = st.music !== false;
    Sfx.sfxEnabled = st.sfx !== false;
  }
  get level() { return 1 + Math.floor(this.elapsed / 15); }
  get effLevel() { return Math.min(this.level, 14); }
  get levelName() { return LEVEL_NAMES[(this.level - 1) % LEVEL_NAMES.length]; }
  get nextShip() { return SHIPS.find(s => !this.save.ships.includes(s.id)); }
  playerPos() { return [CX + Math.cos(this.angle) * this.ringVis, CY + Math.sin(this.angle) * this.ringVis]; }
  rnd(a, b) { return a + this.rng() * (b - a); }
  rndInt(n) { return Math.floor(this.rng() * n); }
  chance(p) { return this.rng() < p; }

  // ---- meta progression ------------------------------------------------
  ensureMissions() {
    const today = dateKey();
    if (this.save.missionDay === today && this.save.missions.length === 3) return;
    const pool = MISSION_POOL.slice();
    const rng = mulberry32(hashStr("missions-" + today));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.save.missions = pool.slice(0, 3).map(t => ({ ...t, progress: 0, completed: false }));
    this.save.missionDay = today;
    Save.write(this.save);
  }
  rotateCompletedMissions() {
    const active = new Set(this.save.missions.filter(m => !m.completed).map(m => m.id));
    const oldCompleted = new Set(this.save.missions.filter(m => m.completed).map(m => m.id));
    let changed = false;
    this.save.missions = this.save.missions.map(m => {
      if (!m.completed) return m;
      let choices = MISSION_POOL.filter(t => !active.has(t.id) && !oldCompleted.has(t.id));
      if (!choices.length) choices = MISSION_POOL.filter(t => !active.has(t.id));
      if (!choices.length) return { ...m, progress: 0, completed: false };
      const t = pick(choices); active.add(t.id); changed = true;
      return { ...t, progress: 0, completed: false };
    });
    if (changed) Save.write(this.save);
  }
  missionValue(m) {
    switch (m.metric) {
      case "run_crystals": return this.crystalGain;
      case "run_near": return this.nearMisses;
      case "run_flares": return this.flaresDodged;
      case "run_level": return this.level;
      case "run_maxcombo": return this.maxCombo;
      case "run_score": return Math.floor(this.score);
      case "total_crystals": return this.save.lifetime;
      case "total_runs": return this.save.stats.runs;
      case "total_flares": return this.save.stats.flares;
      case "total_near": return this.save.stats.near;
      case "total_bosses": return this.save.stats.bosses;
      case "total_powerups": return this.save.stats.powerups;
      default: return 0;
    }
  }
  checkMissions() {
    let reward = 0, bonusGems = 0;
    for (const m of this.save.missions) {
      if (m.completed) continue;
      const value = this.missionValue(m);
      if (value > m.progress) m.progress = value;
      if (m.progress >= m.target) {
        m.completed = true; reward += m.reward; this.save.missionsDone++;
        if (this.save.missionsDone % 5 === 0) {
          bonusGems += GEM_MISSION_REWARD;
          this.save.gems = Math.min(MAX_GEMS, this.save.gems + GEM_MISSION_REWARD);
        }
      }
    }
    if (reward > 0 || bonusGems > 0) {
      if (reward > 0) this.save.bank += reward;
      this.missionReward = reward;
      this.message = [
        reward > 0 ? `+${reward} mission crystals` : "",
        bonusGems > 0 ? `+${bonusGems} bonus gems` : "",
      ].filter(Boolean).join("  ");
    }
  }
  refreshUnlocks() {
    let changed = false;
    for (const s of SHIPS) {
      if (!this.save.ships.includes(s.id) && this.save.lifetime >= s.unlock) {
        this.save.ships.push(s.id); changed = true;
      }
    }
    if (!this.save.ships.includes(this.save.ship)) this.save.ship = "scout";
    if (changed) Save.write(this.save);
    return changed;
  }
  cycleShip() {
    const unlocked = SHIPS.filter(s => this.save.ships.includes(s.id));
    if (!unlocked.length) return;
    const i = unlocked.findIndex(s => s.id === this.save.ship);
    this.save.ship = unlocked[(i + 1) % unlocked.length].id;
    Save.write(this.save); Sfx.play("pause");
  }
  selectContract(id) {
    if (!CONTRACTS.some(c => c.id === id)) return;
    this.save.contract = id; Save.write(this.save); Sfx.play("pause");
  }
  continueCost() {
    return Math.min(CONTINUE_MAX_COST, CONTINUE_BASE_COST * Math.pow(2, this.continues));
  }
  continueLabel() {
    const cost = this.continueCost();
    return this.save.gems >= cost ? `CONTINUE  -  ${cost} GEMS` : `GET ${cost} GEMS TO CONTINUE`;
  }
  burst(x, y, cols, n, speed, life) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(0.2, 1) * speed;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, col: pick(cols), life, max: life });
    }
  }
  float(x, y, s, col) { this.floats.push({ x, y, s, col, life: 1.1 }); }
  addShock(x, y, col, maxR = 90, life = 0.45) {
    this.shocks.push({ x, y, col, r: 8, maxR, life, max: life });
  }
  meteorType(id) { return METEOR_TYPES.find(t => t.id === id) || METEOR_TYPES[0]; }
  pickMeteorType() {
    const total = METEOR_TYPES.reduce((sum, t) => sum + t.weight, 0);
    let roll = this.rng() * total;
    for (const type of METEOR_TYPES) {
      roll -= type.weight;
      if (roll <= 0) return type;
    }
    return METEOR_TYPES[0];
  }
  spawnMeteor(angle, speed, size, kind, r = 780) {
    const type = this.meteorType(kind);
    return {
      angle, r, speed: speed * type.speed, size: size * type.size,
      spin: this.rnd(-.25, .25), near: false, entry: 0.45, kind: type.id, nearMult: type.near,
      rot: rand(0, TAU), shape: Array.from({ length: 7 }, () => rand(0.72, 1.14)),
      trailT: rand(0, 0.08), split: false, dead: false,
    };
  }
  explodeMeteor(m) {
    const mx = CX + Math.cos(m.angle) * m.r, my = CY + Math.sin(m.angle) * m.r;
    m.dead = true;
    this.addShock(mx, my, "#ff8a3c", 150, 0.55);
    this.flash = Math.max(this.flash, 0.22);
    this.score += Math.round(40 * this.level * this.scoreMul);
    this.burst(mx, my, ["#ffd45a", "#ff8a3c", "#ff5a3c"], 28, 300, 0.8);
    Sfx.noise(220, 0.12, 800);
    for (const other of this.meteors) {
      if (other === m || other.dead) continue;
      const ox = CX + Math.cos(other.angle) * other.r, oy = CY + Math.sin(other.angle) * other.r;
      if (Math.hypot(ox - mx, oy - my) < 95) {
        other.dead = true;
        this.burst(ox, oy, ["#ffa03c"], 10, 180, 0.5);
      }
    }
  }
  setTutorialStep(step) {
    this.tutorialStep = step;
    this.save.tutorial.step = step;
    if (step >= 5) {
      this.save.tutorial.done = true;
      this.tutorialActive = false;
      this.save.analytics.tutorialDone = 1;
    }
    Save.write(this.save);
  }
  updateTutorial() {
    if (!this.tutorialActive) return;
    if (this.tutorialStep === 0 && this.ring !== 1) this.setTutorialStep(1);
    else if (this.tutorialStep === 1 && this.crystals > 0) this.setTutorialStep(2);
    else if (this.tutorialStep === 2 && this.dir === -1) this.setTutorialStep(3);
    else if (this.tutorialStep === 3 && (this.flaresDodged > 0 || this.elapsed > 30)) this.setTutorialStep(4);
    else if (this.tutorialStep === 4 && this.elapsed > 42) this.setTutorialStep(5);
  }
  bumpCombo(amount = 1) {
    const before = this.combo;
    this.combo = Math.min(MAX_COMBO, this.combo + amount);
    this.comboT = this.comboTime;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (before < 4 && this.combo >= 4) {
      this.float(CX, CY - 60, "x4  HOT STREAK", "#ffb43c");
      this.addShock(CX, CY, "#ffb43c", 120, 0.4);
    }
    if (before < MAX_COMBO && this.combo >= MAX_COMBO) {
      this.float(CX, CY - 30, "OVERDRIVE", "#ffe678");
      this.addShock(CX, CY, "#ffe678", 170, 0.55);
      Sfx.play("reward");
    }
  }

  // Credit exactly the crystals that have not been banked yet.
  bankCrystals() {
    const delta = this.crystals - this.bankedCrystals;
    if (delta > 0) this.save.bank += delta;
    this.bankedCrystals = this.crystals;
    this.save.bank = Math.max(0, this.save.bank);
  }

  die(cause = "meteor") {
    const [x, y] = this.playerPos();
    this.save.analytics.maxLevel = Math.max(this.save.analytics.maxLevel, this.level);
    if (cause === "flare") this.save.analytics.deathsFlare++;
    else this.save.analytics.deathsMeteor++;
    this.burst(x, y, ["#ffdc5a", "#ff783c", "#fff"], 70, 380, 1.2);
    this.floats = [];
    Sfx.play("die"); Sfx.noise(360, 0.18, 900); vibrate(200); this.shake = 0.5;
    this.bankCrystals();
    const score = Math.floor(this.score);
    if (!this.runCounted) { this.save.stats.runs++; this.runCounted = true; }
    const today = dateKey();
    if (this.mode === "daily") {
      const day = this.dailyDate || today;
      const prev = this.save.daily.date === day ? this.save.daily.best : 0;
      this.newDailyBest = score > prev;
      if (day === today) this.save.daily = { date: day, best: Math.max(prev, score) };
    } else {
      this.newDailyBest = false;
      if (this.mode === "classic" && score > this.save.best) {
        this.save.ghost = { score, samples: this.ghostSamples.slice(0, 2000) };
      }
    }
    this.newBest = score > this.save.best;
    this.save.best = Math.max(this.save.best, score);
    this.message = "";
    this.checkMissions();
    this.refreshUnlocks();
    this.save.bank = Math.max(0, this.save.bank);
    const completedCampaignSector = this.completeCampaignSector();
    Save.write(this.save);
    this.state = completedCampaignSector && this.campaignFinished() ? "ending" : "over";
    this.paused = false; this.hitStop = 0;
    if (this.ranked) {
      if (this.save.ranked.week !== this.rankedWeek || score > this.save.ranked.best) {
        this.save.ranked = { week: this.rankedWeek, best: Math.max(score, this.save.ranked.week === this.rankedWeek ? this.save.ranked.best : 0) };
        Save.write(this.save);
      }
    }
    if (this.competitive) this.submitScore(this.mode, score);
    else Leaderboard.sendEvents([{
      name: "run_end",
      props: { mode: "classic", cause, score, level: this.level, time: Math.round(this.runTime) },
    }], this.profile);
  }

  // ---- online competition ----------------------------------------------
  async submitScore(mode, score) {
    const week = mode === "ranked" ? this.rankedWeek : "";
    const day = mode === "daily" ? (this.dailyDate || dateKey()) : dateKey();
    const runId = `${mode}-${week || day}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    const run = {
      runId, mode, week, date: day, seed: this.seed, runToken: this.runToken, title: this.playerTitle,
      ghost: this.ghostSamples.slice(0, 900),
      score: Math.floor(score), time: this.runTime, crystals: this.crystals, level: this.level,
      maxCombo: this.maxCombo, nearMisses: this.nearMisses, flaresDodged: this.flaresDodged,
      bossesCleared: this.bossesCleared, continues: this.continues,
      doubles: this.doubleUsed ? 1 : 0, ship: "scout", contract: "standard", version: "3.1",
    };
    this.submission = { status: "pending", score: Math.floor(score), runId, mode };
    const result = await Leaderboard.submit(run, this.profile);
    if (this.submission && this.submission.runId === runId) {
      const submission = { status: "done", score: Math.floor(score), runId, mode, ...result };
      if (result.you && result.you.rank) {
        submission.rank = result.you.rank;
        submission.total = result.total;
      }
      this.submission = submission;
      if (result.league) {
        this.save.league = {
          week: this.rankedWeek, tier: result.league.tier || 0,
          leagueId: result.league.id || "", rank: submission.rank || 0,
        };
        Save.write(this.save);
      }
      Leaderboard.sendEvents([{
        name: "run_end",
        props: { mode, score: Math.floor(score), level: this.level, time: Math.round(this.runTime), crystals: this.crystals },
      }], this.profile);
      if (result.entries) {
        this.boardData = { scope: mode === "daily" ? "daily" : "weekly", ...result };
      }
    }
  }
  buildShareCard(score) {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 1080; canvas.height = 1080;
    const c = canvas.getContext("2d");
    const grade = gradeFor(score, this.level, this.maxCombo);
    const tier = tierFor(this.save.best);
    const g = c.createLinearGradient(0, 0, 1080, 1080);
    g.addColorStop(0, "#060610"); g.addColorStop(0.55, "#0d1430"); g.addColorStop(1, "#211033");
    c.fillStyle = g; c.fillRect(0, 0, 1080, 1080);
    c.globalAlpha = 0.35;
    [[180, 180, 260, "#301860"], [900, 300, 220, "#103a5a"], [540, 980, 320, "#4a142e"]].forEach(([x, y, r, col]) => {
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, col); rg.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    });
    c.globalAlpha = 1;
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillStyle = "#ffc85a"; c.font = "bold 92px ui-monospace, Menlo, Consolas, monospace";
    c.fillText("ORBIT RUNNER", 540, 140);
    c.fillStyle = "#9696aa"; c.font = "24px ui-monospace, Menlo, Consolas, monospace";
    c.fillText("ORBITAL SURVIVAL", 540, 205);
    c.fillStyle = "#ffffff"; c.font = "bold 150px ui-monospace, Menlo, Consolas, monospace";
    c.fillText(String(Math.floor(score)), 540, 420);
    c.fillStyle = "#78e6ff"; c.font = "28px ui-monospace, Menlo, Consolas, monospace";
    c.fillText("POINTS", 540, 510);
    c.strokeStyle = grade.col; c.lineWidth = 8;
    c.beginPath(); c.arc(540, 650, 110, 0, Math.PI * 2); c.stroke();
    c.fillStyle = grade.col; c.font = "bold 120px ui-monospace, Menlo, Consolas, monospace";
    c.fillText(grade.letter, 540, 646);
    c.font = "20px ui-monospace, Menlo, Consolas, monospace";
    c.fillText(grade.label, 540, 790);
    c.fillStyle = "#c8c8dc"; c.font = "28px ui-monospace, Menlo, Consolas, monospace";
    c.fillText(`${tier.name}  -  ${this.mode.toUpperCase()}`, 540, 850);
    c.fillStyle = "#78ff8c"; c.font = "24px ui-monospace, Menlo, Consolas, monospace";
    c.fillText(`LEVEL ${this.level}  -  COMBO x${this.maxCombo}  -  ${this.playerTitle}`, 540, 900);
    const url = (typeof location !== "undefined") ? location.origin + location.pathname : "orbit-runner";
    c.fillStyle = "#828296"; c.font = "20px ui-monospace, Menlo, Consolas, monospace";
    c.fillText("Can you beat it?", 540, 970);
    c.fillStyle = "#78c8ff"; c.font = "18px ui-monospace, Menlo, Consolas, monospace";
    c.fillText(url, 540, 1008);
    return canvas;
  }
  async shareCard(score) {
    const canvas = this.buildShareCard(score);
    if (!canvas) return;
    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) return;
      const file = new File([blob], "orbit-runner-score.png", { type: "image/png" });
      if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Orbit Runner", text: `I scored ${Math.floor(score)}. Can you beat it?` });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "orbit-runner-score.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
      this.shareMessage = "Score card ready.";
    } catch (e) {
      this.shareMessage = "Could not create share card.";
    }
  }
  async shareChallenge(score) {
    const base = (typeof location !== "undefined") ? location.origin + location.pathname : "orbit-runner";
    const url = this.mode === "ranked"
      ? `${base}?ranked=${encodeURIComponent(this.rankedWeek)}`
      : this.mode === "daily" ? `${base}?daily=${encodeURIComponent(this.dailyDate || dateKey())}` : base;
    const label = this.mode === "ranked" ? `Week ${this.rankedWeek}` : this.mode === "daily" ? `Daily ${this.dailyDate || dateKey()}` : "";
    const text = `I scored ${Math.floor(score)} on Orbit Runner${label ? ` (${label})` : ""}. Beat me!`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Orbit Runner", text, url });
        this.shareMessage = "Challenge shared.";
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(`${text} ${url}`);
        this.shareMessage = "Challenge link copied.";
      } else {
        this.shareMessage = `${text} ${url}`;
      }
    } catch (e) {
      this.shareMessage = "Share cancelled.";
    }
  }
  async beginMode(mode) {
    if (mode !== "ranked" && mode !== "daily") { this.start(mode); return; }
    const week = (this.challenge && this.challenge.mode === "ranked" && this.challenge.week) || weekKey();
    const day = (this.challenge && this.challenge.mode === "daily" && this.challenge.date) || dateKey();
    let token = null;
    if (CONFIG.apiBase && this.profile && Social.token) {
      this.message = "Preparing leaderboard run...";
      token = await Leaderboard.startRun(mode, week, day);
    }
    this.start(mode);
    this.runToken = token;
    if (this.runToken) this.message = "";
  }
  async raceTopGhost() {
    const scope = this.boardTab === "daily" ? "daily" : "weekly";
    const week = (this.challenge && this.challenge.mode === "ranked" && this.challenge.week) || weekKey();
    const day = (this.challenge && this.challenge.mode === "daily" && this.challenge.date) || dateKey();
    const ghost = await Leaderboard.fetchGhost(scope, week, day);
    if (!ghost || !Array.isArray(ghost.samples) || !ghost.samples.length) {
      this.socialMessage = "No rival ghost available yet.";
      return;
    }
    this.rivalGhost = ghost;
    this.socialMessage = `Racing ${String(ghost.name || "the leader").slice(0, 20)} (${ghost.score})`;
    await this.beginMode(scope === "daily" ? "daily" : "ranked");
  }
  async toggleFullscreen() {
    if (!this.fullscreenAvailable) {
      this.settingsMessage = "Fullscreen is not available in this browser.";
      return;
    }
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen();
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock("portrait").catch(() => {});
        }
      }
    } catch (e) {
      this.settingsMessage = "Fullscreen was blocked by the browser.";
    }
  }
  async installApp() {
    if (!this.installPrompt) return;
    this.save.analytics.installClicks++;
    Save.write(this.save);
    Leaderboard.sendEvents([{ name: "install_click", props: {} }], this.profile);
    try {
      this.installPrompt.prompt();
      await this.installPrompt.userChoice;
      this.installPrompt = null;
      this.settingsMessage = "Install prompt shown.";
    } catch (e) {
      this.settingsMessage = "Install is not available in this browser.";
    }
  }
  openSettings() {
    this.state = "settings";
    this.paused = false;
    this.settingsMessage = "";
  }
  toggleSetting(key) {
    const st = this.save.settings;
    if (!(key in st)) return;
    st[key] = !st[key];
    this.applySettings();
    Save.write(this.save);
  }
  openShop() {
    this.state = "shop";
    this.paused = false;
    this.shopMessage = "";
  }
  buyOrEquip(item) {
    const owned = this.save.cosmetics.owned.includes(item.id);
    if (!owned) {
      if (this.save.bank < item.cost) {
        this.shopMessage = `Need ${item.cost - this.save.bank} more crystals.`;
        return;
      }
      this.save.bank -= item.cost;
      this.save.cosmetics.owned.push(item.id);
    }
    this.save.cosmetics.equipped[item.type] = item.id;
    this.applyCosmetics();
    Save.write(this.save);
    this.shopMessage = owned ? `Equipped ${item.name}.` : `Unlocked and equipped ${item.name}.`;
    Sfx.play("power");
  }
  openBoard(tab = this.boardTab) {
    this.boardTab = tab;
    this.state = "board";
    this.paused = false;
    this.deleteArmed = false;
    this.save.analytics.boardOpens++;
    Save.write(this.save);
    Leaderboard.sendEvents([{ name: "board_open", props: { tab } }], this.profile);
    if (Social.configured && !Social.token) {
      Social.loadSdk().catch(e => { this.socialMessage = e.message || "Could not load Facebook."; });
    }
    this.refreshBoard();
  }
  async refreshBoard() {
    this.boardLoading = true;
    this.boardError = "";
    const opts = {};
    if (this.boardTab === "weekly" || this.boardTab === "friends" || this.boardTab === "league") {
      opts.week = (this.challenge && this.challenge.mode === "ranked" && this.challenge.week) || weekKey();
    } else {
      opts.date = (this.challenge && this.challenge.mode === "daily" && this.challenge.date) || dateKey();
    }
    const result = await Leaderboard.fetch(this.boardTab, opts);
    if (this.state !== "board") return;
    this.boardLoading = false;
    this.boardData = { scope: this.boardTab, ...result };
    this.boardError = result.error || "";
  }
  async connectFacebook() {
    if (this.boardTab === "friends" && !CONFIG.facebookFriends) {
      this.socialMessage = "Friends needs facebookFriends:true in config and user_friends approval.";
      return;
    }
    this.socialMessage = "Connecting to Facebook...";
    try {
      const profile = await Social.login(this.boardTab === "friends");
      this.profile = profile;
      this.save.profile = profile;
      Save.write(this.save);
      this.socialMessage = `Connected as ${profile.name}`;
      if (this.state === "board") await this.refreshBoard();
    } catch (e) {
      this.socialMessage = e.message || "Facebook login failed.";
    }
  }
  disconnectFacebook() {
    Social.logout();
    this.profile = null;
    this.save.profile = null;
    this.deleteArmed = false;
    Save.write(this.save);
    this.socialMessage = "Facebook disconnected.";
    if (this.state === "board") this.refreshBoard();
  }
  async deleteMyData() {
    if (!this.profile) { this.socialMessage = "Connect Facebook before deleting your data."; return; }
    if (!this.deleteArmed) {
      this.deleteArmed = true;
      this.socialMessage = "Tap DELETE MY DATA again to confirm. This removes your global scores.";
      return;
    }
    this.deleteArmed = false;
    this.socialMessage = "Deleting your data...";
    try {
      if (!CONFIG.apiBase) throw new Error("Score server is not configured; local data was not sent anywhere.");
      if (!Social.token) throw new Error("Reconnect Facebook to delete server data.");
      const res = await fetch(`${Leaderboard.apiBase()}/api/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "facebook", accessToken: Social.token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      Leaderboard.clearLocal();
      Social.logout();
      this.profile = null;
      this.save.profile = null;
      this.boardData = null;
      Save.write(this.save);
      this.socialMessage = "Your scores and Facebook profile were deleted.";
      await this.refreshBoard();
    } catch (e) {
      this.socialMessage = e.message || "Could not delete data.";
    }
  }

  // ---- ads and rewards --------------------------------------------------
  requestAd(kind) {
    if (kind === "continue") return this.buyContinue();
    if (this.competitive) {
      this.message = "Competitive runs are one-life: no continues or ads.";
      return;
    }
    if (kind === "double" && (this.doubleUsed || this.crystals <= 0)) return;
    if (!this.ads.isReady()) { this.message = "No ad available right now."; return; }
    if (this.adsUsed >= MAX_ADS) { this.message = "No ads left this session."; return; }
    this.adsUsed++;
    this.save.analytics.ads++;
    Save.write(this.save);
    if (kind === "double") this.ads.showRewarded(() => this.rewardDouble(), () => this.adClosed());
  }
  buyContinue() {
    if (this.competitive) {
      this.message = "Competitive runs are one-life: no continues or ads.";
      return false;
    }
    if (this.state !== "over") return false;
    const cost = this.continueCost();
    if (this.save.gems < cost) {
      this.message = `Need ${cost - this.save.gems} more gems.`;
      this.openGemStore("over");
      return false;
    }
    this.save.gems -= cost;
    this.continues += 1;
    Save.write(this.save);
    this.rewardContinue(cost);
    return true;
  }
  rewardContinue(cost = 0) {
    this.meteors = []; this.invuln = 3;
    this.flareT = 0; this.flareRing = -1;
    this.flareCD = (this.contract.flareRate || 8) * this.biome.flareRate;
    this.boss = null; this.hitStop = 0;
    this.state = "play"; this.paused = false; this.message = "";
    Sfx.play("reward");
    this.float(CX, CY - 60, cost > 0 ? `CONTINUE  -${cost} GEMS` : "SECOND CHANCE!", "#78ff8c");
  }
  rewardDouble() {
    this.doubleUsed = true;
    this.save.bank += this.crystals;
    this.crystals *= 2;
    this.bankedCrystals = this.crystals;
    this.save.bank = Math.max(0, this.save.bank);
    Save.write(this.save);
    this.message = `+${this.crystals / 2} bonus crystals banked!`;
    Sfx.play("reward");
  }
  adClosed() {
    if (this.state === "gems" && !this.storeMessage) this.storeMessage = "Ad closed early - no reward.";
    else if (this.state === "over" && !this.message) this.message = "Ad closed early - no reward.";
  }

  // ---- gem store ---------------------------------------------------------
  openGemStore(returnState = this.state === "over" ? "over" : "title") {
    if (this.state !== "gems") this.gemStoreReturn = returnState;
    this.state = "gems";
    this.paused = false;
    this.storeMessage = "";
  }
  closeGemStore() {
    this.state = this.gemStoreReturn === "over" ? "over" : "title";
    this.paused = false;
  }
  grantGems(amount, message = "") {
    this.save.gems = Math.min(MAX_GEMS, this.save.gems + Math.max(0, Math.floor(amount)));
    Save.write(this.save);
    this.storeMessage = message;
    Sfx.play("reward");
  }
  async buyGemPack(pack) {
    if (this.storeBusy || !pack) return;
    this.storeBusy = true;
    this.storeMessage = "Opening store...";
    try {
      const result = await this.iap.buy(pack);
      if (result && result.ok === false) throw new Error(result.error || "Purchase was not completed.");
      this.save.analytics.gemPurchases++;
      this.grantGems(pack.gems, result && result.demo
        ? `Demo purchase: +${pack.gems} gems (no charge)`
        : `Purchase complete: +${pack.gems} gems`);
    } catch (e) {
      this.storeMessage = e && e.message ? e.message : "Purchase failed.";
    } finally {
      this.storeBusy = false;
    }
  }
  watchGemAd() {
    if (this.storeBusy || this.ads.showing) return;
    if (!this.ads.isReady()) { this.storeMessage = "No ad available right now."; return; }
    if (this.adsUsed >= MAX_ADS) { this.storeMessage = "No ads left this session."; return; }
    this.adsUsed++;
    this.save.analytics.ads++;
    this.save.analytics.gemAds++;
    Save.write(this.save);
    this.ads.showRewarded(
      () => this.grantGems(GEM_AD_REWARD, `+${GEM_AD_REWARD} gems from ad`),
      () => this.adClosed(),
    );
  }

  togglePause() {
    if (this.state !== "play" || this.ads.showing) return;
    this.paused = !this.paused; Sfx.play("pause");
  }
  toggleMute() {
    Sfx.muted = !Sfx.muted;
    this.save.muted = Sfx.muted; Save.write(this.save);
    if (!Sfx.muted) Sfx.play("pause");
  }
  toggleShield() { if (this.save.bank >= SHIELD_COST) { this.buyShield = !this.buyShield; Sfx.play("pause"); } }

  // ---- campaign navigation ---------------------------------------------
  campaignSector(id) { return CAMPAIGN_SECTORS.find(s => s.id === id) || null; }
  campaignUnlocked(sectorOrId) {
    const sector = typeof sectorOrId === "string" ? this.campaignSector(sectorOrId) : sectorOrId;
    return !!sector && (!sector.unlockAfter || this.save.campaign.completed.includes(sector.unlockAfter));
  }
  sectorMastery(sectorId) {
    const sector = this.campaignSector(sectorId);
    const objectives = EXPLORATION_OBJECTIVES.filter(item => item.sectorId === sectorId);
    const completedObjectives = objectives.filter(item => this.explorationDone(item, sectorId)).length;
    const campaignCompleted = this.save.campaign.completed.includes(sectorId);
    return {
      sectorId, campaignCompleted, completedObjectives, totalObjectives: objectives.length,
      mastered: !!sector && campaignCompleted && objectives.length > 0 && completedObjectives === objectives.length,
    };
  }
  campaignMastery() {
    const sectors = CAMPAIGN_SECTORS.map(sector => this.sectorMastery(sector.id));
    return {
      masteredSectors: sectors.filter(item => item.mastered).length,
      completedSectors: sectors.filter(item => item.campaignCompleted).length,
      completedObjectives: sectors.reduce((sum, item) => sum + item.completedObjectives, 0),
      totalObjectives: EXPLORATION_OBJECTIVES.length,
      sectors,
    };
  }
  campaignFinished() {
    return CAMPAIGN_SECTORS.every(sector => this.save.campaign.completed.includes(sector.id));
  }
  openCampaignMap() {
    this.campaignSelectedSector = this.save.campaign.selected || CAMPAIGN_SECTORS[0].id;
    this.campaignMessage = "";
    this.state = "campaign";
    this.paused = false;
  }
  openPlanetExplore(id = this.campaignSelectedSector) {
    const sector = this.campaignSector(id);
    if (!this.campaignUnlocked(sector)) {
      this.campaignMessage = "ROUTE LOCKED — COMPLETE THE PREVIOUS SECTOR";
      return false;
    }
    this.explorationSectorId = sector.id;
    this.campaignSelectedSector = sector.id;
    this.save.campaign.selected = sector.id;
    this.explorationMessage = "";
    Save.write(this.save);
    this.state = "explore";
    this.paused = false;
    return true;
  }
  explorationObjectives(sectorId = this.explorationSectorId) {
    return EXPLORATION_OBJECTIVES.filter(objective => objective.sectorId === sectorId);
  }
  explorationDone(objectiveOrId, sectorId = this.explorationSectorId) {
    const id = typeof objectiveOrId === "string" ? objectiveOrId : objectiveOrId && objectiveOrId.id;
    return !!id && !!this.save.campaign.exploration[sectorId] && this.save.campaign.exploration[sectorId].includes(id);
  }
  completeExplorationObjective(id) {
    const objective = EXPLORATION_OBJECTIVES.find(item => item.id === id && item.sectorId === this.explorationSectorId);
    if (!objective || !this.campaignUnlocked(this.explorationSectorId) || this.explorationDone(objective)) return false;
    if (!this.save.campaign.exploration[this.explorationSectorId]) this.save.campaign.exploration[this.explorationSectorId] = [];
    this.save.campaign.exploration[this.explorationSectorId].push(objective.id);
    this.save.bank = Math.min(MAX_GEMS, this.save.bank + objective.reward);
    this.save.lifetime = Math.min(MAX_GEMS, this.save.lifetime + objective.reward);
    this.explorationMessage = "DATA RECOVERED  /  +" + objective.reward + " CRYSTALS";
    Save.write(this.save);
    return true;
  }
  openStoryArchive(returnState = this.state === "campaign" ? "campaign" : "title") {
    this.storyReturnState = returnState === "campaign" ? "campaign" : "title";
    this.storySelectedId = STORY_ENTRIES.find(entry => this.save.campaign.discoveries.includes(entry.id))?.id || STORY_ENTRIES[0].id;
    this.state = "archive";
    this.paused = false;
  }
  closeStoryArchive() {
    this.state = this.storyReturnState === "campaign" ? "campaign" : "title";
  }
  storyEntry(id) { return STORY_ENTRIES.find(entry => entry.id === id) || null; }
  storyDiscovered(entryOrId) {
    const entry = typeof entryOrId === "string" ? this.storyEntry(entryOrId) : entryOrId;
    return !!entry && this.save.campaign.discoveries.includes(entry.id);
  }
  selectCampaignSector(id) {
    const sector = this.campaignSector(id);
    if (!sector) return false;
    this.campaignSelectedSector = id;
    this.save.campaign.selected = id;
    this.campaignMessage = this.campaignUnlocked(sector) ? "" : "ROUTE LOCKED — COMPLETE THE PREVIOUS SECTOR";
    Save.write(this.save);
    return true;
  }
  launchCampaignSector(id = this.campaignSelectedSector) {
    const sector = this.campaignSector(id);
    if (!this.campaignUnlocked(sector)) {
      this.campaignMessage = "ROUTE LOCKED — COMPLETE THE PREVIOUS SECTOR";
      return false;
    }
    this.selectCampaignSector(sector.id);
    this.start("classic");
    this.currentCampaignSector = sector.id;
    const biome = BIOMES.find(b => b.id === sector.biome);
    if (biome) { this.biome = biome; this.applyLoadout(); }
    this.save.campaign.selected = sector.id;
    Save.write(this.save);
    return true;
  }
  completeCampaignSector() {
    if (!this.currentCampaignSector) return false;
    const id = this.currentCampaignSector;
    const newlyCompleted = !this.save.campaign.completed.includes(id);
    if (newlyCompleted) this.save.campaign.completed.push(id);
    const entry = STORY_ENTRIES.find(item => item.sectorId === id);
    this.lastCampaignDiscovery = entry && !this.save.campaign.discoveries.includes(entry.id) ? entry.title : "";
    if (entry && !this.save.campaign.discoveries.includes(entry.id)) this.save.campaign.discoveries.push(entry.id);
    this.currentCampaignSector = null;
    const index = CAMPAIGN_SECTORS.findIndex(s => s.id === id);
    const next = CAMPAIGN_SECTORS[index + 1];
    this.campaignMessage = entry ? `INTEL RECOVERED: ${entry.title}`
      : next ? `ROUTE DISCOVERED: ${next.name}` : "SECTOR CHARTED — CAMPAIGN FRONTIER COMPLETE";
    Save.write(this.save);
    return newlyCompleted;
  }

  // ---- input ------------------------------------------------------------
  action(a) {
    if (this.paused) return;
    if (this.state === "title") { if (a !== "down") this.start("classic"); return; }
    if (this.state !== "play") return;
    if (a === "up" && this.ring < 2) this.ring++;
    else if (a === "down" && this.ring > 0) this.ring--;
    else if (a === "reverse" || a === "tap") this.dir *= -1;
    else return;
    Sfx.play("jump");
  }
  key(k) {
    if (this.ads.showing) return this.ads.handleKey(k);
    const kk = k.length === 1 ? k.toLowerCase() : k;
    if (kk === "m") { this.toggleMute(); return; }
    if (this.state === "title" && kk === "l") { this.openStoryArchive("title"); return; }
    if (this.state === "title" && kk === "b") { this.openBoard("weekly"); return; }
    if (this.state === "ending") {
      if (kk === "escape" || kk === "b" || kk === "q" || kk === "t") this.goTitle();
      else if (kk === "s" || kk === "enter") this.openCampaignMap();
      else if (kk === "l") this.openStoryArchive("title");
      return;
    }
    if (this.state === "archive") {
      if (kk === "escape" || kk === "b" || kk === "q") this.closeStoryArchive();
      else if (kk === "m") this.toggleMute();
      return;
    }
    if (this.state === "explore") {
      if (kk === "escape" || kk === "b" || kk === "q") this.state = "campaign";
      else if (kk >= "1" && kk <= "3") {
        const objective = this.explorationObjectives()[Number(kk) - 1];
        if (objective) this.completeExplorationObjective(objective.id);
      }
      return;
    }
    if (this.state === "campaign") {
      if (kk === "escape" || kk === "b" || kk === "q") this.goTitle();
      else if (kk === "l") this.openStoryArchive("campaign");
      else if (kk === "arrowup" || kk === "w") {
        const i = CAMPAIGN_SECTORS.findIndex(s => s.id === this.campaignSelectedSector);
        this.selectCampaignSector(CAMPAIGN_SECTORS[(i + CAMPAIGN_SECTORS.length - 1) % CAMPAIGN_SECTORS.length].id);
      } else if (kk === "arrowdown" || kk === "s") {
        const i = CAMPAIGN_SECTORS.findIndex(s => s.id === this.campaignSelectedSector);
        this.selectCampaignSector(CAMPAIGN_SECTORS[(i + 1) % CAMPAIGN_SECTORS.length].id);
      } else if (kk === "enter" || kk === " ") this.launchCampaignSector();
      else if (kk >= "1" && kk <= "4") this.selectCampaignSector(CAMPAIGN_SECTORS[Number(kk) - 1].id);
      return;
    }
    if (this.state === "board") {
      if (kk === "escape" || kk === "b" || kk === "q") this.goTitle();
      else if (kk === "r") this.refreshBoard();
      else if (kk === "1") this.openBoard("weekly");
      else if (kk === "2") this.openBoard("daily");
      else if (kk === "3") this.openBoard("friends");
      else if (kk === "4") this.openBoard("league");
      else if (kk === "g") this.raceTopGhost();
      else if (kk === "f") this.connectFacebook();
      return;
    }
    if (this.state === "shop") {
      if (kk === "escape" || kk === "b" || kk === "q") this.goTitle();
      else if (kk === "1") this.shopTab = "trail";
      else if (kk === "2") this.shopTab = "skin";
      else if (kk === "3") this.shopTab = "title";
      return;
    }
    if (this.state === "gems") {
      if (kk === "escape" || kk === "b" || kk === "q") this.closeGemStore();
      else if (kk >= "1" && kk <= "4") this.buyGemPack(GEM_PACKS[Number(kk) - 1]);
      else if (kk === "a") this.watchGemAd();
      return;
    }
    if (this.state === "settings") {
      if (kk === "escape" || kk === "b" || kk === "q") this.goTitle();
      else if (kk >= "1" && kk <= "5") {
        const keys = ["colorblind", "reducedMotion", "lowFx", "music", "sfx"];
        this.toggleSetting(keys[Number(kk) - 1]);
      }
      return;
    }
    if (this.state === "play" && (kk === "p" || k === "Escape")) { this.togglePause(); return; }
    if (this.paused) {
      if (kk === "p" || k === " " || k === "Enter") this.paused = false;
      else if (kk === "r") this.beginMode(this.mode);
      else if (kk === "t") this.goTitle();
      else if (kk === "o") this.openSettings();
      return;
    }
    if (this.state === "over") {
      if (kk === "s") { this.shareChallenge(this.score); return; }
      const m = { c: "continue", d: "double" }[kk];
      if (m) this.requestAd(m);
      if (kk === "g") this.openGemStore("over");
      if (kk === "r") this.beginMode(this.mode);
      if (kk === "t") this.goTitle();
      if (kk === "l") this.openBoard(this.mode === "daily" ? "daily" : "weekly");
      return;
    }
    if (this.state === "title") {
      if (kk === "b") { this.toggleShield(); return; }
      if (kk === "v") { this.cycleShip(); return; }
      if (kk === "1" || kk === "2" || kk === "3") { this.selectContract(CONTRACTS[Number(kk) - 1].id); return; }
      if (kk === "d") { this.beginMode("daily"); return; }
      if (kk === "r") { this.beginMode("ranked"); return; }
      if (kk === "l") { this.openBoard("weekly"); return; }
      if (kk === "f") { this.openBoard("friends"); return; }
      if (kk === "c") { this.openShop(); return; }
      if (kk === "g") { this.openGemStore("title"); return; }
      if (kk === "o") { this.openSettings(); return; }
    }
    if (["ArrowUp", "w", "W"].includes(k)) this.action("up");
    else if (["ArrowDown", "s", "S"].includes(k)) this.action("down");
    else if (k === " " || k === "Enter") this.action("reverse");
  }
  tap(x, y) {
    if (this.ads.showing) return this.ads.handleTap(x, y);
    for (const b of this.buttons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.fn();
    if (this.paused || this.state === "campaign" || this.state === "ending" || this.state === "archive" || this.state === "board" || this.state === "shop" ||
        this.state === "settings" || this.state === "gems") return;
    if (this.state !== "over") this.action("tap");
  }

  // ---- pickups and hazards ---------------------------------------------
  applyPowerup(kind) {
    const [px, py] = this.playerPos();
    this.powerupsTaken++;
    this.save.stats.powerups++;
    if (kind === "shield") {
      if (this.shield) {
        const pts = Math.round(80 * this.combo * this.scoreMul); this.score += pts;
        this.float(px, py - 40, `SHIELD +${pts}`, "#78c8ff");
      } else {
        this.shield = true; this.invuln = Math.max(this.invuln, 0.6);
        this.float(px, py - 40, "SHIELD UP", "#78c8ff");
      }
    } else if (kind === "magnet") {
      this.magnetT = MAGNET_TIME;
      this.float(px, py - 40, "MAGNET", "#ff78dc");
    } else {
      this.slowT = SLOW_TIME;
      this.float(px, py - 40, "TIME WARP", "#b48cff");
    }
    Sfx.play("power"); vibrate(40);
  }
  spawnPowerup() {
    const kind = seededPick(this.rng, ["shield", "magnet", "slow"]);
    this.powerup = { kind, ring: this.rndInt(3), angle: this.rnd(0, TAU), life: POWERUP_TIME };
    this.powerupT = this.rnd(16, 24);
  }
  fireFlare() {
    const ring = this.flareRing;
    const [px, py] = this.playerPos();
    const onRing = Math.abs(this.ringVis - RINGS[ring]) < 34;
    this.shake = 0.55;
    for (let i = 0; i < 30; i++) {
      const a = i / 30 * TAU;
      this.parts.push({ x: CX + Math.cos(a) * RINGS[ring], y: CY + Math.sin(a) * RINGS[ring],
        vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, col: pick(["#ff9a3c", "#ffd45a"]), life: 0.7, max: 0.7 });
    }
    if (onRing && this.invuln <= 0) {
      if (this.shield) {
        this.shield = false; this.invuln = 1.2; Sfx.play("shield"); Sfx.noise(160, 0.10, 700); vibrate(80);
        this.hitStop = 0.06; this.flash = Math.max(this.flash, 0.25);
        this.burst(px, py, ["#78c8ff"], 30, 280, .7);
      } else {
        Sfx.play("flare"); Sfx.noise(500, 0.20, 1100); this.die("flare"); return true;
      }
    } else if (!onRing) {
      const pts = Math.round(75 * this.combo * this.scoreMul); this.score += pts; this.flaresDodged++;
      this.save.stats.flares++;
      this.bumpCombo();
      this.float(px, py - 40, `FLARE DODGED +${pts}`, "#ffb43c");
      this.addShock(px, py, "#ffb43c", 110, 0.45);
      Sfx.play("flare");
      this.flash = Math.max(this.flash, 0.3); this.hitStop = Math.max(this.hitStop, 0.03);
      Sfx.noise(220, 0.10, 900);
    } else {
      this.float(px, py - 40, "FLARE GRAZED", "#ffd45a");
    }
    for (const m of this.meteors) {
      if (Math.abs(m.r - RINGS[ring]) < 70 && m.kind === "volatile") this.explodeMeteor(m);
    }
    this.meteors = this.meteors.filter(m => !m.dead && Math.abs(m.r - RINGS[ring]) > 70);
    this.flareT = 0; this.flareRing = -1;
    this.flareCD = (this.contract.flareRate ? this.rnd(8, 11) : this.rnd(14, 20)) * this.biome.flareRate;
    return false;
  }

  // ---- Corona Surge -----------------------------------------------------
  startBoss() {
    if (this.boss) return;
    this.boss = { timer: 14, need: 3, cores: 0, core: null, coreT: 1.5 };
    this.flareT = 0; this.flareRing = -1;
    this.flash = Math.max(this.flash, 0.35); this.hitStop = Math.max(this.hitStop, 0.06);
    this.shake = Math.max(this.shake, 0.35);
    this.float(CX, CY - 160, "CORONA SURGE!", "#ff5a2a");
    Sfx.play("boss"); Sfx.noise(700, 0.16, 600);
  }
  updateBoss(dt) {
    if (!this.boss) return;
    this.boss.timer -= dt;
    this.boss.coreT -= dt;
    if (!this.boss.core && this.boss.coreT <= 0 && this.boss.timer > 3) {
      this.boss.core = { ring: this.rndInt(3), angle: this.rnd(0, TAU), life: 6 };
      this.boss.coreT = 3.5;
    }
    if (this.boss.core) {
      this.boss.core.life -= dt;
      this.boss.core.angle += 0.75 * dt;
      if (this.boss.core.life <= 0) { this.boss.core = null; this.boss.coreT = 1; }
    }
    if (this.boss.cores >= this.boss.need) this.clearBoss();
    else if (this.boss.timer <= 0) this.failBoss();
  }
  clearBoss() {
    if (!this.boss) return;
    const bonus = Math.round(1000 * this.level * this.scoreMul);
    this.score += bonus;
    this.crystals += 3; this.crystalGain += 3; this.save.lifetime += 3;
    this.save.stats.bosses++; this.bossesCleared++;
    this.flash = Math.max(this.flash, 0.4); this.hitStop = Math.max(this.hitStop, 0.12);
    this.shake = Math.max(this.shake, 0.5);
    this.float(CX, CY - 120, `SURGE CLEARED +${bonus}`, "#ffd45a");
    this.boss = null;
    Sfx.play("boss"); Sfx.noise(450, 0.16, 1200);
  }
  failBoss() {
    if (!this.boss) return;
    this.float(CX, CY - 120, "SURGE FADED", "#9696aa");
    this.boss = null;
  }

  // ---- simulation -------------------------------------------------------
  update(dt) {
    this.time += dt; this.ads.update(dt);
    this.flash = Math.max(0, this.flash - dt);
    if (this.paused) return;
    if (this.hitStop > 0) { this.hitStop = Math.max(0, this.hitStop - dt); return; }
    this.shake = Math.max(0, this.shake - dt);
    this.parts = this.parts.filter(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .96; p.vy *= .96; return (p.life -= dt) > 0; });
    this.floats = this.floats.filter(f => { f.y -= 50 * dt; return (f.life -= dt) > 0; });
    this.shocks = this.shocks.filter(s => {
      s.life -= dt;
      const pct = 1 - Math.max(0, s.life) / s.max;
      s.r = 8 + (s.maxR - 8) * pct;
      return s.life > 0;
    });
    if (!this.save.settings.reducedMotion && !this.save.settings.lowFx) {
      this.shootingT -= dt;
      if (this.shootingT <= 0) {
        this.shootingT = rand(2.5, 6);
        this.shooting.push({
          x: rand(0, W), y: -20, vx: rand(-120, 120), vy: rand(320, 520),
          life: rand(0.8, 1.4), max: 1.4,
        });
      }
      this.shooting = this.shooting.filter(s => {
        s.x += s.vx * dt; s.y += s.vy * dt;
        return (s.life -= dt) > 0 && s.y < H + 40;
      });
    } else {
      this.shooting = [];
    }
    if (this.state !== "play" || this.ads.showing) return;

    const oldLevel = this.level;
    this.elapsed += dt; this.runTime += dt; const lvl = this.effLevel;
    if (this.level > oldLevel) {
      this.float(CX, CY - 120, `LEVEL ${this.level} - ${this.levelName}`, "#ffd45a");
      Sfx.play("level"); Sfx.play("pad");
      if (this.level % 5 === 0) this.startBoss();
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.score += dt * 10 * this.level * this.scoreMul;
    this.comboT = Math.max(0, this.comboT - dt);
    this.magnetT = Math.max(0, this.magnetT - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.updateTutorial();

    // Orbital mechanics: inner rings orbit faster (Kepler-ish), and turning
    // has inertia. Ring changes are a spring-damper radial move.
    const radiusFactor = Math.pow(RINGS[1] / Math.max(40, this.ringVis), 0.75);
    const targetOmega = this.dir * (1.6 + 0.08 * lvl) * radiusFactor * this.ship.ringSpeed;
    this.angularVel += (targetOmega - this.angularVel) * Math.min(1, dt * 7);
    this.angle += this.angularVel * dt;
    const targetRadius = RINGS[this.ring];
    const radialAccel = (targetRadius - this.ringVis) * 180 - this.radialVel * 30;
    this.radialVel += radialAccel * dt;
    this.ringVis += this.radialVel * dt;
    if (Math.abs(targetRadius - this.ringVis) < 0.5 && Math.abs(this.radialVel) < 1.5) {
      this.ringVis = targetRadius; this.radialVel = 0;
    }
    const [px, py] = this.playerPos();

    if (this.runTime - this.lastGhostSample >= 0.12 && this.ghostSamples.length < 2000) {
      this.ghostSamples.push([this.runTime, this.angle, this.ringVis]);
      this.lastGhostSample = this.runTime;
    }
    this.shipTrail.push([this.angle, this.ringVis]);
    if (this.shipTrail.length > 6) this.shipTrail.shift();
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = 0.035;
      this.parts.push({ x: px, y: py, vx: 0, vy: 0, col: this.trailColor, life: 0.25, max: 0.25 });
    }
    this.musicT -= dt;
    if (this.musicT <= 0) {
      this.musicT = Math.max(0.32, 0.7 - 0.03 * this.level);
      this.musicBeat = (this.musicBeat || 0) + 1;
      Sfx.play(this.level >= 5 ? "beat2" : "beat");
      if (this.musicBeat % 4 === 0) Sfx.play("arp", 1 + (this.level % 5) * 0.04);
    }

    if (this.comboT <= 0 && this.combo > 1) {
      if (this.combo >= 3) this.float(px, py - 50, "combo lost", "#c86464");
      this.combo = 1;
    }

    // solar flares: telegraph a ring, then burn it
    if (!this.boss) {
      if (this.flareT > 0) {
        this.flareT -= dt;
        if (this.flareT <= 0 && this.fireFlare()) return;
      } else {
        this.flareCD -= dt;
        if (this.level >= 2 && this.flareCD <= 0) {
          this.flareRing = this.rndInt(3);
          this.flareT = 2.6;
          this.float(CX, CY - 240, `FLARE -> ${RING_NAMES[this.flareRing]}`, "#ff9a3c");
          Sfx.play("warn");
        }
      }
    }
    this.updateBoss(dt);

    // spawn meteors
    const bossMul = this.boss ? 0.55 : 1;
    if ((this.spawnT -= dt) <= 0 && this.meteors.length < 44) {
      const n = 1 + (this.chance(Math.min(0.5, lvl * 0.06)) ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const type = this.pickMeteorType();
        this.meteors.push(this.spawnMeteor(
          this.rnd(0, TAU),
          (130 + 16 * lvl) * this.rnd(.8, 1.25) * this.meteorMul * (this.boss ? 1.1 : 1),
          this.rnd(14, 24), type.id,
        ));
      }
      this.spawnT = Math.max(0.24, (1 - 0.07 * lvl) * bossMul) * this.rnd(.7, 1.2);
    }
    // spawn crystals (biased toward the player's ring)
    if ((this.gemT -= dt) <= 0 && this.gems.length < 4) {
      const ring = this.chance(0.55) ? this.ring : this.rndInt(3);
      this.gems.push({ ring, angle: this.rnd(0, TAU), life: 6 });
      this.gemT = this.rnd(1.1, 2.1) / (this.gemRate || 1);
    }
    // power-ups
    if (this.powerup) {
      this.powerup.life -= dt;
      if (this.powerup.life <= 0) { this.powerup = null; this.powerupT = this.rnd(14, 22); }
    } else if ((this.powerupT -= dt) <= 0) {
      this.spawnPowerup();
    }

    const speedScale = this.slowT > 0 ? 0.5 : 1;
    const alive = [];
    for (const m of this.meteors) {
      if (m.dead) continue;
      if (m.kind === "splitter" && !m.split && m.r < 230) {
        m.split = true;
        for (const off of [-0.16, 0.16]) {
          const child = this.spawnMeteor(m.angle + off, m.speed * 0.85, m.size * 0.56, "normal", m.r);
          child.split = true;
          alive.push(child);
        }
        this.burst(CX + Math.cos(m.angle) * m.r, CY + Math.sin(m.angle) * m.r, ["#7affb0"], 14, 160, .5);
        continue;
      }
      const prevX = CX + Math.cos(m.angle) * m.r, prevY = CY + Math.sin(m.angle) * m.r;
      const entryMul = m.entry > 0 ? 0.4 : 1;
      m.entry = Math.max(0, (m.entry || 0) - dt);
      m.speed = Math.min(560, m.speed + 55 * speedScale * dt * (this.boss ? 1.25 : 1));
      // conservation of angular momentum makes falling rocks curve faster
      m.angle += (m.spin + 26 / Math.max(80, m.r)) * dt;
      m.rot = (m.rot || 0) + (m.spin + 0.5) * dt;
      m.r -= m.speed * speedScale * entryMul * dt;
      const mx = CX + Math.cos(m.angle) * m.r, my = CY + Math.sin(m.angle) * m.r;
      const d = segDist(px, py, prevX, prevY, mx, my), hitR = m.size + 9;
      if (d < hitR) {
        if (this.invuln > 0) { alive.push(m); continue; }
        if (this.shield) {
          this.shield = false; this.invuln = 1.2; Sfx.play("shield"); vibrate(60);
          this.hitStop = Math.max(this.hitStop, 0.06); this.flash = Math.max(this.flash, 0.2);
          if (m.kind === "volatile") this.explodeMeteor(m);
          this.burst(mx, my, ["#78c8ff"], 30, 280, .7); continue;
        }
        this.die("meteor"); return;
      }
      if (!m.near && d < hitR + 28 && this.invuln <= 0) {
        m.near = true; this.nearMisses++; this.save.stats.near++;
        const pts = Math.round(15 * this.combo * this.scoreMul * (m.nearMult || 1)); this.score += pts;
        Sfx.play("near"); this.hitStop = Math.max(this.hitStop, 0.02);
        this.bumpCombo();
        this.float(px, py - 30, `CLOSE! +${pts}`, "#ffe678");
        this.addShock(px, py, "#ffe678", 70, 0.3);
      }
      m.trailT = (m.trailT || 0) - dt;
      if (m.trailT <= 0 && m.r < 470) {
        m.trailT = 0.055;
        this.parts.push({ x: mx, y: my, vx: 0, vy: 0,
          col: this.slowT > 0 ? "#6a5a8a" : "#ff8a3c", life: 0.32, max: 0.32 });
      }
      if (m.r < 50) {
        if (m.kind === "volatile") {
          this.explodeMeteor(m);
        } else if (m.kind === "gold") {
          const gain = 2;
          this.crystals += gain; this.crystalGain += gain; this.save.lifetime += gain;
          this.float(mx, my, `GOLD +${gain}`, "#ffd45a");
        }
        this.burst(mx, my, ["#ffa03c", "#ff5a3c"], 12, 170, .6);
        continue;
      }
      alive.push(m);
    }
    this.meteors = alive.filter(m => !m.dead);

    this.gems = this.gems.filter(g => {
      g.life -= dt;
      const gx = CX + Math.cos(g.angle) * RINGS[g.ring], gy = CY + Math.sin(g.angle) * RINGS[g.ring];
      const pickupR = 26 + this.magnetBonus + (this.magnetT > 0 ? 70 : 0);
      if (Math.hypot(gx - px, gy - py) < pickupR) {
        const gain = this.crystalMul;
        this.crystals += gain; this.crystalGain += gain;
        this.save.lifetime += gain; this.gemsCollected++;
        const pts = Math.round(25 * this.combo * this.scoreMul); this.score += pts;
        this.float(gx, gy, `+${pts}`, "#78e6ff");
        this.bumpCombo();
        Sfx.play(this.combo >= 5 ? "gem3" : this.combo >= 3 ? "gem2" : "gem");
        this.addShock(gx, gy, "#78e6ff", 55, 0.3);
        vibrate(15); this.burst(gx, gy, ["#78e6ff"], 16, 200, .5); return false;
      }
      return g.life > 0;
    });

    if (this.powerup) {
      const p = this.powerup;
      const gx = CX + Math.cos(p.angle) * RINGS[p.ring], gy = CY + Math.sin(p.angle) * RINGS[p.ring];
      if (Math.hypot(gx - px, gy - py) < 38) {
        this.applyPowerup(p.kind);
        this.burst(gx, gy, [POWERUP_COLORS[p.kind]], 22, 240, .6);
        this.powerup = null; this.powerupT = this.rnd(16, 24);
      }
    }

    if (this.boss && this.boss.core) {
      const core = this.boss.core;
      const gx = CX + Math.cos(core.angle) * RINGS[core.ring], gy = CY + Math.sin(core.angle) * RINGS[core.ring];
      if (Math.hypot(gx - px, gy - py) < 40) {
        this.boss.cores++;
        const pts = Math.round(250 * this.level * this.scoreMul); this.score += pts;
        this.float(gx, gy, `CORE +${pts}`, "#ffd45a");
        this.burst(gx, gy, ["#ffd45a", "#ff9a3c"], 30, 280, .7);
        Sfx.play("power"); vibrate(30);
        this.boss.core = null; this.boss.coreT = 1;
        if (this.boss && this.boss.cores >= this.boss.need) this.clearBoss();
      }
    }
  }

  // ---- render -----------------------------------------------------------
  drawGemStore(c) {
    this.drawSpace(c, 0, 0);
    c.fillStyle = "rgba(3,3,10,0.74)"; c.fillRect(0, 0, W, H);
    panel(c, 50, 60, W - 100, 1140, "rgba(7,10,22,0.95)", "rgba(60,220,180,0.24)", 26);
    text(c, "GEM STORE", W / 2, 112, 46, "#3cdcb4", true);
    text(c, "Gems revive your run. Each revive doubles the price.", W / 2, 150, 16, "#9696aa");
    panel(c, 80, 182, W - 160, 68, "rgba(20,80,70,0.28)", "rgba(60,220,180,0.28)", 14);
    gemIcon(c, 118, 216, 22, "#3cdcb4");
    text(c, `${this.save.gems} GEMS`, 154, 216, 28, "#78ff8c", true, "left");
    text(c, `NEXT CONTINUE ${this.continueCost()}`, W - 102, 216, 15, "#78e6ff", true, "right");
    if (this.iap.demo) {
      text(c, "DEMO STORE - no real charge in this browser build", W / 2, 272, 14, "#ffb06a");
    } else if (!this.iap.available) {
      text(c, "STORE UNAVAILABLE - configure native purchases", W / 2, 272, 14, "#ff8a8a");
    }
    GEM_PACKS.forEach((pack, i) => {
      const y = 296 + i * 132;
      panel(c, 70, y, W - 140, 116, "rgba(255,255,255,0.04)", "rgba(60,220,180,0.16)", 16);
      gemIcon(c, 110, y + 58, 24, "#3cdcb4");
      text(c, `+${pack.gems}`, 150, y + 46, 34, "#fff", true, "left");
      text(c, pack.name, 150, y + 82, 15, "#78e6ff", true, "left");
      text(c, pack.price, 390, y + 58, 26, "#ffd45a", true);
      if (this.iap.available) {
        this.smallButton(c, this.storeBusy ? "..." : "BUY", 500, y + 29, 120, 58,
          "#3cdcb4", () => this.buyGemPack(pack));
      } else {
        text(c, "N/A", 560, y + 58, 20, "#55557a", true);
      }
    });
    this.button(c, `WATCH AD  ->  +${GEM_AD_REWARD} GEMS`, 830, "#78e6ff",
      () => this.watchGemAd(), 64, "rgba(20,60,90,0.35)");
    this.button(c, this.gemStoreReturn === "over" ? "BACK TO RUN" : "BACK", 912,
      "#c8c8dc", () => this.closeGemStore(), 64);
    text(c, `Ads left this session: ${Math.max(0, MAX_ADS - this.adsUsed)}`, W / 2, 1004, 15, "#828296");
    if (this.storeMessage) text(c, this.storeMessage, W / 2, 1046, 18, "#ffe678");
    text(c, "1-4 buy packs - A watch ad - B / ESC back", W / 2, 1104, 16, "#828296");
    if (this.iap.demo) text(c, "Native iOS/Android builds can use real store billing.", W / 2, 1140, 14, "#55557a");
  }

  drawSettings(c) {
    this.drawSpace(c, 0, 0);
    c.fillStyle = "rgba(3,3,10,0.72)"; c.fillRect(0, 0, W, H);
    panel(c, 60, 80, W - 120, 880, "rgba(7,10,22,0.94)", "rgba(120,200,255,0.2)", 26);
    text(c, "SETTINGS", W / 2, 130, 46, "#ffc85a", true);
    text(c, "Accessibility, effects and audio", W / 2, 168, 16, "#9696aa");
    const toggles = [
      ["colorblind", "COLOR CUES", "dashed flare rings + labels"],
      ["reducedMotion", "REDUCED MOTION", "no shake, afterimages or drifting sky"],
      ["lowFx", "LOW FX", "fewer particles, stars and background layers"],
      ["music", "MUSIC", "procedural pulse and arpeggio"],
      ["sfx", "SOUND FX", "impacts, pickups, UI"],
    ];
    toggles.forEach(([key, label, desc], i) => {
      const y = 220 + i * 105;
      const on = !!this.save.settings[key];
      this.button(c, `${label}   ${on ? "ON" : "OFF"}`, y, on ? "#78ff8c" : "#828296",
        () => this.toggleSetting(key), 78,
        on ? "rgba(30,80,40,0.35)" : "rgba(255,255,255,0.04)");
      text(c, desc, W / 2, y + 86, 13, "#828296");
    });
    if (this.fullscreenAvailable) {
      this.button(c, document.fullscreenElement ? "EXIT FULLSCREEN" : "FULLSCREEN", 730,
        "#78c8ff", () => this.toggleFullscreen(), 50);
    }
    if (this.installPrompt) {
      this.button(c, "INSTALL ORBIT RUNNER", 792, "#3cdcb4", () => this.installApp(), 54,
        "rgba(20,80,70,0.35)");
    }
    this.button(c, "BACK", 856, "#c8c8dc", () => this.goTitle(), 60);
    text(c, "1-5 toggle - B / ESC back", W / 2, 940, 17, "#828296");
  }

  drawShop(c) {
    this.drawSpace(c, 0, 0);
    c.fillStyle = "rgba(3,3,10,0.72)"; c.fillRect(0, 0, W, H);
    panel(c, 40, 50, W - 80, 1100, "rgba(7,10,22,0.94)", "rgba(180,140,255,0.24)", 26);
    text(c, "CUSTOMIZE", W / 2, 102, 44, "#ffc85a", true);
    text(c, `BANK ${this.save.bank} CRYSTALS`, W / 2, 142, 18, "#78ff8c", true);
    const tabs = [["trail", "TRAILS"], ["skin", "SHIP SKINS"], ["title", "TITLES"]];
    tabs.forEach(([id, label], i) => {
      this.smallButton(c, label, 80 + i * 190, 174, 170, 48,
        this.shopTab === id ? "#ffd45a" : "#55557a", () => { this.shopTab = id; });
    });
    const items = SHOP_ITEMS.filter(i => i.type === this.shopTab);
    items.forEach((item, i) => {
      const y = 252 + i * 104;
      const owned = this.save.cosmetics.owned.includes(item.id);
      const equipped = this.save.cosmetics.equipped[item.type] === item.id;
      panel(c, 60, y, W - 120, 88,
        equipped ? "rgba(120,255,140,0.08)" : "rgba(255,255,255,0.035)",
        equipped ? "rgba(120,255,140,0.45)" : "rgba(255,255,255,0.07)", 14);
      text(c, item.name, 82, y + 30, 20, equipped ? "#78ff8c" : "#e8eef8", true, "left");
      const status = equipped ? "EQUIPPED" : owned ? "OWNED" : `${item.cost} CRYSTALS`;
      text(c, status, 82, y + 60, 14, equipped ? "#78ff8c" : owned ? "#9696aa" : "#ffd45a", false, "left");
      this.smallButton(c, equipped ? "ACTIVE" : owned ? "EQUIP" : "BUY",
        W - 250, y + 22, 170, 44, equipped ? "#78ff8c" : owned ? "#78c8ff" : "#ffd45a",
        () => this.buyOrEquip(item));
      if (item.type === "trail") {
        circle(c, W - 300, y + 44, 9, item.value);
      }
    });
    if (this.shopMessage) text(c, this.shopMessage, W / 2, 820, 18, "#ffd45a");
    this.button(c, "BACK", 850, "#c8c8dc", () => this.goTitle(), 72);
    text(c, "1/2/3 tabs - B / ESC back", W / 2, 960, 17, "#828296");
  }

  drawSpace(c, ox = 0, oy = 0) {
    const st = this.save.settings;
    c.fillStyle = "#060610"; c.fillRect(0, 0, W, H);
    if (!st.lowFx) {
      const drift = st.reducedMotion ? 0 : Math.sin(this.time * 0.07) * 18;
      c.globalCompositeOperation = "lighter";
      glowBlob(c, W * 0.22 + drift, H * 0.18, 330, this.biome.tint);
      glowBlob(c, W * 0.82 - drift, H * 0.32, 290, "rgba(14,58,100,0.16)");
      glowBlob(c, W * 0.55, H * 0.88, 360, "rgba(74,26,60,0.12)");
      c.globalCompositeOperation = "source-over";
      // distant ringed planet
      const px = W * 0.83 + ox * 0.2, py = H * 0.21 + oy * 0.2;
      circle(c, px, py, 82, "rgba(80,160,255,0.05)");
      if (typeof c.createRadialGradient === "function") {
        const g = c.createRadialGradient(px - 22, py - 24, 6, px, py, 58);
        if (g && g.addColorStop) {
          g.addColorStop(0, "#4c7f9e"); g.addColorStop(0.55, "#25465f"); g.addColorStop(1, "#0d1c2b");
          c.fillStyle = g; c.beginPath(); c.arc(px, py, 56, 0, TAU); c.fill();
        } else circle(c, px, py, 56, "#25465f");
      } else circle(c, px, py, 56, "#25465f");
      c.save(); c.translate(px, py); c.rotate(-0.32);
      c.beginPath(); c.ellipse(0, 0, 92, 20, 0, 0, TAU);
      c.lineWidth = 3; c.strokeStyle = "rgba(170,210,230,0.22)"; c.stroke();
      c.restore();
    }

    // parallax starfield
    for (let i = 0; i < this.stars.length; i++) {
      if (st.lowFx && i % 3 !== 0) continue;
      const [x, y, b, depth] = this.stars[i];
      const sx = (x + Math.sin(this.time * 0.03 + b * 6) * 6 + W) % W;
      const sy = (y + this.time * 7 * depth) % H;
      const v = Math.floor(50 + 130 * b * (0.6 + 0.4 * Math.sin(this.time * 2 + x)));
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.fillRect(sx, sy, depth > 0.7 ? 2 : 1, depth > 0.7 ? 2 : 1);
    }
    if (!st.lowFx && !st.reducedMotion) {
      for (const s of this.shooting) {
        c.globalAlpha = Math.max(0, Math.min(0.7, s.life / s.max));
        c.strokeStyle = "#d8ecff"; c.lineWidth = 2;
        c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x - s.vx * 0.08, s.y - s.vy * 0.08); c.stroke();
        c.globalAlpha = 1;
      }
    }
  }

  draw(c) {
    this.buttons = [];
    if (this.state === "campaign") return this.drawCampaignMap(c);
    if (this.state === "ending") return this.drawCampaignEnding(c);
    if (this.state === "explore") return this.drawPlanetExplore(c);
    if (this.state === "archive") return this.drawStoryArchive(c);
    if (this.state === "board") return this.drawBoard(c);
    if (this.state === "shop") return this.drawShop(c);
    if (this.state === "settings") return this.drawSettings(c);
    if (this.state === "gems" && !this.ads.showing) return this.drawGemStore(c);
    if (this.ads.showing) return this.ads.draw(c);
    const canShake = this.shake > 0 && !this.save.settings.reducedMotion;
    const ox = canShake ? rand(-8, 8) : 0, oy = canShake ? rand(-8, 8) : 0;
    this.drawSpace(c, ox, oy);
    const glow = 46 + 5 * Math.sin(this.time * 3);
    circle(c, CX + ox, CY + oy, 118 + 6 * Math.sin(this.time * 2), "rgba(255,110,40,0.06)");
    circle(c, CX + ox, CY + oy, 82, "rgba(255,150,60,0.08)");
    this.biome.star.forEach((col, i) => circle(c, CX + ox, CY + oy, glow + 22 - i * 11, col));
    for (let i = 0; i < 4; i++) {
      const a = this.time * 0.35 + i * TAU / 4;
      c.beginPath(); c.arc(CX + ox, CY + oy, 62 + i * 4, a, a + 0.32);
      c.lineWidth = 3; c.strokeStyle = "rgba(255,170,80,0.22)"; c.stroke();
    }
    RINGS.forEach((r, i) => {
      const active = i === this.ring && this.state === "play";
      if (active) circle(c, CX + ox, CY + oy, r, "rgba(140,140,255,0.18)", 8);
      circle(c, CX + ox, CY + oy, r, active ? this.biome.ring : this.biome.ringDim, 2);
    });

    if (this.flareT > 0 && this.flareRing >= 0) {
      c.globalAlpha = 0.45 + 0.45 * Math.sin(this.time * 14);
      if (this.save.settings.colorblind) {
        c.save();
        if (c.setLineDash) c.setLineDash([14, 10]);
        circle(c, CX + ox, CY + oy, RINGS[this.flareRing], "#ff5a2a", 8);
        if (c.setLineDash) c.setLineDash([]);
        c.restore();
        const ax = CX + Math.cos(-Math.PI / 2) * RINGS[this.flareRing] + ox;
        const ay = CY + Math.sin(-Math.PI / 2) * RINGS[this.flareRing] + oy;
        circle(c, ax, ay, 12, "#ff5a2a");
        text(c, "!", ax, ay + 1, 18, "#0a1020", true);
      } else {
        circle(c, CX + ox, CY + oy, RINGS[this.flareRing], "#ff5a2a", 7);
      }
      c.globalAlpha = 1;
    }
    if (this.boss) {
      for (let i = 0; i < 3; i++) {
        const a = this.time * 1.4 + i * TAU / 3;
        c.beginPath(); c.arc(CX + ox, CY + oy, 345, a, a + 0.55);
        c.lineWidth = 5; c.strokeStyle = "#ff6a3c"; c.stroke();
      }
    }

    // ghost of the best classic run
    if (this.ghost && this.ghost.samples.length) {
      const idx = Math.floor(this.runTime / 0.12);
      if (idx < this.ghost.samples.length) {
        const s = this.ghost.samples[idx];
        const gx = CX + Math.cos(s[1]) * s[2] + ox, gy = CY + Math.sin(s[1]) * s[2] + oy;
        c.globalAlpha = 0.28; c.fillStyle = "#78c8ff"; c.beginPath();
        c.arc(gx, gy, 14, 0, TAU); c.fill(); c.globalAlpha = 1;
      }
    }
    if (this.rivalGhost && this.rivalGhost.samples && this.rivalGhost.samples.length) {
      const idx = Math.floor(this.runTime / 0.12);
      if (idx < this.rivalGhost.samples.length) {
        const s = this.rivalGhost.samples[idx];
        const gx = CX + Math.cos(s[1]) * s[2] + ox, gy = CY + Math.sin(s[1]) * s[2] + oy;
        c.globalAlpha = 0.32;
        drawAircraft(c, gx, gy, s[1] + Math.PI / 2,
          { hull: "#ff78dc", wing: "#b44890", trim: "#ffd0f4", accent: "#ffffff" }, this.time, 0);
        c.globalAlpha = 1;
      }
    }

    for (const g of this.gems) {
      if (g.life < 1.5 && Math.floor(this.time * 10) % 2) continue;
      const gx = CX + Math.cos(g.angle) * RINGS[g.ring] + ox, gy = CY + Math.sin(g.angle) * RINGS[g.ring] + oy;
      const rr = 11 + 3 * Math.sin(this.time * 6);
      c.fillStyle = "#78e6ff"; c.beginPath();
      c.moveTo(gx, gy - rr); c.lineTo(gx + rr * .7, gy); c.lineTo(gx, gy + rr); c.lineTo(gx - rr * .7, gy); c.fill();
    }

    if (this.powerup) {
      const p = this.powerup;
      const gx = CX + Math.cos(p.angle) * RINGS[p.ring] + ox, gy = CY + Math.sin(p.angle) * RINGS[p.ring] + oy;
      const col = POWERUP_COLORS[p.kind];
      if (p.life > 2 || Math.floor(this.time * 10) % 2) {
        circle(c, gx, gy, 19 + 3 * Math.sin(this.time * 7), col + "33");
        circle(c, gx, gy, 15, "#0c0a14");
        circle(c, gx, gy, 15, col, 3);
        text(c, POWERUP_LABELS[p.kind], gx, gy + 1, 18, col, true);
      }
    }

    if (this.boss && this.boss.core) {
      const core = this.boss.core;
      const gx = CX + Math.cos(core.angle) * RINGS[core.ring] + ox;
      const gy = CY + Math.sin(core.angle) * RINGS[core.ring] + oy;
      circle(c, gx, gy, 26 + 4 * Math.sin(this.time * 8), "#ffd45a33");
      circle(c, gx, gy, 18, "#0c0a14");
      circle(c, gx, gy, 18, "#ffd45a", 4);
      text(c, "C", gx, gy + 1, 20, "#ffd45a", true);
    }

    for (const m of this.meteors) {
      if (m.dead) continue;
      const mx = CX + Math.cos(m.angle) * m.r + ox, my = CY + Math.sin(m.angle) * m.r + oy;
      const slow = this.slowT > 0;
      const mt = this.meteorType(m.kind);
      // re-entry tail
      const tailR = m.r + m.speed * 0.10;
      const tx = CX + Math.cos(m.angle) * tailR + ox, ty = CY + Math.sin(m.angle) * tailR + oy;
      c.globalAlpha = 0.22; c.strokeStyle = slow ? "#8a7ab0" : mt.color; c.lineWidth = m.size * 0.9;
      c.beginPath(); c.moveTo(tx, ty); c.lineTo(mx, my); c.stroke(); c.globalAlpha = 1;
      const glowCol = m.kind === "gold" ? "rgba(255,212,90,0.14)"
        : m.kind === "volatile" ? "rgba(255,90,40,0.14)"
        : m.kind === "ice" ? "rgba(100,220,255,0.12)"
        : slow ? "rgba(120,90,180,0.08)" : "rgba(255,110,50,0.09)";
      circle(c, mx, my, m.size * 1.8, glowCol);
      // irregular rotating rock
      c.save(); c.translate(mx, my); c.rotate(m.rot || 0);
      const shape = m.shape || [1, 1, 1, 1, 1, 1, 1];
      c.beginPath();
      for (let i = 0; i < shape.length; i++) {
        const a = i / shape.length * TAU;
        const rr = m.size * shape[i];
        if (i === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath();
      c.fillStyle = slow ? "#6a5a88" : mt.color; c.fill();
      c.lineWidth = 2; c.strokeStyle = slow ? "#9a8ac0" : mt.shade; c.stroke();
      c.fillStyle = slow ? "#4a3e62" : mt.shade;
      circle(c, -m.size * 0.25, -m.size * 0.2, m.size * 0.22);
      circle(c, m.size * 0.3, m.size * 0.25, m.size * 0.15);
      c.restore();
      if (m.r > 380) circle(c, CX + Math.cos(m.angle) * 370, CY + Math.sin(m.angle) * 370, 4, "#ff5050");
    }

    if (this.state === "play") {
      const [px, py] = this.playerPos();
      const magnetR = 95 + this.magnetBonus;
      const livery = this.skinLivery || SKIN_LIVERIES.scout;
      const facing = Math.sign(this.angularVel) || this.dir;
      const a = this.angle + facing * Math.PI / 2;
      if (this.magnetT > 0) {
        for (const g of this.gems) {
          const gx = CX + Math.cos(g.angle) * RINGS[g.ring], gy = CY + Math.sin(g.angle) * RINGS[g.ring];
          if (Math.hypot(gx - px, gy - py) < 190) {
            c.globalAlpha = 0.16; c.strokeStyle = "#ff78dc"; c.lineWidth = 1.5;
            c.beginPath(); c.moveTo(px + ox, py + oy); c.lineTo(gx + ox, gy + oy); c.stroke();
            c.globalAlpha = 1;
          }
        }
        circle(c, px + ox, py + oy, magnetR, "rgba(255,120,220,0.35)", 3);
      }
      // short afterimage trail
      if (!this.save.settings.reducedMotion && !this.save.settings.lowFx) {
        c.globalAlpha = 0.05;
        for (let i = 0; i < this.shipTrail.length - 1; i += 2) {
          const tr = this.shipTrail[i];
          drawAircraft(c, CX + Math.cos(tr[0]) * tr[1] + ox,
            CY + Math.sin(tr[0]) * tr[1] + oy, tr[0] + facing * Math.PI / 2, livery, this.time, 0);
        }
        c.globalAlpha = 1;
      }
      if (this.invuln <= 0 || Math.floor(this.time * 12) % 2) {
        drawAircraft(c, px + ox, py + oy, a, livery, this.time, Math.abs(this.angularVel));
      }
      if (this.shield) {
        circle(c, px + ox, py + oy, 24 + 2 * Math.sin(this.time * 8), "rgba(120,200,255,0.22)");
        circle(c, px + ox, py + oy, 22, "#78c8ff", 2);
      }
    }
    c.globalCompositeOperation = "lighter";
    for (const p of this.parts) circle(c, p.x, p.y, Math.max(1, 4 * p.life / p.max), p.col);
    for (const s of this.shocks) {
      c.globalAlpha = Math.max(0, s.life / s.max) * 0.6;
      circle(c, s.x, s.y, s.r, s.col, 2);
      c.globalAlpha = 1;
    }
    c.globalCompositeOperation = "source-over";
    for (const f of this.floats) {
      c.globalAlpha = Math.min(1, f.life * 2);
      text(c, f.s, f.x, f.y, 26, f.col, true);
      c.globalAlpha = 1;
    }

    if (this.flash > 0) {
      c.fillStyle = `rgba(255,140,60,${Math.min(0.35, this.flash * 0.5)})`;
      c.fillRect(0, 0, W, H);
    }
    if (typeof c.createRadialGradient === "function" && !this.save.settings.lowFx) {
      const vignette = c.createRadialGradient(CX, CY, H * 0.28, CX, CY, H * 0.78);
      if (vignette && vignette.addColorStop) {
        vignette.addColorStop(0, "rgba(0,0,0,0)");
        vignette.addColorStop(1, "rgba(0,0,0,0.42)");
        c.fillStyle = vignette; c.fillRect(0, 0, W, H);
      }
    }

    if (this.state === "title") {
      c.fillStyle = "rgba(3,3,10,0.55)";
      c.fillRect(0, 0, W, H);
      this.drawTitle(c);
    } else {
      this.drawHud(c);
      if (this.state === "over") this.drawOver(c);
      if (this.paused) this.drawPause(c);
      if (this.tutorialActive && this.state === "play" && !this.paused) this.drawTutorial(c);
    }
  }

  drawTutorial(c) {
    const messages = [
      "STEP 1/4  -  Swipe up/down (W/S) to change rings",
      "STEP 2/4  -  Fly through a crystal to build combo",
      "STEP 3/4  -  Tap or SPACE to reverse orbit",
      "STEP 4/4  -  Flare incoming: move to another ring",
      "Tutorial complete - chase the ghost and bank crystals",
    ];
    const idx = clamp(this.tutorialStep, 0, 4);
    panel(c, 52, H - 176, W - 104, 86, "rgba(7,11,22,0.88)", "rgba(120,200,255,0.28)", 16);
    text(c, "TUTORIAL", 76, H - 150, 14, "#78e6ff", true, "left");
    text(c, messages[idx], W / 2, H - 126, 19, "#fff", true);
    for (let i = 0; i < 5; i++) {
      circle(c, W / 2 - 40 + i * 20, H - 104, 4, i <= idx ? "#78e6ff" : "#2a3148");
    }
  }

  button(c, label, y, col, fn, h = 90, fill = "rgba(255,255,255,0.08)") {
    const x = 80, w = W - 160;
    c.fillStyle = fill; c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, 18) : c.rect(x, y, w, h); c.fill();
    c.lineWidth = 2; c.strokeStyle = col; c.stroke();
    text(c, label, W / 2, y + h / 2, 30, col, true);
    this.buttons.push({ x, y, w, h, fn });
  }
  smallButton(c, label, x, y, w, h, col, fn) {
    c.fillStyle = "rgba(255,255,255,0.07)"; c.beginPath();
    c.roundRect ? c.roundRect(x, y, w, h, 10) : c.rect(x, y, w, h); c.fill();
    c.lineWidth = 2; c.strokeStyle = col; c.stroke();
    text(c, label, x + w / 2, y + h / 2, 20, col, true);
    this.buttons.push({ x, y, w, h, fn });
  }
  missionLine(c, m, y, size = 20) {
    const pct = clamp(m.progress / m.target, 0, 1);
    const col = m.completed ? "#78ff8c" : "#c8c8dc";
    text(c, m.text, 80, y, size, col, false, "left");
    text(c, m.completed ? `DONE +${m.reward}` : `${m.progress}/${m.target} +${m.reward}`,
      W - 80, y, size - 2, m.completed ? "#78ff8c" : "#9696aa", false, "right");
    c.fillStyle = "#22223a"; c.fillRect(80, y + size + 3, W - 160, 5);
    c.fillStyle = m.completed ? "#78ff8c" : "#78c8ff";
    c.fillRect(80, y + size + 3, (W - 160) * pct, 5);
  }

  drawHud(c) {
    const mode = this.mode === "daily" ? "DAILY"
      : this.mode === "ranked" ? "RANKED" : this.contract.name;
    panel(c, 16, 14, 280, 88, "rgba(7,11,22,0.78)", "rgba(120,200,255,0.18)");
    text(c, `SCORE`, 30, 38, 15, "#7f8ba3", true, "left");
    text(c, `${Math.floor(this.score)}`, 30, 64, 36, "#fff", true, "left");
    text(c, `LV ${this.level} ${this.levelName} - ${mode} - ${this.biome.name}`, 30, 86, 13, "#9aa6c0", false, "left");
    const levelPct = (this.elapsed % 15) / 15;
    c.fillStyle = "#1c2236"; c.fillRect(30, 96, 252, 4);
    c.fillStyle = "#78e6ff"; c.fillRect(30, 96, 252 * levelPct, 4);

    panel(c, W - 250, 14, 234, 88, "rgba(7,11,22,0.78)", "rgba(255,212,90,0.22)");
    const comboCol = this.combo >= 8 ? "#ff8a4a" : this.combo >= 4 ? "#ffe678" : "#c8c8dc";
    text(c, `x${this.combo}`, W - 30, 42, 38, comboCol, true, "right");
    const tier = this.combo >= 8 ? "OVERDRIVE" : this.combo >= 6 ? "BLAZING" : this.combo >= 4 ? "HOT" : this.combo >= 2 ? "WARM" : "READY";
    text(c, tier, W - 30, 66, 13, comboCol, true, "right");
    const segW = 21;
    for (let i = 0; i < MAX_COMBO; i++) {
      const x = W - 236 + i * (segW + 5);
      c.fillStyle = i < this.combo ? comboCol : "#24243a";
      c.fillRect(x, 80, segW, 7);
    }
    c.fillStyle = "#24243a"; c.fillRect(W - 236, 92, 200, 3);
    c.fillStyle = comboCol; c.fillRect(W - 236, 92, 200 * clamp(this.comboT / this.comboTime, 0, 1), 3);

    gemIcon(c, W - 140, 116, 8);
    text(c, `${this.crystals}`, W - 30, 116, 20, "#78e6ff", true, "right");

    const chips = [];
    if (this.shield) chips.push(["SHIELD", "#78c8ff"]);
    if (this.magnetT > 0) chips.push([`MAGNET ${this.magnetT.toFixed(1)}`, "#ff78dc"]);
    if (this.slowT > 0) chips.push([`WARP ${this.slowT.toFixed(1)}`, "#b48cff"]);
    chips.forEach(([s, col], i) => {
      const x = 24 + i * 150;
      panel(c, x, 122, 140, 24, "rgba(8,12,24,0.55)", "rgba(255,255,255,0.08)", 8);
      text(c, s, x + 70, 134, 13, col, true);
    });
    if (this.ghost && this.mode === "classic")
      text(c, `GHOST ${this.ghost.score}`, 30, 196, 14, "#5c6f8a", false, "left");

    if (this.boss) {
      panel(c, W / 2 - 160, 154, 320, 32, "rgba(30,10,6,0.72)", "rgba(255,106,60,0.5)", 10);
      text(c, `CORONA SURGE ${this.boss.cores}/${this.boss.need}  ${Math.max(0, this.boss.timer).toFixed(1)}s`,
        W / 2, 170, 19, "#ff8a4a", true);
    } else if (this.flareT > 0 && this.flareRing >= 0) {
      panel(c, W / 2 - 160, 154, 320, 32, "rgba(30,10,6,0.72)", "rgba(255,106,60,0.5)", 10);
      c.globalAlpha = 0.6 + 0.4 * Math.sin(this.time * 14);
      text(c, `FLARE: ${RING_NAMES[this.flareRing]} RING ${this.flareT.toFixed(1)}`, W / 2, 170, 19, "#ff8a4a", true);
      c.globalAlpha = 1;
    }

    this.smallButton(c, this.paused ? ">" : "II", 312, 20, 46, 44, "#c8c8dc", () => this.togglePause());
    this.smallButton(c, this.save.muted ? "MX" : "M", 362, 20, 46, 44,
      this.save.muted ? "#ff8a8a" : "#c8c8dc", () => this.toggleMute());
  }

  drawMissions(c, y) {
    text(c, "DAILY MISSIONS", 80, y - 34, 22, "#c8c8dc", true, "left");
    text(c, `GEMS ${this.save.gems}  DONE ${this.save.missionsDone}`, W - 80, y - 34, 18, "#78c8ff", false, "right");
    this.save.missions.forEach((m, i) => this.missionLine(c, m, y + i * 42, 20));
  }

  drawCampaignMap(c) {
    c.fillStyle = "rgba(2, 5, 16, 0.97)"; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      const x = (i * 137 + 41) % W, y = (i * 211 + 19) % H;
      circle(c, x, y, i % 9 === 0 ? 2 : 1, i % 3 === 0 ? "rgba(120,200,255,0.6)" : "rgba(210,225,255,0.38)");
    }
    text(c, "THE LOST SYSTEMS", W / 2, 68, 34, "#d9edff", true);
    text(c, "SECTOR NAVIGATION  /  SELECT A DESTINATION", W / 2, 108, 14, "#7fa7c8", true);
    c.strokeStyle = "rgba(95, 166, 220, 0.55)"; c.lineWidth = 3; c.beginPath();
    CAMPAIGN_SECTORS.forEach((sector, i) => {
      const x = 104, y = 218 + i * 210;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    });
    c.stroke();
    CAMPAIGN_SECTORS.forEach((sector, i) => {
      const x = 38, y = 150 + i * 210, w = W - 76, h = 178;
      const selected = sector.id === this.campaignSelectedSector;
      const unlocked = this.campaignUnlocked(sector);
      const completed = this.save.campaign.completed.includes(sector.id);
      panel(c, x, y, w, h,
        selected ? "rgba(16, 36, 58, 0.94)" : "rgba(7, 15, 31, 0.88)",
        selected ? "rgba(120, 220, 255, 0.9)" : "rgba(120, 170, 210, 0.24)", 16);
      const px = 104, py = y + 68, pr = 27;
      if (typeof c.createRadialGradient === "function") {
        const glow = c.createRadialGradient(px, py, 2, px, py, 47);
        glow.addColorStop(0, sector.biome === "ember" ? "rgba(255,125,70,0.9)" :
          sector.biome === "ice" ? "rgba(110,225,255,0.9)" :
          sector.biome === "void" ? "rgba(160,120,255,0.9)" : "rgba(100,180,255,0.9)");
        glow.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = glow; c.fillRect(px - 48, py - 48, 96, 96);
      }
      const planetCol = sector.biome === "ember" ? "#ff874f" : sector.biome === "ice" ? "#8deaff" :
        sector.biome === "void" ? "#a18bff" : "#78c8ff";
      circle(c, px, py, pr, planetCol);
      circle(c, px - 8, py - 8, 10, "rgba(255,255,255,0.28)");
      c.strokeStyle = "rgba(210,230,255,0.55)"; c.lineWidth = 2; c.beginPath();
      c.ellipse(px, py, pr + 13, 8, -0.24, 0, TAU); c.stroke();
      const titleCol = unlocked ? "#e6f3ff" : "#718096";
      text(c, `${i + 1}. ${sector.name}`, 153, y + 36, 20, titleCol, true, "left");
      text(c, sector.subtitle, 153, y + 62, 12, unlocked ? "#80d8ff" : "#65738a", true, "left");
      text(c, sector.description, 153, y + 94, 13, "#b8c6d9", false, "left");
      const mastery = this.sectorMastery(sector.id);
      text(c, mastery.mastered ? "SECTOR MASTERED" : completed ? "SECTOR CHARTED" : unlocked ? "ROUTE AVAILABLE" : "ROUTE LOCKED",
        153, y + 126, 13, mastery.mastered ? "#8dffce" : completed ? "#a5c9e8" : unlocked ? "#80d8ff" : "#768096", true, "left");
      text(c, "SURVEYS " + mastery.completedObjectives + "/" + mastery.totalObjectives + "  •  " + sector.biome.toUpperCase(),
        153, y + 151, 11, mastery.mastered ? "#8dffce" : "#778aa4", false, "left");
      this.buttons.push({ x, y, w, h, fn: () => this.selectCampaignSector(sector.id) });
    });
    const selected = this.campaignSector(this.campaignSelectedSector) || CAMPAIGN_SECTORS[0];
    const unlocked = this.campaignUnlocked(selected);
    this.smallButton(c, unlocked ? "LAUNCH SECTOR" : "SECTOR LOCKED",
      38, 1005, 300, 64, unlocked ? "#ffd783" : "#6e778b",
      () => this.launchCampaignSector(selected.id));
    this.smallButton(c, unlocked ? "EXPLORE PLANET" : "EXPLORE LOCKED",
      350, 1005, 332, 64, unlocked ? "#78c8ff" : "#6e778b",
      () => this.openPlanetExplore(selected.id));
    this.smallButton(c, "STORY ARCHIVE", 52, 1080, 270, 56, "#b48cff", () => this.openStoryArchive("campaign"));
    this.smallButton(c, "BACK TO TITLE", 340, 1080, 328, 56, "#83bfe9", () => this.goTitle());
    const progress = this.campaignMastery();
    text(c, this.campaignMessage || ("SECTORS MASTERED " + progress.masteredSectors + "/4  •  OPTIONAL SURVEYS " +
      progress.completedObjectives + "/" + progress.totalObjectives), W / 2, 1168, 13, "#9bb6ce", false);
    text(c, "UP / DOWN SELECT  •  ENTER LAUNCH  •  L ARCHIVE  •  ESC BACK", W / 2, 1214, 12, "#607994");
  }

  drawCampaignEnding(c) {
    const progress = this.campaignMastery();
    c.fillStyle = "rgba(2, 5, 16, 0.99)"; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 110; i++) {
      const x = (i * 173 + 29) % W, y = (i * 197 + 11) % H;
      circle(c, x, y, i % 11 === 0 ? 2 : 1,
        i % 4 === 0 ? "rgba(180,140,255,0.7)" : "rgba(180,220,255,0.38)");
    }
    if (typeof c.createRadialGradient === "function") {
      const glow = c.createRadialGradient(W / 2, 285, 10, W / 2, 285, 280);
      glow.addColorStop(0, "rgba(125,100,255,0.28)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = glow; c.fillRect(W / 2 - 285, 0, 570, 570);
    }
    text(c, "THE SIGNAL ANSWERS", W / 2, 92, 34, "#e7ddff", true);
    text(c, "CAMPAIGN COMPLETE", W / 2, 151, 26, "#8dffce", true);
    text(c, "Four lost systems. One map. A signal finally understood.", W / 2, 195, 15, "#b8c6d9");
    const px = W / 2, py = 318;
    circle(c, px, py, 82, "#493c83");
    circle(c, px, py, 64, "#1d2d56");
    circle(c, px - 20, py - 18, 18, "rgba(255,255,255,0.22)");
    c.strokeStyle = "rgba(180,150,255,0.85)"; c.lineWidth = 3;
    c.beginPath(); c.ellipse(px, py, 128, 32, -0.25, 0, TAU); c.stroke();
    text(c, "SECTOR MASTERY  " + progress.masteredSectors + " / 4", W / 2, 432, 20, "#e4f3ff", true);
    text(c, "OPTIONAL SURVEYS  " + progress.completedObjectives + " / " + progress.totalObjectives,
      W / 2, 466, 16, "#9bb6ce", true);
    progress.sectors.forEach((item, i) => {
      const sector = CAMPAIGN_SECTORS[i], y = 512 + i * 82;
      panel(c, 76, y, W - 152, 66, item.mastered ? "rgba(12,42,43,0.86)" : "rgba(8,16,32,0.92)",
        item.mastered ? "rgba(141,255,206,0.62)" : "rgba(120,190,230,0.24)", 12);
      text(c, sector.name, 96, y + 26, 16, "#e6f3ff", true, "left");
      text(c, item.mastered ? "MASTERED" : item.completedObjectives + "/" + item.totalObjectives + " SURVEYS",
        W - 96, y + 26, 13, item.mastered ? "#8dffce" : "#a8bad1", true, "right");
    });
    text(c, progress.masteredSectors === CAMPAIGN_SECTORS.length
      ? "FRONTIER FULLY MASTERED — EVERY SURVEY RECOVERED"
      : "MAIN STORY COMPLETE — OPTIONAL SURVEYS REMAIN FOR FULL MASTERY",
      W / 2, 874, 14, progress.masteredSectors === CAMPAIGN_SECTORS.length ? "#8dffce" : "#b8c6d9", true);
    this.smallButton(c, "RETURN TO STAR MAP", 76, 938, W - 152, 62, "#78c8ff", () => this.openCampaignMap());
    this.smallButton(c, "STORY ARCHIVE", 76, 1012, (W - 168) / 2, 58, "#b48cff", () => this.openStoryArchive("title"));
    this.smallButton(c, "BACK TO TITLE", 92 + (W - 168) / 2, 1012, (W - 168) / 2, 58, "#83bfe9", () => this.goTitle());
    text(c, "OPTIONAL EXPLORATION NEVER BLOCKS THE CAMPAIGN ENDING", W / 2, 1120, 12, "#607994");
  }

  drawPlanetExplore(c) {
    const sector = this.campaignSector(this.explorationSectorId) || CAMPAIGN_SECTORS[0];
    const objectives = this.explorationObjectives(sector.id);
    const done = objectives.filter(objective => this.explorationDone(objective, sector.id)).length;
    c.fillStyle = "#030713"; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 84; i++) {
      const x = (i * 149 + 17) % W, y = (i * 223 + 37) % H;
      circle(c, x, y, i % 10 === 0 ? 2 : 1, i % 3 === 0 ? "rgba(120,200,255,0.55)" : "rgba(220,230,255,0.28)");
    }
    text(c, "PLANETARY SURVEY", W / 2, 54, 31, "#e4f3ff", true);
    text(c, sector.name + "  /  " + sector.subtitle, W / 2, 91, 13, "#8cb9da", true);
    const planetColor = sector.biome === "ember" ? "#c84d2f" : sector.biome === "ice" ? "#4faac8" :
      sector.biome === "void" ? "#5d438f" : "#376fa8";
    const px = W / 2, py = 282, radius = 112;
    if (typeof c.createRadialGradient === "function") {
      const glow = c.createRadialGradient(px, py, 12, px, py, 205);
      glow.addColorStop(0, sector.biome === "ember" ? "rgba(255,100,55,0.3)" :
        sector.biome === "ice" ? "rgba(100,220,255,0.3)" :
        sector.biome === "void" ? "rgba(160,110,255,0.28)" : "rgba(80,160,255,0.28)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = glow; c.fillRect(px - 210, py - 210, 420, 420);
    }
    circle(c, px, py, radius, planetColor);
    c.save(); c.beginPath(); c.arc(px, py, radius, 0, TAU); c.clip();
    c.fillStyle = "rgba(255,255,255,0.08)";
    c.beginPath(); c.ellipse(px - 30, py - 24, 42, 18, -0.4, 0, TAU); c.fill();
    c.fillStyle = "rgba(0,0,0,0.22)";
    c.beginPath(); c.ellipse(px + 40, py + 42, 65, 24, 0.5, 0, TAU); c.fill();
    c.restore();
    c.strokeStyle = "rgba(170,220,255,0.7)"; c.lineWidth = 2;
    c.beginPath(); c.ellipse(px, py + 12, radius + 28, 34, -0.18, 0, TAU); c.stroke();
    circle(c, px + 158, py - 16, 10, "#e6f7ff");
    circle(c, px + 158, py - 16, 22, "rgba(120,220,255,0.16)");
    text(c, "SURVEY PROGRESS  " + done + " / " + objectives.length, W / 2, 442, 15, "#b9d7ed", true);
    objectives.forEach((objective, i) => {
      const y = 482 + i * 164, completed = this.explorationDone(objective, sector.id);
      panel(c, 36, y, W - 72, 144, completed ? "rgba(12,42,43,0.9)" : "rgba(8,16,32,0.94)",
        completed ? "rgba(141,255,206,0.65)" : "rgba(120,190,230,0.28)", 14);
      circle(c, 70, y + 39, 13, completed ? "#8dffce" : objective.color);
      text(c, completed ? "DATA SECURED" : "SURVEY " + (i + 1), 98, y + 28, 11,
        completed ? "#8dffce" : objective.color, true, "left");
      text(c, objective.title, 58, y + 59, 19, "#e6f3ff", true, "left");
      text(c, objective.detail, 58, y + 85, 12, "#9fb3cc", false, "left");
      this.smallButton(c, completed ? "COMPLETE" : "SCAN",
        500, y + 96, 158, 34, completed ? "#477f76" : objective.color,
        () => this.completeExplorationObjective(objective.id));
      text(c, "REWARD  +" + objective.reward + " CRYSTALS", 58, y + 119, 11, "#8dffce", true, "left");
    });
    this.smallButton(c, "BACK TO STAR MAP", 52, 1002, W - 104, 58, "#78c8ff", () => { this.state = "campaign"; });
    text(c, this.explorationMessage || "Optional surveys persist on this device. Complete each scan once for its reward.",
      W / 2, 1092, 12, "#8aa6c1");
    text(c, "TAP SCAN  •  KEYS 1–3 SCAN OBJECTIVES  •  ESC / B BACK", W / 2, 1140, 12, "#607994");
    text(c, this.save.bank + " CRYSTALS BANKED  /  " +
      (done === objectives.length ? "SECTOR SURVEY COMPLETE" : "OPTIONAL EXPLORATION"),
      W / 2, 1180, 12, "#8dffce", true);
  }

  drawStoryArchive(c) {
    c.fillStyle = "rgba(2, 5, 16, 0.98)"; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 64; i++) {
      const x = (i * 173 + 23) % W, y = (i * 127 + 61) % H;
      circle(c, x, y, i % 8 === 0 ? 2 : 1, i % 3 === 0 ? "rgba(180,140,255,0.62)" : "rgba(210,225,255,0.30)");
    }
    const found = this.save.campaign.discoveries.length;
    text(c, "FRONTIER ARCHIVE", W / 2, 62, 34, "#e4d9ff", true);
    text(c, `RECOVERED INTEL  /  ${found} OF ${STORY_ENTRIES.length} RECORDS`, W / 2, 101, 14, "#9e91c7", true);
    STORY_ENTRIES.forEach((entry, i) => {
      const y = 132 + i * 218, unlocked = this.storyDiscovered(entry);
      const selected = this.storySelectedId === entry.id;
      panel(c, 38, y, W - 76, 194,
        selected ? "rgba(38, 25, 66, 0.88)" : "rgba(9, 12, 28, 0.88)",
        selected ? "rgba(180, 140, 255, 0.78)" : "rgba(150, 140, 190, 0.22)", 14);
      text(c, unlocked ? entry.classification : "ENCRYPTED RECORD", 60, y + 27, 12,
        unlocked ? "#bba0ff" : "#6b6682", true, "left");
      text(c, unlocked ? entry.title : `RECORD ${String(i + 1).padStart(2, "0")}  /  LOCKED`, 60, y + 57, 20,
        unlocked ? "#f0eaff" : "#8a849d", true, "left");
      const lines = unlocked ? entry.body : entry.teaser;
      const words = lines.split(" ");
      let line = "", lineY = y + 88, count = 0;
      for (const word of words) {
        const nextLine = line ? line + " " + word : word;
        if (nextLine.length > 67 && line) {
          text(c, line, 60, lineY, 14, unlocked ? "#c5c8dc" : "#77748a", false, "left");
          line = word; lineY += 23; count++;
          if (count >= 3) break;
        } else line = nextLine;
      }
      if (line && count < 3) text(c, line, 60, lineY, 14, unlocked ? "#c5c8dc" : "#77748a", false, "left");
      text(c, unlocked ? "RECOVERED" : `COMPLETE ${CAMPAIGN_SECTORS[i].name} TO DECRYPT`, W - 58, y + 169, 11,
        unlocked ? "#8dffce" : "#6e778b", true, "right");
      this.buttons.push({ x: 38, y, w: W - 76, h: 194, fn: () => { this.storySelectedId = entry.id; } });
    });
    this.smallButton(c, "BACK", 52, 1024, 270, 60, "#b48cff", () => this.closeStoryArchive());
    this.smallButton(c, this.storyReturnState === "campaign" ? "BACK TO STAR MAP" : "OPEN STAR MAP",
      340, 1024, 328, 60, "#78c8ff", () => {
        this.closeStoryArchive();
        if (this.state === "title") this.openCampaignMap();
      });
    text(c, "ARCHIVE RECORDS ARE SAVED ON THIS DEVICE  •  ESC / B TO RETURN", W / 2, 1130, 13, "#77748a");
  }

  drawTitle(c) {
    c.save();
    c.shadowColor = "#ff8a3c"; c.shadowBlur = 28;
    text(c, "ORBIT", W / 2, 98, 88, "#ffc85a", true);
    text(c, "RUNNER", W / 2, 178, 88, "#ffc85a", true);
    c.restore();
    text(c, "O R B I T A L   S U R V I V A L", W / 2, 236, 15, "#7f8ba3", true);

    // pilot card
    panel(c, 40, 264, W - 80, 62, "rgba(8,12,24,0.82)", "rgba(120,200,255,0.22)");
    this.smallButton(c, `SHIP  ${this.ship.name}`, 54, 276, 210, 38, "#78c8ff", () => this.cycleShip());
    const next = this.nextShip;
    text(c, next ? `LIFETIME ${this.save.lifetime}  NEXT ${next.name} ${next.unlock}` : "ALL SHIPS UNLOCKED",
      278, 296, 15, "#9aa6c0", false, "left");
    if (this.save.bank >= SHIELD_COST || this.buyShield) {
      this.smallButton(c, this.buyShield ? "SHIELD  ON" : `SHIELD  ${SHIELD_COST}`, 500, 276, 166, 38,
        "#78c8ff", () => this.toggleShield());
    } else {
      text(c, "SHIELD  25", 583, 295, 14, "#55557a", true);
    }

    // missions card
    panel(c, 40, 348, W - 80, 196, "rgba(8,12,24,0.80)", "rgba(120,200,255,0.16)");
    this.drawMissions(c, 405);

    // contract card
    panel(c, 40, 560, W - 80, 204, "rgba(8,12,24,0.80)", "rgba(255,212,90,0.16)");
    text(c, "CONTRACT", 58, 585, 18, "#c8c8dc", true, "left");
    text(c, `${this.contract.name} - ${this.contract.desc}`, 58, 610, 16, "#9696aa", false, "left");
    CONTRACTS.forEach((ct, i) => {
      const x = 58 + i * 208;
      this.smallButton(c, ct.name, x, 636, 190, 52, this.save.contract === ct.id ? "#ffd45a" : "#55557a",
        () => this.selectContract(ct.id));
    });
    this.smallButton(c, "OPEN STAR MAP  /  THE LOST SYSTEMS", 54, 700, 330, 44, "#78c8ff", () => this.openCampaignMap());
    this.smallButton(c, `STORY ARCHIVE  ${this.save.campaign.discoveries.length}/${STORY_ENTRIES.length}`, 394, 700, 272, 44,
      "#b48cff", () => this.openStoryArchive("title"));

    // actions
    const challengeWeek = this.challenge && this.challenge.mode === "ranked" ? this.challenge.week : null;
    const challengeDay = this.challenge && this.challenge.mode === "daily" ? this.challenge.date : null;
    const dailyDate = challengeDay || dateKey();
    this.button(c, `>  LAUNCH  ${this.contract.name}`, 784, "#ffd45a", () => this.start("classic"), 76,
      "rgba(90,70,20,0.35)");
    this.button(c, `${challengeWeek ? "RANKED CHALLENGE" : "RANKED WEEKLY"}  ${challengeWeek || weekKey()}`,
      870, "#ff8a4a", () => this.beginMode("ranked"), 72, "rgba(120,50,20,0.35)");
    this.button(c, `DAILY CHALLENGE  ${dailyDate}`, 952, "#78c8ff", () => this.beginMode("daily"), 72,
      "rgba(20,60,90,0.35)");
    [
      ["BOARD", "#b48cff", () => this.openBoard(challengeDay ? "daily" : "weekly")],
      ["CUSTOMIZE", "#ff9adf", () => this.openShop()],
      [`GEMS ${this.save.gems}`, "#3cdcb4", () => this.openGemStore("title")],
      ["SETTINGS", "#78c8dc", () => this.openSettings()],
    ].forEach(([label, col, fn], i) => this.smallButton(c, label, 80 + i * 144, 1034, 128, 62, col, fn));

    const dailyBest = this.save.daily.date === dailyDate ? this.save.daily.best : 0;
    const rankedBest = this.save.ranked.week === (challengeWeek || weekKey()) ? this.save.ranked.best : 0;
    text(c, `WEEKLY ${challengeWeek || weekKey()}  BEST ${rankedBest}    |    DAILY ${dailyDate}  BEST ${dailyBest}`,
      W / 2, 1124, 17, "#ffb06a");
    const profileLine = !Social.configured
      ? "Facebook not configured - edit web/config.js"
      : this.profile ? `FACEBOOK: ${String(this.profile.name).slice(0, 24)}`
        : "Not connected - open the leaderboard to link Facebook";
    text(c, profileLine, W / 2, 1150, 17,
      !Social.configured ? "#ffb06a" : this.profile ? "#78ff8c" : "#828296");
    text(c, `BEST ${this.save.best}   CRYSTALS ${this.save.bank}   GEMS ${this.save.gems}   LIFE ${this.save.lifetime}`,
      W / 2, 1176, 15, "#fff");
    text(c, `TITLE ${this.playerTitle}   TIER ${tierFor(this.save.best).name}`,
      W / 2, 1200, 15, "#c8c8dc");
    text(c, "Crystals buy shields/cosmetics - gems revive runs",
      W / 2, 1224, 15, "#78e6ff");
    text(c, "1/2/3 contract - V ship - R ranked - L archive - B board - C shop - G gems - O settings",
      W / 2, 1248, 14, "#9aa6c0");
    text(c, "P pause - M mute - swipe up/down - tap to reverse", W / 2, 1270, 14, "#828296");
  }

  drawOver(c) {
    c.fillStyle = "rgba(0,0,0,0.76)"; c.fillRect(0, 0, W, H);
    panel(c, 40, 130, W - 80, 1080, "rgba(7,10,22,0.90)", "rgba(255,212,90,0.18)", 28);
    const grade = gradeFor(this.score, this.level, this.maxCombo);
    text(c, "SHIP DESTROYED", W / 2 - 35, 185, 52, "#ff5a5a", true);
    if (this.newBest) {
      c.globalAlpha = 0.55 + 0.45 * Math.sin(this.time * 6);
      text(c, "NEW BEST", W / 2 - 35, 235, 26, "#ffd45a", true);
      c.globalAlpha = 1;
    }
    if (this.mode === "daily")
      text(c, this.newDailyBest ? "NEW DAILY BEST" : `DAILY BEST ${this.save.daily.best}`,
        W / 2 - 35, 268, 20, "#78c8ff", true);
    text(c, `Score ${Math.floor(this.score)}`, W / 2 - 35, 314, 40, "#fff", true);
    text(c, `Crystals ${this.crystals}`, W / 2 - 35, 350, 22, "#78e6ff", true);
    // grade badge
    circle(c, W - 118, 306, 50, "rgba(255,255,255,0.04)");
    circle(c, W - 118, 306, 45, grade.col, 3);
    text(c, grade.letter, W - 118, 304, 48, grade.col, true);
    text(c, grade.label, W - 118, 360, 11, grade.col, true);

    text(c, `TIME ${Math.floor(this.runTime)}s   LEVEL ${this.level}   MAX COMBO x${this.maxCombo}`,
      W / 2, 392, 18, "#c8c8dc");
    text(c, `NEAR ${this.nearMisses}   FLARES ${this.flaresDodged}   SURGES ${this.bossesCleared}`,
      W / 2, 418, 17, "#9696aa");
    text(c, `CRYSTALS ${this.save.bank}  GEMS ${this.save.gems}  LIFETIME ${this.save.lifetime}  TIER ${tierFor(this.save.best).name}`,
      W / 2, 444, 14, "#828296");
    if (this.lastCampaignDiscovery) text(c, `INTEL RECOVERED: ${this.lastCampaignDiscovery}  •  OPEN STORY ARCHIVE`,
      W / 2, 456, 13, "#bba0ff", true);

    panel(c, 68, 462, W - 136, 158, "rgba(10,16,30,0.65)", "rgba(120,200,255,0.12)", 14);
    text(c, "MISSIONS", 86, 482, 17, "#c8c8dc", true, "left");
    this.save.missions.forEach((m, i) => this.missionLine(c, m, 508 + i * 34, 17));

    if (this.competitive) {
      const boardScope = this.mode === "daily" ? "daily" : "weekly";
      const compLabel = this.mode === "daily" ? `DAILY ${this.dailyDate}` : `RANKED WEEK ${this.rankedWeek}`;
      const bestLabel = this.mode === "daily" ? "DAILY BEST" : "WEEKLY BEST";
      const best = this.mode === "daily"
        ? (this.save.daily.date === (this.dailyDate || dateKey()) ? this.save.daily.best : this.dailyBestAtStart || 0)
        : this.save.ranked.best;
      const sub = this.submission;
      const leagueTag = sub && sub.league ? `   -   ${sub.league.name} LEAGUE` : "";
      text(c, `${compLabel}   ${bestLabel} ${best}${leagueTag}`, W / 2, 645, 20, "#ffb06a", true);
      if (!sub || sub.status === "pending") {
        text(c, "SUBMITTING SCORE...", W / 2, 678, 22, "#78c8ff", true);
      } else if (sub.rank && sub.source === "remote") {
        text(c, `GLOBAL RANK #${sub.rank}${sub.total ? ` / ${sub.total}` : ""}`, W / 2, 678, 26, "#78ff8c", true);
      } else if (sub.source === "local") {
        text(c, sub.error || (!CONFIG.apiBase ? "LOCAL BOARD - SET apiBase IN web/config.js"
          : "SCORE SAVED LOCALLY - LINK FACEBOOK FOR GLOBAL RANK"),
          W / 2, 678, 18, (sub.error || !CONFIG.apiBase) ? "#ffb06a" : "#9696aa");
      } else {
        text(c, sub.error || "Score submitted.", W / 2, 678, 18, "#ffb06a");
      }
      const top = this.boardData && this.boardData.entries ? this.boardData.entries.slice(0, 3) : [];
      top.forEach((e, i) => text(c, `${i + 1}. ${String(e.name || "PLAYER").slice(0, 18)}  ${e.score}`,
        W / 2, 716 + i * 24, 18, e.you ? "#ffd45a" : "#c8c8dc"));
      text(c, "One-life: no continues, ads, bought shields or loadout perks.",
        W / 2, 792, 16, "#9696aa");
      this.button(c, "SHARE CHALLENGE", 810, "#b48cff", () => this.shareChallenge(this.score), 76,
        "rgba(70,40,100,0.35)");
      this.smallButton(c, "SHARE RESULT CARD", 80, 894, W - 160, 58, "#ff9adf",
        () => this.shareCard(this.score));
      this.button(c, "LEADERBOARD", 960, "#78c8ff", () => this.openBoard(boardScope), 66);
      this.button(c, "Restart", 1032, "#c8c8dc", () => this.beginMode(this.mode), 64);
      this.button(c, "Title", 1102, "#c8c8dc", () => this.goTitle(), 64);
      if (this.shareMessage) text(c, this.shareMessage, W / 2, 1182, 18, "#ffd45a");
      if (this.message) text(c, this.message, W / 2, 1204, 16, "#ffe678");
      return;
    }

    let y = 642;
    const continueCost = this.continueCost();
    const canContinue = this.save.gems >= continueCost;
    const g = Math.floor(200 + 55 * Math.sin(this.time * 5));
    this.button(c, this.continueLabel(), y, canContinue ? `rgb(${g},255,${g})` : "#ffb06a",
      () => this.requestAd("continue"), 84, canContinue ? "rgba(60,140,40,0.45)" : "rgba(120,70,20,0.35)");
    this.smallButton(c, `GEM STORE  -  ${this.save.gems} GEMS`, 80, y + 92, W - 160, 44,
      "#3cdcb4", () => this.openGemStore("over"));
    y += 146;
    if (!this.doubleUsed && this.crystals > 0)
      this.button(c, `WATCH AD -> DOUBLE (+${this.crystals})`, y, "#78e6ff", () => this.requestAd("double"), 76);
    y += 88;
    this.button(c, "Restart", y, "#c8c8dc", () => this.beginMode(this.mode), 72);
    this.button(c, "Title", y + 88, "#c8c8dc", () => this.goTitle(), 72);
    this.smallButton(c, "SHARE RESULT CARD", 80, y + 176, W - 160, 54, "#ff9adf",
      () => this.shareCard(this.score));
    if (this.shareMessage) text(c, this.shareMessage, W / 2, y + 242, 18, "#ffd45a");
    if (this.message) text(c, this.message, W / 2, y + 268, 20, "#ffe678");
  }

  drawBoard(c) {
    this.drawSpace(c, 0, 0);
    c.fillStyle = "rgba(3,3,10,0.62)"; c.fillRect(0, 0, W, H);
    const boardDate = (this.challenge && this.challenge.mode === "daily" && this.challenge.date) || dateKey();
    const boardWeek = (this.challenge && this.challenge.mode === "ranked" && this.challenge.week) || weekKey();
    const league = this.boardData && this.boardData.league;
    panel(c, 40, 38, W - 80, 148, "rgba(8,12,24,0.82)", "rgba(255,212,90,0.18)", 24);
    text(c, this.boardTab === "league" ? "LEAGUE" : "LEADERBOARD", W / 2, 82, 46, "#ffc85a", true);
    text(c, this.boardTab === "daily" ? boardDate
      : this.boardTab === "league" ? `${league ? league.name : "UNRANKED"} - ${boardWeek}` : boardWeek,
      W / 2, 118, 18, "#9696aa");
    text(c, this.boardTab === "daily" ? `ENDS IN ${dayResetText()}`
      : this.boardTab === "league" ? (league ? `TOP ${league.promoteCount} PROMOTE - BOTTOM ${league.relegateCount} RELEGATE` : "CONNECT FACEBOOK TO JOIN")
        : `RESETS IN ${weekResetText()}`,
      W / 2, 146, 14, "#ffb06a");

    const tabs = [["weekly", "WEEKLY"], ["daily", "DAILY"], ["friends", "FRIENDS"], ["league", "LEAGUE"]];
    tabs.forEach(([id, label], i) => {
      this.smallButton(c, label, 40 + i * 160, 202, 148, 50,
        this.boardTab === id ? "#ffd45a" : "#55557a", () => this.openBoard(id));
    });

    const profile = this.profile;
    text(c, !Social.configured ? "Facebook not configured - edit web/config.js"
      : profile ? `FACEBOOK: ${String(profile.name).slice(0, 24)}` : "Not connected to Facebook",
      W / 2, 280, 19, !Social.configured ? "#ffb06a" : profile ? "#78ff8c" : "#9696aa");
    const source = this.boardData ? this.boardData.source : null;
    if (this.boardLoading) text(c, "LOADING...", W / 2, 308, 18, "#78c8ff");
    else if (this.boardError) text(c, this.boardError, W / 2, 308, 15, "#ffb06a");
    else if (source) text(c, source === "remote" ? "GLOBAL BOARD"
      : CONFIG.apiBase ? "LOCAL / PERSONAL BOARD" : "LOCAL BOARD - SET apiBase FOR GLOBAL RANKS",
      W / 2, 308, 15, source === "remote" ? "#78ff8c" : "#828296");
    if (this.socialMessage) text(c, this.socialMessage, W / 2, 330, 15, "#ffd45a");

    text(c, "RANK", 90, 362, 15, "#828296", true, "left");
    text(c, "PLAYER", 175, 362, 15, "#828296", true, "left");
    text(c, "TIER", W - 190, 362, 15, "#828296", true, "right");
    text(c, "SCORE", W - 70, 362, 15, "#828296", true, "right");

    const entries = this.boardData && Array.isArray(this.boardData.entries)
      ? this.boardData.entries.slice(0, 10) : [];
    if (!entries.length && !this.boardLoading) {
      circle(c, W / 2, 470, 42, "rgba(255,212,90,0.08)");
      circle(c, W / 2, 470, 42, "rgba(255,212,90,0.35)", 2);
      text(c, "1", W / 2, 468, 38, "#ffd45a", true);
      text(c, "No scores on this board yet.", W / 2, 540, 22, "#c8c8dc");
      text(c, "Play a ranked or daily run, then link Facebook.", W / 2, 572, 17, "#828296");
    }
    entries.forEach((entry, i) => {
      const y = 394 + i * 48;
      const isYou = entry.you || (profile && entry.userId && entry.userId === profile.id);
      const tier = tierFor(entry.score || 0);
      const leagueMode = this.boardTab === "league";
      const promote = leagueMode && i < 5;
      const relegate = leagueMode && entries.length > 5 && i >= entries.length - 5;
      panel(c, 56, y - 21, W - 112, 43,
        isYou ? "rgba(255,212,90,0.10)" : promote ? "rgba(120,255,140,0.05)" : relegate ? "rgba(255,90,90,0.05)"
          : i % 2 ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.045)",
        isYou ? "rgba(255,212,90,0.55)" : promote ? "rgba(120,255,140,0.35)" : relegate ? "rgba(255,90,90,0.35)"
          : "rgba(255,255,255,0.06)", 10);
      const medal = i === 0 ? "#ffd45a" : i === 1 ? "#c8d0e0" : i === 2 ? "#d8996a" : "#828296";
      circle(c, 92, y, 14, i < 3 ? medal : "rgba(255,255,255,0.06)");
      text(c, String(entry.rank || i + 1), 92, y + 1, i < 3 ? 15 : 14, i < 3 ? "#0a1020" : "#c8c8dc", true);
      circle(c, 142, y, 15, nameColor(entry.name));
      text(c, initials(entry.name), 142, y + 1, 12, "#0a1020", true);
      text(c, String(entry.name || "PLAYER").slice(0, 16), 172, y - (entry.title ? 7 : 0), 19,
        isYou ? "#ffd45a" : "#c8c8dc", false, "left");
      if (entry.title) text(c, String(entry.title).slice(0, 20), 172, y + 12, 11, "#828296", false, "left");
      text(c, tier.name, W - 190, y, 13, tier.col, true, "right");
      text(c, String(entry.score || 0), W - 70, y, 20, isYou ? "#ffd45a" : "#78e6ff", true, "right");
    });

    const you = this.boardData && this.boardData.you;
    if (you && you.rank) text(c, `YOUR RANK: #${you.rank}${you.total ? ` / ${you.total}` : ""}`,
      W / 2, 905, 19, "#ffd45a", true);

    const connected = !!(profile && Social.token);
    this.button(c, "BACK", 930, "#c8c8dc", () => this.goTitle(), 68);
    this.smallButton(c, "REFRESH", 80, 1008, 260, 68, "#78c8ff", () => this.refreshBoard());
    this.smallButton(c, "RACE TOP GHOST", 370, 1008, 260, 68, "#ff78dc", () => this.raceTopGhost());
    this.button(c, connected ? "DISCONNECT FACEBOOK" : profile ? "RECONNECT FACEBOOK" : "CONNECT FACEBOOK",
      1086, connected ? "#ff8a8a" : "#3cdcb4",
      () => connected ? this.disconnectFacebook() : this.connectFacebook(), 68);
    if (profile) {
      this.button(c, this.deleteArmed ? "CONFIRM DELETE MY DATA" : "DELETE MY DATA",
        1164, "#ff5a5a", () => this.deleteMyData(), 68);
    }
    text(c, "1/2/3/4 tabs - R refresh - G race ghost - F connect - B back", W / 2, 1255, 16, "#828296");
  }

  drawPause(c) {
    c.fillStyle = "rgba(4,4,12,0.84)"; c.fillRect(0, 0, W, H);
    panel(c, 70, 150, W - 140, 930, "rgba(7,10,22,0.92)", "rgba(255,212,90,0.18)", 28);
    text(c, "PAUSED", W / 2, 265, 68, "#ffd45a", true);
    text(c, `SCORE ${Math.floor(this.score)}`, W / 2, 340, 30, "#fff", true);
    text(c, `Level ${this.level} - combo x${this.combo} - orbit on hold`,
      W / 2, 380, 18, "#9696aa");
    text(c, `${this.mode === "daily" ? "DAILY" : this.mode === "ranked" ? `RANKED ${this.rankedWeek}` : this.contract.name} - ${this.ship.name}`,
      W / 2, 414, 18, "#78c8ff");
    this.button(c, "Resume", 470, "#78ff8c", () => this.togglePause(), 96);
    this.button(c, "Restart", 598, "#c8c8dc", () => this.beginMode(this.mode), 96);
    this.button(c, "Title", 726, "#c8c8dc", () => this.goTitle(), 96);
    this.button(c, this.save.muted ? "Settings (muted)" : "Settings", 854,
      this.save.muted ? "#ff8a8a" : "#78e6ff", () => this.openSettings(), 84);
    text(c, "P / SPACE resume - R restart - T title - O settings - M mute", W / 2, 1010, 18, "#828296");
  }
}

// ------------------------------------------------------------ bootstrap ----
function boot() {
  const canvas = document.getElementById("game"), ctx = canvas.getContext("2d");
  const stage = document.getElementById("stage") || document.body;
  const game = new Game(createAdProvider(), createIapProvider());
  window.game = game;
  try {
    const params = new URLSearchParams(location.search);
    const ranked = params.get("ranked");
    const daily = params.get("daily");
    const mode = params.get("mode");
    if (ranked && /^\d{4}-W\d{2}$/.test(ranked)) game.challenge = { mode: "ranked", week: ranked };
    else if (daily && /^\d{4}-\d{2}-\d{2}$/.test(daily)) game.challenge = { mode: "daily", date: daily };
    if (mode === "ranked") game.beginMode("ranked");
    else if (mode === "daily") game.beginMode("daily");
    else if (mode === "board") game.openBoard("weekly");
    else if (mode === "shop") game.openShop();
    else if (mode === "gems") game.openGemStore("title");
    else if (mode === "settings") game.openSettings();
  } catch (e) { /* no URL access */ }

  let scale = 1;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const cs = getComputedStyle(stage);
    const vw = (stage.clientWidth || window.innerWidth) - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
    const vh = (stage.clientHeight || window.innerHeight) - parseFloat(cs.paddingTop || 0) - parseFloat(cs.paddingBottom || 0);
    scale = Math.min(vw / W, vh / H);
    canvas.style.width = W * scale + "px"; canvas.style.height = H * scale + "px";
    canvas.width = W * scale * dpr; canvas.height = H * scale * dpr;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);
  resize();
  const toLogical = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale]; };

  let start = null;
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  canvas.addEventListener("pointerdown", e => { Sfx.unlock(); start = { p: toLogical(e), t: performance.now() }; e.preventDefault(); });
  canvas.addEventListener("pointerup", e => {
    if (!start) return;
    const [x, y] = toLogical(e), dy = y - start.p[1], dx = x - start.p[0];
    if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx) && game.state === "play" && !game.ads.showing && !game.paused)
      game.action(dy < 0 ? "up" : "down");
    else game.tap(...start.p);
    start = null;
  });
  window.addEventListener("keydown", e => { Sfx.unlock(); game.key(e.key); if (e.key === " ") e.preventDefault(); });
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); game.installPrompt = e; });
  window.addEventListener("appinstalled", () => { game.installPrompt = null; });

  const autoPause = () => { if (game.state === "play" && !game.ads.showing) game.paused = true; };
  document.addEventListener("visibilitychange", () => { if (document.hidden) autoPause(); });
  window.addEventListener("blur", autoPause);

  let last = performance.now();
  let frameHandle = null;
  let lastAnnouncedState = "";
  const status = document.getElementById("game-status");
  const stateAnnouncement = state => ({
    title: "Title screen. Press Space to start, or C to open the campaign star map.",
    play: "Game in progress. Up or W moves outward, Down or S moves inward, Space reverses orbit, and P pauses.",
    pause: "Game paused. Press P or Space to resume, R to restart, or T to return to the title.",
    over: "Run over. Review your score, continue if available, restart, or return to the title.",
    ending: "Campaign complete. Use the on-screen options to revisit the star map or story archive.",
    campaign: "Campaign star map. Use left and right arrows to choose a sector and Enter or Space to open it.",
    explore: "Planet survey. Follow the on-screen controls to inspect and record optional discoveries.",
    story: "Story archive. Browse the unlocked entries and return to the star map or title.",
    settings: "Settings. Toggle visual effects, audio, and display options.",
    shop: "Cosmetics shop. Browse items and equip or unlock available cosmetics.",
    board: "Leaderboard. Browse tabs, refresh results, or return to the title.",
    gems: "Gem store. Browse packs and return when finished."
  }[state] || "Orbit Runner screen changed.");

  function loop(now) {
    frameHandle = null;
    if (document.hidden) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    game.update(dt);
    game.draw(ctx);
    if (status && game.state !== lastAnnouncedState) {
      lastAnnouncedState = game.state;
      status.textContent = stateAnnouncement(game.state);
    }
    frameHandle = requestAnimationFrame(loop);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      autoPause();
      if (frameHandle !== null) cancelAnimationFrame(frameHandle);
      frameHandle = null;
    } else if (frameHandle === null) {
      last = performance.now();
      frameHandle = requestAnimationFrame(loop);
    }
  });
  frameHandle = requestAnimationFrame(loop);

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js");
}

if (typeof module !== "undefined" && module.exports)
  module.exports = { Game, MockAdProvider, AdMobProvider, createAdProvider, Save, Sfx, Social, Leaderboard,
    CAMPAIGN_SECTORS, STORY_ENTRIES, EXPLORATION_OBJECTIVES, freshCampaign, sanitizeCampaign, DemoIapProvider, DisabledIapProvider, CdvIapProvider, createIapProvider, GEM_PACKS, CONTINUE_BASE_COST,
    SHIPS, CONTRACTS, MISSION_POOL, BIOMES, METEOR_TYPES, SHOP_ITEMS,
    dateKey, weekKey, mulberry32, W, H };
else window.addEventListener("load", boot);
