"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Game, MockAdProvider, AdMobProvider, Save, Social, Leaderboard, MISSION_POOL, CONTRACTS,
  BIOMES, SHOP_ITEMS, dateKey, weekKey } = require("../game.js");

function localStore() {
  const store = {};
  global.localStorage = {
    getItem: key => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
  };
  return store;
}

function newGame() {
  const game = new Game(new MockAdProvider());
  game.save = Save.fresh();
  game.ensureMissions();
  game.reset();
  return game;
}

function diedWith(game, crystals, bank = 0) {
  game.save = Save.fresh();
  game.save.bank = bank;
  game.ensureMissions();
  game.reset();
  game.crystals = crystals;
  game.state = "over";
  game.die();
}

test("banking credits crystals exactly once", () => {
  const g = newGame();
  diedWith(g, 5);
  assert.equal(g.save.bank, 5);
});

test("continue never loses crystals, even if the player restarts", () => {
  const g = newGame();
  diedWith(g, 5);
  g.rewardContinue();
  assert.equal(g.save.bank, 5);
  g.start();
  assert.equal(g.save.bank, 5);
});

test("double ad banks exactly double, not quadruple", () => {
  const g = newGame();
  diedWith(g, 5);
  g.rewardDouble();
  assert.equal(g.save.bank, 10);
  assert.equal(g.crystals, 10);
  g.die();
  assert.equal(g.save.bank, 10);
});

test("continue then double is still exactly double", () => {
  const g = newGame();
  diedWith(g, 5);
  g.rewardContinue();
  g.rewardDouble();
  g.die();
  assert.equal(g.save.bank, 10);
});

test("crystals collected after a continue are banked on the next death", () => {
  const g = newGame();
  diedWith(g, 5);
  g.rewardContinue();
  g.crystals += 2;
  g.die();
  assert.equal(g.save.bank, 7);
});

test("double then collecting more is not double-counted", () => {
  const g = newGame();
  diedWith(g, 5);
  g.rewardDouble();
  g.crystals += 3;
  g.die();
  assert.equal(g.save.bank, 13);
});

test("save loader clamps corrupt values and fills new fields", () => {
  global.localStorage = { getItem: () => '{"best":"oops","bank":-99,"muted":"yes"}' };
  const s = Save.load();
  assert.equal(s.best, 0);
  assert.equal(s.bank, 0);
  assert.equal(s.muted, false);
  assert.equal(s.lifetime, 0);
  assert.deepEqual(s.ships, ["scout"]);
  assert.equal(s.stats.runs, 0);

  global.localStorage = { getItem: () => "not json" };
  assert.equal(Save.load().best, 0);

  // pre-v3 save migration
  global.localStorage = { getItem: () => '{"best":3850,"bank":70,"muted":false}' };
  assert.equal(Save.load().lifetime, 385);
  delete global.localStorage;
});

test("rewarded ad grants nothing when closed early and rewards when watched", () => {
  const ads = new MockAdProvider();
  let rewards = 0;
  ads.showRewarded(() => rewards++, () => {});
  ads.t = 2;
  ads.handleTap(700, 20);
  assert.equal(rewards, 0);

  ads.showRewarded(() => rewards++, () => {});
  ads.t = ads.DURATION;
  ads.handleTap(700, 20);
  assert.equal(rewards, 1);
});

test("combo decays after the timer", () => {
  const g = newGame();
  g.start();
  g.combo = 4; g.comboT = 0.001;
  g.update(0.01);
  assert.equal(g.combo, 1);
});

test("dodging a flare scores and builds combo", () => {
  const g = newGame();
  g.start();
  g.elapsed = 30;
  g.ring = 2; g.ringVis = 300;
  g.flareRing = 0; g.flareT = 0.001;
  g.update(0.01);
  assert.equal(g.state, "play");
  assert.equal(g.flaresDodged, 1);
  assert.ok(g.score > 0);
});

test("standing on the flare ring is fatal", () => {
  const g = newGame();
  g.start();
  g.elapsed = 30;
  g.ring = 0; g.ringVis = 130;
  g.invuln = 0; g.shield = false;
  g.flareRing = 0; g.flareT = 0.001;
  g.update(0.01);
  assert.equal(g.state, "over");
});

test("shield absorbs a flare", () => {
  const g = newGame();
  g.start();
  g.elapsed = 30;
  g.ring = 0; g.ringVis = 130;
  g.invuln = 0; g.shield = true;
  g.flareRing = 0; g.flareT = 0.001;
  g.update(0.01);
  assert.equal(g.state, "play");
  assert.equal(g.shield, false);
});

test("missions complete, pay out, and award tokens every five completions", () => {
  const g = newGame();
  g.save.missions = [{ ...MISSION_POOL.find(m => m.id === "run_crystals"), progress: 0, completed: false }];
  g.crystalGain = 15;
  g.checkMissions();
  assert.equal(g.save.missions[0].completed, true);
  assert.equal(g.save.missionsDone, 1);
  assert.ok(g.save.bank >= 30);

  g.save.missionsDone = 4;
  g.save.continueTokens = 0;
  g.save.missions = [{ ...MISSION_POOL.find(m => m.id === "run_level"), progress: 0, completed: false }];
  g.elapsed = 60; // level 5
  g.checkMissions();
  assert.equal(g.save.continueTokens, 1);
});

test("contract and ship modifiers are applied on start", () => {
  const g = newGame();
  g.save.contract = "void";
  g.save.ships = ["scout", "warden", "drifter"];
  g.save.ship = "warden";
  g.start("classic");
  assert.equal(g.crystalMul, 2);
  assert.ok(Math.abs(g.meteorMul - 1.25 * g.biome.meteorSpeed) < 1e-9);
  assert.equal(g.ship.id, "warden");
  assert.ok(g.comboTime > 6);
  assert.equal(g.shield, true);
});

test("daily challenge is deterministic for the same date", () => {
  const a = newGame(), b = newGame();
  a.start("daily"); b.start("daily");
  assert.equal(a.seed, b.seed);
  assert.equal(a.contract.id, b.contract.id);
  assert.equal(dateKey(), dateKey());
});

test("continue token is used without an ad", () => {
  const g = newGame();
  diedWith(g, 5);
  g.save.freeContinueUsed = true;
  g.save.continueTokens = 1;
  g.requestAd("continue");
  assert.equal(g.state, "play");
  assert.equal(g.save.continueTokens, 0);
  assert.equal(g.ads.showing, false);
});

test("first continue is free without an ad", () => {
  const g = newGame();
  diedWith(g, 5);
  g.save.freeContinueUsed = false;
  g.save.continueTokens = 0;
  g.requestAd("continue");
  assert.equal(g.state, "play");
  assert.equal(g.save.freeContinueUsed, true);
  assert.equal(g.ads.showing, false);
});

test("ad session cap stops new rewarded ads", () => {
  const g = newGame();
  diedWith(g, 5);
  g.save.freeContinueUsed = true;
  g.adsUsed = 4;
  g.requestAd("double");
  assert.equal(g.ads.showing, false);
  assert.match(g.message, /No ads left/);
});

test("clearing a Corona Surge awards crystals and tracks the stat", () => {
  const g = newGame();
  g.start();
  g.startBoss();
  assert.ok(g.boss);
  g.boss.cores = 3;
  g.clearBoss();
  assert.equal(g.boss, null);
  assert.equal(g.save.stats.bosses, 1);
  assert.ok(g.score > 0);
});

test("a new best run stores a ghost", () => {
  const g = newGame();
  g.start();
  g.ghostSamples = [[0, 0, 130], [0.12, 1, 215]];
  g.score = 100;
  g.die();
  assert.equal(g.save.ghost.score, 100);
  assert.equal(g.save.ghost.samples.length, 2);
});

test("missions rotate after completion on the next start", () => {
  const g = newGame();
  const completed = { ...MISSION_POOL.find(m => m.id === "run_crystals"), progress: 15, completed: true };
  const open = { ...MISSION_POOL.find(m => m.id === "run_near"), progress: 2, completed: false };
  g.save.missions = [completed, open, { ...MISSION_POOL.find(m => m.id === "run_level"), progress: 1, completed: false }];
  g.start();
  assert.equal(g.save.missions.length, 3);
  assert.notEqual(g.save.missions[0].id, completed.id);
  assert.equal(g.save.missions[0].completed, false);
  assert.ok(g.save.missions.some(m => m.id === open.id));
});

test("classic contract select updates the saved loadout", () => {
  const g = newGame();
  g.selectContract(CONTRACTS[2].id);
  assert.equal(g.save.contract, CONTRACTS[2].id);
});

test("week keys are stable and valid", () => {
  assert.match(weekKey(new Date(Date.UTC(2026, 9, 23))), /^\d{4}-W\d{2}$/);
  assert.equal(weekKey(new Date(Date.UTC(2026, 9, 23))), weekKey(new Date(Date.UTC(2026, 9, 25))));
  assert.notEqual(weekKey(new Date(Date.UTC(2026, 9, 23))), weekKey(new Date(Date.UTC(2026, 10, 1))));
});

test("ranked runs use a fixed fair loadout and submit a local score", async () => {
  localStore();
  const g = newGame();
  g.save = Save.fresh();
  g.start("ranked");
  assert.equal(g.ranked, true);
  assert.equal(g.contract.id, "standard");
  assert.equal(g.ship.id, "scout");
  assert.equal(g.rankedWeek, weekKey());
  assert.equal(g.ghost, null);
  g.score = 1000; g.runTime = 40; g.crystals = 8;
  g.die();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(g.submission.status, "done");
  assert.equal(g.submission.source, "local");
  assert.equal(g.save.ranked.best, 1000);
  assert.equal(Leaderboard.localFetch("weekly").entries[0].score, 1000);
  delete global.localStorage;
});

test("ranked runs disable continues and rewarded ads", () => {
  const g = newGame();
  g.save = Save.fresh();
  g.start("ranked");
  g.score = 500; g.die();
  g.requestAd("continue");
  assert.match(g.message, /Competitive runs are one-life/);
  assert.equal(g.ads.showing, false);
});

test("challenge links start the requested ranked week", () => {
  const g = newGame();
  g.save = Save.fresh();
  g.challenge = { mode: "ranked", week: "2026-W01" };
  g.start("ranked");
  assert.equal(g.rankedWeek, "2026-W01");
});

test("first classic run starts the tutorial and guarantees a gem", () => {
  const g = newGame();
  g.start("classic");
  assert.equal(g.tutorialActive, true);
  assert.ok(g.gems.length >= 1);
  assert.equal(g.tutorialStep, 0);
  g.ring = 2; g.update(0.01);
  assert.equal(g.tutorialStep, 1);
  g.crystals = 1; g.update(0.01);
  assert.equal(g.tutorialStep, 2);
  g.dir = -1; g.update(0.01);
  assert.equal(g.tutorialStep, 3);
  g.flaresDodged = 1; g.update(0.01);
  assert.equal(g.tutorialStep, 4);
  g.elapsed = 50; g.update(0.01);
  assert.equal(g.save.tutorial.done, true);
  assert.equal(g.tutorialActive, false);
});

test("volatile meteors explode and clear nearby rocks", () => {
  const g = newGame();
  g.start("classic");
  g.invuln = 99;
  const bomb = g.spawnMeteor(0, 100, 20, "volatile", 45);
  const other = g.spawnMeteor(0.1, 100, 20, "normal", 60);
  g.meteors = [bomb, other];
  g.update(0.01);
  assert.equal(bomb.dead, true);
  assert.equal(other.dead, true);
});

test("biomes drive speed, score and crystal rates", () => {
  const g = newGame();
  g.start("daily");
  assert.equal(g.biome.id, BIOMES[g.seed % BIOMES.length].id);
  assert.ok(g.gemRate > 0);
  const m = g.spawnMeteor(0, 100, 20, "iron");
  assert.equal(m.kind, "iron");
  assert.equal(m.nearMult, 2);
});

test("shop purchases spend bank crystals and equip cosmetics", () => {
  const g = newGame();
  g.save.bank = 500;
  const item = SHOP_ITEMS.find(i => i.id === "trail_ember");
  g.buyOrEquip(item);
  assert.equal(g.save.bank, 380);
  assert.ok(g.save.cosmetics.owned.includes(item.id));
  assert.equal(g.save.cosmetics.equipped.trail, item.id);
  assert.equal(g.trailColor, item.value);
});

test("settings toggles persist and control audio flags", () => {
  const g = newGame();
  g.toggleSetting("colorblind");
  g.toggleSetting("music");
  assert.equal(g.save.settings.colorblind, true);
  assert.equal(g.save.settings.music, false);
  assert.equal(require("../game.js").Sfx.musicEnabled, false);
  g.toggleSetting("music");
});

test("Facebook is opt-in and not configured by default", async () => {
  const { Social } = require("../game.js");
  assert.equal(Social.configured, false);
  await assert.rejects(() => Social.login(), /not configured/);
});

test("profile is persisted and sanitised", () => {
  const store = localStore();
  store.orbit_runner_save = JSON.stringify({
    best: 1, profile: { provider: "facebook", id: "42", name: "Ada", picture: "https://x/y.png" },
  });
  const s = Save.load();
  assert.deepEqual(s.profile, { provider: "facebook", id: "42", name: "Ada", picture: "https://x/y.png" });
  delete global.localStorage;
});

test("leaderboard screen loads the local board without a backend", async () => {
  localStore();
  const g = newGame();
  g.save = Save.fresh();
  g.start("ranked");
  g.score = 777; g.runTime = 20; g.die();
  await new Promise(resolve => setTimeout(resolve, 0));
  g.openBoard("weekly");
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(g.state, "board");
  assert.equal(g.boardData.source, "local");
  assert.equal(g.boardData.entries[0].score, 777);
  delete global.localStorage;
});

test("AdMob provider grants only on the SDK reward event", async () => {
  const handlers = {};
  const plugin = {
    addListener: (name, fn) => { handlers[name] = fn; return { remove: () => delete handlers[name] }; },
    initialize: async () => {},
    prepareRewardVideoAd: async () => {},
    showRewardVideoAd: async () => { handlers.onRewarded && handlers.onRewarded(); handlers.onRewardedDismissed && handlers.onRewardedDismissed(); },
  };
  const ads = new AdMobProvider(plugin);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(ads.isReady(), true);
  let rewards = 0, closed = 0;
  ads.showRewarded(() => rewards++, () => closed++);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(rewards, 1);
  assert.equal(closed, 1);
  assert.equal(ads.showing, false);
});

test("AdMob provider does not reward an early dismiss", async () => {
  const handlers = {};
  const plugin = {
    addListener: (name, fn) => { handlers[name] = fn; return { remove: () => delete handlers[name] }; },
    initialize: async () => {},
    prepareRewardVideoAd: async () => {},
    showRewardVideoAd: async () => { handlers.onRewardedDismissed && handlers.onRewardedDismissed(); },
  };
  const ads = new AdMobProvider(plugin);
  await new Promise(resolve => setTimeout(resolve, 0));
  let rewards = 0, closed = 0;
  ads.showRewarded(() => rewards++, () => closed++);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(rewards, 0);
  assert.equal(closed, 1);
});
