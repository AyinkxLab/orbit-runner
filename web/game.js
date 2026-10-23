/* ORBIT RUNNER - mobile/web version (port of orbit_runner.py)
 *
 * Controls
 *   Touch:    swipe UP = outer ring, swipe DOWN = inner ring, TAP = reverse
 *   Keyboard: Up/W, Down/S, Space  (same as the desktop version)
 *
 * Ads: the game only talks to `ads` (an AdProvider). MockAdProvider fakes a
 * 5-second rewarded video. To ship real ads, see AdMobProvider below.
 */
"use strict";

// Logical portrait resolution; the canvas is scaled to fit any screen.
const W = 720, H = 1280, CX = W / 2, CY = H / 2 + 40;
const RINGS = [130, 215, 300];
const SHIELD_COST = 25;
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ------------------------------------------------------------ persistence --
const Save = {
  key: "orbit_runner_save",
  load() {
    try { return Object.assign({ best: 0, bank: 0 }, JSON.parse(localStorage.getItem(this.key))); }
    catch (e) { return { best: 0, bank: 0 }; }
  },
  write(d) { try { localStorage.setItem(this.key, JSON.stringify(d)); } catch (e) {} },
};

// ----------------------------------------------------------------- sound ---
const Sfx = {
  ctx: null,
  unlock() { // browsers require a user gesture before audio can play
    if (!this.ctx && typeof AudioContext !== "undefined") this.ctx = new AudioContext();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },
  tone(freq, ms, vol = 0.2, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(freq, t);
    o.frequency.linearRampToValueAtTime(Math.max(40, freq + slide), t + ms / 1000);
    g.gain.setValueAtTime(vol * 0.3, t);
    g.gain.linearRampToValueAtTime(0, t + ms / 1000);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + ms / 1000);
  },
  play(n) {
    const s = { gem: [880, 80, .2, 400], jump: [300, 60, .15, 200], near: [1200, 50, .12, 0],
      die: [200, 500, .35, -170], reward: [523, 300, .25, 520], shield: [400, 200, .25, -200] }[n];
    if (s) this.tone(...s);
  },
};
const vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

// ------------------------------------------------------------- ad system ---
/* AdProvider interface:
 *   isReady() -> bool
 *   showRewarded(onReward, onClosed)   call onReward() if earned, then onClosed()
 *   update(dt), draw(ctx), handleTap(x,y), handleKey(key), showing
 */
class MockAdProvider {
  constructor() {
    this.DURATION = 5; this.showing = false; this.t = 0;
    this.brands = [
      ["GALAXY GRUB", "Snacks that are out of this world.", "#ffaa3c"],
      ["NEBULA NAPS", "Mattresses tested in zero gravity.", "#8c78ff"],
      ["COMET COLA", "Fizz at the speed of light.", "#ff506e"],
      ["STARLIGHT VPN", "Browse privately across 9 galaxies.", "#3cdcb4"],
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
  // close button lives in the top-right corner
  handleTap(x, y) { if (this.showing && x > W - 140 && y < 140) this.finish(this.t >= this.DURATION); }
  handleKey(k) { if (this.showing && (k === "x" || k === "X" || k === "Escape")) this.finish(this.t >= this.DURATION); }
  draw(c) {
    const [name, slogan, col] = this.brand, t = this.t;
    c.fillStyle = "#0c0a14"; c.fillRect(0, 0, W, H);
    const r = 130 * (1 + 0.08 * Math.sin(t * 6));
    circle(c, W / 2, 470, r, col); circle(c, W / 2, 470, r, "#fff", 5);
    for (let i = 0; i < 8; i++) { const a = t * 2 + i * TAU / 8; circle(c, W / 2 + Math.cos(a) * 210, 470 + Math.sin(a) * 210, 9, col); }
    text(c, "AD · simulated rewarded video", W / 2, 70, 24, "#787890");
    text(c, name, W / 2, 800, 64, "#fff", true);
    text(c, slogan, W / 2, 860, 28, "#c8c8dc");
    c.fillStyle = "#323246"; c.fillRect(110, 960, W - 220, 18);
    c.fillStyle = col; c.fillRect(110, 960, (W - 220) * Math.min(1, t / this.DURATION), 18);
    const left = this.DURATION - t;
    text(c, left > 0 ? `Reward in ${Math.ceil(left)}…` : "Reward earned!", W / 2, 1040, 36, left > 0 ? "#fff" : "#78ff8c", true);
    // close "X": grey (forfeits reward) until the timer is done
    text(c, "✕", W - 70, 85, 56, left > 0 ? "#555" : "#fff", true);
    if (left > 0) text(c, "close = no reward", W - 110, 135, 18, "#555");
  }
}

/* --- Real ads (when packaged with Capacitor, see README) -------------------
class AdMobProvider {
  constructor() { this.showing = false; this.ready = false; this.load(); }
  async load() {
    const { AdMob } = Capacitor.Plugins;
    await AdMob.prepareRewardVideoAd({ adId: "ca-app-pub-XXXX/YYYY" }); this.ready = true;
  }
  isReady() { return this.ready && !this.showing; }
  async showRewarded(onReward, onClosed) {
    const { AdMob } = Capacitor.Plugins; this.showing = true; this.ready = false;
    try { const r = await AdMob.showRewardVideoAd(); if (r) onReward(); } catch (e) {}
    this.showing = false; onClosed(); this.load();
  }
  update() {} draw() {} handleTap() {} handleKey() {}
}
--------------------------------------------------------------------------- */

// --------------------------------------------------------- draw helpers ----
function circle(c, x, y, r, col, line = 0) {
  c.beginPath(); c.arc(x, y, Math.max(0.5, r), 0, TAU);
  if (line) { c.lineWidth = line; c.strokeStyle = col; c.stroke(); } else { c.fillStyle = col; c.fill(); }
}
function text(c, s, x, y, size, col, bold = false, align = "center") {
  c.font = `${bold ? "bold " : ""}${size}px ui-monospace, Menlo, Consolas, monospace`;
  c.fillStyle = col; c.textAlign = align; c.textBaseline = "middle"; c.fillText(s, x, y);
}

// ----------------------------------------------------------------- game ----
class Game {
  constructor(ads) {
    this.ads = ads; this.save = Save.load(); this.state = "title"; this.time = 0;
    this.buyShield = false; this.message = ""; this.buttons = [];
    this.stars = Array.from({ length: 160 }, () => [Math.random() * W, Math.random() * H, Math.random()]);
    this.reset();
  }
  reset() {
    Object.assign(this, { ring: 1, ringVis: RINGS[1], angle: -Math.PI / 2, dir: 1,
      meteors: [], gems: [], parts: [], floats: [], score: 0, crystals: 0, combo: 1, elapsed: 0,
      spawnT: 1, gemT: 1.5, invuln: 1, shield: false, shake: 0, continueUsed: false, doubleUsed: false });
  }
  start() {
    this.reset();
    if (this.buyShield && this.save.bank >= SHIELD_COST) { this.save.bank -= SHIELD_COST; this.shield = true; Save.write(this.save); }
    this.buyShield = false; this.state = "play";
  }
  get level() { return 1 + Math.floor(this.elapsed / 15); }
  playerPos() { return [CX + Math.cos(this.angle) * this.ringVis, CY + Math.sin(this.angle) * this.ringVis]; }
  burst(x, y, cols, n, speed, life) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(0.2, 1) * speed;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, col: pick(cols), life, max: life });
    }
  }
  float(x, y, s, col) { this.floats.push({ x, y, s, col, life: 0.9 }); }

  die() {
    const [x, y] = this.playerPos();
    this.burst(x, y, ["#ffdc5a", "#ff783c", "#fff"], 70, 380, 1.2);
    Sfx.play("die"); vibrate(200); this.shake = 0.5;
    this.save.bank += this.crystals; this.save.best = Math.max(this.save.best, Math.floor(this.score));
    Save.write(this.save); this.message = ""; this.state = "over";
  }

  // ---- ad flow: the game only knows "reward granted" / "closed" ----
  requestAd(kind) {
    if (!this.ads.isReady()) { this.message = "No ad available right now."; return; }
    if (kind === "continue" && !this.continueUsed) this.ads.showRewarded(() => this.rewardContinue(), () => this.adClosed());
    if (kind === "double" && !this.doubleUsed && this.crystals > 0) this.ads.showRewarded(() => this.rewardDouble(), () => this.adClosed());
  }
  rewardContinue() {
    this.continueUsed = true; this.meteors = []; this.invuln = 3;
    this.save.bank -= this.crystals; Save.write(this.save); // re-banked on next death
    this.state = "play"; Sfx.play("reward"); this.float(CX, CY - 60, "SECOND CHANCE!", "#78ff8c");
  }
  rewardDouble() {
    this.doubleUsed = true; this.save.bank += this.crystals; Save.write(this.save);
    this.message = `+${this.crystals} bonus crystals banked!`; this.crystals *= 2; Sfx.play("reward");
  }
  adClosed() { if (this.state === "over" && !this.message) this.message = "Ad closed early – no reward."; }

  // ---- input ----
  action(a) { // a: "up" | "down" | "reverse" | "tap"
    if (this.state === "title") { if (a !== "down") this.start(); return; }
    if (this.state !== "play") return;
    if (a === "up" && this.ring < 2) this.ring++;
    else if (a === "down" && this.ring > 0) this.ring--;
    else if (a === "reverse" || a === "tap") this.dir *= -1;
    else return;
    Sfx.play("jump");
  }
  key(k) {
    if (this.ads.showing) return this.ads.handleKey(k);
    if (this.state === "over") {
      const m = { c: "continue", d: "double" }[k.toLowerCase()];
      if (m) this.requestAd(m);
      if (k.toLowerCase() === "r") this.start();
      if (k.toLowerCase() === "t") this.state = "title";
      return;
    }
    if (this.state === "title" && k.toLowerCase() === "b") { this.toggleShield(); return; }
    if (["ArrowUp", "w", "W"].includes(k)) this.action("up");
    else if (["ArrowDown", "s", "S"].includes(k)) this.action("down");
    else if (k === " " || k === "Enter") this.action("reverse");
  }
  toggleShield() { if (this.save.bank >= SHIELD_COST) this.buyShield = !this.buyShield; }
  tap(x, y) { // menus use on-screen buttons
    if (this.ads.showing) return this.ads.handleTap(x, y);
    for (const b of this.buttons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.fn();
    if (this.state !== "over") this.action("tap");
  }

  // ---- simulation ----
  update(dt) {
    this.time += dt; this.ads.update(dt); this.shake = Math.max(0, this.shake - dt);
    this.parts = this.parts.filter(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .96; p.vy *= .96; return (p.life -= dt) > 0; });
    this.floats = this.floats.filter(f => { f.y -= 50 * dt; return (f.life -= dt) > 0; });
    if (this.state !== "play" || this.ads.showing) return;

    this.elapsed += dt; const lvl = this.level;
    this.invuln = Math.max(0, this.invuln - dt);
    this.score += dt * 10 * lvl;
    this.angle += this.dir * (1.6 + 0.08 * lvl) * dt;
    this.ringVis += (RINGS[this.ring] - this.ringVis) * Math.min(1, dt * 14);
    const [px, py] = this.playerPos();

    if ((this.spawnT -= dt) <= 0) {
      const n = 1 + (Math.random() < Math.min(0.5, lvl * 0.06));
      for (let i = 0; i < n; i++) this.meteors.push({ angle: rand(0, TAU), r: 780, speed: (130 + 16 * lvl) * rand(.8, 1.25),
        size: rand(14, 24), spin: rand(-.25, .25), near: false });
      this.spawnT = Math.max(0.22, 1 - 0.07 * lvl) * rand(.7, 1.2);
    }
    if ((this.gemT -= dt) <= 0 && this.gems.length < 3) {
      this.gems.push({ ring: Math.floor(Math.random() * 3), angle: rand(0, TAU), life: 6 });
      this.gemT = rand(1.2, 2.2);
    }

    const alive = [];
    for (const m of this.meteors) {
      m.r -= m.speed * dt; m.angle += m.spin * dt;
      const mx = CX + Math.cos(m.angle) * m.r, my = CY + Math.sin(m.angle) * m.r;
      const d = Math.hypot(mx - px, my - py), hitR = m.size + 9;
      if (d < hitR) {
        if (this.invuln > 0) { alive.push(m); continue; }
        if (this.shield) { this.shield = false; this.invuln = 1.2; Sfx.play("shield"); vibrate(60); this.burst(mx, my, ["#78c8ff"], 30, 280, .7); continue; }
        this.die(); return;
      }
      if (!m.near && d < hitR + 28 && this.invuln <= 0) {
        m.near = true; const pts = 15 * this.combo; this.score += pts; Sfx.play("near");
        this.float(px, py - 30, `CLOSE! +${pts}`, "#ffe678");
      }
      if (m.r < 50) { this.burst(mx, my, ["#ffa03c"], 8, 140, .5); continue; }
      alive.push(m);
    }
    this.meteors = alive;

    this.gems = this.gems.filter(g => {
      g.life -= dt;
      const gx = CX + Math.cos(g.angle) * RINGS[g.ring], gy = CY + Math.sin(g.angle) * RINGS[g.ring];
      if (Math.hypot(gx - px, gy - py) < 26) {
        this.crystals++; const pts = 25 * this.combo; this.score += pts;
        this.float(gx, gy, `+${pts}`, "#78e6ff"); this.combo = Math.min(8, this.combo + 1);
        Sfx.play("gem"); vibrate(15); this.burst(gx, gy, ["#78e6ff"], 16, 200, .5); return false;
      }
      if (g.life <= 0) { if (this.combo > 1) this.float(gx, gy, "combo lost", "#c86464"); this.combo = 1; return false; }
      return true;
    });
  }

  // ---- render ----
  draw(c) {
    this.buttons = [];
    if (this.ads.showing) return this.ads.draw(c);
    c.fillStyle = "#060610"; c.fillRect(0, 0, W, H);
    const ox = this.shake > 0 ? rand(-8, 8) : 0, oy = this.shake > 0 ? rand(-8, 8) : 0;
    for (const [x, y, b] of this.stars) {
      const v = Math.floor(60 + 120 * b * (0.6 + 0.4 * Math.sin(this.time * 2 + x)));
      c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(x, y, 2, 2);
    }
    const glow = 46 + 5 * Math.sin(this.time * 3);
    ["#501e0a", "#b45014", "#ffb43c"].forEach((col, i) => circle(c, CX + ox, CY + oy, glow + 22 - i * 11, col));
    RINGS.forEach((r, i) => circle(c, CX + ox, CY + oy, r, i === this.ring && this.state === "play" ? "#6e6ebe" : "#3c3c6e", 2));

    for (const g of this.gems) {
      if (g.life < 1.5 && Math.floor(this.time * 10) % 2) continue;
      const gx = CX + Math.cos(g.angle) * RINGS[g.ring] + ox, gy = CY + Math.sin(g.angle) * RINGS[g.ring] + oy;
      const rr = 11 + 3 * Math.sin(this.time * 6);
      c.fillStyle = "#78e6ff"; c.beginPath();
      c.moveTo(gx, gy - rr); c.lineTo(gx + rr * .7, gy); c.lineTo(gx, gy + rr); c.lineTo(gx - rr * .7, gy); c.fill();
    }
    for (const m of this.meteors) {
      const mx = CX + Math.cos(m.angle) * m.r + ox, my = CY + Math.sin(m.angle) * m.r + oy;
      circle(c, mx, my, m.size, "#8c6e64"); circle(c, mx - 4, my - 3, m.size / 3, "#5a463c");
      if (m.r > 380) circle(c, CX + Math.cos(m.angle) * 370, CY + Math.sin(m.angle) * 370, 4, "#ff5050"); // incoming warning
    }
    if (this.state === "play") {
      const [px, py] = this.playerPos();
      if (this.invuln <= 0 || Math.floor(this.time * 12) % 2) {
        const a = this.angle + this.dir * Math.PI / 2;
        c.fillStyle = "#f0f0ff"; c.beginPath();
        c.moveTo(px + Math.cos(a) * 16 + ox, py + Math.sin(a) * 16 + oy);
        c.lineTo(px + Math.cos(a + 2.5) * 12 + ox, py + Math.sin(a + 2.5) * 12 + oy);
        c.lineTo(px + Math.cos(a - 2.5) * 12 + ox, py + Math.sin(a - 2.5) * 12 + oy); c.fill();
      }
      if (this.shield) circle(c, px + ox, py + oy, 22, "#78c8ff", 3);
    }
    for (const p of this.parts) circle(c, p.x, p.y, Math.max(1, 4 * p.life / p.max), p.col);
    for (const f of this.floats) { c.globalAlpha = Math.min(1, f.life * 2); text(c, f.s, f.x, f.y, 26, f.col, true); c.globalAlpha = 1; }

    if (this.state === "title") this.drawTitle(c);
    else { this.drawHud(c); if (this.state === "over") this.drawOver(c); }
  }
  button(c, label, y, col, fn, h = 90, fill = "rgba(255,255,255,0.08)") {
    const x = 80, w = W - 160;
    c.fillStyle = fill; c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, 18) : c.rect(x, y, w, h); c.fill();
    c.lineWidth = 2; c.strokeStyle = col; c.stroke();
    text(c, label, W / 2, y + h / 2, 30, col, true);
    this.buttons.push({ x, y, w, h, fn });
  }
  drawHud(c) {
    text(c, `SCORE ${Math.floor(this.score)}`, 30, 60, 40, "#fff", true, "left");
    text(c, `LEVEL ${this.level}  BEST ${this.save.best}`, 30, 105, 24, "#aaaac8", false, "left");
    text(c, `x${this.combo}`, W - 30, 60, 44, this.combo > 1 ? "#ffe678" : "#9696aa", true, "right");
    text(c, `◆ ${this.crystals}`, W - 30, 105, 26, "#78e6ff", false, "right");
  }
  drawTitle(c) {
    text(c, "ORBIT", W / 2, 150, 96, "#ffc85a", true);
    text(c, "RUNNER", W / 2, 245, 96, "#ffc85a", true);
    text(c, "swipe ↑ outer ring · swipe ↓ inner ring", W / 2, 1000, 26, "#c8c8dc");
    text(c, "tap to reverse · grab ◆ · dodge meteors", W / 2, 1040, 26, "#c8c8dc");
    const p = 0.5 + 0.5 * Math.sin(this.time * 4);
    c.globalAlpha = 0.6 + 0.4 * p; text(c, "TAP TO LAUNCH", W / 2, 1120, 44, "#fff", true); c.globalAlpha = 1;
    text(c, `Best ${this.save.best} · Bank ◆ ${this.save.bank}`, W / 2, 1180, 26, "#78e6ff");
    if (this.save.bank >= SHIELD_COST)
      this.button(c, this.buyShield ? "🛡 Shield: ON" : `🛡 Buy shield (◆${SHIELD_COST})`, 330, "#78c8ff", () => this.toggleShield(), 80);
  }
  drawOver(c) {
    c.fillStyle = "rgba(0,0,0,0.7)"; c.fillRect(0, 0, W, H);
    text(c, "SHIP DESTROYED", W / 2, 300, 60, "#ff5a5a", true);
    text(c, `Score ${Math.floor(this.score)}   ◆ ${this.crystals}`, W / 2, 380, 34, "#fff", true);
    let y = 480;
    if (!this.continueUsed) {
      const g = Math.floor(200 + 55 * Math.sin(this.time * 5));
      this.button(c, "▶ Watch ad → CONTINUE", y, `rgb(${g},255,${g})`, () => this.requestAd("continue"), 110, "rgba(60,140,40,0.45)");
    } else text(c, "(continue already used this run)", W / 2, y + 55, 24, "#828296");
    y += 140;
    if (!this.doubleUsed && this.crystals > 0)
      this.button(c, `▶ Watch ad → DOUBLE ◆ (+${this.crystals})`, y, "#78e6ff", () => this.requestAd("double"));
    y += 120;
    this.button(c, "Restart", y, "#c8c8dc", () => this.start());
    this.button(c, "Title", y + 110, "#c8c8dc", () => { this.state = "title"; });
    if (this.message) text(c, this.message, W / 2, y + 260, 26, "#ffe678");
  }
}

// ------------------------------------------------------------ bootstrap ----
function boot() {
  const canvas = document.getElementById("game"), ctx = canvas.getContext("2d");
  const game = new Game(new MockAdProvider());
  window.game = game; // handy for debugging in the browser console

  // letterbox-scale the logical 720x1280 canvas to the window, crisp on hi-dpi
  let scale = 1;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = W * scale + "px"; canvas.style.height = H * scale + "px";
    canvas.width = W * scale * dpr; canvas.height = H * scale * dpr;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }
  window.addEventListener("resize", resize); resize();
  const toLogical = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale]; };

  // swipe vs tap detection via pointer events (works for touch + mouse)
  let start = null;
  canvas.addEventListener("pointerdown", e => { Sfx.unlock(); start = { p: toLogical(e), t: performance.now() }; e.preventDefault(); });
  canvas.addEventListener("pointerup", e => {
    if (!start) return;
    const [x, y] = toLogical(e), dy = y - start.p[1], dx = x - start.p[0];
    if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx) && game.state === "play" && !game.ads.showing) game.action(dy < 0 ? "up" : "down");
    else game.tap(...start.p);
    start = null;
  });
  window.addEventListener("keydown", e => { Sfx.unlock(); game.key(e.key); if (e.key === " ") e.preventDefault(); });

  let last = performance.now();
  (function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    game.update(dt); game.draw(ctx);
    requestAnimationFrame(loop);
  })(last);

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js");
}

if (typeof module !== "undefined") module.exports = { Game, MockAdProvider, Save, W, H };
else window.addEventListener("load", boot);
