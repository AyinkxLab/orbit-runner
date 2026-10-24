"""
Orbit Runner score server (standard library only).

Run:
    FACEBOOK_APP_ID=... FACEBOOK_APP_SECRET=... PORT=8080 python server/orbit_server.py

Environment:
    FACEBOOK_APP_ID        Facebook app id (required for real submissions)
    FACEBOOK_APP_SECRET    Facebook app secret (required for token verification)
    ALLOWED_ORIGIN         CORS origin, default "*"
    PORT                   default 8080
    ORBIT_DB               SQLite path, default server/data/orbit.db
    ALLOW_GUEST=1          allow provider="guest" submissions (development only)

Endpoints:
    GET  /api/health
    GET  /api/leaderboard?scope=weekly|daily|friends&week=...&date=...&limit=20&offset=0
    POST /api/scores       submit a run
    POST /api/delete       delete the authenticated player's data

The client never stores the Facebook access token; it sends it with a score or
deletion request and the server verifies it with the Graph API.

Anti-cheat note: the server validates the run shape, seed, fixed loadout,
score/time plausibility, one-life rules and unique run ids, and stores best
scores per player. It does NOT replay the game simulation. A determined cheater
can still forge a plausible run. For prizes, record inputs and replay them
server-side, or add signed device attestation.
"""
import json
import math
import os
import re
import secrets
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

FACEBOOK_APP_ID = os.environ.get("FACEBOOK_APP_ID", "")
FACEBOOK_APP_SECRET = os.environ.get("FACEBOOK_APP_SECRET", "")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")
PORT = int(os.environ.get("PORT", "8080"))
ALLOW_GUEST = os.environ.get("ALLOW_GUEST", "0") == "1"
HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("ORBIT_DB", os.path.join(HERE, "data", "orbit.db"))

MAX_SCORE = 100000
MAX_TIME = 1800.0
MAX_SCORE_PER_SECOND = 1500.0
MAX_BODY = 256 * 1024
MAX_SUBMISSIONS_PER_MINUTE = 12
RETENTION_DAYS = 120
REQUIRE_RUN_TOKENS = os.environ.get("RUN_TOKENS", "1") == "1"
RUN_TOKEN_TTL = 45 * 60
LEAGUE_SIZE = 30

WEEK_RE = re.compile(r"^(\d{4})-W(\d{2})$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
RUN_ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{8,140}$")

_RATE = {}
_RATE_LOCK = threading.Lock()


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


# ------------------------------------------------------------------ seed ---


def fnv1a(value):
    """Must match the client's hashStr for ASCII seeds."""
    h = 2166136261
    for byte in value.encode("utf-8"):
        h ^= byte
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def seed_for(mode, week="", day=""):
    if mode == "ranked":
        return fnv1a("orbit-ranked-" + week)
    return fnv1a("orbit-daily-" + day)


def utc_today():
    return datetime.now(timezone.utc).date()


def week_key(value=None):
    d = value or utc_today()
    year, week, _ = d.isocalendar()
    return f"{year}-W{week:02d}"


def _today():
    return utc_today().isoformat()


# --------------------------------------------------------------- database ---


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    picture TEXT NOT NULL DEFAULT '',
    created REAL NOT NULL,
    updated REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    scope_key TEXT NOT NULL,
    score INTEGER NOT NULL,
    time REAL NOT NULL,
    created REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS bests (
    scope_key TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    run_id TEXT NOT NULL,
    score INTEGER NOT NULL,
    time REAL NOT NULL,
    created REAL NOT NULL,
    ghost TEXT,
    title TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (scope_key, user_id)
);
CREATE INDEX IF NOT EXISTS idx_bests_board ON bests(scope_key, score DESC, time ASC, created ASC);
CREATE INDEX IF NOT EXISTS idx_bests_user ON bests(user_id);
CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created);
CREATE TABLE IF NOT EXISTS league_tiers (
    user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    tier INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS league_instances (
    league_id TEXT PRIMARY KEY,
    week TEXT NOT NULL,
    tier INTEGER NOT NULL,
    created REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS league_members (
    week TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    league_id TEXT NOT NULL,
    PRIMARY KEY (week, user_id)
);
CREATE TABLE IF NOT EXISTS run_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    scope_key TEXT NOT NULL,
    expires REAL NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    props TEXT,
    created REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created);
CREATE INDEX IF NOT EXISTS idx_league_members_week ON league_members(week, league_id);
"""


@contextmanager
def database():
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA journal_mode=WAL")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with database() as conn:
        conn.executescript(SCHEMA)
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(bests)").fetchall()}
        if "ghost" not in columns:
            conn.execute("ALTER TABLE bests ADD COLUMN ghost TEXT")
        if "title" not in columns:
            conn.execute("ALTER TABLE bests ADD COLUMN title TEXT NOT NULL DEFAULT ''")


def prune_db(conn):
    cutoff = time.time() - RETENTION_DAYS * 86400
    conn.execute("DELETE FROM runs WHERE created < ?", (cutoff,))
    conn.execute("DELETE FROM run_tokens WHERE expires < ?", (time.time() - 86400,))
    conn.execute("DELETE FROM events WHERE created < ?", (cutoff,))
    conn.execute("DELETE FROM league_instances WHERE created < ?", (time.time() - 180 * 86400,))


def delete_user(conn, user_id):
    conn.execute("DELETE FROM events WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
    return True


def _ghost_json(value):
    if not isinstance(value, list):
        return None
    samples = []
    for sample in value[:900]:
        if isinstance(sample, (list, tuple)) and len(sample) >= 3:
            try:
                samples.append([float(sample[0]), float(sample[1]), float(sample[2])])
            except (TypeError, ValueError):
                continue
    return json.dumps(samples, separators=(",", ":")) if samples else None


def store_score(conn, user_id, name, picture, run, ghost=None, title=""):
    now = time.time()
    exists = conn.execute("SELECT 1 FROM runs WHERE run_id = ?", (run["runId"],)).fetchone()
    if exists:
        raise ApiError(409, "run already submitted")
    conn.execute(
        "INSERT INTO users(user_id, name, picture, created, updated) VALUES(?,?,?,?,?) "
        "ON CONFLICT(user_id) DO UPDATE SET name=excluded.name, picture=excluded.picture, updated=excluded.updated",
        (user_id, name[:60], picture[:500], now, now),
    )
    conn.execute(
        "INSERT INTO runs(run_id, user_id, scope_key, score, time, created) VALUES(?,?,?,?,?,?)",
        (run["runId"], user_id, run["scopeKey"], run["score"], run["time"], now),
    )
    previous = conn.execute(
        "SELECT score, time FROM bests WHERE scope_key = ? AND user_id = ?", (run["scopeKey"], user_id)
    ).fetchone()
    better = (not previous or run["score"] > int(previous["score"]) or
              (run["score"] == int(previous["score"]) and run["time"] < float(previous["time"])))
    if better:
        conn.execute(
            "INSERT INTO bests(scope_key, user_id, run_id, score, time, created, ghost, title) "
            "VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(scope_key, user_id) DO UPDATE SET "
            "run_id=excluded.run_id, score=excluded.score, time=excluded.time, created=excluded.created, "
            "ghost=excluded.ghost, title=excluded.title",
            (run["scopeKey"], user_id, run["runId"], run["score"], run["time"], now,
             _ghost_json(ghost), str(title or "")[:40]),
        )
    return True


def board_entries(conn, scope_key, limit=20, offset=0, allowed_user_ids=None):
    params = [scope_key]
    where = "b.scope_key = ?"
    if allowed_user_ids is not None:
        ids = list(allowed_user_ids)
        if not ids:
            return [], 0
        where += " AND b.user_id IN (" + ",".join("?" for _ in ids) + ")"
        params.extend(ids)
    total = conn.execute(
        "SELECT COUNT(*) AS n FROM bests b WHERE " + where, params
    ).fetchone()["n"]
    rows = conn.execute(
        "SELECT b.user_id, b.score, b.time, b.run_id, b.title, u.name FROM bests b "
        "JOIN users u ON u.user_id = b.user_id WHERE " + where +
        " ORDER BY b.score DESC, b.time ASC, b.created ASC LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()
    entries = []
    for index, row in enumerate(rows):
        entries.append({
            "rank": offset + index + 1,
            "name": row["name"],
            "score": int(row["score"]),
            "time": row["time"],
            "title": row["title"] or "",
            "userId": row["user_id"],
        })
    return entries, total


def player_rank(conn, scope_key, user_id, allowed_user_ids=None):
    mine = conn.execute(
        "SELECT score, time FROM bests WHERE scope_key = ? AND user_id = ?", (scope_key, user_id)
    ).fetchone()
    if not mine:
        return None
    params = [scope_key, mine["score"], mine["score"], mine["time"]]
    where = "scope_key = ? AND (score > ? OR (score = ? AND time < ?))"
    if allowed_user_ids is not None:
        ids = list(allowed_user_ids)
        if not ids:
            return None
        where += " AND user_id IN (" + ",".join("?" for _ in ids) + ")"
        params.extend(ids)
    ahead = conn.execute("SELECT COUNT(*) AS n FROM bests WHERE " + where, params).fetchone()["n"]
    return {"rank": int(ahead) + 1, "score": int(mine["score"])}


def board_response(conn, scope_key, user_id="", limit=20, offset=0, allowed_user_ids=None):
    entries, total = board_entries(conn, scope_key, limit, offset, allowed_user_ids)
    you = player_rank(conn, scope_key, user_id, allowed_user_ids) if user_id else None
    return {"entries": entries, "you": you, "total": total}


# ------------------------------------------------------------------ rules ---


def validate_run(run):
    if not isinstance(run, dict):
        raise ApiError(400, "run must be an object")
    mode = run.get("mode")
    if mode not in ("ranked", "daily"):
        raise ApiError(400, "mode must be ranked or daily")

    run_id = run.get("runId")
    if not isinstance(run_id, str) or not RUN_ID_RE.match(run_id):
        raise ApiError(400, "invalid runId")

    try:
        score = int(run.get("score"))
        elapsed = float(run.get("time"))
        crystals = int(run.get("crystals", 0))
        level = int(run.get("level", 1))
        near = int(run.get("nearMisses", 0))
        flares = int(run.get("flaresDodged", 0))
        bosses = int(run.get("bossesCleared", 0))
    except (TypeError, ValueError):
        raise ApiError(400, "score/time/stats must be numeric")

    if score < 0 or score > MAX_SCORE:
        raise ApiError(400, "score out of range")
    if elapsed < 3 or elapsed > MAX_TIME:
        raise ApiError(400, "run time out of range")
    if score > elapsed * MAX_SCORE_PER_SECOND + 100:
        raise ApiError(400, "implausible score for run time")
    if crystals < 0 or crystals > elapsed * 8 + 50:
        raise ApiError(400, "implausible crystal count")
    if level < 1 or level > int(elapsed // 15) + 3:
        raise ApiError(400, "implausible level")
    if near < 0 or near > elapsed * 8 + 30:
        raise ApiError(400, "implausible near-miss count")
    if flares < 0 or flares > elapsed / 5 + 10:
        raise ApiError(400, "implausible flare count")
    if bosses < 0 or bosses > level // 5 + 2:
        raise ApiError(400, "implausible boss count")
    if run.get("continues", 0) != 0 or run.get("doubles", 0) != 0:
        raise ApiError(400, "competitive runs cannot use continues or doubles")
    if run.get("ship") != "scout" or run.get("contract") != "standard":
        raise ApiError(400, "competitive runs use the fixed scout/standard loadout")

    if mode == "ranked":
        week = run.get("week")
        if not isinstance(week, str) or not WEEK_RE.match(week):
            raise ApiError(400, "invalid week")
        expected = seed_for("ranked", week=week)
        if int(run.get("seed", -1)) != expected:
            raise ApiError(400, "seed does not match the ranked week")
        scope_key = "ranked:" + week
        scope = "weekly"
        day = run.get("date") if isinstance(run.get("date"), str) else _today()
    else:
        day = run.get("date")
        if not isinstance(day, str) or not DATE_RE.match(day):
            raise ApiError(400, "invalid date")
        try:
            parsed = datetime.strptime(day, "%Y-%m-%d").date()
        except ValueError:
            raise ApiError(400, "invalid date")
        if parsed > utc_today() or parsed < utc_today() - timedelta(days=365):
            raise ApiError(400, "date outside the accepted window")
        expected = seed_for("daily", day=day)
        if int(run.get("seed", -1)) != expected:
            raise ApiError(400, "seed does not match the daily challenge")
        week = week_key(parsed)
        scope_key = "daily:" + day
        scope = "daily"

    return {
        "runId": run_id,
        "mode": mode,
        "week": week,
        "date": day,
        "scope": scope,
        "scopeKey": scope_key,
        "score": score,
        "time": round(elapsed, 2),
        "crystals": crystals,
        "level": level,
        "nearMisses": near,
        "flaresDodged": flares,
        "bossesCleared": bosses,
    }


# --------------------------------------------------------------- leagues ----

LEAGUE_NAMES = ["ROOKIE", "BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND", "MASTER"]


def league_name(tier):
    return LEAGUE_NAMES[min(tier, len(LEAGUE_NAMES) - 1)]


def ensure_user(conn, profile):
    now = time.time()
    conn.execute(
        "INSERT INTO users(user_id, name, picture, created, updated) VALUES(?,?,?,?,?) "
        "ON CONFLICT(user_id) DO UPDATE SET name=excluded.name, picture=excluded.picture, updated=excluded.updated",
        (profile["id"], profile["name"][:60], profile.get("picture", "")[:500], now, now),
    )


def _league_rank(conn, league_id, week, user_id):
    members = conn.execute("SELECT user_id FROM league_members WHERE league_id = ?", (league_id,)).fetchall()
    ids = [row["user_id"] for row in members]
    if not ids:
        return None, 0
    placeholders = ",".join("?" for _ in ids)
    rows = conn.execute(
        "SELECT user_id, score, time FROM bests WHERE scope_key = ? AND user_id IN (" + placeholders + ") "
        "ORDER BY score DESC, time ASC, created ASC",
        ["ranked:" + week] + ids,
    ).fetchall()
    order = [row["user_id"] for row in rows]
    if user_id in order:
        return order.index(user_id) + 1, len(ids)
    return len(ids), len(ids)


def _assign_league(conn, user_id, week):
    existing = conn.execute(
        "SELECT league_id FROM league_members WHERE week = ? AND user_id = ?", (week, user_id)
    ).fetchone()
    tier_row = conn.execute("SELECT tier FROM league_tiers WHERE user_id = ?", (user_id,)).fetchone()
    tier = int(tier_row["tier"]) if tier_row else 0
    if existing:
        return existing["league_id"], tier
    previous = conn.execute(
        "SELECT week, league_id FROM league_members WHERE user_id = ? AND week < ? ORDER BY week DESC LIMIT 1",
        (user_id, week),
    ).fetchone()
    if previous:
        rank, count = _league_rank(conn, previous["league_id"], previous["week"], user_id)
        if rank:
            if rank <= 5:
                tier += 1
            elif count > 5 and rank > count - 5:
                tier = max(0, tier - 1)
    conn.execute(
        "INSERT INTO league_tiers(user_id, tier) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET tier=excluded.tier",
        (user_id, tier),
    )
    instance = conn.execute(
        "SELECT li.league_id FROM league_instances li "
        "LEFT JOIN league_members lm ON lm.league_id = li.league_id "
        "WHERE li.week = ? AND li.tier = ? GROUP BY li.league_id HAVING COUNT(lm.user_id) < ? "
        "ORDER BY li.created LIMIT 1",
        (week, tier, LEAGUE_SIZE),
    ).fetchone()
    if instance:
        league_id = instance["league_id"]
    else:
        league_id = f"{tier}:{week}:{secrets.token_hex(4)}"
        conn.execute(
            "INSERT INTO league_instances(league_id, week, tier, created) VALUES(?,?,?,?)",
            (league_id, week, tier, time.time()),
        )
    conn.execute(
        "INSERT INTO league_members(week, user_id, league_id) VALUES(?,?,?) "
        "ON CONFLICT(week, user_id) DO UPDATE SET league_id=excluded.league_id",
        (week, user_id, league_id),
    )
    return league_id, tier


def league_board(conn, user_id, week):
    league_id, tier = _assign_league(conn, user_id, week)
    rows = conn.execute(
        "SELECT b.user_id, b.score, b.time, b.title, u.name FROM league_members lm "
        "JOIN bests b ON b.user_id = lm.user_id AND b.scope_key = ? "
        "JOIN users u ON u.user_id = lm.user_id WHERE lm.league_id = ? "
        "ORDER BY b.score DESC, b.time ASC, b.created ASC",
        ("ranked:" + week, league_id),
    ).fetchall()
    entries = []
    you = None
    for index, row in enumerate(rows):
        entry = {
            "rank": index + 1,
            "name": row["name"],
            "score": int(row["score"]),
            "time": row["time"],
            "title": row["title"] or "",
            "userId": row["user_id"],
        }
        entries.append(entry)
        if row["user_id"] == user_id:
            you = {"rank": index + 1, "score": int(row["score"])}
    return {
        "entries": entries,
        "you": you,
        "total": len(entries),
        "league": {
            "id": league_id,
            "name": league_name(tier),
            "tier": tier,
            "promoteCount": 5,
            "relegateCount": 5,
        },
    }


# ------------------------------------------------------------- run tokens ---


def _scope_for(mode, week, day):
    if mode == "ranked":
        if not isinstance(week, str) or not WEEK_RE.match(week):
            raise ApiError(400, "invalid week")
        return "ranked:" + week
    if mode == "daily":
        if not isinstance(day, str) or not DATE_RE.match(day):
            raise ApiError(400, "invalid date")
        try:
            parsed = datetime.strptime(day, "%Y-%m-%d").date()
        except ValueError:
            raise ApiError(400, "invalid date")
        if parsed > utc_today() or parsed < utc_today() - timedelta(days=365):
            raise ApiError(400, "date outside the accepted window")
        return "daily:" + day
    raise ApiError(400, "invalid mode")


def issue_run_token(conn, user_id, mode, week, day):
    scope_key = _scope_for(mode, week, day)
    token = secrets.token_urlsafe(24)
    now = time.time()
    conn.execute(
        "INSERT INTO run_tokens(token, user_id, scope_key, expires, used, created) VALUES(?,?,?,?,0,?)",
        (token, user_id, scope_key, now + RUN_TOKEN_TTL, now),
    )
    return token, now + RUN_TOKEN_TTL


def consume_run_token(conn, token, user_id, scope_key):
    if not REQUIRE_RUN_TOKENS:
        return
    if not token:
        raise ApiError(401, "missing run token")
    row = conn.execute("SELECT * FROM run_tokens WHERE token = ?", (token,)).fetchone()
    if not row or row["used"] or row["expires"] < time.time() or \
            row["user_id"] != user_id or row["scope_key"] != scope_key:
        raise ApiError(401, "invalid or expired run token")
    conn.execute("UPDATE run_tokens SET used = 1 WHERE token = ?", (token,))


def get_ghost(conn, scope_key):
    row = conn.execute(
        "SELECT b.score, b.time, b.ghost, u.name FROM bests b JOIN users u ON u.user_id = b.user_id "
        "WHERE b.scope_key = ? AND b.ghost IS NOT NULL ORDER BY b.score DESC, b.time ASC, b.created ASC LIMIT 1",
        (scope_key,),
    ).fetchone()
    if not row:
        return None
    try:
        samples = json.loads(row["ghost"])
    except Exception:
        samples = []
    if not samples:
        return None
    return {"score": int(row["score"]), "time": row["time"], "name": row["name"], "samples": samples}


def store_events(conn, user_id, events):
    now = time.time()
    count = 0
    for event in events[:20]:
        if not isinstance(event, dict) or not isinstance(event.get("name"), str):
            continue
        props = event.get("props") if isinstance(event.get("props"), dict) else {}
        conn.execute(
            "INSERT INTO events(user_id, name, props, created) VALUES(?,?,?,?)",
            (user_id, event["name"][:60], json.dumps(props)[:2000], now),
        )
        count += 1
    return count


# -------------------------------------------------------------- facebook ----


def _graph_get(path, params):
    url = "https://graph.facebook.com/" + path + "?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=6) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode("utf-8"))
            message = body.get("error", {}).get("message", "Facebook verification failed")
        except Exception:
            message = "Facebook verification failed"
        raise ApiError(401, message)
    except Exception:
        raise ApiError(502, "Could not reach Facebook")


def verify_facebook(access_token):
    if not access_token or not isinstance(access_token, str):
        raise ApiError(401, "missing Facebook access token")
    if not FACEBOOK_APP_ID or not FACEBOOK_APP_SECRET:
        raise ApiError(503, "Facebook login is not configured on the server")
    app_token = f"{FACEBOOK_APP_ID}|{FACEBOOK_APP_SECRET}"
    debug = _graph_get("debug_token", {"input_token": access_token, "access_token": app_token})
    info = debug.get("data", {})
    if not info.get("is_valid"):
        raise ApiError(401, "Facebook token is invalid")
    if str(info.get("app_id")) != str(FACEBOOK_APP_ID):
        raise ApiError(401, "Facebook token belongs to another app")
    me = _graph_get("me", {"fields": "id,name,picture.type(large)", "access_token": access_token})
    if not me.get("id"):
        raise ApiError(401, "Could not read Facebook profile")
    picture = ((me.get("picture") or {}).get("data") or {}).get("url", "")
    return {"id": str(me["id"]), "name": str(me.get("name") or "PLAYER"), "picture": picture}


def facebook_friend_ids(access_token):
    if not access_token:
        raise ApiError(401, "Friends leaderboard needs a Facebook token")
    result = _graph_get("me/friends", {"limit": 500, "access_token": access_token})
    return {str(item.get("id")) for item in result.get("data", [])}


def check_rate(user_id):
    now = time.time()
    with _RATE_LOCK:
        recent = [t for t in _RATE.get(user_id, []) if now - t < 60]
        if len(recent) >= MAX_SUBMISSIONS_PER_MINUTE:
            raise ApiError(429, "too many submissions, try again shortly")
        recent.append(now)
        _RATE[user_id] = recent


# ------------------------------------------------------------------ http -----


class Handler(BaseHTTPRequestHandler):
    server_version = "OrbitRunnerScores/2.0"

    def log_message(self, fmt, *args):
        # Older clients may still send a token in the query string. Redact it
        # before logging request lines so legacy traffic cannot leak credentials.
        message = re.sub(r"(?i)(accessToken=)[^&\s]*", r"\1[REDACTED]", fmt % args)
        print("%s - %s" % (self.address_string(), message))

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-store")

    def _json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _error(self, error):
        if isinstance(error, ApiError):
            self._json(error.status, {"error": error.message})
        else:
            self._json(500, {"error": "internal server error"})

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _bearer_token(self):
        authorization = self.headers.get("Authorization", "").strip()
        parts = authorization.split(None, 1)
        if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
            raise ApiError(401, "missing or invalid Authorization bearer token")
        return parts[1].strip()

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            raise ApiError(413, "request body too large")
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            raise ApiError(400, "invalid JSON")

    def _profile(self, body):
        provider = body.get("provider")
        if provider == "facebook":
            return verify_facebook(body.get("accessToken", ""))
        if provider == "guest" and ALLOW_GUEST:
            name = str(body.get("name") or "GUEST")[:60]
            return {"id": "guest:" + str(fnv1a(name)), "name": name, "picture": ""}
        raise ApiError(401, "provider must be facebook")

    def do_GET(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            query = urllib.parse.parse_qs(parsed.query)
            if parsed.path == "/api/health":
                return self._json(200, {
                    "ok": True,
                    "facebook": bool(FACEBOOK_APP_ID and FACEBOOK_APP_SECRET),
                    "guest": ALLOW_GUEST,
                    "storage": "sqlite",
                })
            if parsed.path == "/api/ghost":
                scope = (query.get("scope") or ["weekly"])[0]
                week = (query.get("week") or [week_key()])[0]
                day = (query.get("date") or [_today()])[0]
                if scope == "daily":
                    scope_key = "daily:" + day
                elif scope == "weekly":
                    scope_key = "ranked:" + week
                else:
                    raise ApiError(400, "ghost scope must be weekly or daily")
                with database() as conn:
                    ghost = get_ghost(conn, scope_key)
                if not ghost:
                    raise ApiError(404, "no ghost available")
                return self._json(200, ghost)
            if parsed.path != "/api/leaderboard":
                raise ApiError(404, "not found")
            self._leaderboard(query)
        except Exception as e:
            self._error(e)

    def _league(self, query, token):
        week = (query.get("week") or [week_key()])[0]
        if not WEEK_RE.match(week):
            raise ApiError(400, "invalid week")
        me = verify_facebook(token)
        with database() as conn:
            ensure_user(conn, me)
            data = league_board(conn, me["id"], week)
        data["source"] = "global"
        self._json(200, data)

    def _leaderboard(self, query):
        scope = (query.get("scope") or ["weekly"])[0]
        try:
            limit = max(1, min(50, int((query.get("limit") or ["20"])[0])))
            offset = max(0, int((query.get("offset") or ["0"])[0]))
        except ValueError:
            raise ApiError(400, "limit/offset must be numbers")
        week = (query.get("week") or [week_key()])[0]
        day = (query.get("date") or [_today()])[0]
        user_id = ""
        allowed = None
        if scope == "weekly":
            if not WEEK_RE.match(week):
                raise ApiError(400, "invalid week")
            scope_key = "ranked:" + week
        elif scope == "daily":
            if not DATE_RE.match(day):
                raise ApiError(400, "invalid date")
            scope_key = "daily:" + day
        elif scope == "friends":
            token = self._bearer_token()
            me = verify_facebook(token)
            user_id = me["id"]
            friends = facebook_friend_ids(token)
            friends.add(user_id)
            allowed = friends
            if not WEEK_RE.match(week):
                raise ApiError(400, "invalid week")
            scope_key = "ranked:" + week
        elif scope == "league":
            token = self._bearer_token()
            return self._league(query, token)
        else:
            raise ApiError(400, "scope must be weekly, daily, friends or league")

        with database() as conn:
            data = board_response(conn, scope_key, user_id, limit, offset, allowed)
        data["source"] = "global"
        self._json(200, data)

    def do_POST(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path == "/api/delete":
                return self._delete()
            if parsed.path == "/api/runs/start":
                return self._start_run()
            if parsed.path == "/api/events":
                return self._events()
            if parsed.path != "/api/scores":
                raise ApiError(404, "not found")
            body = self._body()
            profile = self._profile(body)
            raw_run = body.get("run")
            run = validate_run(raw_run)
            run_token = raw_run.get("runToken") if isinstance(raw_run, dict) else None
            check_rate(profile["id"])
            with database() as conn:
                ensure_user(conn, profile)
                consume_run_token(conn, run_token, profile["id"], run["scopeKey"])
                store_score(conn, profile["id"], profile["name"], profile["picture"], run,
                            ghost=raw_run.get("ghost"), title=raw_run.get("title", ""))
                league = None
                if run["mode"] == "ranked":
                    _, tier = _assign_league(conn, profile["id"], run["week"])
                    league = {"name": league_name(tier), "tier": tier,
                              "promoteCount": 5, "relegateCount": 5}
                prune_db(conn)
                response = board_response(conn, run["scopeKey"], profile["id"], 10, 0)
            response.update({"source": "global", "accepted": True, "score": run["score"], "league": league})
            self._json(200, response)
        except Exception as e:
            self._error(e)

    def _start_run(self):
        body = self._body()
        profile = self._profile(body)
        mode = body.get("mode")
        week = body.get("week") or week_key()
        day = body.get("date") or _today()
        with database() as conn:
            ensure_user(conn, profile)
            token, expires = issue_run_token(conn, profile["id"], mode, week, day)
        self._json(200, {"runToken": token, "expires": expires})

    def _events(self):
        body = self._body()
        profile = self._profile(body)
        events = body.get("events")
        if not isinstance(events, list):
            raise ApiError(400, "events must be a list")
        with database() as conn:
            count = store_events(conn, profile["id"], events)
        self._json(200, {"accepted": count})

    def _delete(self):
        body = self._body()
        provider = body.get("provider")
        if provider == "facebook":
            profile = verify_facebook(body.get("accessToken", ""))
        elif provider == "guest" and ALLOW_GUEST:
            name = str(body.get("name") or "")
            profile = {"id": "guest:" + str(fnv1a(name)), "name": name}
        else:
            raise ApiError(401, "provider must be facebook")
        with database() as conn:
            delete_user(conn, profile["id"])
        self._json(200, {"deleted": True})


def run(port=PORT):
    init_db()
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Orbit Runner scores listening on :{port}")
    print(f"sqlite: {DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    run()
