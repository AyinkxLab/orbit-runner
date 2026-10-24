# Orbit Runner score server

A small standard-library Python server for the weekly ranked and daily
leaderboards. It verifies Facebook access tokens with the Graph API, enforces
the competitive rules, stores best scores per player, and serves CORS-enabled
JSON endpoints for `web/game.js`.

## What it enforces

- Facebook token is valid and belongs to your app (`debug_token`).
- Ranked runs use the server-computed week seed, daily runs use the date seed.
- Competitive runs use the fixed `SCOUT` / `STANDARD` loadout.
- No continues, doubles, bought shields or other paid/loadout advantages.
- Score, time, crystals, level, near-misses, flares and boss counts must be
  plausible for the elapsed time.
- Unique run ids, so a submitted run cannot be replayed.
- Per-user submission rate limit (12/minute) and best-score-per-user storage.

It does **not** replay the simulation. A determined cheater can forge a
plausible run. For prizes or a serious ladder, record inputs and replay them
server-side, or add signed device attestation.

## 1. Create the Facebook app

1. Create an app at https://developers.facebook.com/apps/ and add
   **Facebook Login**.
2. Add your site URL and OAuth redirect URI. Set the app domain and use HTTPS
   in production. `http://localhost:8000` is fine for development after adding
   it in the Facebook dashboard.
3. Copy the **App ID** and **App Secret**.
4. `public_profile` is enough for global scores. The **Friends** tab needs
   `user_friends`, which only returns friends who also use the app and requires
   app review for production. Set `facebookFriends: true` in `web/config.js`
   when you are ready.

Never put the App Secret in `web/config.js` or any client file.

## 2. Configure the client

Edit `web/config.js`:

```js
window.ORBIT_CONFIG = {
  facebookAppId: "1234567890",
  apiBase: "https://your-score-server.example.com",
  facebookFriends: false,
  leaderboardSize: 20,
};
```

Keep `apiBase` empty to retain offline/local boards.

## 3. Run the server

No third-party packages are required.

```bash
# development
ALLOW_GUEST=1 PORT=8080 python server/orbit_server.py
```

Windows PowerShell:

```powershell
$env:ALLOW_GUEST="1"; $env:PORT="8080"; python server/orbit_server.py
```

Production:

```bash
FACEBOOK_APP_ID=... \
FACEBOOK_APP_SECRET=... \
ALLOWED_ORIGIN=https://your-game.example.com \
PORT=8080 \
ORBIT_DB=/var/lib/orbit-runner/orbit.db \
python server/orbit_server.py
```

Put it behind HTTPS (Caddy, nginx, Render, Fly, Railway, etc.). Facebook login
and `navigator.share` require a secure context.

Environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `FACEBOOK_APP_ID` | empty | Facebook app id |
| `FACEBOOK_APP_SECRET` | empty | Facebook app secret, server only |
| `ALLOWED_ORIGIN` | `*` | CORS origin; set your game origin in production |
| `PORT` | `8080` | listen port |
| `ORBIT_DB` | `server/data/orbit.db` | SQLite storage path |
| `ALLOW_GUEST` | `0` | development-only `provider:"guest"` submissions |
| `RUN_TOKENS` | `1` | require a server-issued one-use token for ranked/daily scores |

## Endpoints

```text
GET  /api/health
GET  /api/leaderboard?scope=weekly&week=2026-W43&limit=20&offset=0
GET  /api/leaderboard?scope=daily&date=2026-10-23&limit=20&offset=0
GET  /api/leaderboard?scope=friends&week=2026-W43
GET  /api/leaderboard?scope=league&week=2026-W43
GET  /api/ghost?scope=weekly&week=2026-W43
POST /api/runs/start    {"provider":"facebook","accessToken":"...","mode":"ranked","week":"2026-W43"}
POST /api/scores
POST /api/events        {"provider":"facebook","accessToken":"...","events":[...]}
POST /api/delete        {"provider":"facebook","accessToken":"..."}
```

`POST /api/scores` body:

```json
{
  "provider": "facebook",
  "accessToken": "...",
  "run": {
    "runId": "ranked-2026-W43-...",
    "mode": "ranked",
    "week": "2026-W43",
    "date": "2026-10-23",
    "seed": 771507115,
    "score": 8385,
    "time": 91.2,
    "crystals": 31,
    "level": 7,
    "maxCombo": 6,
    "nearMisses": 17,
    "flaresDodged": 5,
    "bossesCleared": 1,
    "continues": 0,
    "doubles": 0,
    "ship": "scout",
    "contract": "standard",
    "version": "3.1"
  }
}
```

The client sends Facebook tokens in JSON bodies for score, run-start, event and
deletion requests. Friends and league leaderboard requests send the token in the
HTTP header `Authorization: Bearer <facebook-access-token>`, never in the URL.
The server does not store the token. Query-string tokens are not accepted for
leaderboard authentication, and legacy `accessToken` query values are redacted
from request logs.

Ranked/daily runs first call `/api/runs/start`, which returns a one-use token
bound to the user and scope. Set `RUN_TOKENS=0` only for a legacy client or
local debugging. The score response includes the player's league tier.

### Leagues and ghosts

- 30 players per weekly division.
- Top 5 promote; bottom 5 relegate on the next weekly assignment.
- `scope=league` returns the division, member rows, your rank and promotion zones.
- The top run's ghost is stored with the best score and served by `/api/ghost`.
- The client's **RACE TOP GHOST** button uses that run as a magenta rival.

### Events

`/api/events` accepts up to 20 events per batch (`run_start`, `run_end`,
`board_open`, `install_click`). They are stored in SQLite and pruned after 120
days. The game sends them only when Facebook and `apiBase` are configured.

Daily seeds, weekly keys and the score server's date checks use **UTC**, so
players in different time zones compete on the same daily/weekly run.

## Data and privacy

SQLite stores Facebook user id, display name, profile picture URL, best score,
run history and timestamps. `POST /api/delete` verifies the Facebook token and
deletes the user, their best scores and runs via `ON DELETE CASCADE`. The web
leaderboard exposes a two-tap **DELETE MY DATA** action when connected.

Publish a privacy policy before production. If you want to minimise stored
personal data, replace the display name with a pseudonym or hash the user id in
`store_score`. Database backups must follow the same deletion policy.

## Tests

```bash
python -m unittest discover -s server -p "test_*.py" -v
```

The tests cover bearer-header validation, seed parity, validation, SQLite storage, best-score ranking,
pagination, duplicate runs, deletion, rate limits, leagues, ghosts, run tokens,
events and Facebook configuration.

## Docker

```bash
docker compose up --build
```

The compose file mounts `orbit-data` at `/data` and reads
`FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `ALLOWED_ORIGIN` and `RUN_TOKENS` from
the environment.
