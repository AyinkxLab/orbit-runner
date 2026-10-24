"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Game, MockAdProvider, AdMobProvider, Save, Social, Leaderboard, MISSION_POOL, CONTRACTS,
  BIOMES, SHOP_ITEMS, GEM_PACKS, DemoIapProvider, dateKey, weekKey, CAMPAIGN_SECTORS, STORY_ENTRIES, EXPLORATION_OBJECTIVES, freshCampaign,
  sanitizeCampaign, difficultyProfile, flareWarningText, comboMilestoneText, shouldRenderScreenFlash, cosmeticPreviewItem } = require("../game.js");

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
  assert.equal(s.gems, 10);

  global.localStorage = { getItem: () => "not json" };
  assert.equal(Save.load().best, 0);

  // pre-v3 save migration
  global.localStorage = { getItem: () => '{"best":3850,"bank":70,"muted":false}' };
  assert.equal(Save.load().lifetime, 385);

  // old continue tokens become gems
  global.localStorage = { getItem: () => '{"continueTokens":2}' };
  assert.equal(Save.load().gems, 20);
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

test("first-run pacing eases tutorial meteor pressure without changing competitive rules", () => {
  const tutorial = difficultyProfile(2, { tutorial: true, competitive: false });
  assert.equal(tutorial.level, 2);
  assert.equal(tutorial.spawnIntervalMultiplier, 1.22);
  assert.equal(tutorial.meteorSpeedMultiplier, 0.88);
  assert.equal(tutorial.doubleSpawnChance, 0);

  const classic = difficultyProfile(2);
  const ranked = difficultyProfile(2, { tutorial: true, competitive: true });
  assert.equal(classic.spawnIntervalMultiplier, 1);
  assert.equal(classic.meteorSpeedMultiplier, 1);
  assert.equal(ranked.spawnIntervalMultiplier, 1);
  assert.equal(ranked.meteorSpeedMultiplier, 1);
  assert.equal(ranked.doubleSpawnChance, 0.12);

  assert.equal(difficultyProfile(99).level, 14);
  assert.equal(difficultyProfile(-4).level, 1);
});

test("flare warnings name the target ring and countdown without relying on color", () => {
  assert.equal(flareWarningText(2.56, 0), "FLARE IN 2.6s — INNER RING");
  assert.equal(flareWarningText(0.34, 2), "FLARE IN 0.3s — OUTER RING");
  assert.equal(flareWarningText(0, 1), "");
  assert.equal(flareWarningText(2, 99), "");
  assert.equal(flareWarningText(Number.NaN, 1), "");
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

test("missions complete, pay out, and award gems every five completions", () => {
  const g = newGame();
  g.save.missions = [{ ...MISSION_POOL.find(m => m.id === "run_crystals"), progress: 0, completed: false }];
  g.crystalGain = 15;
  g.checkMissions();
  assert.equal(g.save.missions[0].completed, true);
  assert.equal(g.save.missionsDone, 1);
  assert.ok(g.save.bank >= 30);

  g.save.missionsDone = 4;
  g.save.gems = 0;
  g.save.missions = [{ ...MISSION_POOL.find(m => m.id === "run_level"), progress: 0, completed: false }];
  g.elapsed = 60; // level 5
  g.checkMissions();
  assert.equal(g.save.gems, 10);
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

test("gems buy a continue and each revive doubles the price", () => {
  const g = newGame();
  diedWith(g, 5);
  g.save.gems = 100;
  assert.equal(g.continueCost(), 5);
  assert.equal(g.requestAd("continue"), true);
  assert.equal(g.state, "play");
  assert.equal(g.save.gems, 95);
  assert.equal(g.continues, 1);

  g.die();
  assert.equal(g.continueCost(), 10);
  g.requestAd("continue");
  assert.equal(g.state, "play");
  assert.equal(g.save.gems, 85);
  assert.equal(g.continues, 2);

  g.die();
  assert.equal(g.continueCost(), 20);
  g.continues = 10;
  assert.equal(g.continueCost(), 320);
});

test("insufficient gems opens the gem store instead of reviving", () => {
  const g = newGame();
  diedWith(g, 5);
  g.save.gems = 2;
  g.requestAd("continue");
  assert.equal(g.state, "gems");
  assert.equal(g.continueCost(), 5);
  assert.match(g.message, /more gems/);
});

test("demo gem pack purchase credits the wallet once", async () => {
  const g = newGame();
  g.iap = new DemoIapProvider();
  g.save.gems = 0;
  await g.buyGemPack(GEM_PACKS[0]);
  assert.equal(g.save.gems, GEM_PACKS[0].gems);
  assert.equal(g.save.analytics.gemPurchases, 1);
  assert.match(g.storeMessage, /Demo purchase/);
});

test("watching a gem ad grants gems and respects the session cap", () => {
  const g = newGame();
  g.save.gems = 0;
  g.openGemStore("title");
  g.watchGemAd();
  assert.equal(g.ads.showing, true);
  g.ads.t = g.ads.DURATION;
  g.ads.handleTap(700, 20);
  assert.equal(g.save.gems, 5);
  assert.equal(g.state, "gems");
  assert.equal(g.save.analytics.gemAds, 1);
});

test("ad session cap stops new rewarded ads", () => {
  const g = newGame();
  diedWith(g, 5);
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

test("cosmetic preview selects the requested item without changing equipped state", () => {
  const equipped = { trail: "trail_default", skin: "skin_scout", title: "title_rookie" };
  const selected = cosmeticPreviewItem("skin", "skin_stealth", equipped);
  assert.equal(selected.id, "skin_stealth");
  assert.equal(equipped.skin, "skin_scout");
  assert.equal(cosmeticPreviewItem("trail", "unknown-item", equipped).id, "trail_default");
  assert.equal(cosmeticPreviewItem("title", null, equipped).id, "title_rookie");
  assert.equal(cosmeticPreviewItem("unknown", null, equipped), null);
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


test("campaign save defaults and migration preserve existing progress", () => {
  const store = localStore();
  store.orbit_runner_save = JSON.stringify({
    bank: 123, gems: 45,
    campaign: { version: 1, completed: ["sol-frontier", "silent-expanse"], selected: "silent-expanse" },
  });
  const loaded = Save.load();
  assert.equal(loaded.bank, 123);
  assert.equal(loaded.gems, 45);
  assert.deepEqual(loaded.campaign.completed, ["sol-frontier"]);
  assert.equal(loaded.campaign.selected, "silent-expanse");
  assert.deepEqual(freshCampaign(), { version: 3, completed: [], selected: "sol-frontier", discoveries: [], exploration: {
    "sol-frontier": [], "ember-reach": [], "silent-expanse": [], "void-crown": [],
  } });
  delete global.localStorage;
});

test("campaign progression validates sector order and unknown IDs", () => {
  const clean = sanitizeCampaign({
    completed: ["sol-frontier", "ember-reach", "void-crown", "unknown-sector"],
    selected: "void-crown",
  });
  assert.deepEqual(clean.completed, ["sol-frontier", "ember-reach"]);
  assert.equal(clean.selected, "void-crown");
  assert.equal(CAMPAIGN_SECTORS.length, 4);
});

test("campaign map prevents locked launches and starts selected biome", () => {
  const g = newGame();
  g.openCampaignMap();
  assert.equal(g.state, "campaign");
  assert.equal(g.campaignUnlocked("sol-frontier"), true);
  assert.equal(g.campaignUnlocked("ember-reach"), false);
  assert.equal(g.launchCampaignSector("ember-reach"), false);
  assert.equal(g.state, "campaign");
  assert.equal(g.launchCampaignSector("sol-frontier"), true);
  assert.equal(g.state, "play");
  assert.equal(g.currentCampaignSector, "sol-frontier");
  assert.equal(g.biome.id, "nebula");
});

test("finishing a campaign run unlocks the next sector exactly once", () => {
  const g = newGame();
  g.launchCampaignSector("sol-frontier");
  g.die();
  assert.deepEqual(g.save.campaign.completed, ["sol-frontier"]);
  assert.deepEqual(g.save.campaign.discoveries, ["beacon-awake"]);
  assert.equal(g.campaignUnlocked("ember-reach"), true);
  assert.equal(g.currentCampaignSector, null);
  g.die();
  assert.deepEqual(g.save.campaign.completed, ["sol-frontier"]);
});

test("daily and ranked runs do not advance campaign sectors", () => {
  const g = newGame();
  g.start("daily");
  assert.equal(g.currentCampaignSector, null);
  g.die();
  assert.deepEqual(g.save.campaign.completed, []);
  assert.deepEqual(g.save.campaign.discoveries, []);
});


test("story archive migrates completed sectors and rejects invalid discoveries", () => {
  const migrated = sanitizeCampaign({
    version: 1,
    completed: ["sol-frontier", "ember-reach"],
    discoveries: ["void-origin", "not-a-record"],
  });
  assert.deepEqual(migrated.discoveries, ["beacon-awake", "ember-expedition"]);
  assert.equal(STORY_ENTRIES.length, 4);
  assert.deepEqual(STORY_ENTRIES.map(entry => entry.sectorId), CAMPAIGN_SECTORS.map(sector => sector.id));
});

test("campaign completion persists its story discovery and archive navigation returns", () => {
  const g = newGame();
  g.launchCampaignSector("sol-frontier");
  g.die();
  assert.ok(g.save.campaign.discoveries.includes("beacon-awake"));
  assert.equal(g.storyDiscovered("beacon-awake"), true);
  assert.equal(g.storyDiscovered("ember-expedition"), false);
  g.openCampaignMap();
  g.openStoryArchive("campaign");
  assert.equal(g.state, "archive");
  g.closeStoryArchive();
  assert.equal(g.state, "campaign");
  g.openStoryArchive("title");
  g.closeStoryArchive();
  assert.equal(g.state, "title");
});


test("planet exploration is available only for unlocked campaign sectors", () => {
  const g = newGame();
  g.openCampaignMap();
  assert.equal(g.openPlanetExplore("ember-reach"), false);
  assert.equal(g.state, "campaign");
  assert.equal(g.openPlanetExplore("sol-frontier"), true);
  assert.equal(g.state, "explore");
  assert.equal(g.explorationObjectives().length, 3);
});

test("exploration objectives persist, reward once, and remain sector-specific", () => {
  localStore();
  const g = newGame();
  g.openPlanetExplore("sol-frontier");
  const objective = EXPLORATION_OBJECTIVES.find(item => item.sectorId === "sol-frontier");
  const startingBank = g.save.bank, startingLifetime = g.save.lifetime;
  assert.equal(g.completeExplorationObjective(objective.id), true);
  assert.equal(g.completeExplorationObjective(objective.id), false);
  assert.equal(g.save.bank, startingBank + objective.reward);
  assert.equal(g.save.lifetime, startingLifetime + objective.reward);
  assert.equal(g.explorationDone(objective), true);
  assert.equal(g.completeExplorationObjective("ember-core"), false);
  assert.deepEqual(Save.load().campaign.exploration["sol-frontier"], [objective.id]);
  delete global.localStorage;
});

test("exploration save migration drops unknown and cross-sector objective IDs", () => {
  const clean = sanitizeCampaign({ exploration: {
    "sol-frontier": ["sol-signal", "ember-core", "not-real"],
    "void-crown": ["void-origin"],
    "unknown-sector": ["sol-signal"],
  } });
  assert.deepEqual(clean.exploration["sol-frontier"], ["sol-signal"]);
  assert.deepEqual(clean.exploration["void-crown"], ["void-origin"]);
  assert.deepEqual(clean.exploration["ember-reach"], []);
});


test("sector mastery requires campaign completion and all sector surveys", () => {
  const g = newGame();
  g.save.campaign.completed = ["sol-frontier"];
  g.openPlanetExplore("sol-frontier");
  assert.equal(g.sectorMastery("sol-frontier").mastered, false);
  for (const objective of g.explorationObjectives()) assert.equal(g.completeExplorationObjective(objective.id), true);
  assert.equal(g.sectorMastery("sol-frontier").mastered, true);
  const progress = g.campaignMastery();
  assert.equal(progress.masteredSectors, 1);
  assert.equal(progress.completedSectors, 1);
  assert.equal(progress.completedObjectives, 3);
  assert.equal(progress.totalObjectives, 12);
});

test("campaign ending appears after the final new sector is completed, even with optional surveys left", () => {
  const g = newGame();
  g.save.campaign.completed = CAMPAIGN_SECTORS.slice(0, -1).map(sector => sector.id);
  assert.equal(g.campaignFinished(), false);
  assert.equal(g.launchCampaignSector(CAMPAIGN_SECTORS[CAMPAIGN_SECTORS.length - 1].id), true);
  g.die();
  assert.equal(g.campaignFinished(), true);
  assert.equal(g.state, "ending");
  assert.equal(g.campaignMastery().masteredSectors, 0);
});

test("replaying an already-charted sector does not trigger the campaign ending again", () => {
  const g = newGame();
  g.save.campaign.completed = CAMPAIGN_SECTORS.map(sector => sector.id);
  assert.equal(g.launchCampaignSector("sol-frontier"), true);
  g.die();
  assert.equal(g.state, "over");
});

test("reduced motion disables full-screen flash overlays without changing default visuals", () => {
  assert.equal(shouldRenderScreenFlash({ reducedMotion: true }), false);
  assert.equal(shouldRenderScreenFlash({ reducedMotion: false }), true);
  assert.equal(shouldRenderScreenFlash({ lowFx: true }), true);
  assert.equal(shouldRenderScreenFlash(), true);
});

test("combo milestone copy names the streak tiers clearly and rejects invalid values", () => {
  assert.equal(comboMilestoneText(2), "x2 WARM STREAK");
  assert.equal(comboMilestoneText(4), "x4 HOT STREAK");
  assert.equal(comboMilestoneText(6), "x6 BLAZING");
  assert.equal(comboMilestoneText(8), "OVERDRIVE");
  assert.equal(comboMilestoneText(3), "");
  assert.equal(comboMilestoneText(Number.NaN), "");
});

test("Corona Surge HUD guidance states core progress and remaining time", () => {
  const { bossWarningText } = require("../game.js");
  assert.equal(bossWarningText(8.26, 1, 3), "COLLECT CORES 1/3 — 8.3s");
  assert.equal(bossWarningText(3.9, 2, 3), "HURRY — 1 CORE LEFT — 3.9s");
  assert.equal(bossWarningText(2.1, 0, 3), "HURRY — 3 CORES LEFT — 2.1s");
  assert.equal(bossWarningText(0, 1, 3), "");
  assert.equal(bossWarningText(Number.NaN, 1, 3), "");
});
