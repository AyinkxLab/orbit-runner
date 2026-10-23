"""
ORBIT RUNNER  -  a one-button-ish arcade dodger with a rewarded-ad continue.

You orbit a dying star on three rings while meteors rain inward.
  UP / W      jump to the outer ring
  DOWN / S    drop to the inner ring
  SPACE       reverse orbit direction
  P           pause / resume
  M           mute / unmute
  V           cycle ship (title screen)
  1 / 2 / 3   choose contract (title screen)
  D           start the daily challenge (title screen)
  ESC         quit

Systems
  * Crystals build a combo (x1..x8). Near-misses and dodges also build it.
  * Power-ups: S shield, M magnet, T time warp.
  * Solar flares burn one ring; be elsewhere when they fire.
  * Corona Surge every 5 levels: collect 3 cores before the timer expires.
  * 3 daily missions, lifetime-crystal ship unlocks, run contracts, daily seed,
    best-run ghost, continue tokens and a first-run free continue.

When you die:
  [C] Continue (token / first free / rewarded ad)
  [D] Watch an ad -> DOUBLE the crystals you collected this run
  [R] Restart / [T] Title

Run:  pip install pygame && python orbit_runner.py
Self-test:  python orbit_runner.py --selftest
Screenshots next to this file:  python orbit_runner.py --selftest --shots
"""
import datetime
import json
import math
import os
import random
import sys
import tempfile
from array import array

import pygame

W, H = 900, 700
CX, CY = W // 2, H // 2 + 20
RINGS = [110, 180, 250]
RING_NAMES = ("INNER", "MID", "OUTER")
FONT_STACK = "consolas,menlo,dejavusansmono,liberationmono,couriernew,monospace"


def _save_path():
    """User-writable save location, portable across Windows/macOS/Linux.

    In development the save stays next to the script. A PyInstaller build uses
    the platform's user-data directory so the save survives app updates and
    works when the install directory is read-only.
    """
    if not getattr(sys, "frozen", False):
        return os.path.join(os.path.dirname(os.path.abspath(__file__)), "orbit_save.json")
    if sys.platform == "win32":
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
    elif sys.platform == "darwin":
        base = os.path.join(os.path.expanduser("~"), "Library", "Application Support")
    else:
        base = os.environ.get("XDG_DATA_HOME") or os.path.join(os.path.expanduser("~"), ".local", "share")
    folder = os.path.join(base, "OrbitRunner")
    try:
        os.makedirs(folder, exist_ok=True)
    except OSError:
        folder = os.path.expanduser("~")
    return os.path.join(folder, "orbit_save.json")


SAVE_FILE = _save_path()
SHIELD_COST = 25
COMBO_TIME = 6.0
MAGNET_TIME = 8.0
SLOW_TIME = 6.0
MAX_COMBO = 8
MAX_ADS = 4
MAX_TOKENS = 3
POWERUP_TIME = 10.0
LEVEL_NAMES = ("DUST", "EMBER", "FLARE", "CORONA", "NOVA", "PULSAR", "QUASAR", "VOID")
POWERUP_COLORS = {"shield": (120, 200, 255), "magnet": (255, 120, 220), "slow": (180, 140, 255)}
POWERUP_LABELS = {"shield": "S", "magnet": "M", "slow": "T"}
BIOMES = [
    {"id": "nebula", "name": "NEBULA", "star": [(80, 30, 10), (180, 80, 20), (255, 180, 60)],
     "ring": (122, 122, 208), "ring_dim": (60, 60, 110), "meteor_speed": 1.0, "gem_rate": 1.0,
     "score_mul": 1.0, "flare_rate": 1.0},
    {"id": "pulsar", "name": "PULSAR", "star": [(10, 42, 80), (20, 106, 180), (60, 200, 255)],
     "ring": (60, 158, 220), "ring_dim": (36, 74, 106), "meteor_speed": 1.12, "gem_rate": 0.9,
     "score_mul": 1.10, "flare_rate": 1.15},
    {"id": "ember", "name": "RED GIANT", "star": [(80, 16, 10), (180, 52, 20), (255, 122, 60)],
     "ring": (180, 80, 60), "ring_dim": (90, 42, 36), "meteor_speed": 0.94, "gem_rate": 1.20,
     "score_mul": 1.0, "flare_rate": 0.95},
    {"id": "void", "name": "VOID", "star": [(20, 10, 40), (58, 26, 104), (154, 106, 255)],
     "ring": (122, 90, 200), "ring_dim": (58, 42, 90), "meteor_speed": 1.06, "gem_rate": 1.0,
     "score_mul": 1.15, "flare_rate": 1.05},
    {"id": "ice", "name": "ICE FIELD", "star": [(10, 42, 56), (20, 112, 138), (106, 232, 255)],
     "ring": (74, 168, 200), "ring_dim": (36, 80, 90), "meteor_speed": 0.88, "gem_rate": 1.10,
     "score_mul": 1.0, "flare_rate": 1.0},
]
METEOR_TYPES = [
    {"id": "normal", "weight": 66, "size": 1.0, "speed": 1.0, "near": 1, "color": (140, 110, 100), "shade": (90, 70, 60)},
    {"id": "iron", "weight": 8, "size": 1.35, "speed": 0.90, "near": 2, "color": (138, 122, 106), "shade": (74, 62, 52)},
    {"id": "ice", "weight": 8, "size": 0.95, "speed": 0.65, "near": 1, "color": (106, 154, 176), "shade": (58, 90, 106)},
    {"id": "gold", "weight": 7, "size": 0.80, "speed": 1.05, "near": 1, "color": (200, 160, 74), "shade": (122, 90, 32)},
    {"id": "volatile", "weight": 6, "size": 1.05, "speed": 0.95, "near": 1, "color": (160, 90, 60), "shade": (96, 42, 26)},
    {"id": "splitter", "weight": 5, "size": 1.10, "speed": 0.90, "near": 1, "color": (122, 138, 106), "shade": (74, 90, 58)},
]
SHIP_LIVERIES = {
    "scout": {"hull": (232, 238, 248), "wing": (159, 179, 204), "trim": (120, 216, 255), "accent": (255, 106, 106)},
    "warden": {"hull": (220, 232, 255), "wing": (127, 168, 222), "trim": (92, 156, 255), "accent": (255, 212, 90)},
    "drifter": {"hull": (240, 230, 255), "wing": (180, 140, 255), "trim": (224, 184, 255), "accent": (120, 255, 140)},
    "gambler": {"hull": (255, 233, 200), "wing": (217, 162, 74), "trim": (255, 180, 60), "accent": (255, 90, 90)},
}

SHIPS = [
    {"id": "scout", "name": "SCOUT", "desc": "Balanced", "unlock": 0, "ring_speed": 1.0,
     "combo_time": 1.0, "magnet_bonus": 0, "crystal_mul": 1, "score_mul": 1.0, "start_shield": False},
    {"id": "warden", "name": "WARDEN", "desc": "Starts with a shield - longer combo", "unlock": 250,
     "ring_speed": 1.0, "combo_time": 1.35, "magnet_bonus": 0, "crystal_mul": 1, "score_mul": 0.95,
     "start_shield": True},
    {"id": "drifter", "name": "DRIFTER", "desc": "Wider magnet - faster ring shifts", "unlock": 700,
     "ring_speed": 1.18, "combo_time": 1.0, "magnet_bonus": 50, "crystal_mul": 1, "score_mul": 1.0,
     "start_shield": False},
    {"id": "gambler", "name": "GAMBLER", "desc": "Crystals worth 2x - no shield", "unlock": 1500,
     "ring_speed": 1.0, "combo_time": 1.0, "magnet_bonus": 0, "crystal_mul": 2, "score_mul": 0.9,
     "start_shield": False},
]

CONTRACTS = [
    {"id": "standard", "name": "STANDARD", "desc": "Classic orbit", "score_mul": 1.0,
     "crystal_mul": 1, "meteor_mul": 1.0, "flare_rate": 0},
    {"id": "blaze", "name": "BLAZE", "desc": "Flares every ~9s - +40% score", "score_mul": 1.4,
     "crystal_mul": 1, "meteor_mul": 1.0, "flare_rate": 9},
    {"id": "void", "name": "VOID", "desc": "Meteors +25% faster - 2x crystals", "score_mul": 1.0,
     "crystal_mul": 2, "meteor_mul": 1.25, "flare_rate": 0},
]

MISSION_POOL = [
    {"id": "run_crystals", "text": "Crystals in one run", "metric": "run_crystals", "target": 15, "reward": 30},
    {"id": "run_near", "text": "Near-misses in one run", "metric": "run_near", "target": 8, "reward": 35},
    {"id": "run_flares", "text": "Flares dodged in one run", "metric": "run_flares", "target": 2, "reward": 40},
    {"id": "run_level", "text": "Reach level", "metric": "run_level", "target": 4, "reward": 40},
    {"id": "run_combo", "text": "Max combo", "metric": "run_maxcombo", "target": 6, "reward": 35},
    {"id": "run_score", "text": "Score in one run", "metric": "run_score", "target": 1500, "reward": 45},
    {"id": "total_crystals", "text": "Crystals collected", "metric": "total_crystals", "target": 40, "reward": 25},
    {"id": "total_runs", "text": "Runs completed", "metric": "total_runs", "target": 5, "reward": 25},
    {"id": "total_flares", "text": "Flares dodged", "metric": "total_flares", "target": 5, "reward": 50},
    {"id": "total_near", "text": "Near-misses", "metric": "total_near", "target": 25, "reward": 40},
    {"id": "total_bosses", "text": "Corona Surges cleared", "metric": "total_bosses", "target": 2, "reward": 60},
    {"id": "total_powerups", "text": "Power-ups collected", "metric": "total_powerups", "target": 6, "reward": 35},
]


# ---------------------------------------------------------------- helpers ---


def fresh_save():
    return {
        "best": 0, "bank": 0, "muted": False, "lifetime": 0,
        "ships": ["scout"], "ship": "scout", "contract": "standard",
        "missions": [], "mission_day": "", "missions_done": 0,
        "continue_tokens": 0, "free_continue_used": False,
        "daily": {"date": "", "best": 0}, "ghost": None,
        "stats": {"runs": 0, "flares": 0, "near": 0, "bosses": 0, "powerups": 0},
    }


def date_key():
    return datetime.date.today().isoformat()


def _num(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return 0
    if not math.isfinite(value):
        return 0
    return max(0, int(value))


def load_save():
    try:
        with open(SAVE_FILE) as f:
            raw = json.load(f)
    except Exception:
        raw = {}
    if not isinstance(raw, dict):
        raw = {}
    out = fresh_save()

    out["best"] = _num(raw.get("best"))
    out["bank"] = _num(raw.get("bank"))
    out["muted"] = raw.get("muted") is True
    out["lifetime"] = _num(raw.get("lifetime"))
    # migrate pre-v3 saves: approximate lifetime crystals from the old score/bank
    if "lifetime" not in raw:
        out["lifetime"] = max(out["bank"], out["best"] // 10)

    ships = raw.get("ships")
    if isinstance(ships, list):
        valid = {s["id"] for s in SHIPS}
        out["ships"] = [sid for sid in ships if sid in valid]
        if "scout" not in out["ships"]:
            out["ships"].insert(0, "scout")
    if any(s["id"] == raw.get("ship") for s in SHIPS):
        out["ship"] = raw.get("ship")
    if out["ship"] not in out["ships"]:
        out["ship"] = "scout"
    if any(c["id"] == raw.get("contract") for c in CONTRACTS):
        out["contract"] = raw.get("contract")

    out["missions_done"] = _num(raw.get("missions_done"))
    out["continue_tokens"] = min(MAX_TOKENS, _num(raw.get("continue_tokens")))
    out["free_continue_used"] = raw.get("free_continue_used") is True
    daily = raw.get("daily")
    if isinstance(daily, dict):
        out["daily"]["date"] = daily.get("date") if isinstance(daily.get("date"), str) else ""
        out["daily"]["best"] = _num(daily.get("best"))
    ghost = raw.get("ghost")
    if isinstance(ghost, dict) and isinstance(ghost.get("samples"), list):
        samples = []
        for s in ghost["samples"][:2000]:
            if isinstance(s, (list, tuple)) and len(s) >= 3 and all(isinstance(v, (int, float)) for v in s[:3]):
                samples.append([float(s[0]), float(s[1]), float(s[2])])
        if samples:
            out["ghost"] = {"score": _num(ghost.get("score")), "samples": samples}
    stats = raw.get("stats")
    if isinstance(stats, dict):
        for key in out["stats"]:
            out["stats"][key] = _num(stats.get(key))
    if isinstance(raw.get("mission_day"), str):
        out["mission_day"] = raw.get("mission_day")
    missions = raw.get("missions")
    if isinstance(missions, list):
        by_id = {m["id"]: m for m in MISSION_POOL}
        for m in missions[:3]:
            if not isinstance(m, dict) or m.get("id") not in by_id:
                continue
            template = dict(by_id[m.get("id")])
            template["progress"] = _num(m.get("progress"))
            template["completed"] = m.get("completed") is True
            out["missions"].append(template)
    return out


def write_save(data):
    tmp = SAVE_FILE + ".tmp"
    try:
        with open(tmp, "w") as f:
            json.dump(data, f)
        os.replace(tmp, SAVE_FILE)
    except OSError:
        try:
            os.remove(tmp)
        except OSError:
            pass


def make_tone(freq, ms, vol=0.3, slide=0.0):
    try:
        rate = 22050
        n = int(rate * ms / 1000)
        buf = array("h")
        phase = 0.0
        for i in range(n):
            f = freq + slide * i / n
            phase += f / rate
            env = 1 - i / n
            buf.append(int(32767 * vol * env * (1 if (phase % 1) < 0.5 else -1)))
        return pygame.mixer.Sound(buffer=buf.tobytes())
    except Exception:
        return None


def make_noise(ms, vol=0.15):
    try:
        rate = 22050
        n = int(rate * ms / 1000)
        buf = array("h")
        for i in range(n):
            env = 1 - i / n
            buf.append(int(32767 * vol * env * (random.random() * 2 - 1)))
        return pygame.mixer.Sound(buffer=buf.tobytes())
    except Exception:
        return None


class Sfx:
    def __init__(self):
        self.ok = False
        self.muted = False
        try:
            pygame.mixer.init(22050, -16, 1, 512)
            self.ok = True
        except Exception:
            return
        self.sounds = {
            "gem": make_tone(880, 80, 0.2, 400),
            "gem2": make_tone(1040, 80, 0.2, 420),
            "gem3": make_tone(1240, 90, 0.2, 460),
            "jump": make_tone(300, 60, 0.15, 200),
            "near": make_tone(1200, 50, 0.12),
            "die": make_tone(200, 500, 0.35, -170),
            "reward": make_tone(523, 300, 0.25, 520),
            "shield": make_tone(400, 200, 0.25, -200),
            "power": make_tone(660, 180, 0.25, 260),
            "flare": make_tone(110, 420, 0.3, -50),
            "warn": make_tone(520, 130, 0.16, -90),
            "level": make_tone(700, 220, 0.2, 320),
            "pause": make_tone(400, 80, 0.12),
            "boss": make_tone(70, 620, 0.3, -20),
            "beat": make_tone(90, 120, 0.06),
            "beat2": make_tone(120, 110, 0.07),
            "arp": make_tone(392, 160, 0.10, 100),
            "pad": make_tone(196, 700, 0.07, 80),
            "die_noise": make_noise(360, 0.18),
            "flare_noise": make_noise(500, 0.20),
            "shield_noise": make_noise(160, 0.10),
            "boss_noise": make_noise(700, 0.16),
        }

    def play(self, name):
        if self.ok and not self.muted and self.sounds.get(name):
            self.sounds[name].play()


# ------------------------------------------------------------- ad system ---


class AdProvider:
    def is_ready(self):
        raise NotImplementedError

    def show_rewarded(self, on_reward, on_closed):
        raise NotImplementedError

    def update(self, dt):
        pass

    def handle_event(self, ev):
        pass

    def draw(self, surf, fonts):
        pass

    @property
    def showing(self):
        return False


class MockAdProvider(AdProvider):
    DURATION = 5.0
    BRANDS = [
        ("GALAXY GRUB", "Snacks so good they're out of this world.", (255, 170, 60)),
        ("NEBULA NAPS", "Mattresses tested in zero gravity.", (140, 120, 255)),
        ("COMET COLA", "Fizz at the speed of light.", (255, 80, 110)),
        ("STARLIGHT VPN", "Browse privately across 9 galaxies.", (60, 220, 180)),
        ("MOON BOOTS", "Grip that defies gravity.", (255, 212, 90)),
        ("ASTEROID INSURANCE", "Because space is full of surprises.", (120, 200, 255)),
    ]

    def __init__(self):
        self._active = False
        self.t = 0.0
        self.brand = self.BRANDS[0]
        self.on_reward = self.on_closed = None

    @property
    def showing(self):
        return self._active

    def is_ready(self):
        return not self._active

    def show_rewarded(self, on_reward, on_closed):
        self._active = True
        self.t = 0.0
        self.brand = random.choice(self.BRANDS)
        self.on_reward, self.on_closed = on_reward, on_closed

    def _finish(self, rewarded):
        self._active = False
        if rewarded and self.on_reward:
            self.on_reward()
        if self.on_closed:
            self.on_closed()

    def update(self, dt):
        if self._active:
            self.t += dt
            if self.t >= self.DURATION + 0.6:
                self._finish(True)

    def handle_event(self, ev):
        if self._active and ev.type == pygame.KEYDOWN and ev.key == pygame.K_x:
            self._finish(self.t >= self.DURATION)

    def draw(self, surf, fonts):
        if not self._active:
            return
        name, slogan, col = self.brand
        surf.fill((12, 10, 20))
        pulse = 1 + 0.08 * math.sin(self.t * 6)
        r = int(90 * pulse)
        pygame.draw.circle(surf, col, (W // 2, 270), r)
        pygame.draw.circle(surf, (255, 255, 255), (W // 2, 270), r, 4)
        for i in range(8):
            a = self.t * 2 + i * math.tau / 8
            pygame.draw.circle(surf, col, (int(W / 2 + math.cos(a) * 150), int(270 + math.sin(a) * 150)), 6)
        blit_c(surf, fonts["big"], name, (255, 255, 255), 430)
        blit_c(surf, fonts["mid"], slogan, (200, 200, 220), 480)
        blit_c(surf, fonts["small"], "AD  -  simulated rewarded video", (120, 120, 140), 30)
        left = max(0.0, self.DURATION - self.t)
        pygame.draw.rect(surf, (50, 50, 70), (150, 560, W - 300, 14), border_radius=7)
        pygame.draw.rect(surf, col, (150, 560, int((W - 300) * min(1, self.t / self.DURATION)), 14), border_radius=7)
        if left > 0:
            blit_c(surf, fonts["mid"], f"Reward in {math.ceil(left)}...", (255, 255, 255), 600)
            blit_c(surf, fonts["small"], "[X] close now (no reward)", (130, 130, 150), 640)
        else:
            blit_c(surf, fonts["mid"], "Reward earned!  [X] close", (120, 255, 140), 600)


# ----------------------------------------------------------------- render ---


def blit_c(surf, font, text, col, y):
    img = font.render(text, True, col)
    surf.blit(img, (W // 2 - img.get_width() // 2, y))


def blit_l(surf, font, text, col, x, y):
    surf.blit(font.render(text, True, col), (x, y))


def blit_r(surf, font, text, col, x, y):
    img = font.render(text, True, col)
    surf.blit(img, (x - img.get_width(), y))


def draw_panel(surf, x, y, w, h, fill=(8, 12, 24), alpha=205,
               stroke=(120, 200, 255, 70), radius=16):
    panel = pygame.Surface((w, h), pygame.SRCALPHA)
    pygame.draw.rect(panel, (*fill, alpha), panel.get_rect(), border_radius=radius)
    pygame.draw.rect(panel, stroke, panel.get_rect(), 2, border_radius=radius)
    pygame.draw.line(panel, (255, 255, 255, 55), (radius, 1), (w - radius, 1), 1)
    surf.blit(panel, (x, y))


def draw_gem_icon(surf, x, y, r, col=(120, 230, 255)):
    pts = [(x, y - r), (x + r * 0.7, y), (x, y + r), (x - r * 0.7, y)]
    pygame.draw.polygon(surf, col, pts)
    pygame.draw.lines(surf, (235, 255, 255), True, pts, 1)


def tier_for(score):
    if score >= 20000:
        return "DIAMOND", (159, 232, 255)
    if score >= 10000:
        return "PLATINUM", (184, 255, 237)
    if score >= 6000:
        return "GOLD", (255, 212, 90)
    if score >= 3000:
        return "SILVER", (200, 208, 224)
    if score >= 1000:
        return "BRONZE", (216, 153, 106)
    return "ROOKIE", (130, 130, 150)


def grade_for(score, level, max_combo):
    power = score + level * 250 + max_combo * 300
    if power >= 25000:
        return "S", (255, 212, 90), "LEGENDARY"
    if power >= 14000:
        return "A", (255, 154, 90), "ACE"
    if power >= 7000:
        return "B", (120, 230, 255), "SOLID"
    if power >= 3000:
        return "C", (180, 140, 255), "PROMISING"
    if power >= 1000:
        return "D", (150, 150, 170), "ROOKIE"
    return "E", (130, 130, 150), "TRY AGAIN"


def initials(name):
    parts = [p for p in str(name or "?").split() if p]
    return ((parts[0][0] if parts else "?") + (parts[-1][0] if len(parts) > 1 else "")).upper()


def name_color(name):
    palette = [(120, 200, 255), (255, 120, 220), (180, 140, 255),
               (255, 212, 90), (120, 255, 140), (255, 138, 74)]
    h = 0
    for ch in str(name or "?"):
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return palette[h % len(palette)]


def _reset_countdown(weekly=True):
    now = datetime.datetime.now(datetime.timezone.utc)
    if weekly:
        days = 8 - (now.isoweekday())
        target = now + datetime.timedelta(days=days)
    else:
        target = (now + datetime.timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    seconds = max(0, (target - now).total_seconds())
    days = int(seconds // 86400)
    hours = int(seconds % 86400 // 3600)
    minutes = int(seconds % 3600 // 60)
    return f"{days}d {hours}h" if weekly else f"{hours}h {minutes}m"


def _dim_livery(livery, factor=0.28):
    return {key: tuple(int(c * factor) for c in value) for key, value in livery.items()}


def _rot_point(x, y, angle, cx, cy):
    ca, sa = math.cos(angle), math.sin(angle)
    return cx + x * ca - y * sa, cy + x * sa + y * ca


def draw_aircraft(surf, x, y, angle, livery, t, thrust=0.0):
    """Top-down aircraft silhouette in local +x-forward coordinates."""
    L = livery or SHIP_LIVERIES["scout"]

    def p(px, py):
        return _rot_point(px, py, angle, x, y)

    flick = 13 + 5 * math.sin(t * 42) + min(8, thrust * 2)
    pygame.draw.polygon(surf, (24, 46, 62),
                        [p(-13, -5), p(-13 - flick - 6, 0), p(-13, 5)])
    pygame.draw.polygon(surf, L["trim"],
                        [p(-13, -3), p(-13 - flick, 0), p(-13, 3)])
    # tail fin
    pygame.draw.polygon(surf, L["wing"], [p(-7, 0), p(-18, 0), p(-12, 4)])
    # swept main wings
    pygame.draw.polygon(surf, L["wing"], [p(5, 0), p(-4, -15), p(-10, -15), p(-7, -2)])
    pygame.draw.polygon(surf, L["wing"], [p(5, 0), p(-4, 15), p(-10, 15), p(-7, 2)])
    # tailplanes
    pygame.draw.polygon(surf, L["hull"], [p(-8, -1), p(-14, -8), p(-18, -8), p(-15, -1)])
    pygame.draw.polygon(surf, L["hull"], [p(-8, 1), p(-14, 8), p(-18, 8), p(-15, 1)])
    # fuselage
    fuselage = [p(18, 0), p(8, -4), p(-10, -5), p(-14, -3),
                p(-14, 3), p(-10, 5), p(8, 4)]
    pygame.draw.polygon(surf, L["hull"], fuselage)
    pygame.draw.lines(surf, (8, 12, 20), True, fuselage, 2)
    # canopy
    canopy = [p(6 + 5.5 * math.cos(a), 3 * math.sin(a))
              for a in [i / 12 * math.tau for i in range(12)]]
    pygame.draw.polygon(surf, L["trim"], canopy)
    pygame.draw.lines(surf, (235, 250, 255), True, canopy, 1)
    # engine nozzles and wingtip lights
    pygame.draw.circle(surf, (42, 54, 72), (int(p(-14, -3)[0]), int(p(-14, -3)[1])), 2)
    pygame.draw.circle(surf, (42, 54, 72), (int(p(-14, 3)[0]), int(p(-14, 3)[1])), 2)
    pygame.draw.circle(surf, L["accent"], (int(p(-3.5, -15)[0]), int(p(-3.5, -15)[1])), 2)
    pygame.draw.circle(surf, (120, 255, 140), (int(p(-3.5, 15)[0]), int(p(-3.5, 15)[1])), 2)


def segment_dist(px, py, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    length2 = dx * dx + dy * dy
    t = ((px - x1) * dx + (py - y1) * dy) / length2 if length2 else 0.0
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


class Particle:
    def __init__(self, x, y, col, speed=200, life=0.7):
        a = random.uniform(0, math.tau)
        s = random.uniform(0.2, 1) * speed
        self.x, self.y, self.vx, self.vy = x, y, math.cos(a) * s, math.sin(a) * s
        self.col, self.life, self.max = col, life, life

    def update(self, dt):
        self.x += self.vx * dt
        self.y += self.vy * dt
        self.vx *= 0.96
        self.vy *= 0.96
        self.life -= dt
        return self.life > 0

    def draw(self, surf):
        r = max(1, int(3 * self.life / self.max))
        pygame.draw.circle(surf, self.col, (int(self.x), int(self.y)), r)


class FloatText:
    def __init__(self, x, y, text, col):
        self.x, self.y, self.text, self.col, self.life = x, y, text, col, 1.1

    def update(self, dt):
        self.y -= 40 * dt
        self.life -= dt
        return self.life > 0


class Meteor:
    def __init__(self, angle, speed, size, spin, kind="normal", r=470.0):
        mtype = next((t for t in METEOR_TYPES if t["id"] == kind), METEOR_TYPES[0])
        self.kind = mtype["id"]
        self.angle = angle
        self.r = r
        self.speed = speed * mtype["speed"]
        self.size = size * mtype["size"]
        self.spin = spin
        self.near_mult = mtype["near"]
        self.near_done = False
        self.entry = 0.45
        self.rot = random.uniform(0, math.tau)
        self.shape = [random.uniform(0.72, 1.14) for _ in range(7)]
        self.trail_t = random.uniform(0, 0.08)
        self.split = False
        self.dead = False

    @property
    def pos(self):
        return CX + math.cos(self.angle) * self.r, CY + math.sin(self.angle) * self.r


class Gem:
    def __init__(self, ring, angle):
        self.ring, self.angle, self.life = ring, angle, 6.0

    @property
    def pos(self):
        return CX + math.cos(self.angle) * RINGS[self.ring], CY + math.sin(self.angle) * RINGS[self.ring]


class Powerup:
    def __init__(self, kind, ring, angle):
        self.kind, self.ring, self.angle = kind, ring, angle
        self.life = POWERUP_TIME

    @property
    def pos(self):
        return CX + math.cos(self.angle) * RINGS[self.ring], CY + math.sin(self.angle) * RINGS[self.ring]


# ------------------------------------------------------------------- game ---


class Game:
    TITLE, PLAY, OVER = "title", "play", "over"

    def __init__(self, screen, ads: AdProvider):
        self.screen = screen
        self.ads = ads
        self.sfx = Sfx()
        self.fonts = {
            "big": pygame.font.SysFont(FONT_STACK, 48, bold=True),
            "hud": pygame.font.SysFont(FONT_STACK, 34, bold=True),
            "mid": pygame.font.SysFont(FONT_STACK, 26, bold=True),
            "small": pygame.font.SysFont(FONT_STACK, 18),
        }
        self.save = load_save()
        self.sfx.muted = bool(self.save.get("muted", False))
        self.stars = [(random.randrange(W), random.randrange(H), random.random(),
                       0.25 + random.random() * 0.75) for _ in range(140)]
        self.state = self.TITLE
        self.buy_shield = False
        self.message = ""
        self.time = 0.0
        self.paused = False
        self.mode = "classic"
        self.contract = CONTRACTS[0]
        self.ship = SHIPS[0]
        self.biome = BIOMES[0]
        self.rng = random.Random()
        self.ghost = self.save.get("ghost")
        self.ads_used = 0
        self.new_daily_best = False
        self.daily_best_at_start = 0
        self.flash_surf = pygame.Surface((W, H), pygame.SRCALPHA)
        self.veil = pygame.Surface((W, H), pygame.SRCALPHA)
        self.nebula = pygame.Surface((W, H))
        self.nebula.fill((0, 0, 0))
        for x, y, r, col in [
            (int(W * 0.22), int(H * 0.18), 300, (18, 8, 32)),
            (int(W * 0.82), int(H * 0.32), 260, (6, 20, 32)),
            (int(W * 0.55), int(H * 0.88), 340, (24, 8, 18)),
        ]:
            for step in range(20, 0, -1):
                scale = step / 20
                shade = tuple(int(channel * (1 - scale) * 0.9 + channel * 0.1) for channel in col)
                pygame.draw.circle(self.nebula, shade, (x, y), int(r * scale))
        self.ensure_missions()
        self.refresh_unlocks()
        self.reset_run()

    # ---- run lifecycle ----------------------------------------------------
    def reset_run(self):
        self.ring = 1
        self.ring_vis = float(RINGS[1])
        self.angular_vel = 0.0
        self.radial_vel = 0.0
        self.angle = -math.pi / 2
        self.dir = 1
        self.meteors, self.gems, self.parts, self.floats = [], [], [], []
        self.score = 0.0
        self.crystals = 0
        self.banked_crystals = 0
        self.combo = 1
        self.combo_t = 0.0
        self.combo_time = COMBO_TIME
        self.max_combo = 1
        self.elapsed = 0.0
        self.run_time = 0.0
        self.spawn_t = 1.0
        self.gem_t = 1.5
        self.powerup_t = 10.0
        self.powerup = None
        self.magnet_t = 0.0
        self.slow_t = 0.0
        self.invuln = 1.0
        self.shield = False
        self.shake = 0.0
        self.continue_used = False
        self.double_used = False
        self.paused = False
        self.flare_t = 0.0
        self.flare_ring = -1
        self.flare_cd = 12.0
        self.near_misses = 0
        self.gems_collected = 0
        self.crystal_gain = 0
        self.powerups_taken = 0
        self.flares_dodged = 0
        self.bosses_cleared = 0
        self.boss = None
        self.hit_stop = 0.0
        self.flash = 0.0
        self.music_t = 0.7
        self.music_beat = 0
        self.trail_t = 0.0
        self.shocks = []
        self.shooting = []
        self.shooting_t = 2.5
        self.ship_trail = []
        self.ghost_samples = []
        self.last_ghost_sample = -1.0
        self.run_counted = False
        self.mission_reward = 0
        self.score_mul = 1.0
        self.crystal_mul = 1
        self.meteor_mul = 1.0
        self.magnet_bonus = 0
        self.gem_rate = 1.0
        self.new_best = False
        self.new_daily_best = False
        self.message = ""

    def go_title(self):
        self.reset_run()
        self.ghost = self.save.get("ghost")
        self.state = self.TITLE
        self.paused = False

    def start_run(self, mode="classic"):
        self.ensure_missions()
        self.rotate_completed_missions()
        self.refresh_unlocks()
        self.mode = mode
        today = date_key()
        if mode == "daily":
            self.seed = int(today.replace("-", ""))
            drng = random.Random(self.seed)
            self.contract = drng.choice(CONTRACTS)
            self.ship = next((s for s in SHIPS if s["id"] == self.save["ship"]), SHIPS[0])
            self.daily_best_at_start = self.save["daily"]["best"] if self.save["daily"]["date"] == today else 0
        else:
            self.seed = random.randrange(1 << 32)
            self.contract = next((c for c in CONTRACTS if c["id"] == self.save["contract"]), CONTRACTS[0])
            self.ship = next((s for s in SHIPS if s["id"] == self.save["ship"]), SHIPS[0])
            self.daily_best_at_start = 0
        self.biome = BIOMES[self.seed % len(BIOMES)] if mode == "daily" else random.choice(BIOMES)
        self.rng = random.Random(self.seed)
        self.reset_run()
        self.apply_loadout()
        if self.buy_shield and self.save["bank"] >= SHIELD_COST:
            self.save["bank"] -= SHIELD_COST
            self.shield = True
            write_save(self.save)
        self.buy_shield = False
        self.ghost = self.save.get("ghost") if mode == "classic" else None
        self.state = self.PLAY
        self.message = ""

    def apply_loadout(self):
        self.score_mul = self.contract["score_mul"] * self.ship["score_mul"] * self.biome["score_mul"]
        self.crystal_mul = self.contract["crystal_mul"] * self.ship["crystal_mul"]
        self.meteor_mul = self.contract["meteor_mul"] * self.biome["meteor_speed"]
        self.gem_rate = self.biome["gem_rate"]
        self.combo_time = COMBO_TIME * self.ship["combo_time"]
        self.magnet_bonus = self.ship["magnet_bonus"]
        if self.ship["start_shield"]:
            self.shield = True
        self.flare_cd = (self.contract["flare_rate"] or 12) * self.biome["flare_rate"]
        self.angular_vel = self.dir * (1.6 + 0.08) * self.ship["ring_speed"]

    @property
    def level(self):
        return 1 + int(self.elapsed // 15)

    @property
    def eff_level(self):
        return min(self.level, 14)

    @property
    def level_name(self):
        return LEVEL_NAMES[(self.level - 1) % len(LEVEL_NAMES)]

    @property
    def next_ship(self):
        return next((s for s in SHIPS if s["id"] not in self.save["ships"]), None)

    def player_pos(self):
        return CX + math.cos(self.angle) * self.ring_vis, CY + math.sin(self.angle) * self.ring_vis

    def add_float(self, x, y, text, col):
        self.floats.append(FloatText(x, y, text, col))

    def pick_meteor_type(self):
        total = sum(t["weight"] for t in METEOR_TYPES)
        roll = self.rng.random() * total
        for mtype in METEOR_TYPES:
            roll -= mtype["weight"]
            if roll <= 0:
                return mtype
        return METEOR_TYPES[0]

    def explode_meteor(self, m):
        mx, my = m.pos
        m.dead = True
        self.add_shock(mx, my, (255, 138, 60), 150, 0.55)
        self.flash = max(self.flash, 0.22)
        self.score += int(40 * self.level * self.score_mul)
        for _ in range(28):
            self.parts.append(Particle(mx, my, random.choice([(255, 212, 90), (255, 138, 60), (255, 90, 60)]), 300, 0.8))
        self.sfx.play("flare_noise")
        for other in self.meteors:
            if other is m or other.dead:
                continue
            ox, oy = other.pos
            if math.hypot(ox - mx, oy - my) < 95:
                other.dead = True
                for _ in range(10):
                    self.parts.append(Particle(ox, oy, (255, 160, 60), 180, 0.5))

    def add_shock(self, x, y, col, max_r=90, life=0.45):
        self.shocks.append({"x": x, "y": y, "col": col, "r": 8.0,
                            "max_r": max_r, "life": life, "max": life})

    def bump_combo(self, amount=1):
        before = self.combo
        self.combo = min(MAX_COMBO, self.combo + amount)
        self.combo_t = self.combo_time
        self.max_combo = max(self.max_combo, self.combo)
        if before < 4 <= self.combo:
            self.add_float(CX, CY - 60, "x4  HOT STREAK", (255, 180, 60))
            self.add_shock(CX, CY, (255, 180, 60), 120, 0.4)
        if before < MAX_COMBO <= self.combo:
            self.add_float(CX, CY - 30, "OVERDRIVE", (255, 230, 120))
            self.add_shock(CX, CY, (255, 230, 120), 170, 0.55)
            self.sfx.play("reward")

    # ---- meta progression -------------------------------------------------
    def ensure_missions(self):
        today = date_key()
        if self.save["mission_day"] == today and len(self.save["missions"]) == 3:
            return
        pool = [dict(m) for m in MISSION_POOL]
        rng = random.Random(int(today.replace("-", "")) + 7)
        rng.shuffle(pool)
        self.save["missions"] = []
        for template in pool[:3]:
            template["progress"] = 0
            template["completed"] = False
            self.save["missions"].append(template)
        self.save["mission_day"] = today
        write_save(self.save)

    def rotate_completed_missions(self):
        active = {m["id"] for m in self.save["missions"] if not m["completed"]}
        old_completed = {m["id"] for m in self.save["missions"] if m["completed"]}
        changed = False
        new_missions = []
        for m in self.save["missions"]:
            if not m["completed"]:
                new_missions.append(m)
                continue
            choices = [t for t in MISSION_POOL if t["id"] not in active and t["id"] not in old_completed]
            if not choices:
                choices = [t for t in MISSION_POOL if t["id"] not in active]
            if not choices:
                m = dict(m)
                m["progress"] = 0
                m["completed"] = False
                new_missions.append(m)
                continue
            template = dict(random.choice(choices))
            template["progress"] = 0
            template["completed"] = False
            active.add(template["id"])
            new_missions.append(template)
            changed = True
        self.save["missions"] = new_missions
        if changed:
            write_save(self.save)

    def mission_value(self, mission):
        metric = mission["metric"]
        values = {
            "run_crystals": self.crystal_gain,
            "run_near": self.near_misses,
            "run_flares": self.flares_dodged,
            "run_level": self.level,
            "run_maxcombo": self.max_combo,
            "run_score": int(self.score),
            "total_crystals": self.save["lifetime"],
            "total_runs": self.save["stats"]["runs"],
            "total_flares": self.save["stats"]["flares"],
            "total_near": self.save["stats"]["near"],
            "total_bosses": self.save["stats"]["bosses"],
            "total_powerups": self.save["stats"]["powerups"],
        }
        return values.get(metric, 0)

    def check_missions(self):
        reward = 0
        for mission in self.save["missions"]:
            if mission["completed"]:
                continue
            value = self.mission_value(mission)
            if value > mission["progress"]:
                mission["progress"] = value
            if mission["progress"] >= mission["target"]:
                mission["completed"] = True
                reward += mission["reward"]
                self.save["missions_done"] += 1
                if self.save["missions_done"] % 5 == 0:
                    self.save["continue_tokens"] = min(MAX_TOKENS, self.save["continue_tokens"] + 1)
        if reward > 0:
            self.save["bank"] += reward
            self.mission_reward = reward
            self.message = f"+{reward} mission crystals"

    def refresh_unlocks(self):
        changed = False
        for ship in SHIPS:
            if ship["id"] not in self.save["ships"] and self.save["lifetime"] >= ship["unlock"]:
                self.save["ships"].append(ship["id"])
                changed = True
        if self.save["ship"] not in self.save["ships"]:
            self.save["ship"] = "scout"
        if changed:
            write_save(self.save)

    def cycle_ship(self):
        if self.state != self.TITLE:
            return
        unlocked = [s for s in SHIPS if s["id"] in self.save["ships"]]
        if not unlocked:
            return
        index = next((i for i, s in enumerate(unlocked) if s["id"] == self.save["ship"]), 0)
        self.save["ship"] = unlocked[(index + 1) % len(unlocked)]["id"]
        write_save(self.save)
        self.sfx.play("pause")

    def select_contract(self, index):
        if not 0 <= index < len(CONTRACTS):
            return
        self.save["contract"] = CONTRACTS[index]["id"]
        write_save(self.save)
        self.sfx.play("pause")

    def continue_label(self):
        if self.save["continue_tokens"] > 0:
            return f"[C] Use continue token (x{self.save['continue_tokens']})"
        if not self.save["free_continue_used"]:
            return "[C] Free first continue"
        return "[C] Watch ad  ->  CONTINUE"

    # ---- banking / death --------------------------------------------------
    def bank_crystals(self):
        delta = self.crystals - self.banked_crystals
        if delta > 0:
            self.save["bank"] += delta
        self.banked_crystals = self.crystals
        self.save["bank"] = max(0, self.save["bank"])

    def die(self):
        x, y = self.player_pos()
        for _ in range(60):
            self.parts.append(Particle(x, y, random.choice([(255, 220, 90), (255, 120, 60), (255, 255, 255)]), 320, 1.2))
        self.floats.clear()
        self.sfx.play("die")
        self.sfx.play("die_noise")
        self.shake = 0.5
        self.bank_crystals()
        score = int(self.score)
        if not self.run_counted:
            self.save["stats"]["runs"] += 1
            self.run_counted = True
        today = date_key()
        if self.mode == "daily":
            prev = self.save["daily"]["best"] if self.save["daily"]["date"] == today else 0
            self.new_daily_best = score > prev
            self.save["daily"] = {"date": today, "best": max(prev, score)}
        else:
            self.new_daily_best = False
            if score > self.save["best"]:
                self.save["ghost"] = {"score": score, "samples": self.ghost_samples[:2000]}
        self.new_best = score > self.save["best"]
        self.save["best"] = max(self.save["best"], score)
        self.message = ""
        self.check_missions()
        self.refresh_unlocks()
        self.save["bank"] = max(0, self.save["bank"])
        write_save(self.save)
        self.state = self.OVER
        self.paused = False
        self.hit_stop = 0.0

    # ---- ads and rewards --------------------------------------------------
    def request_ad(self, kind):
        if kind == "continue" and self.continue_used:
            return
        if kind == "double" and (self.double_used or self.crystals <= 0):
            return
        if kind == "continue":
            if self.save["continue_tokens"] > 0:
                self.save["continue_tokens"] -= 1
                write_save(self.save)
                self.reward_continue()
                return
            if not self.save["free_continue_used"]:
                self.save["free_continue_used"] = True
                write_save(self.save)
                self.reward_continue()
                return
        if not self.ads.is_ready():
            self.message = "No ad available right now."
            return
        if self.ads_used >= MAX_ADS:
            self.message = "No ads left this session."
            return
        self.ads_used += 1
        if kind == "continue":
            self.ads.show_rewarded(self.reward_continue, self.ad_closed)
        elif kind == "double":
            self.ads.show_rewarded(self.reward_double, self.ad_closed)

    def reward_continue(self):
        self.continue_used = True
        self.meteors.clear()
        self.invuln = 3.0
        self.flare_t = 0.0
        self.flare_ring = -1
        self.flare_cd = self.contract["flare_rate"] or 8
        self.boss = None
        self.hit_stop = 0.0
        self.state = self.PLAY
        self.paused = False
        self.message = ""
        self.sfx.play("reward")
        self.add_float(CX, CY - 40, "SECOND CHANCE!", (120, 255, 140))

    def reward_double(self):
        self.double_used = True
        self.save["bank"] += self.crystals
        self.crystals *= 2
        self.banked_crystals = self.crystals
        self.save["bank"] = max(0, self.save["bank"])
        write_save(self.save)
        self.message = f"+{self.crystals // 2} bonus crystals banked!"
        self.sfx.play("reward")

    def ad_closed(self):
        if self.state == self.OVER and not self.message:
            self.message = "Ad closed early - no reward."

    def toggle_pause(self):
        if self.state != self.PLAY or self.ads.showing:
            return
        self.paused = not self.paused
        self.sfx.play("pause")

    def toggle_mute(self):
        self.sfx.muted = not self.sfx.muted
        self.save["muted"] = self.sfx.muted
        write_save(self.save)
        if not self.sfx.muted:
            self.sfx.play("pause")

    def toggle_shield(self):
        if self.save["bank"] >= SHIELD_COST:
            self.buy_shield = not self.buy_shield
            self.sfx.play("pause")

    # ---- pickups and hazards ---------------------------------------------
    def apply_powerup(self, kind):
        px, py = self.player_pos()
        self.powerups_taken += 1
        self.save["stats"]["powerups"] += 1
        if kind == "shield":
            if self.shield:
                pts = int(80 * self.combo * self.score_mul)
                self.score += pts
                self.add_float(px, py - 30, f"SHIELD +{pts}", (120, 200, 255))
            else:
                self.shield = True
                self.invuln = max(self.invuln, 0.6)
                self.add_float(px, py - 30, "SHIELD UP", (120, 200, 255))
        elif kind == "magnet":
            self.magnet_t = MAGNET_TIME
            self.add_float(px, py - 30, "MAGNET", (255, 120, 220))
        else:
            self.slow_t = SLOW_TIME
            self.add_float(px, py - 30, "TIME WARP", (180, 140, 255))
        self.sfx.play("power")

    def spawn_powerup(self):
        kind = self.rng.choice(("shield", "magnet", "slow"))
        self.powerup = Powerup(kind, self.rng.randrange(3), self.rng.uniform(0, math.tau))
        self.powerup_t = self.rng.uniform(16, 24)

    def fire_flare(self):
        ring = self.flare_ring
        px, py = self.player_pos()
        on_ring = abs(self.ring_vis - RINGS[ring]) < 34
        self.shake = 0.55
        for i in range(30):
            a = i / 30 * math.tau
            self.parts.append(Particle(
                CX + math.cos(a) * RINGS[ring], CY + math.sin(a) * RINGS[ring],
                random.choice([(255, 154, 60), (255, 212, 90)]), 40, 0.7))
        if on_ring and self.invuln <= 0:
            if self.shield:
                self.shield = False
                self.invuln = 1.2
                self.sfx.play("shield")
                self.sfx.play("shield_noise")
                self.hit_stop = max(self.hit_stop, 0.06)
                self.flash = max(self.flash, 0.25)
                for _ in range(30):
                    self.parts.append(Particle(px, py, (120, 200, 255), 250))
                self.add_float(px, py - 30, "SHIELD SAVED YOU", (120, 200, 255))
            else:
                self.sfx.play("flare")
                self.sfx.play("flare_noise")
                self.die()
                return True
        elif not on_ring:
            pts = int(75 * self.combo * self.score_mul)
            self.score += pts
            self.flares_dodged += 1
            self.save["stats"]["flares"] += 1
            self.bump_combo()
            self.add_float(px, py - 30, f"FLARE DODGED +{pts}", (255, 180, 60))
            self.add_shock(px, py, (255, 180, 60), 110, 0.45)
            self.sfx.play("flare")
            self.flash = max(self.flash, 0.3)
            self.hit_stop = max(self.hit_stop, 0.03)
        else:
            self.add_float(px, py - 30, "FLARE GRAZED", (255, 212, 90))
        for m in self.meteors:
            if abs(m.r - RINGS[ring]) < 70 and m.kind == "volatile":
                self.explode_meteor(m)
        self.meteors = [m for m in self.meteors if not m.dead and abs(m.r - RINGS[ring]) > 70]
        self.flare_t = 0.0
        self.flare_ring = -1
        self.flare_cd = self.rng.uniform(8, 11) if self.contract["flare_rate"] else self.rng.uniform(14, 20)
        return False

    # ---- Corona Surge -----------------------------------------------------
    def start_boss(self):
        if self.boss:
            return
        self.boss = {"timer": 14.0, "need": 3, "cores": 0, "core": None, "core_t": 1.5}
        self.flare_t = 0.0
        self.flare_ring = -1
        self.flash = max(self.flash, 0.35)
        self.hit_stop = max(self.hit_stop, 0.06)
        self.shake = max(self.shake, 0.35)
        self.add_float(CX, CY - 120, "CORONA SURGE!", (255, 90, 42))
        self.sfx.play("boss")
        self.sfx.play("boss_noise")

    def update_boss(self, dt):
        if not self.boss:
            return
        self.boss["timer"] -= dt
        self.boss["core_t"] -= dt
        if not self.boss["core"] and self.boss["core_t"] <= 0 and self.boss["timer"] > 3:
            self.boss["core"] = {
                "ring": self.rng.randrange(3),
                "angle": self.rng.uniform(0, math.tau),
                "life": 6.0,
            }
            self.boss["core_t"] = 3.5
        if self.boss["core"]:
            self.boss["core"]["life"] -= dt
            self.boss["core"]["angle"] += 0.75 * dt
            if self.boss["core"]["life"] <= 0:
                self.boss["core"] = None
                self.boss["core_t"] = 1.0
        if self.boss["cores"] >= self.boss["need"]:
            self.clear_boss()
        elif self.boss["timer"] <= 0:
            self.fail_boss()

    def clear_boss(self):
        if not self.boss:
            return
        bonus = int(1000 * self.level * self.score_mul)
        self.score += bonus
        self.crystals += 3
        self.crystal_gain += 3
        self.save["lifetime"] += 3
        self.save["stats"]["bosses"] += 1
        self.bosses_cleared += 1
        self.flash = max(self.flash, 0.4)
        self.hit_stop = max(self.hit_stop, 0.12)
        self.shake = max(self.shake, 0.5)
        self.add_float(CX, CY - 100, f"SURGE CLEARED +{bonus}", (255, 212, 90))
        self.boss = None
        self.sfx.play("boss")
        self.sfx.play("boss_noise")

    def fail_boss(self):
        if not self.boss:
            return
        self.add_float(CX, CY - 100, "SURGE FADED", (150, 150, 170))
        self.boss = None

    # ---- input ------------------------------------------------------------
    def handle(self, ev):
        if self.ads.showing:
            self.ads.handle_event(ev)
            return
        if ev.type != pygame.KEYDOWN:
            return
        k = ev.key
        if k == pygame.K_m:
            self.toggle_mute()
            return
        if self.state == self.PLAY and k == pygame.K_p:
            self.toggle_pause()
            return
        if self.paused:
            if k in (pygame.K_p, pygame.K_SPACE, pygame.K_RETURN):
                self.paused = False
            elif k == pygame.K_r:
                self.start_run(self.mode)
            elif k == pygame.K_t:
                self.go_title()
            return
        if self.state == self.TITLE:
            if k in (pygame.K_SPACE, pygame.K_RETURN):
                self.start_run("classic")
            elif k == pygame.K_b:
                self.toggle_shield()
            elif k == pygame.K_v:
                self.cycle_ship()
            elif k in (pygame.K_1, pygame.K_2, pygame.K_3):
                self.select_contract(k - pygame.K_1)
            elif k == pygame.K_d:
                self.start_run("daily")
        elif self.state == self.PLAY:
            if k in (pygame.K_UP, pygame.K_w) and self.ring < 2:
                self.ring += 1
                self.sfx.play("jump")
            elif k in (pygame.K_DOWN, pygame.K_s) and self.ring > 0:
                self.ring -= 1
                self.sfx.play("jump")
            elif k == pygame.K_SPACE:
                self.dir *= -1
                self.sfx.play("jump")
        elif self.state == self.OVER:
            if k == pygame.K_c:
                self.request_ad("continue")
            elif k == pygame.K_d:
                self.request_ad("double")
            elif k == pygame.K_r:
                self.start_run(self.mode)
            elif k == pygame.K_t:
                self.go_title()

    # ---- simulation -------------------------------------------------------
    def update(self, dt):
        self.time += dt
        self.ads.update(dt)
        self.flash = max(0.0, self.flash - dt)
        if self.paused:
            return
        if self.hit_stop > 0:
            self.hit_stop = max(0.0, self.hit_stop - dt)
            return
        self.shake = max(0, self.shake - dt)
        self.parts = [p for p in self.parts if p.update(dt)]
        self.floats = [f for f in self.floats if f.update(dt)]
        alive_shocks = []
        for shock in self.shocks:
            shock["life"] -= dt
            pct = 1 - max(0.0, shock["life"]) / shock["max"]
            shock["r"] = 8 + (shock["max_r"] - 8) * pct
            if shock["life"] > 0:
                alive_shocks.append(shock)
        self.shocks = alive_shocks
        self.shooting_t -= dt
        if self.shooting_t <= 0:
            self.shooting_t = random.uniform(2.5, 6.0)
            self.shooting.append({
                "x": random.uniform(0, W), "y": -20,
                "vx": random.uniform(-120, 120), "vy": random.uniform(320, 520),
                "life": random.uniform(0.8, 1.4), "max": 1.4,
            })
        next_shooting = []
        for star in self.shooting:
            star["x"] += star["vx"] * dt
            star["y"] += star["vy"] * dt
            star["life"] -= dt
            if star["life"] > 0 and star["y"] < H + 40:
                next_shooting.append(star)
        self.shooting = next_shooting
        if self.state != self.PLAY or self.ads.showing:
            return

        old_level = self.level
        self.elapsed += dt
        self.run_time += dt
        lvl = self.eff_level
        if self.level > old_level:
            self.add_float(CX, CY - 120, f"LEVEL {self.level} - {self.level_name}", (255, 212, 90))
            self.sfx.play("level")
            self.sfx.play("pad")
            if self.level % 5 == 0:
                self.start_boss()
        self.invuln = max(0.0, self.invuln - dt)
        self.score += dt * 10 * self.level * self.score_mul
        self.combo_t = max(0.0, self.combo_t - dt)
        self.magnet_t = max(0.0, self.magnet_t - dt)
        self.slow_t = max(0.0, self.slow_t - dt)

        # orbital mechanics and inertial ring changes
        radius_factor = (RINGS[1] / max(40.0, self.ring_vis)) ** 0.75
        target_omega = self.dir * (1.6 + 0.08 * lvl) * radius_factor * self.ship["ring_speed"]
        self.angular_vel += (target_omega - self.angular_vel) * min(1, dt * 7)
        self.angle += self.angular_vel * dt
        target_radius = RINGS[self.ring]
        radial_accel = (target_radius - self.ring_vis) * 180 - self.radial_vel * 30
        self.radial_vel += radial_accel * dt
        self.ring_vis += self.radial_vel * dt
        if abs(target_radius - self.ring_vis) < 0.5 and abs(self.radial_vel) < 1.5:
            self.ring_vis = float(target_radius)
            self.radial_vel = 0.0
        px, py = self.player_pos()

        if self.run_time - self.last_ghost_sample >= 0.12 and len(self.ghost_samples) < 2000:
            self.ghost_samples.append([self.run_time, self.angle, self.ring_vis])
            self.last_ghost_sample = self.run_time
        self.ship_trail.append((self.angle, self.ring_vis))
        if len(self.ship_trail) > 6:
            self.ship_trail.pop(0)
        self.trail_t -= dt
        if self.trail_t <= 0:
            self.trail_t = 0.035
            self.parts.append(Particle(px, py, (120, 200, 255), 0, 0.25))
        self.music_t -= dt
        if self.music_t <= 0:
            self.music_t = max(0.32, 0.7 - 0.03 * self.level)
            self.music_beat += 1
            self.sfx.play("beat2" if self.level >= 5 else "beat")
            if self.music_beat % 4 == 0:
                self.sfx.play("arp")

        if self.combo_t <= 0 and self.combo > 1:
            if self.combo >= 3:
                self.add_float(px, py - 50, "combo lost", (200, 100, 100))
            self.combo = 1

        if not self.boss:
            if self.flare_t > 0:
                self.flare_t -= dt
                if self.flare_t <= 0 and self.fire_flare():
                    return
            else:
                self.flare_cd -= dt
                if self.level >= 2 and self.flare_cd <= 0:
                    self.flare_ring = self.rng.randrange(3)
                    self.flare_t = 2.6
                    self.add_float(CX, CY - 200, f"FLARE -> {RING_NAMES[self.flare_ring]}", (255, 154, 60))
                    self.sfx.play("warn")
        self.update_boss(dt)

        boss_mul = 0.55 if self.boss else 1.0
        self.spawn_t -= dt
        if self.spawn_t <= 0:
            if len(self.meteors) < 44:
                burst = 1 + (1 if self.rng.random() < min(0.5, lvl * 0.06) else 0)
                for _ in range(burst):
                    base = (110 + 14 * lvl) * self.rng.uniform(0.8, 1.25)
                    mtype = self.pick_meteor_type()
                    self.meteors.append(Meteor(
                        self.rng.uniform(0, math.tau),
                        base * self.meteor_mul * (1.1 if self.boss else 1.0),
                        self.rng.randint(10, 18),
                        self.rng.uniform(-0.25, 0.25),
                        mtype["id"],
                    ))
            self.spawn_t = max(0.24, (1.0 - 0.07 * lvl) * boss_mul) * self.rng.uniform(0.7, 1.2)

        self.gem_t -= dt
        if self.gem_t <= 0 and len(self.gems) < 4:
            ring = self.ring if self.rng.random() < 0.55 else self.rng.randrange(3)
            self.gems.append(Gem(ring, self.rng.uniform(0, math.tau)))
            self.gem_t = self.rng.uniform(1.1, 2.1) / max(0.2, self.gem_rate)

        if self.powerup:
            self.powerup.life -= dt
            if self.powerup.life <= 0:
                self.powerup = None
                self.powerup_t = self.rng.uniform(14, 22)
        else:
            self.powerup_t -= dt
            if self.powerup_t <= 0:
                self.spawn_powerup()

        speed_scale = 0.5 if self.slow_t > 0 else 1.0
        alive = []
        for m in self.meteors:
            if m.dead:
                continue
            if m.kind == "splitter" and not m.split and m.r < 190:
                m.split = True
                for off in (-0.16, 0.16):
                    child = Meteor(m.angle + off, m.speed * 0.85, m.size * 0.56,
                                   self.rng.uniform(-0.2, 0.2), "normal", m.r)
                    child.split = True
                    alive.append(child)
                for _ in range(14):
                    self.parts.append(Particle(CX + math.cos(m.angle) * m.r,
                                               CY + math.sin(m.angle) * m.r, (120, 255, 160), 160, 0.5))
                continue
            prev_x = CX + math.cos(m.angle) * m.r
            prev_y = CY + math.sin(m.angle) * m.r
            entry_mul = 0.4 if m.entry > 0 else 1.0
            m.entry = max(0.0, m.entry - dt)
            m.speed = min(560.0, m.speed + 55 * speed_scale * dt * (1.25 if self.boss else 1.0))
            m.angle += (m.spin + 26 / max(80.0, m.r)) * dt
            m.rot += (m.spin + 0.5) * dt
            m.r -= m.speed * speed_scale * entry_mul * dt
            mx, my = m.pos
            d = segment_dist(px, py, prev_x, prev_y, mx, my)
            hit_r = m.size + 7
            if d < hit_r:
                if self.invuln > 0:
                    alive.append(m)
                    continue
                if self.shield:
                    self.shield = False
                    self.invuln = 1.2
                    self.sfx.play("shield")
                    self.hit_stop = max(self.hit_stop, 0.06)
                    self.flash = max(self.flash, 0.2)
                    if m.kind == "volatile":
                        self.explode_meteor(m)
                    for _ in range(30):
                        self.parts.append(Particle(mx, my, (120, 200, 255), 250))
                    continue
                self.die()
                return
            if not m.near_done and d < hit_r + 22 and self.invuln <= 0:
                m.near_done = True
                self.near_misses += 1
                self.save["stats"]["near"] += 1
                pts = int(15 * self.combo * self.score_mul * m.near_mult)
                self.score += pts
                self.sfx.play("near")
                self.hit_stop = max(self.hit_stop, 0.02)
                self.bump_combo()
                self.add_float(px, py - 20, f"CLOSE! +{pts}", (255, 230, 120))
                self.add_shock(px, py, (255, 230, 120), 70, 0.3)
            m.trail_t -= dt
            if m.trail_t <= 0 and m.r < 390:
                m.trail_t = 0.055
                self.parts.append(Particle(mx, my, (106, 90, 138) if self.slow_t > 0 else (255, 138, 60), 0, 0.32))
            if m.r < 40:
                if m.kind == "volatile":
                    self.explode_meteor(m)
                elif m.kind == "gold":
                    self.crystals += 2
                    self.crystal_gain += 2
                    self.save["lifetime"] += 2
                    self.add_float(mx, my, "GOLD +2", (255, 212, 90))
                for _ in range(8):
                    self.parts.append(Particle(mx, my, (255, 160, 60), 120, 0.5))
                continue
            alive.append(m)
        self.meteors = [m for m in alive if not m.dead]

        keep = []
        for g in self.gems:
            g.life -= dt
            gx, gy = g.pos
            pickup_r = 20 + self.magnet_bonus + (70 if self.magnet_t > 0 else 0)
            if math.hypot(gx - px, gy - py) < pickup_r:
                gain = self.crystal_mul
                self.crystals += gain
                self.crystal_gain += gain
                self.save["lifetime"] += gain
                self.gems_collected += 1
                pts = int(25 * self.combo * self.score_mul)
                self.score += pts
                self.add_float(gx, gy, f"+{pts}", (120, 230, 255))
                self.bump_combo()
                self.sfx.play("gem3" if self.combo >= 5 else "gem2" if self.combo >= 3 else "gem")
                self.add_shock(gx, gy, (120, 230, 255), 55, 0.3)
                for _ in range(16):
                    self.parts.append(Particle(gx, gy, (120, 230, 255), 180, 0.5))
                continue
            if g.life > 0:
                keep.append(g)
        self.gems = keep

        if self.powerup:
            gx, gy = self.powerup.pos
            if math.hypot(gx - px, gy - py) < 30:
                self.apply_powerup(self.powerup.kind)
                for _ in range(22):
                    self.parts.append(Particle(gx, gy, POWERUP_COLORS[self.powerup.kind], 240, 0.6))
                self.powerup = None
                self.powerup_t = self.rng.uniform(16, 24)

        if self.boss and self.boss["core"]:
            core = self.boss["core"]
            gx = CX + math.cos(core["angle"]) * RINGS[core["ring"]]
            gy = CY + math.sin(core["angle"]) * RINGS[core["ring"]]
            if math.hypot(gx - px, gy - py) < 40:
                self.boss["cores"] += 1
                pts = int(250 * self.level * self.score_mul)
                self.score += pts
                self.add_float(gx, gy, f"CORE +{pts}", (255, 212, 90))
                for _ in range(30):
                    self.parts.append(Particle(gx, gy, random.choice([(255, 212, 90), (255, 154, 60)]), 280, 0.7))
                self.sfx.play("power")
                self.boss["core"] = None
                self.boss["core_t"] = 1.0
                if self.boss and self.boss["cores"] >= self.boss["need"]:
                    self.clear_boss()

    # ---- drawing ----------------------------------------------------------
    def draw_space(self, s, ox=0, oy=0):
        s.fill((6, 6, 16))
        s.blit(self.nebula, (0, 0), special_flags=pygame.BLEND_RGB_ADD)
        # distant ringed planet
        px = int(W * 0.83 + ox * 0.2)
        py = int(H * 0.21 + oy * 0.2)
        pygame.draw.circle(s, (10, 20, 30), (px, py), 62)
        pygame.draw.circle(s, (26, 50, 68), (px, py), 54)
        pygame.draw.circle(s, (44, 82, 102), (px - 12, py - 10), 34)
        pygame.draw.circle(s, (66, 112, 132), (px - 22, py - 18), 15)
        pygame.draw.ellipse(s, (68, 96, 116), (px - 80, py - 18, 160, 36), 2)
        # parallax stars
        for x, y, b, depth in self.stars:
            sx = int((x + math.sin(self.time * 0.03 + b * 6) * 6) % W)
            sy = int((y + self.time * 7 * depth) % H)
            c = int(50 + 130 * b * (0.6 + 0.4 * math.sin(self.time * 2 + x)))
            s.set_at((sx, sy), (c, c, c))
        for star in self.shooting:
            alpha = max(0.0, min(0.7, star["life"] / star["max"]))
            col = int(210 * alpha)
            pygame.draw.line(s, (col, col, min(255, col + 20)),
                             (int(star["x"]), int(star["y"])),
                             (int(star["x"] - star["vx"] * 0.08), int(star["y"] - star["vy"] * 0.08)), 2)

    def draw(self):
        s = self.screen
        if self.ads.showing:
            self.ads.draw(s, self.fonts)
            return
        ox = oy = 0
        if self.shake > 0:
            ox, oy = random.randint(-6, 6), random.randint(-6, 6)
        self.draw_space(s, ox, oy)

        glow = 36 + 4 * math.sin(self.time * 3)
        pygame.draw.circle(s, (28, 12, 8), (CX + ox, CY + oy), int(118 + 6 * math.sin(self.time * 2)))
        pygame.draw.circle(s, (40, 18, 8), (CX + ox, CY + oy), 82)
        for i, col in enumerate(self.biome["star"]):
            pygame.draw.circle(s, col, (CX + ox, CY + oy), int(glow + 18 - i * 9))
        for i in range(4):
            a = self.time * 0.35 + i * math.tau / 4
            rect = pygame.Rect(CX + ox - (62 + i * 4), CY + oy - (62 + i * 4),
                               (62 + i * 4) * 2, (62 + i * 4) * 2)
            pygame.draw.arc(s, (120, 78, 38), rect, a, a + 0.32, 3)
        for i, r in enumerate(RINGS):
            active = i == self.ring and self.state == self.PLAY
            if active:
                pygame.draw.circle(s, tuple(int(c * 0.45) for c in self.biome["ring"]),
                                   (CX + ox, CY + oy), r, 7)
            pygame.draw.circle(s, self.biome["ring"] if active else self.biome["ring_dim"],
                               (CX + ox, CY + oy), r, 2)

        if self.flare_t > 0 and self.flare_ring >= 0:
            pulse = 0.45 + 0.45 * math.sin(self.time * 14)
            pygame.draw.circle(s, (int(255 * pulse), int(90 * pulse), int(40 * pulse)),
                               (CX + ox, CY + oy), RINGS[self.flare_ring], 7)
        if self.boss:
            for i in range(3):
                a = self.time * 1.4 + i * math.tau / 3
                rect = pygame.Rect(CX + ox - 345, CY + oy - 345, 690, 690)
                pygame.draw.arc(s, (255, 106, 60), rect, a, a + 0.55, 5)

        if self.ghost and self.ghost.get("samples") and self.mode == "classic":
            idx = int(self.run_time / 0.12)
            if idx < len(self.ghost["samples"]):
                _, ga, gr = self.ghost["samples"][idx]
                gx = CX + math.cos(ga) * gr + ox
                gy = CY + math.sin(ga) * gr + oy
                pygame.draw.circle(s, (60, 100, 140), (int(gx), int(gy)), 12, 2)
                pygame.draw.circle(s, (90, 140, 190), (int(gx), int(gy)), 5)

        for g in self.gems:
            gx, gy = g.pos
            if g.life > 1.5 or int(self.time * 10) % 2:
                rr = 8 + 2 * math.sin(self.time * 6)
                pts = [(gx + ox, gy - rr + oy), (gx + rr * 0.7 + ox, gy + oy),
                       (gx + ox, gy + rr + oy), (gx - rr * 0.7 + ox, gy + oy)]
                pygame.draw.polygon(s, (120, 230, 255), pts)

        if self.powerup:
            p = self.powerup
            gx, gy = p.pos
            col = POWERUP_COLORS[p.kind]
            if p.life > 2 or int(self.time * 10) % 2:
                pygame.draw.circle(s, col, (int(gx + ox), int(gy + oy)), int(19 + 3 * math.sin(self.time * 7)), 1)
                pygame.draw.circle(s, (12, 10, 20), (int(gx + ox), int(gy + oy)), 15)
                pygame.draw.circle(s, col, (int(gx + ox), int(gy + oy)), 15, 2)
                img = self.fonts["small"].render(POWERUP_LABELS[p.kind], True, col)
                s.blit(img, (int(gx + ox) - img.get_width() // 2, int(gy + oy) - img.get_height() // 2))

        if self.boss and self.boss["core"]:
            core = self.boss["core"]
            gx = CX + math.cos(core["angle"]) * RINGS[core["ring"]] + ox
            gy = CY + math.sin(core["angle"]) * RINGS[core["ring"]] + oy
            pygame.draw.circle(s, (255, 212, 90), (int(gx), int(gy)), 18, 4)
            pygame.draw.circle(s, (12, 10, 20), (int(gx), int(gy)), 14)
            img = self.fonts["small"].render("C", True, (255, 212, 90))
            s.blit(img, (int(gx) - img.get_width() // 2, int(gy) - img.get_height() // 2))

        for m in self.meteors:
            mx, my = m.pos
            mx += ox
            my += oy
            slow = self.slow_t > 0
            tail_r = m.r + m.speed * 0.10
            tx = CX + math.cos(m.angle) * tail_r + ox
            ty = CY + math.sin(m.angle) * tail_r + oy
            pygame.draw.line(s, (90, 62, 120) if slow else (150, 70, 36),
                             (int(tx), int(ty)), (int(mx), int(my)), max(2, int(m.size * 0.9)))
            pygame.draw.circle(s, (36, 20, 26) if slow else (54, 28, 16),
                               (int(mx), int(my)), int(m.size * 1.8), 2)
            mtype = next((t for t in METEOR_TYPES if t["id"] == m.kind), METEOR_TYPES[0])
            body = (106, 90, 138) if slow else mtype["color"]
            edge = (154, 138, 192) if slow else tuple(min(255, c + 40) for c in mtype["color"])
            points = []
            for i, scale in enumerate(m.shape):
                a = m.rot + i / len(m.shape) * math.tau
                points.append((mx + math.cos(a) * m.size * scale, my + math.sin(a) * m.size * scale))
            pygame.draw.polygon(s, body, points)
            pygame.draw.lines(s, edge, True, points, 2)
            crater = (74, 62, 98) if slow else mtype["shade"]
            pygame.draw.circle(s, crater,
                               (int(mx - m.size * 0.25), int(my - m.size * 0.2)), max(2, int(m.size * 0.22)))
            pygame.draw.circle(s, crater,
                               (int(mx + m.size * 0.3), int(my + m.size * 0.25)), max(1, int(m.size * 0.15)))
            if m.r > 300:
                ex, ey = CX + math.cos(m.angle) * 300, CY + math.sin(m.angle) * 300
                pygame.draw.circle(s, (255, 80, 80), (int(ex), int(ey)), 3)

        if self.state == self.PLAY:
            px, py = self.player_pos()
            livery = SHIP_LIVERIES.get(self.ship["id"], SHIP_LIVERIES["scout"])
            facing = 1 if self.angular_vel >= 0 else -1
            a = self.angle + facing * math.pi / 2
            if self.magnet_t > 0:
                for g in self.gems:
                    gx, gy = g.pos
                    if math.hypot(gx - px, gy - py) < 190:
                        pygame.draw.line(s, (90, 44, 78), (int(px) + ox, int(py) + oy),
                                         (int(gx) + ox, int(gy) + oy), 1)
                pygame.draw.circle(s, (255, 120, 220), (int(px) + ox, int(py) + oy),
                                   75 + self.magnet_bonus, 2)
            dim = _dim_livery(livery)
            for i in range(0, max(0, len(self.ship_trail) - 1), 2):
                ga, gr = self.ship_trail[i]
                draw_aircraft(s, CX + math.cos(ga) * gr + ox, CY + math.sin(ga) * gr + oy,
                              ga + facing * math.pi / 2, dim, self.time, 0)
            if self.invuln <= 0 or int(self.time * 12) % 2:
                draw_aircraft(s, px + ox, py + oy, a, livery, self.time, abs(self.angular_vel))
            if self.shield:
                pygame.draw.circle(s, (44, 88, 110), (int(px) + ox, int(py) + oy),
                                   int(26 + 3 * math.sin(self.time * 8)))
                pygame.draw.circle(s, (120, 200, 255), (int(px) + ox, int(py) + oy), 22, 2)

        for p in self.parts:
            p.draw(s)
        for shock in self.shocks:
            alpha = max(0.0, shock["life"] / shock["max"])
            col = tuple(int(ch * alpha) for ch in shock["col"])
            pygame.draw.circle(s, col, (int(shock["x"]), int(shock["y"])), int(shock["r"]), 2)
        for f in self.floats:
            img = self.fonts["small"].render(f.text, True, f.col)
            s.blit(img, (f.x - img.get_width() // 2, f.y))

        if self.flash > 0:
            self.flash_surf.fill((255, 140, 60, int(min(90, self.flash * 160))))
            s.blit(self.flash_surf, (0, 0))

        if self.state == self.TITLE:
            self.veil.fill((3, 3, 10, 145))
            s.blit(self.veil, (0, 0))
            self.draw_title()
        else:
            self.draw_hud()
            if self.state == self.OVER:
                self.draw_over()
            if self.paused:
                self.draw_pause()

    def draw_mission_line(self, mission, y):
        f = self.fonts["small"]
        s = self.screen
        col = (120, 255, 140) if mission["completed"] else (200, 200, 220)
        s.blit(f.render(mission["text"], True, col), (80, y))
        label = f"DONE +{mission['reward']}" if mission["completed"] else \
            f"{mission['progress']}/{mission['target']} +{mission['reward']}"
        blit_r(s, f, label, col if mission["completed"] else (150, 150, 178), W - 80, y)
        pygame.draw.rect(s, (34, 34, 58), (80, y + 22, W - 160, 4))
        pct = min(1.0, mission["progress"] / mission["target"]) if mission["target"] else 0
        pygame.draw.rect(s, (120, 255, 140) if mission["completed"] else (120, 200, 255),
                         (80, y + 22, int((W - 160) * pct), 4))

    def draw_hud(self):
        f = self.fonts
        s = self.screen
        mode = "DAILY" if self.mode == "daily" else self.contract["name"]
        draw_panel(s, 16, 14, 280, 100, (7, 11, 22), 200, (120, 200, 255, 60))
        s.blit(f["small"].render("SCORE", True, (127, 139, 163)), (30, 24))
        s.blit(f["hud"].render(str(int(self.score)), True, (255, 255, 255)), (30, 42))
        s.blit(f["small"].render(f"LV {self.level} {self.level_name} - {self.biome['name']}",
                                 True, (154, 166, 192)), (30, 78))
        level_pct = (self.elapsed % 15) / 15
        pygame.draw.rect(s, (28, 34, 54), (30, 102, 252, 4))
        pygame.draw.rect(s, (120, 230, 255), (30, 102, int(252 * level_pct), 4))

        draw_panel(s, W - 250, 14, 234, 100, (7, 11, 22), 200, (255, 212, 90, 60))
        combo_col = (255, 138, 74) if self.combo >= 8 else (255, 230, 120) if self.combo >= 4 else (200, 200, 220)
        img = f["hud"].render(f"x{self.combo}", True, combo_col)
        s.blit(img, (W - 30 - img.get_width(), 38))
        tier = "OVERDRIVE" if self.combo >= 8 else "BLAZING" if self.combo >= 6 else \
            "HOT" if self.combo >= 4 else "WARM" if self.combo >= 2 else "READY"
        img = f["small"].render(tier, True, combo_col)
        s.blit(img, (W - 30 - img.get_width(), 70))
        for i in range(MAX_COMBO):
            x = W - 236 + i * 24
            pygame.draw.rect(s, combo_col if i < self.combo else (36, 36, 58), (x, 90, 20, 7))
        pygame.draw.rect(s, (36, 36, 58), (W - 236, 102, 200, 3))
        pygame.draw.rect(s, combo_col, (W - 236, 102, int(200 * min(1, self.combo_t / self.combo_time)), 3))

        draw_gem_icon(s, W - 140, 128, 8)
        img = f["small"].render(str(self.crystals), True, (120, 230, 255))
        s.blit(img, (W - 30 - img.get_width(), 120))

        chips = []
        if self.shield:
            chips.append("SHIELD")
        if self.magnet_t > 0:
            chips.append(f"MAGNET {self.magnet_t:.1f}")
        if self.slow_t > 0:
            chips.append(f"WARP {self.slow_t:.1f}")
        for i, chip in enumerate(chips):
            x = 24 + i * 150
            draw_panel(s, x, 126, 140, 26, (8, 12, 24), 150, (255, 255, 255, 30), 8)
            img = f["small"].render(chip, True, (190, 190, 220))
            s.blit(img, (x + 70 - img.get_width() // 2, 131))
        if self.ghost and self.mode == "classic":
            s.blit(f["small"].render(f"GHOST {self.ghost['score']}", True, (92, 111, 138)), (30, 194))

        blit_c(s, f["small"], "P pause   M unmute" if self.sfx.muted else "P pause   M mute", (100, 100, 125), 8)
        if self.boss:
            draw_panel(s, W // 2 - 170, 160, 340, 32, (30, 10, 6), 190, (255, 106, 60, 120), 10)
            blit_c(s, f["small"],
                   f"CORONA SURGE {self.boss['cores']}/{self.boss['need']}   {max(0, self.boss['timer']):.1f}s",
                   (255, 138, 74), 167)
        elif self.flare_t > 0 and self.flare_ring >= 0:
            draw_panel(s, W // 2 - 170, 160, 340, 32, (30, 10, 6), 190, (255, 106, 60, 120), 10)
            pulse = 0.55 + 0.45 * math.sin(self.time * 14)
            blit_c(s, f["small"],
                   f"FLARE IN {self.flare_t:.1f}s - {RING_NAMES[self.flare_ring]} RING",
                   (255, int(110 * pulse + 60), 60), 167)

    def draw_title(self):
        f = self.fonts
        s = self.screen
        shadow = f["big"].render("ORBIT RUNNER", True, (96, 44, 12))
        s.blit(shadow, (W // 2 - shadow.get_width() // 2, 21))
        blit_c(s, f["big"], "ORBIT RUNNER", (255, 200, 90), 16)
        blit_c(s, f["small"], "O R B I T A L   S U R V I V A L", (127, 139, 163), 72)

        draw_panel(s, 16, 96, W - 32, 50, (8, 12, 24), 205, (120, 200, 255, 60))
        ship = next((x for x in SHIPS if x["id"] == self.save["ship"]), SHIPS[0])
        blit_l(s, f["small"], f"SHIP: {ship['name']} (V)", (120, 200, 255), 32, 102)
        lifetime = f"LIFETIME {self.save['lifetime']}"
        nxt = self.next_ship
        if nxt:
            lifetime += f"   NEXT: {nxt['name']} ({nxt['unlock']})"
        else:
            lifetime += "   ALL SHIPS UNLOCKED"
        blit_l(s, f["small"], lifetime, (150, 150, 178), 240, 102)
        blit_l(s, f["small"], f"BEST {self.save['best']}   BANK {self.save['bank']}   TOKENS {self.save['continue_tokens']}",
               (200, 200, 220), 32, 126)

        draw_panel(s, 16, 156, W - 32, 174, (8, 12, 24), 195, (120, 200, 255, 45))
        blit_l(s, f["small"], "DAILY MISSIONS", (200, 200, 220), 32, 168)
        blit_r(s, f["small"], f"TOKENS {self.save['continue_tokens']}   DONE {self.save['missions_done']}",
               (120, 200, 255), W - 32, 168)
        for i, mission in enumerate(self.save["missions"]):
            self.draw_mission_line(mission, 198 + i * 32)

        draw_panel(s, 16, 340, W - 32, 112, (8, 12, 24), 195, (255, 212, 90, 45))
        blit_l(s, f["small"], "CONTRACT", (200, 200, 220), 32, 352)
        blit_l(s, f["small"], f"{self.contract['name']} - {self.contract['desc']}", (150, 150, 178), 140, 352)
        options = []
        for i, ct in enumerate(CONTRACTS):
            tag = f"[{i + 1} {ct['name']}]" if self.save["contract"] == ct["id"] else f"{i + 1} {ct['name']}"
            options.append(tag)
        blit_c(s, f["small"], "    ".join(options), (120, 200, 255), 382)
        blit_l(s, f["small"], "Different risk / reward profiles. Keys 1 / 2 / 3.",
               (120, 120, 145), 32, 410)

        blit_c(s, f["mid"], f"SPACE launch - {self.contract['name']}", (255, 255, 255), 466)
        blit_c(s, f["small"], "D = daily challenge   V = ship   1/2/3 = contract", (170, 170, 200), 502)

        bank = self.save["bank"]
        daily_best = self.save["daily"]["best"] if self.save["daily"]["date"] == date_key() else 0
        blit_c(s, f["small"],
               f"DAILY {date_key()}   BEST {daily_best}   |   TIER {tier_for(self.save['best'])[0]}",
               (120, 200, 255), 534)
        if bank >= SHIELD_COST or self.buy_shield:
            tag = "[B] shield: ON" if self.buy_shield else f"[B] buy shield ({SHIELD_COST})"
            blit_c(s, f["small"], tag, (120, 200, 255), 562)
        blit_c(s, f["small"], "Crystals: score + combo - bank for shields - lifetime unlocks ships",
               (120, 230, 255), 590)
        blit_c(s, f["small"], "Power-ups: S shield - M magnet - T time warp", (255, 154, 223), 614)
        blit_c(s, f["small"], "Dodge flares - collect 3 cores during a Corona Surge - missions pay crystals",
               (255, 176, 106), 638)
        blit_c(s, f["small"], "P pause   M mute   ESC quit", (100, 100, 125), 664)

    def draw_over(self):
        f = self.fonts
        s = self.screen
        veil = pygame.Surface((W, H), pygame.SRCALPHA)
        veil.fill((0, 0, 0, 205))
        s.blit(veil, (0, 0))
        draw_panel(s, 20, 20, W - 40, 650, (7, 10, 22), 235, (255, 212, 90, 55), 24)
        grade, grade_col, grade_label = grade_for(self.score, self.level, self.max_combo)
        blit_c(s, f["big"], "SHIP DESTROYED", (255, 90, 90), 54)
        if self.new_best:
            pulse = 0.55 + 0.45 * math.sin(self.time * 6)
            blit_c(s, f["mid"], "NEW BEST", (255, int(180 * pulse + 60), 60), 102)
        if self.mode == "daily":
            label = "NEW DAILY BEST" if self.new_daily_best else f"DAILY BEST {self.save['daily']['best']}"
            blit_c(s, f["small"], label, (120, 200, 255), 128)
        blit_c(s, f["hud"], f"Score {int(self.score)}", (255, 255, 255), 150)
        blit_c(s, f["small"], f"Crystals {self.crystals}", (120, 230, 255), 180)
        # grade badge
        pygame.draw.circle(s, grade_col, (W - 96, 166), 46, 3)
        grade_img = f["big"].render(grade, True, grade_col)
        s.blit(grade_img, (W - 96 - grade_img.get_width() // 2, 140))
        blit_c(s, f["small"],
               f"TIME {int(self.run_time)}s   LEVEL {self.level}   MAX COMBO x{self.max_combo}",
               (200, 200, 220), 218)
        blit_c(s, f["small"],
               f"NEAR {self.near_misses}  FLARES {self.flares_dodged}  SURGES {self.bosses_cleared}",
               (150, 150, 180), 242)
        blit_c(s, f["small"],
               f"BANK {self.save['bank']}   LIFETIME {self.save['lifetime']}   TIER {tier_for(self.save['best'])[0]}",
               (120, 120, 145), 266)

        draw_panel(s, 50, 282, W - 100, 128, (10, 16, 30), 180, (120, 200, 255, 40), 14)
        blit_l(s, f["small"], "MISSIONS", (200, 200, 220), 66, 292)
        for i, mission in enumerate(self.save["missions"]):
            self.draw_mission_line(mission, 318 + i * 32)

        y = 420
        if not self.continue_used:
            p = int(200 + 55 * math.sin(self.time * 5))
            pygame.draw.rect(s, (40, p // 3, 20), (W // 2 - 270, y - 8, 540, 44), border_radius=10)
            blit_c(s, f["mid"], self.continue_label(), (p, 255, p), y)
        else:
            blit_c(s, f["small"], "(continue already used this run)", (130, 130, 150), y + 8)
        y += 62
        if not self.double_used and self.crystals > 0:
            blit_c(s, f["mid"], f"[D] Watch ad  ->  DOUBLE crystals (+{self.crystals})", (120, 230, 255), y)
        y += 58
        blit_c(s, f["small"], "[R] restart     [T] title", (200, 200, 220), y)
        if self.message:
            blit_c(s, f["small"], self.message, (255, 230, 120), y + 32)

    def draw_pause(self):
        f = self.fonts
        s = self.screen
        veil = pygame.Surface((W, H), pygame.SRCALPHA)
        veil.fill((0, 0, 0, 190))
        s.blit(veil, (0, 0))
        draw_panel(s, 60, 90, W - 120, 430, (7, 10, 22), 235, (255, 212, 90, 55), 24)
        blit_c(s, f["big"], "PAUSED", (255, 212, 90), 108)
        blit_c(s, f["mid"], f"Score {int(self.score)}   Level {self.level}   Combo x{self.combo}", (255, 255, 255), 170)
        blit_c(s, f["small"], f"{self.mode.upper() if self.mode == 'daily' else self.contract['name']}   {self.ship['name']}",
               (120, 200, 255), 205)
        blit_c(s, f["small"], "P / SPACE resume", (200, 200, 220), 300)
        blit_c(s, f["small"], "R restart", (200, 200, 220), 336)
        blit_c(s, f["small"], "T title", (200, 200, 220), 372)
        blit_c(s, f["small"], "M unmute" if self.sfx.muted else "M mute", (200, 200, 220), 408)
        blit_c(s, f["small"], "ESC quit", (130, 130, 150), 444)


# ------------------------------------------------------------------- main ---


def main(selftest=False, shots=False):
    global SAVE_FILE
    if selftest:
        os.environ["SDL_VIDEODRIVER"] = "dummy"
        os.environ["SDL_AUDIODRIVER"] = "dummy"
        # point at a temp save BEFORE constructing Game, so a selftest can
        # never touch the player's real progress
        SAVE_FILE = os.path.join(tempfile.gettempdir(), "orbit_runner_selftest_save.json")
        try:
            os.remove(SAVE_FILE)
        except OSError:
            pass
    pygame.init()
    screen = pygame.display.set_mode((W, H))
    pygame.display.set_caption("Orbit Runner")
    clock = pygame.time.Clock()
    game = Game(screen, MockAdProvider())
    if selftest:
        return run_selftest(game, shots)
    while True:
        dt = min(clock.tick(60) / 1000, 0.05)
        for ev in pygame.event.get():
            if ev.type == pygame.QUIT or (ev.type == pygame.KEYDOWN and ev.key == pygame.K_ESCAPE):
                write_save(game.save)
                pygame.quit()
                return
            if ev.type == getattr(pygame, "WINDOWFOCUSLOST", -1) and game.state == game.PLAY and not game.ads.showing:
                game.paused = True
            game.handle(ev)
        game.update(dt)
        game.draw()
        pygame.display.flip()


def run_selftest(game, shots=False):
    global SAVE_FILE
    SAVE_FILE = os.path.join(tempfile.gettempdir(), "orbit_runner_selftest_save.json")
    try:
        os.remove(SAVE_FILE)
    except OSError:
        pass
    shot_dir = os.path.dirname(os.path.abspath(__file__)) if shots else tempfile.gettempdir()

    def shot(name):
        path = os.path.join(shot_dir, name)
        pygame.image.save(game.screen, path)
        return path

    game.save = fresh_save()
    game.ensure_missions()
    game.refresh_unlocks()
    game.reset_run()
    game.state = game.TITLE
    game.draw()
    shot("orbit_title.png")

    def reset_over(crystals, bank=0):
        game.save = fresh_save()
        game.save["bank"] = bank
        game.ensure_missions()
        game.reset_run()
        game.crystals = crystals
        game.state = game.OVER

    # reward accounting regression tests
    reset_over(5)
    game.die()
    assert game.save["bank"] == 5, "death did not bank crystals"
    game.reward_continue()
    game.start_run()
    assert game.save["bank"] == 5, "continue + restart lost crystals"

    reset_over(5)
    game.die()
    game.reward_double()
    assert game.save["bank"] == 10 and game.crystals == 10, "double banked the wrong amount"
    game.die()
    assert game.save["bank"] == 10, "double was banked twice"

    reset_over(5)
    game.die()
    game.reward_continue()
    game.reward_double()
    game.die()
    assert game.save["bank"] == 10, "continue then double was not exactly double"

    reset_over(5)
    game.die()
    game.reward_continue()
    game.crystals += 2
    game.die()
    assert game.save["bank"] == 7, "crystals collected after continue were not banked"

    # scripted gameplay
    game.save = fresh_save()
    game.ensure_missions()
    game.buy_shield = False
    game.state = game.TITLE
    game.ads_used = 0
    key = lambda k: game.handle(pygame.event.Event(pygame.KEYDOWN, key=k))
    step = lambda secs: [(game.update(1 / 60), game.draw()) for _ in range(int(secs * 60))]

    key(pygame.K_SPACE)
    assert game.state == game.PLAY
    game.crystals = 4
    for _ in range(60 * 120):
        game.update(1 / 60)
        if game.state == game.OVER:
            break
    game.draw()
    assert game.state == game.OVER, "player never died"
    shot("orbit_over.png")
    score_at_death = game.score
    crystals_at_death = game.crystals
    bank_at_death = game.save["bank"]

    # use the ad path, not the free first continue
    game.save["free_continue_used"] = True
    game.save["continue_tokens"] = 0
    game.message = ""
    key(pygame.K_c)
    step(1)
    key(pygame.K_x)
    assert game.state == game.OVER and not game.continue_used and "no reward" in game.message

    key(pygame.K_d)
    assert game.ads.showing
    step(2)
    shot("orbit_ad.png")
    step(5)
    assert not game.ads.showing and game.double_used
    assert game.save["bank"] == bank_at_death + crystals_at_death, "double ad bank mismatch"
    assert game.crystals == crystals_at_death * 2

    game.message = ""
    bank_before_continue = game.save["bank"]
    key(pygame.K_c)
    step(6)
    assert game.state == game.PLAY and game.continue_used and game.score >= score_at_death
    assert game.invuln > 0
    assert game.save["bank"] == bank_before_continue, "continue changed the bank"
    step(1)
    shot("orbit_play.png")
    for _ in range(60 * 120):
        game.update(1 / 60)
        if game.state == game.OVER:
            break
    key(pygame.K_c)
    assert not game.ads.showing, "continue offered twice"
    key(pygame.K_r)
    assert game.state == game.PLAY and not game.continue_used
    print("SELFTEST OK  (score at first death: %d, shots: %s)" % (score_at_death, shot_dir))
    try:
        os.remove(SAVE_FILE)
    except OSError:
        pass
    pygame.quit()


if __name__ == "__main__":
    main(selftest="--selftest" in sys.argv, shots="--shots" in sys.argv)
