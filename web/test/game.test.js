"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Game, MockAdProvider, AdMobProvider, Save, Social, Leaderboard, MISSION_POOL, CONTRACTS,
  BIOMES, SHOP_ITEMS, GEM_PACKS, DemoIapProvider, dateKey, weekKey, CAMPAIGN_SECTORS, STORY_ENTRIES, EXPLORATION_OBJECTIVES, freshCampaign,
  sanitizeCampaign, difficultyProfile, ghostSampleAt, swipeDir, crystalPoints, missionTarget, slingshotTarget, flingVelocity, slingPreview, slingHintVisible, isOnBeat, flowTier, gravityStep, patternAngles, RUN_MODIFIERS, pickModifier, meteorGlyph, METEOR_TYPES, mulberry32, flareWarningText, comboMilestoneText, shouldRenderScreenFlash, shouldApplyHitStop, campaignPauseHint, campaignMapPoint, storySignalState, planetSurveyProfile, campaignBossProfile, cosmeticPreviewItem, achievementProgress } = require("../game.js");

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

  assert.equal(difficultyProfile(99).level, 40);
  assert.equal(difficultyProfile(-4).level, 1);
  const late = difficultyProfile(30);
  assert.equal(late.level, 30);
  assert.ok(late.lateSpeedMultiplier > 1);
  assert.ok(late.doubleSpawnChance > difficultyProfile(10).doubleSpawnChance);
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

test("campaign sectors use distinct boss profiles while non-campaign runs retain Corona Surge", () => {
  const profiles = CAMPAIGN_SECTORS.map(sector => campaignBossProfile(sector.id));
  assert.equal(new Set(profiles.map(profile => profile.name)).size, CAMPAIGN_SECTORS.length);
  assert.ok(profiles.every(profile => profile.timer > 0 && profile.need >= 3 && profile.coreLife > 0));
  assert.deepEqual(
    [campaignBossProfile("unknown-sector").name, campaignBossProfile(null).name],
    ["CORONA SURGE", "CORONA SURGE"],
  );
  const g = newGame();
  g.currentCampaignSector = "ember-reach";
  g.startBoss();
  assert.equal(g.boss.name, "EMBER COLOSSUS");
  assert.equal(g.boss.ringMode, "outer");
  g.boss = null;
  g.currentCampaignSector = null;
  g.startBoss();
  assert.equal(g.boss.name, "CORONA SURGE");
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
  assert.equal(g.save.ghost, null);
  g.commitGhost();
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

test("achievement progress derives badges from existing stats and campaign saves", () => {
  const empty = achievementProgress({});
  assert.ok(empty.length >= 8);
  assert.equal(empty.find(item => item.id === "first-flight").unlocked, false);
  const progress = achievementProgress({
    stats: { runs: 1, flares: 10, near: 25, bosses: 3 },
    lifetime: 500,
    campaign: {
      completed: ["sol-frontier", "ember-reach", "silent-expanse", "void-crown"],
      discoveries: ["beacon-awake", "ember-expedition", "silent-echo", "void-origin"],
      exploration: { "sol-frontier": ["a", "b", "c"], "ember-reach": ["d", "e", "f"] },
    },
    cosmetics: { owned: ["1", "2", "3", "4", "5", "6", "7", "8"] },
  });
  assert.ok(progress.every(item => item.unlocked));
  assert.equal(achievementProgress({ stats: { runs: -10 } })[0].progress, 0);
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

test("campaign map positions produce usable canvas coordinates", () => {
  const points = CAMPAIGN_SECTORS.map(sector => campaignMapPoint(sector));
  assert.equal(points.length, 4);
  assert.ok(points.every(point => point && Number.isFinite(point.x) && Number.isFinite(point.y)));
  assert.ok(points.every(point => point.x >= 42 && point.x <= 678));
  assert.ok(points.every(point => point.y >= 145 && point.y <= 645));
  assert.equal(campaignMapPoint({ position: ["bad", 0.5] }), null);
  assert.equal(campaignMapPoint({}), null);
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


test("story signal chain reports the next lead and completes only when all known records are recovered", () => {
  assert.deepEqual(storySignalState([]), {
    recoveredCount: 0, total: STORY_ENTRIES.length, recoveredIds: [],
    nextEntryId: STORY_ENTRIES[0].id, nextTitle: STORY_ENTRIES[0].title, decoded: false,
  });
  const partial = storySignalState(["beacon-awake", "unknown-record"]);
  assert.equal(partial.recoveredCount, 1);
  assert.deepEqual(partial.recoveredIds, ["beacon-awake"]);
  assert.equal(partial.nextEntryId, "ember-expedition");
  const complete = storySignalState(STORY_ENTRIES.map(entry => entry.id));
  assert.equal(complete.recoveredCount, STORY_ENTRIES.length);
  assert.equal(complete.nextEntryId, null);
  assert.equal(complete.decoded, true);
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


test("each campaign planet has a unique survey briefing and unknown sectors are rejected", () => {
  const profiles = CAMPAIGN_SECTORS.map(sector => planetSurveyProfile(sector.id));
  assert.equal(profiles.length, CAMPAIGN_SECTORS.length);
  assert.ok(profiles.every(profile => profile && profile.environment && profile.hazard && profile.focus && profile.fieldNote));
  assert.equal(new Set(profiles.map(profile => profile.environment)).size, profiles.length);
  assert.equal(planetSurveyProfile("unknown-sector"), null);
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

test("campaign pause hint explains the selected sector objective and ignores unknown sectors", () => {
  assert.equal(campaignPauseHint("sol-frontier"),
    "SOL FRONTIER - Complete a run here to chart the frontier.");
  assert.equal(campaignPauseHint("not-a-sector"), "");
  assert.equal(campaignPauseHint(null), "");
});

test("reduced motion disables full-screen flash overlays without changing default visuals", () => {
  assert.equal(shouldRenderScreenFlash({ reducedMotion: true }), false);
  assert.equal(shouldRenderScreenFlash({ reducedMotion: false }), true);
  assert.equal(shouldRenderScreenFlash({ lowFx: true }), true);
  assert.equal(shouldRenderScreenFlash(), true);
});

test("reduced motion skips hit-stop pauses while normal settings retain them", () => {
  assert.equal(shouldApplyHitStop({ reducedMotion: true }), false);
  assert.equal(shouldApplyHitStop({ reducedMotion: false }), true);
  assert.equal(shouldApplyHitStop(), true);
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

test("ghost playback follows recorded timestamps and wraps angles", () => {
  const samples = [[0, 0, 130], [0.2, Math.PI - 0.1, 215], [0.5, 0, 300]];
  const mid = ghostSampleAt(samples, 0.1);
  assert.equal(mid[0], 0.1);
  assert.ok(mid[1] > 0 && mid[1] < Math.PI);
  assert.equal(mid[2], 172.5);
  const wrapped = ghostSampleAt([[0, Math.PI - 0.1, 130], [0.2, -Math.PI + 0.1, 130]], 0.1);
  assert.ok(Math.abs(Math.abs(wrapped[1]) - Math.PI) < 0.01);
  assert.equal(ghostSampleAt(samples, 0.5), samples[2]);
  assert.equal(ghostSampleAt(samples, 99), null);
  assert.equal(ghostSampleAt([], 1), null);
});

test("short swipes change rings and drags are not mistaken for taps", () => {
  assert.equal(swipeDir(0, -22), "up");
  assert.equal(swipeDir(0, 30), "down");
  assert.equal(swipeDir(0, -20), null);
  assert.equal(swipeDir(40, -40), null);
  assert.equal(swipeDir(0, 5), null);
});

test("crystals on the outer ring are worth more", () => {
  assert.equal(crystalPoints(1, 1, 1), 25);
  assert.equal(crystalPoints(1, 1, 2), 40);
  assert.equal(crystalPoints(4, 2, 2), 320);
});

test("missions scale with the player's best score", () => {
  const score = MISSION_POOL.find(m => m.metric === "run_score");
  const level = MISSION_POOL.find(m => m.metric === "run_level");
  assert.equal(missionTarget(score, 0), 1500);
  assert.equal(missionTarget(score, 20000), 10000);
  assert.equal(missionTarget(level, 0), 4);
  assert.equal(missionTarget(level, 50000), 10);
  assert.equal(missionTarget(MISSION_POOL[0], 50000), 15);
});

test("reverse orbit earns a close-pass bonus once", () => {
  const g = newGame();
  g.start();
  g.spawnT = 99; g.gemT = 99; g.powerupT = 99; g.flareCD = 99;
  g.invuln = 0;
  g.meteors = [{ angle: g.angle, r: g.ringVis - 24, speed: 0, size: 10, kind: "normal", spin: 0 }];
  const before = g.score;
  g.action("reverse");
  g.update(0.01);
  assert.ok(g.score - before >= 25);
  assert.ok(g.floats.some(f => f.s.startsWith("REVERSE")));
  assert.equal(g.reverseGrace, 0);
  assert.equal(g.meteors.length, 1);
  assert.equal(g.meteors[0].near, true);
});

test("a slung rock chains into nearby meteors and can break a boss core", () => {
  const g = newGame();
  g.start();
  g.angle = 0; g.ringVis = 130;
  const [px, py] = g.playerPos();
  const flung = { angle: 0, r: 130, speed: 0, size: 12, kind: "normal", spin: 0,
    dead: false, flung: true, fx: px, fy: py, vx: 300, vy: 0, flungT: 1, chain: 0 };
  const other = { angle: 0, r: 150, speed: 0, size: 12, kind: "normal", spin: 0, dead: false };
  g.meteors = [flung, other];
  const spawned = [];
  const before = g.score;
  g.updateFlung(flung, 0.01, spawned);
  assert.equal(other.dead, true);
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].chain, 1);
  assert.equal(spawned[0].flung, true);
  assert.ok(g.score > before);

  g.boss = { core: { angle: 0, ring: 1 }, cores: 0, need: 3, coreDelay: 10, coreLife: 5 };
  const coreRock = { ...flung, dead: false, fx: 360 + 215, fy: 680, vx: 0, vy: 0, flungT: 1, chain: 0 };
  g.meteors = [coreRock];
  const coreScore = g.score;
  g.updateFlung(coreRock, 0.01, []);
  assert.equal(g.boss.cores, 1);
  assert.equal(g.boss.core, null);
  assert.ok(g.score > coreScore);
});

test("daily new best is measured against the daily score, not the all-time best", () => {
  const g = newGame();
  g.start("daily");
  g.competitive = false;
  g.save.best = 999999;
  g.score = 100;
  g.die();
  assert.equal(g.newBest, true);
  assert.equal(g.newBest, g.newDailyBest);
});

test("a corrupt save falls back to the previous good copy", () => {
  const store = localStore();
  const first = Save.fresh(); first.best = 111; Save.write(first);
  const second = Save.fresh(); second.best = 222; Save.write(second);
  store[Save.key] = "{broken";
  assert.equal(Save.load().best, 111);
  delete global.localStorage;
});

test("the daily ad cap survives a reload", () => {
  const store = localStore();
  const saved = Save.fresh();
  saved.ads = { day: dateKey(), count: 3 };
  Save.write(saved);
  const g = new Game(new MockAdProvider());
  assert.equal(g.adsUsed, 3);
  assert.equal(store[Save.key] !== undefined, true);
  delete global.localStorage;
});

test("slingshot picks the nearest live meteor in reach", () => {
  const near = { angle: -Math.PI / 2, r: 60, dead: false };
  const other = { angle: -Math.PI / 2, r: 80, dead: false };
  const far = { angle: 0, r: 150, dead: false };
  assert.equal(slingshotTarget([far, other, near], 360, 680), near);
  assert.equal(slingshotTarget([{ angle: -Math.PI / 2, r: 150, dead: false }], 360, 680), null);
  assert.equal(slingshotTarget([{ ...near, dead: true }], 360, 680), null);
  assert.equal(slingshotTarget([{ ...near, flung: true }], 360, 680), null);
});

test("a flung rock leaves the player and curves with the orbit", () => {
  const [vx, vy] = flingVelocity(0, 0, 100, 0, 1);
  assert.ok(Math.abs(vx - 338) < 0.01);
  assert.ok(Math.abs(vy - 286) < 0.01);
});

test("beat windows reward one reversal per musical pulse", () => {
  assert.equal(isOnBeat(0.05, 0.7), true);
  assert.equal(isOnBeat(0.7, 0.7), true);
  assert.equal(isOnBeat(0.35, 0.7), false);
  assert.equal(isOnBeat(0.6, 0.7, 0.05), false);
  const g = newGame();
  g.start();
  g.meteors = [];
  g.musicT = 0.02; g.musicBeat = 7;
  const before = g.score;
  g.action("reverse");
  assert.ok(g.score > before);
  assert.equal(g.beatHit, 7);
  const after = g.score;
  g.action("reverse");
  assert.equal(g.score, after);
});

test("the sling hint only shows during the first tutorial run", () => {
  assert.equal(slingHintVisible(true, 0, 7), true);
  assert.equal(slingHintVisible(true, 0, 5), false);
  assert.equal(slingHintVisible(true, 1, 20), false);
  assert.equal(slingHintVisible(false, 0, 20), false);
});

test("a tap whips a nearby meteor into a friendly projectile", () => {
  localStore();
  const g = newGame();
  g.start("classic");
  g.meteors = [g.spawnMeteor(g.angle, 100, 20, "normal", g.ringVis)];
  const before = g.score;
  assert.equal(g.trySlingshot(), true);
  assert.ok(g.score > before);
  assert.equal(g.slings, 1);
  const flung = g.meteors.filter(m => m.flung);
  assert.equal(flung.length, 1);
  const fx = flung[0].fx;
  g.hitStop = 0;
  g.update(0.016);
  assert.notEqual(flung[0].fx, fx);
  delete global.localStorage;
});

test("gravity wells pull meteors toward the well", () => {
  const [x, y] = gravityStep(100, 100, 200, 100, 0.5);
  assert.ok(x > 100 && x < 200);
  assert.equal(y, 100);
  const [sx, sy] = gravityStep(5, 5, 5, 5, 0.5);
  assert.equal(sx, 5); assert.equal(sy, 5);
  const [zx, zy] = gravityStep(0, 0, 100, 0, 0);
  assert.equal(zx, 0); assert.equal(zy, 0);
});

test("a meteor inside a gravity well is pulled and then consumed", () => {
  localStore();
  const g = newGame();
  g.start("classic");
  g.meteors = [g.spawnMeteor(2, 0, 16, "normal", 300)];
  g.gravity = { angle: 2, ring: 0, life: 5 };
  g.spawnT = 999;
  g.hitStop = 0;
  const before = Math.abs(g.meteors[0].r - 130);
  g.update(0.05);
  if (g.meteors.length) assert.ok(Math.abs(g.meteors[0].r - 130) < before);
  delete global.localStorage;
});

test("a meteor reaching the well center pays out and disappears", () => {
  localStore();
  const g = newGame();
  g.start("classic");
  g.meteors = [g.spawnMeteor(2, 0, 16, "normal", 130)];
  g.gravity = { angle: 2, ring: 0, life: 5 };
  g.spawnT = 999;
  g.hitStop = 0;
  const before = g.score;
  g.update(0.016);
  assert.equal(g.meteors.some(m => !m.flung && m.angle === 2), false);
  assert.ok(g.score > before);
  delete global.localStorage;
});

test("telegraphed patterns fire a symmetric fan of three rocks", () => {
  const angles = patternAngles(1, 3, 0.5);
  assert.equal(angles.length, 3);
  assert.equal(angles[1], 1);
  assert.ok(Math.abs(angles[0] + angles[2] - 2) < 1e-9);
  localStore();
  const g = newGame();
  g.start("classic");
  g.meteors = [];
  g.patternWarn = { angle: 0, ring: 1, t: 0.01 };
  g.spawnT = 999;
  g.hitStop = 0;
  g.update(0.02);
  assert.equal(g.meteors.length, 3);
  assert.equal(g.patternWarn, null);
  delete global.localStorage;
});

test("run modifiers are deterministic and only touch classic runs", () => {
  const a = pickModifier(mulberry32(9));
  const b = pickModifier(mulberry32(9));
  assert.equal(a.id, b.id);
  assert.ok(RUN_MODIFIERS.includes(a));
  localStore();
  const g = newGame();
  g.scoreMul = 1; g.crystalMul = 1; g.meteorMul = 1; g.flareCD = 12;
  g.applyModifier(RUN_MODIFIERS[0]);
  assert.equal(g.modifier.id, "rich");
  assert.equal(g.crystalMul, 2);
  assert.equal(g.scoreMul, 1);
  assert.ok(g.meteorMul > 1);
  g.start("ranked");
  assert.equal(g.modifier, null);
  delete global.localStorage;
});

test("classic runs pick a modifier once the tutorial is over", () => {
  localStore();
  const g = newGame();
  g.save.tutorial.done = true;
  g.start("classic");
  assert.ok(g.modifier);
  assert.ok(RUN_MODIFIERS.some(m => m.id === g.modifier.id));
  delete global.localStorage;
});

test("every meteor type has a distinct colorblind glyph", () => {
  const seen = new Set();
  for (const type of METEOR_TYPES) {
    const glyph = meteorGlyph(type.id);
    assert.ok(glyph);
    assert.equal(seen.has(glyph), false);
    seen.add(glyph);
  }
  assert.equal(meteorGlyph("unknown"), "circle");
});

test("slingshot preview follows the fling velocity", () => {
  const pts = slingPreview(100, 200, 300, -100, 4, 0.05);
  assert.equal(pts.length, 4);
  assert.deepEqual(pts[0], [115, 195]);
  assert.deepEqual(pts[3], [160, 180]);
});

test("holding a ring builds flow tiers", () => {
  assert.deepEqual(flowTier(0), { tier: 0, name: "", mult: 1 });
  assert.equal(flowTier(4).tier, 1);
  assert.equal(flowTier(8).name, "STREAM");
  assert.equal(flowTier(12).mult, 1.15);
  assert.equal(flowTier(99).tier, 3);
});
