"""
ORBIT RUNNER  -  a one-button-ish arcade dodger with a rewarded-ad continue.

You are a tiny ship orbiting a dying star on three rings. Meteors rain inward.
  UP / W      jump to the outer ring
  DOWN / S    drop to the inner ring
  SPACE       reverse orbit direction
  ESC         quit

Scoring
  * Survive          -> points every second (scaled by level)
  * Collect crystals -> builds a COMBO multiplier (x1..x8); missing one resets it
  * Near-miss        -> brush past a meteor without dying for bonus points
Crystals are also banked between runs (save file) and can buy a SHIELD on the
title screen (press B, costs 25).

When you die you get a choice:
  [C] Watch an ad -> CONTINUE right where you died (once per run)
  [D] Watch an ad -> DOUBLE the crystals you collected this run
  [R] Restart / [T] Title

The ad is simulated by MockAdProvider. Swap it for a real SDK by implementing
the same AdProvider interface (see bottom of the ad section).

Run:  pip install pygame && python orbit_runner.py
Self-test (headless, scripted):  python orbit_runner.py --selftest
"""
import json
import math
import os
import random
import sys
from array import array

import pygame

W, H = 900, 700
CX, CY = W // 2, H // 2 + 20
RINGS = [110, 180, 250]
SAVE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "orbit_save.json")
SHIELD_COST = 25

# ---------------------------------------------------------------- helpers ---


def load_save():
    try:
        with open(SAVE_FILE) as f:
            return json.load(f)
    except Exception:
        return {"best": 0, "bank": 0}


def write_save(data):
    try:
        with open(SAVE_FILE, "w") as f:
            json.dump(data, f)
    except OSError:
        pass


def make_tone(freq, ms, vol=0.3, slide=0.0):
    """Synthesize a short square-ish blip (no asset files needed)."""
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


class Sfx:
    def __init__(self):
        self.ok = False
        try:
            pygame.mixer.init(22050, -16, 1, 512)
            self.ok = True
        except Exception:
            return
        self.sounds = {
            "gem": make_tone(880, 80, 0.2, 400),
            "jump": make_tone(300, 60, 0.15, 200),
            "near": make_tone(1200, 50, 0.12),
            "die": make_tone(200, 500, 0.35, -170),
            "reward": make_tone(523, 300, 0.25, 520),
            "shield": make_tone(400, 200, 0.25, -200),
        }

    def play(self, name):
        if self.ok and self.sounds.get(name):
            self.sounds[name].play()


# ------------------------------------------------------------- ad system ---


class AdProvider:
    """Interface the game talks to. A real SDK adapter (AdMob, Unity Ads,
    AppLovin...) would implement these same methods and call the callbacks
    from its own listener events."""

    def is_ready(self):
        raise NotImplementedError

    def show_rewarded(self, on_reward, on_closed):
        """Start an ad. Call on_reward() if the user earned the reward, then
        on_closed() when the ad UI goes away (always)."""
        raise NotImplementedError

    def update(self, dt):  # pump per frame (real SDKs are event-driven)
        pass

    def handle_event(self, ev):
        pass

    def draw(self, surf, fonts):
        pass

    @property
    def showing(self):
        return False


class MockAdProvider(AdProvider):
    """Fake 5-second rewarded video. Closing early forfeits the reward,
    exactly like a real rewarded ad."""
    DURATION = 5.0
    BRANDS = [
        ("GALAXY GRUB", "Snacks so good they're out of this world.", (255, 170, 60)),
        ("NEBULA NAPS", "Mattresses tested in zero gravity.", (140, 120, 255)),
        ("COMET COLA", "Fizz at the speed of light.", (255, 80, 110)),
        ("STARLIGHT VPN", "Browse privately across 9 galaxies.", (60, 220, 180)),
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
            if self.t >= self.DURATION + 0.6:  # auto-close after "video" ends
                self._finish(True)

    def handle_event(self, ev):
        if not self._active or ev.type != pygame.KEYDOWN:
            return
        if ev.key == pygame.K_x:  # X = close ad
            self._finish(self.t >= self.DURATION)

    def draw(self, surf, fonts):
        if not self._active:
            return
        name, slogan, col = self.brand
        surf.fill((12, 10, 20))
        # animated "video": pulsing logo + orbiting dots
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
        # progress bar
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
        self.x, self.y, self.text, self.col, self.life = x, y, text, col, 0.9

    def update(self, dt):
        self.y -= 40 * dt
        self.life -= dt
        return self.life > 0


# ------------------------------------------------------------------- game ---


class Meteor:
    def __init__(self, speed):
        self.angle = random.uniform(0, math.tau)
        self.r = 470.0
        self.speed = speed * random.uniform(0.8, 1.25)
        self.size = random.randint(10, 18)
        self.spin = random.uniform(-0.25, 0.25)  # slight spiral makes timing trickier
        self.near_done = False

    @property
    def pos(self):
        return CX + math.cos(self.angle) * self.r, CY + math.sin(self.angle) * self.r


class Gem:
    def __init__(self, ring, angle):
        self.ring, self.angle, self.life = ring, angle, 6.0

    @property
    def pos(self):
        return CX + math.cos(self.angle) * RINGS[self.ring], CY + math.sin(self.angle) * RINGS[self.ring]


class Game:
    TITLE, PLAY, OVER = "title", "play", "over"

    def __init__(self, screen, ads: AdProvider):
        self.screen = screen
        self.ads = ads
        self.sfx = Sfx()
        self.fonts = {
            "big": pygame.font.SysFont("consolas,menlo,monospace", 48, bold=True),
            "mid": pygame.font.SysFont("consolas,menlo,monospace", 26, bold=True),
            "small": pygame.font.SysFont("consolas,menlo,monospace", 18),
        }
        self.save = load_save()
        self.stars = [(random.randrange(W), random.randrange(H), random.random()) for _ in range(120)]
        self.state = self.TITLE
        self.buy_shield = False
        self.message = ""
        self.time = 0.0
        self.reset_run()

    # ---- run lifecycle ----------------------------------------------------
    def reset_run(self):
        self.ring = 1
        self.ring_vis = float(RINGS[1])  # smoothed radius for animation
        self.angle = -math.pi / 2
        self.dir = 1
        self.meteors, self.gems, self.parts, self.floats = [], [], [], []
        self.score = 0.0
        self.crystals = 0
        self.combo = 1
        self.elapsed = 0.0
        self.spawn_t = 1.0
        self.gem_t = 1.5
        self.invuln = 1.0
        self.shield = False
        self.shake = 0.0
        self.continue_used = False
        self.double_used = False

    def start_run(self):
        self.reset_run()
        if self.buy_shield and self.save["bank"] >= SHIELD_COST:
            self.save["bank"] -= SHIELD_COST
            self.shield = True
            write_save(self.save)
        self.buy_shield = False
        self.state = self.PLAY

    @property
    def level(self):
        return 1 + int(self.elapsed // 15)

    def player_pos(self):
        return CX + math.cos(self.angle) * self.ring_vis, CY + math.sin(self.angle) * self.ring_vis

    def die(self):
        x, y = self.player_pos()
        for _ in range(60):
            self.parts.append(Particle(x, y, random.choice([(255, 220, 90), (255, 120, 60), (255, 255, 255)]), 320, 1.2))
        self.sfx.play("die")
        self.shake = 0.5
        self.save["bank"] += self.crystals
        self.save["best"] = max(self.save["best"], int(self.score))
        write_save(self.save)
        self.message = ""
        self.state = self.OVER

    # ---- ad reward callbacks (game logic is decoupled from the ad itself) --
    def request_ad(self, kind):
        if not self.ads.is_ready():
            self.message = "No ad available right now."
            return
        if kind == "continue" and not self.continue_used:
            self.ads.show_rewarded(self.reward_continue, self.ad_closed)
        elif kind == "double" and not self.double_used and self.crystals > 0:
            self.ads.show_rewarded(self.reward_double, self.ad_closed)

    def reward_continue(self):
        self.continue_used = True
        self.meteors.clear()  # clear the sky so the player isn't instantly killed
        self.invuln = 3.0
        self.save["bank"] -= self.crystals  # crystals re-banked on next death
        write_save(self.save)
        self.state = self.PLAY
        self.sfx.play("reward")
        self.floats.append(FloatText(CX, CY - 40, "SECOND CHANCE!", (120, 255, 140)))

    def reward_double(self):
        self.double_used = True
        self.save["bank"] += self.crystals
        write_save(self.save)
        self.message = f"+{self.crystals} bonus crystals banked!"
        self.crystals *= 2
        self.sfx.play("reward")

    def ad_closed(self):
        if self.state == self.OVER and not self.message:
            self.message = "Ad closed early - no reward."

    # ---- input -------------------------------------------------------------
    def handle(self, ev):
        if self.ads.showing:
            self.ads.handle_event(ev)
            return
        if ev.type != pygame.KEYDOWN:
            return
        k = ev.key
        if self.state == self.TITLE:
            if k in (pygame.K_SPACE, pygame.K_RETURN):
                self.start_run()
            elif k == pygame.K_b and self.save["bank"] >= SHIELD_COST:
                self.buy_shield = not self.buy_shield
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
                self.start_run()
            elif k == pygame.K_t:
                self.state = self.TITLE

    # ---- simulation --------------------------------------------------------
    def update(self, dt):
        self.time += dt
        self.ads.update(dt)
        self.shake = max(0, self.shake - dt)
        self.parts = [p for p in self.parts if p.update(dt)]
        self.floats = [f for f in self.floats if f.update(dt)]
        if self.state != self.PLAY or self.ads.showing:
            return

        self.elapsed += dt
        lvl = self.level
        self.invuln = max(0, self.invuln - dt)
        self.score += dt * 10 * lvl

        # player motion: angular speed grows slightly with level
        self.angle += self.dir * (1.6 + 0.08 * lvl) * dt
        self.ring_vis += (RINGS[self.ring] - self.ring_vis) * min(1, dt * 14)
        px, py = self.player_pos()

        # spawn meteors - interval shrinks, speed grows
        self.spawn_t -= dt
        if self.spawn_t <= 0:
            burst = 1 + (random.random() < min(0.5, lvl * 0.06))
            for _ in range(burst):
                self.meteors.append(Meteor(110 + 14 * lvl))
            self.spawn_t = max(0.22, 1.0 - 0.07 * lvl) * random.uniform(0.7, 1.2)

        # spawn crystals
        self.gem_t -= dt
        if self.gem_t <= 0 and len(self.gems) < 3:
            self.gems.append(Gem(random.randrange(3), random.uniform(0, math.tau)))
            self.gem_t = random.uniform(1.2, 2.2)

        # meteors
        alive = []
        for m in self.meteors:
            m.r -= m.speed * dt
            m.angle += m.spin * dt
            mx, my = m.pos
            d = math.hypot(mx - px, my - py)
            hit_r = m.size + 7
            if d < hit_r:
                if self.invuln > 0:
                    alive.append(m)
                    continue
                if self.shield:
                    self.shield = False
                    self.invuln = 1.2
                    self.sfx.play("shield")
                    for _ in range(30):
                        self.parts.append(Particle(mx, my, (120, 200, 255), 250))
                    continue
                self.die()
                return
            if not m.near_done and d < hit_r + 22 and self.invuln <= 0:
                m.near_done = True
                pts = 15 * self.combo
                self.score += pts
                self.sfx.play("near")
                self.floats.append(FloatText(px, py - 20, f"CLOSE! +{pts}", (255, 230, 120)))
            if m.r < 40:  # swallowed by the star
                for _ in range(8):
                    self.parts.append(Particle(mx, my, (255, 160, 60), 120, 0.5))
                continue
            alive.append(m)
        self.meteors = alive

        # crystals
        keep = []
        for g in self.gems:
            g.life -= dt
            gx, gy = g.pos
            if math.hypot(gx - px, gy - py) < 20:
                self.crystals += 1
                pts = 25 * self.combo
                self.score += pts
                self.floats.append(FloatText(gx, gy, f"+{pts}", (120, 230, 255)))
                self.combo = min(8, self.combo + 1)
                self.sfx.play("gem")
                for _ in range(16):
                    self.parts.append(Particle(gx, gy, (120, 230, 255), 180, 0.5))
                continue
            if g.life <= 0:
                if self.combo > 1:
                    self.floats.append(FloatText(gx, gy, "combo lost", (200, 100, 100)))
                self.combo = 1
                continue
            keep.append(g)
        self.gems = keep

    # ---- drawing -----------------------------------------------------------
    def draw(self):
        s = self.screen
        if self.ads.showing:
            self.ads.draw(s, self.fonts)
            return
        s.fill((6, 6, 16))
        ox = oy = 0
        if self.shake > 0:
            ox, oy = random.randint(-6, 6), random.randint(-6, 6)
        for x, y, b in self.stars:
            c = int(60 + 120 * b * (0.6 + 0.4 * math.sin(self.time * 2 + x)))
            s.set_at((x, y), (c, c, c))

        # star core
        glow = 36 + 4 * math.sin(self.time * 3)
        for i, col in enumerate([(80, 30, 10), (180, 80, 20), (255, 180, 60)]):
            pygame.draw.circle(s, col, (CX + ox, CY + oy), int(glow + 18 - i * 9))
        for i, r in enumerate(RINGS):
            col = (70, 70, 120) if i != self.ring or self.state != self.PLAY else (110, 110, 190)
            pygame.draw.circle(s, col, (CX + ox, CY + oy), r, 1)

        for g in self.gems:
            gx, gy = g.pos
            blink = g.life > 1.5 or int(self.time * 10) % 2
            if blink:
                rr = 8 + 2 * math.sin(self.time * 6)
                pts = [(gx + ox, gy - rr + oy), (gx + rr * 0.7 + ox, gy + oy), (gx + ox, gy + rr + oy), (gx - rr * 0.7 + ox, gy + oy)]
                pygame.draw.polygon(s, (120, 230, 255), pts)
        for m in self.meteors:
            mx, my = m.pos
            # warning tick on the outer edge before the meteor is visible
            pygame.draw.circle(s, (140, 110, 100), (int(mx) + ox, int(my) + oy), m.size)
            pygame.draw.circle(s, (90, 70, 60), (int(mx) + ox - 3, int(my) + oy - 2), m.size // 3)
            if m.r > 300:
                ex, ey = CX + math.cos(m.angle) * 300, CY + math.sin(m.angle) * 300
                pygame.draw.circle(s, (255, 80, 80), (int(ex), int(ey)), 3)

        if self.state == self.PLAY:
            px, py = self.player_pos()
            if self.invuln <= 0 or int(self.time * 12) % 2:
                a = self.angle + self.dir * math.pi / 2  # face the direction of travel
                tri = [(px + math.cos(a) * 12, py + math.sin(a) * 12),
                       (px + math.cos(a + 2.5) * 9, py + math.sin(a + 2.5) * 9),
                       (px + math.cos(a - 2.5) * 9, py + math.sin(a - 2.5) * 9)]
                pygame.draw.polygon(s, (240, 240, 255), [(x + ox, y + oy) for x, y in tri])
            if self.shield:
                pygame.draw.circle(s, (120, 200, 255), (int(px) + ox, int(py) + oy), 16, 2)

        for p in self.parts:
            p.draw(s)
        for f in self.floats:
            img = self.fonts["small"].render(f.text, True, f.col)
            s.blit(img, (f.x - img.get_width() // 2, f.y))

        if self.state == self.TITLE:
            self.draw_title()
        else:
            self.draw_hud()
            if self.state == self.OVER:
                self.draw_over()

    def draw_hud(self):
        f = self.fonts
        s = self.screen
        s.blit(f["mid"].render(f"SCORE {int(self.score)}", True, (255, 255, 255)), (16, 12))
        s.blit(f["small"].render(f"LEVEL {self.level}   BEST {self.save['best']}", True, (170, 170, 200)), (16, 44))
        col = (255, 230, 120) if self.combo > 1 else (150, 150, 170)
        img = f["mid"].render(f"COMBO x{self.combo}", True, col)
        s.blit(img, (W - img.get_width() - 16, 12))
        img = f["small"].render(f"crystals {self.crystals}", True, (120, 230, 255))
        s.blit(img, (W - img.get_width() - 16, 44))

    def draw_title(self):
        f = self.fonts
        blit_c(self.screen, f["big"], "ORBIT RUNNER", (255, 200, 90), 60)
        blit_c(self.screen, f["small"], "UP/DOWN change ring   SPACE reverse   grab crystals, dodge meteors", (200, 200, 220), 120)
        blit_c(self.screen, f["mid"], "SPACE to launch", (255, 255, 255), 600)
        bank = self.save["bank"]
        txt = f"Best {self.save['best']}   Bank {bank} crystals"
        blit_c(self.screen, f["small"], txt, (120, 230, 255), 645)
        if bank >= SHIELD_COST:
            tag = "[B] shield: ON" if self.buy_shield else f"[B] buy shield ({SHIELD_COST})"
            blit_c(self.screen, f["small"], tag, (120, 200, 255), 670)

    def draw_over(self):
        f = self.fonts
        s = self.screen
        veil = pygame.Surface((W, H), pygame.SRCALPHA)
        veil.fill((0, 0, 0, 170))
        s.blit(veil, (0, 0))
        blit_c(s, f["big"], "SHIP DESTROYED", (255, 90, 90), 170)
        blit_c(s, f["mid"], f"Score {int(self.score)}    Crystals {self.crystals}", (255, 255, 255), 240)
        y = 320
        if not self.continue_used:
            # pulsing call-to-action, the main monetization hook
            p = int(200 + 55 * math.sin(self.time * 5))
            pygame.draw.rect(s, (40, p // 3, 20), (W // 2 - 260, y - 8, 520, 44), border_radius=10)
            blit_c(s, f["mid"], "[C] Watch ad  ->  CONTINUE", (p, 255, p), y)
        else:
            blit_c(s, f["small"], "(continue already used this run)", (130, 130, 150), y + 8)
        y += 60
        if not self.double_used and self.crystals > 0:
            blit_c(s, f["mid"], f"[D] Watch ad  ->  DOUBLE crystals (+{self.crystals})", (120, 230, 255), y)
        y += 60
        blit_c(s, f["small"], "[R] restart     [T] title", (200, 200, 220), y)
        if self.message:
            blit_c(s, f["small"], self.message, (255, 230, 120), y + 50)


# ------------------------------------------------------------------- main ---


def main(selftest=False):
    if selftest:
        os.environ["SDL_VIDEODRIVER"] = "dummy"
        os.environ["SDL_AUDIODRIVER"] = "dummy"
    pygame.init()
    screen = pygame.display.set_mode((W, H))
    pygame.display.set_caption("Orbit Runner")
    clock = pygame.time.Clock()
    game = Game(screen, MockAdProvider())
    if selftest:
        return run_selftest(game)
    while True:
        dt = min(clock.tick(60) / 1000, 0.05)
        for ev in pygame.event.get():
            if ev.type == pygame.QUIT or (ev.type == pygame.KEYDOWN and ev.key == pygame.K_ESCAPE):
                write_save(game.save)
                pygame.quit()
                return
            game.handle(ev)
        game.update(dt)
        game.draw()
        pygame.display.flip()


def run_selftest(game):
    """Drive the game with synthetic input and assert the ad flow works."""
    global SAVE_FILE
    SAVE_FILE = os.devnull
    game.save = {"best": 0, "bank": 0}
    key = lambda k: game.handle(pygame.event.Event(pygame.KEYDOWN, key=k))
    step = lambda secs: [(game.update(1 / 60), game.draw()) for _ in range(int(secs * 60))]

    key(pygame.K_SPACE)
    assert game.state == game.PLAY
    game.crystals = 4
    # play until death (do nothing; meteors will eventually hit)
    for _ in range(60 * 120):
        game.update(1 / 60)
        if game.state == game.OVER:
            break
    game.draw()
    assert game.state == game.OVER, "player never died"
    pygame.image.save(game.screen, "/tmp/orbit_over.png")
    score_at_death = game.score

    # close the ad early -> no reward
    key(pygame.K_c); step(1); key(pygame.K_x)
    assert game.state == game.OVER and not game.continue_used and "no reward" in game.message

    # double-crystals ad, watched fully
    bank_before = game.save["bank"]
    key(pygame.K_d); assert game.ads.showing
    step(2); pygame.image.save(game.screen, "/tmp/orbit_ad.png")
    step(5)
    assert not game.ads.showing and game.double_used and game.save["bank"] == bank_before + game.crystals // 2

    # continue ad, watched fully -> back in play with same score
    game.message = ""
    key(pygame.K_c); step(6)
    assert game.state == game.PLAY and game.continue_used and game.score >= score_at_death
    assert game.invuln > 0  # still protected right after resuming
    step(1)
    pygame.image.save(game.screen, "/tmp/orbit_play.png")
    # second continue must be refused
    for _ in range(60 * 120):
        game.update(1 / 60)
        if game.state == game.OVER:
            break
    key(pygame.K_c)
    assert not game.ads.showing, "continue offered twice"
    key(pygame.K_r)
    assert game.state == game.PLAY and not game.continue_used
    print("SELFTEST OK  (score at first death: %d)" % score_at_death)
    pygame.quit()


if __name__ == "__main__":
    main(selftest="--selftest" in sys.argv)
