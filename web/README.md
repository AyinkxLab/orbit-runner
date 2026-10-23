# Orbit Runner - app version

A phone-ready version of the game that you can install. It has touch controls,
portrait layout, vibration, offline support, power-ups, solar flares, Corona
Surges, daily missions, run contracts, ship unlocks, a best-run ghost, weekly and
daily ranked ladders, Facebook login and the same rewarded-ad flow as the
desktop version.

![Title screen](../desktop/orbit_title.png)

**Controls:** swipe up/down to change ring, tap to reverse. Keyboard: arrows or
W/S, Space to reverse, `P` pause, `M` mute, `V` ship, `1/2/3` contract,
`R` ranked, `L` leaderboard, `D` daily. On the leaderboard: `1/2/3` tabs,
`F` connect Facebook, `R` refresh, `B` back.

## 1. Try it on your computer

From the repository root:

```bash
cd web
python -m http.server 8000
```

Open http://localhost:8000. To get the phone view, press F12 and turn on the
device toolbar.

## 2. Put it on your phone (free, no app store)

The game has to be online over HTTPS before a phone can install it:

1. Drag the `web` folder onto https://app.netlify.com/drop (or publish it with
   GitHub Pages). Keep `index.html`, `game.js`, `manifest.json`, `sw.js` and the
   icons together.
2. Open the link on your phone.
   - **Android (Chrome):** menu -> *Add to Home screen* / *Install app*
   - **iPhone (Safari):** Share -> *Add to Home Screen*
3. It opens full-screen from its own icon and works offline.

When you deploy an update, bump `CACHE` in `sw.js` (for example `v8` -> `v9`) so
installed clients pick up the new files.

## Competitive mode / Facebook

The web build has a weekly ranked ladder, a daily ladder and a Friends tab.

- **Ranked Weekly:** fixed `SCOUT` + `STANDARD` loadout, deterministic weekly
  seed, one life, no ads, no continues. Everyone gets the same run.
- **Daily Challenge:** same fair rules, fresh seed per day.
- **Leaderboards:** Weekly / Daily / Friends, with a local personal fallback when
  offline or before the server is configured.
- **Facebook:** profile name/picture, optional `user_friends`; the access token
  is kept in memory and sent only with a score submission.
- **Challenge links:** `?ranked=2026-W43` and `?daily=2026-10-23`.
- **Leagues:** 30-player weekly divisions, top-5 promotion, bottom-5 relegation.
- **Rival ghost:** race the current #1 line from the leaderboard.
- **Run tokens:** ranked/daily starts obtain a one-use server token; submissions
  without it are rejected when `RUN_TOKENS=1`.
- **Share:** score-card PNG, native share sheet, clipboard and challenge links.
- **Onboarding:** contextual first-run tutorial with a guaranteed crystal.
- **Biomes / meteors:** five star biomes, iron/ice/gold/volatile/splitter rocks.
- **Crystal shop:** trails, ship skins and titles (cosmetic only).
- **Settings:** colour-blind cues, reduced motion, low-FX, music and SFX toggles.
- **Install:** PWA install prompt and Ranked/Daily/Board shortcuts.

Configure `config.js`:

```js
window.ORBIT_CONFIG = {
  facebookAppId: "1234567890",
  apiBase: "https://your-score-server.example.com",
  facebookFriends: false, // true requests user_friends (needs app review)
  leaderboardSize: 20,

  // native Capacitor builds only; blank = simulated browser ad
  admobRewardedId: "ca-app-pub-XXXX/YYYY",
  admobTestMode: true,
  admobConsent: true,
};
```

Deploy `server/orbit_server.py` (SQLite by default) and follow
[`../server/README.md`](../server/README.md) for the Facebook app setup, HTTPS,
CORS, deletion and data notes. Leave `apiBase` empty to keep everything
offline/local.

The server verifies the Facebook token, seed, fixed loadout, one-life rules,
stat plausibility and unique run ids. It does not replay the simulation, so a
determined cheater can still forge a plausible run; add server-side replay or
device attestation for prizes.

Daily challenges and weekly ranks use UTC dates, so the seed is the same for
players in every time zone.

## 3. Publish to Google Play / the App Store (with real ads)

Wrap the `web` folder with [Capacitor](https://capacitorjs.com). You need
Node.js, plus Android Studio for Android or Xcode on a Mac for iOS.

```bash
cd web
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor-community/admob
npx cap init "Orbit Runner" com.yourname.orbitrunner --web-dir .
npx cap add android
npx cap sync
npx cap open android      # build and run from Android Studio
```

Real ads: set `admobRewardedId` in `config.js`. With the Capacitor AdMob plugin
present, `createAdProvider()` automatically uses `AdMobProvider`; in a plain
browser it falls back to `MockAdProvider`. The provider runs the UMP consent
flow when `admobConsent` is true, preloads the next video, grants the reward only
from the SDK's `onRewarded` event, and falls back safely on ad failure.

Set `admobTestMode: false` only after your app is approved and you are using
production ad unit IDs. Verify the plugin method names for your installed
`@capacitor-community/admob` version, and add the iOS ATT prompt if you track
users.

## Crystals

Crystals are not just a counter:

- Each pickup is `25 x combo` points and raises the combo (up to x8), refreshing
  its 6-second timer. They are the safest way to build a large multiplier.
- Collected crystals are banked at the end of the run.
- Bank crystals buy a starting shield (25 crystals).
- Lifetime crystals unlock `WARDEN` (250), `DRIFTER` (700) and `GAMBLER` (1500).
- Missions ask for crystal counts and pay bank crystals.
- Ranked/daily runs still earn score, missions and lifetime progress, but the
  fixed loadout means crystals cannot buy a leaderboard advantage.

## Progression systems

- **Missions:** three date-seeded objectives per day. Progress is saved; rewards
  are paid on the game-over screen; every five completions grants a continue
  token.
- **Ships:** unlocked with lifetime crystals (0 / 250 / 700 / 1500) and cycled
  from the title screen.
- **Contracts:** `STANDARD`, `BLAZE` (more flares, more score) and `VOID`
  (faster meteors, double crystals).
- **Daily challenge:** fair UTC-date seed, fixed loadout, one life, own ladder.
- **Ranked weekly:** UTC-week seed, fixed loadout, one life, own ladder.
- **Ghost:** best classic run is replayed in-game.
- **Continue economy:** free first continue -> continue tokens -> rewarded ad,
  with a four-ad session cap. Ranked/daily runs have no continues or ads.
- **Corona Surge:** every 5 levels, collect 3 cores before the timer expires.

## Realism pass

- Kepler-style inner-ring speed, angular inertia when reversing, and a
  spring-damper radial move between rings.
- Meteors accelerate toward the star, curve with angular momentum, spawn as
  rotating irregular rocks, and use swept collision so fast rocks cannot tunnel
  through the ship.
- Parallax starfield, shooting stars, ringed planet, additive nebula/corona,
  glowing rings, aircraft liveries, exhaust/banking, afterimages, rock tails and
  craters, magnet beams, shockwaves, combo callouts, vignette and screen flash.
- Glass HUD panels, segmented combo and level meters, crystal/power-up chips,
  run grade `S`-`E`, tier badges `ROOKIE`-`DIAMOND`, medal/avatar leaderboard rows
  and a card-based game-over screen.
- Layered procedural music, impact noise, combo-tier gem sounds, UMP-aware ads.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page that holds the game (safe-area aware) |
| `config.js` | Facebook App ID and score-server URL |
| `game.js` | Game, ad system, ranked mode and leaderboard client |
| `manifest.json` | App name, icon and full-screen settings for installing |
| `sw.js` | Versioned offline cache with network-first navigation |
| `icon-*.png` | App icons |
| `package.json` | Test/serve scripts |
| `test/game.test.js` | Node regression tests |

## Tests

```bash
npm test
```

The 36-test suite covers reward accounting, save sanitising, missions, contracts,
ship modifiers, daily determinism, continue tokens, ad caps, flares, boss surges,
ghosts, ranked loadouts, local leaderboards, challenge seeds, profile storage,
AdMob reward-event ordering, onboarding, biomes, shop purchases and settings.
