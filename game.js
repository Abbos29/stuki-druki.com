// HUGA vs BIG RUSSIAN BOSS — маленькая пиксельная игра на canvas
(() => {
  const W = 640, H = 360, FLOOR = 330, G = 1300;
  const FONT = '"Press Start 2P", monospace';
  const ULT_TEXT = 'LIFE IS GOOOOOD!';
  // тайминги ульты, секунды от начала: вспышка → аниме-заставка → заряд → луч → финал
  const ULT = { flash: 0.25, cut: 1.65, charge: 2.25, beam: 3.45, end: 3.9 };
  const $ = id => document.getElementById(id);
  const modal = $('game'), canvas = $('gameCanvas'), ctx = canvas.getContext('2d'), ultBtn = $('gameUlt');

  const load = src => Object.assign(new Image(), { src });
  const IMG = {
    huga: load('game/huga-sheet.png'), boss: load('game/boss-sheet.png'),
    bg: load('game/bg.png'), cover: load('game/cover.jpg'), cutin: load('game/cutin.jpg'),
  };
  // спрайт-листы: одна строка одинаковых ячеек, персонаж стоит на нижней границе ячейки
  const SHEET = {
    huga: { n: 10, idle: [0, 1], walk: [2, 3, 4, 3], jump: [5], attack: [6], hurt: [7], ult: [8], win: [9] },
    boss: { n: 8, idle: [0, 1], walk: [2, 3], attack: [4], stomp: [5], hurt: [6], laugh: [7] },
  };

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.random() * a.length | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut = t => 1 - (1 - clamp(t, 0, 1)) ** 3;
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  const JOKES = ['ХА!', 'ХА-ХА', 'ЛОЛ', 'ШУТКА!', 'ОДНАЖДЫ...'];
  const TAUNTS = ['Я БОСС!', 'ЗОЛОТО!', 'ГДЕ МОЙ ОСКАР?', 'ДЕНЕГ ХВАТИТ!', 'ЭТО BIG BOSS!', 'ТЫ КТО, ХЕТАГ?', 'ТЕПЛЕЕ ГИБРАЛТАРА!'];
  const HUGA_LINES = ['ОДНАЖДЫ В...', 'ДАЙ МИКРОФОН', 'СМЕШНО ЖЕ!', 'ПОДПИШИСЬ!'];
  const CONFETTI = ['#ffd23f', '#ff4d4d', '#4dd2ff', '#7dff7d', '#ff8f5a', '#fff'];
  const GOLD = ['#ffd23f', '#fff3a0', '#ff8f2a', '#fff'];

  // ---------- звук ----------
  let actx = null, muted = false;
  const audio = () => (actx = actx || new (window.AudioContext || window.webkitAudioContext)());
  function beep(freq, dur = 0.08, type = 'square', vol = 0.05, slide = 0) {
    if (muted) return;
    try {
      const a = audio(), o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(a.destination);
      o.start(t);
      o.stop(t + dur);
    } catch (e) {}
  }
  function noise(dur, vol = 0.06) {
    if (muted) return;
    try {
      const a = audio(), buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const s = a.createBufferSource(), g = a.createGain();
      s.buffer = buf; g.gain.value = vol;
      s.connect(g).connect(a.destination);
      s.start();
    } catch (e) {}
  }
  const melody = (notes, step) => notes.forEach((f, i) => setTimeout(() => beep(f, step / 1000 + 0.05, 'square', 0.05), i * step));

  // ---------- состояние ----------
  let state = 'title', p, boss, shots, hazards, fx = [], pickups, ult = null;
  let time = 0, clock = 0, shake = 0, heartT = 0, lock = 0, best = 0;
  try { best = +localStorage.getItem('hugaBest') || 0; } catch (e) {}

  const say = (who, text, t = 1.5) => { who.say = { text, t }; };
  const playerBox = () => ({ x: p.x - 16, y: p.y - 92, w: 32, h: 90 });
  const bossBox = () => ({ x: boss.x - 40, y: boss.y - 140, w: 80, h: 138 });

  function start() {
    if (lock > 0) return;
    state = 'play'; time = 0; shake = 0; heartT = 10; ult = null;
    p = { x: 90, y: FLOOR, vy: 0, face: 1, hp: 5, inv: 0, cd: 0, atkT: 0, ground: true, energy: 0, say: null };
    boss = { x: 520, y: FLOOR, vy: 0, hp: 40, max: 40, atk: 2, tx: 520, hurtT: 0, poseT: 0, stomp: false, say: null };
    shots = []; hazards = []; fx = []; pickups = [];
    say(boss, 'Я БОСС!', 1.8);
    beep(220, 0.15, 'square', 0.05, 440);
  }

  function win() {
    state = 'win'; lock = 0.8; shake = 0.5; ult = null; p.y = FLOOR;
    if (!best || time < best) {
      best = time;
      try { localStorage.setItem('hugaBest', best.toFixed(1)); } catch (e) {}
    }
    say(boss, 'ХА-ХА! ЛАДНО, ТЫ СМЕШНОЙ!', 99);
    say(p, 'LIFE IS GOOOOD!', 99);
    for (let i = 0; i < 90; i++) fx.push({ conf: true, x: rnd(0, W), y: rnd(-200, 0), vy: rnd(60, 160), c: pick(CONFETTI), t: 5 });
    melody([523, 659, 784, 1046], 140);
  }

  function lose() {
    state = 'lose'; lock = 0.8;
    say(boss, 'BIG BOSS НЕ СМЕЁТСЯ', 99);
    melody([392, 330, 262, 196], 180);
  }

  function addEnergy(v) {
    if (p.energy >= 100) return;
    p.energy = Math.min(100, p.energy + v);
    if (p.energy >= 100) {
      fx.push({ x: p.x, y: p.y - 130, text: 'УЛЬТА ГОТОВА!', t: 1.2, c: '#ffd23f' });
      melody([784, 988, 1175], 70);
    }
  }

  function hurt() {
    if (p.inv > 0 || state !== 'play' || ult) return;
    p.hp--; p.inv = 1.2; shake = 0.25;
    beep(110, 0.25, 'sawtooth', 0.06, -60);
    fx.push({ x: p.x, y: p.y - 110, text: 'АЙ!', t: 0.8, c: '#ff4d4d' });
    addEnergy(12);
    if (p.hp <= 0) lose();
  }

  function damageBoss(byUlt) {
    boss.hp--; boss.hurtT = byUlt ? 0.2 : 0.14;
    if (!byUlt) { beep(140, 0.08, 'sawtooth', 0.04); addEnergy(9); }
    fx.push({ x: boss.x + rnd(-30, 30), y: boss.y - rnd(120, 160), text: byUlt ? pick(['-1', 'GOOD!', 'LIFE!']) : pick(['-1', 'ХА', 'ХЫ']), t: 0.8, c: byUlt ? '#fff3a0' : '#ffe14d' });
    if (boss.hp <= 0) return win();
    if (boss.hp === 26) { say(boss, 'ТЫ ЧЁ, СМЕШНО?!', 2); shake = 0.3; }
    if (boss.hp === 13) { say(boss, 'ЩА БУДЕТ ДОЖДЬ ИЗ ДЕНЕГ!', 2); shake = 0.3; }
  }

  function throwChain(phase) {
    boss.poseT = 0.35;
    for (let i = 0; i < (phase === 2 ? 2 : 1); i++) {
      const dir = p.x < boss.x ? -1 : 1;
      const sx = boss.x + dir * 60, sy = boss.y - 80, T = rnd(0.8, 1.1) - phase * 0.08;
      const tx = p.x + rnd(-30, 30) + i * rnd(-90, 90), ty = p.y - 45;
      hazards.push({ kind: 'chain', x: sx, y: sy, vx: (tx - sx) / T, vy: (ty - sy - 0.5 * 900 * T * T) / T, g: 900, r: 10, rot: 0 });
    }
    beep(500, 0.1, 'triangle', 0.04, -300);
  }

  function moneyRain(phase) {
    boss.poseT = 0.35;
    for (let i = 0; i < 4 + phase * 3; i++)
      hazards.push({ kind: 'money', x: rnd(20, W - 20), y: rnd(-140, -10), vx: 0, vy: rnd(90, 150) + phase * 30, g: 0, sway: rnd(0, 6) });
    beep(880, 0.15, 'triangle', 0.03, 400);
  }

  function hazardBox(h) {
    if (h.kind === 'chain') return { x: h.x - h.r, y: h.y - h.r, w: h.r * 2, h: h.r * 2 };
    if (h.kind === 'money') return { x: h.x - 11, y: h.y - 6, w: 22, h: 12 };
    return { x: h.x - 12, y: FLOOR - 22, w: 24, h: 22 };
  }

  // ---------- ульта LIFE IS GOOOOD ----------
  function startUlt() {
    if (state !== 'play' || ult || p.energy < 100) return;
    p.energy = 0;
    ult = { t: 0, letters: 0, hits: 0, tick: 0, dir: boss.x >= p.x ? 1 : -1 };
    p.face = ult.dir;
    noise(0.35, 0.08);
    beep(1046, 0.3, 'square', 0.05, -600);
  }

  function updateUlt(dt) {
    const prev = ult.t, t = (ult.t += dt);
    const crossed = mark => prev < mark && t >= mark;

    if (t > ULT.flash && t < ULT.cut) {
      const n = clamp(Math.floor((t - ULT.flash - 0.2) / 0.05), 0, ULT_TEXT.length);
      while (ult.letters < n) { ult.letters++; beep(320 + ult.letters * 50, 0.05, 'square', 0.035); }
    }
    if (crossed(ULT.cut)) {
      say(p, 'LIFE IS GOOOOD!', 1.6);
      beep(180, 0.6, 'sawtooth', 0.05, 1100);
      beep(270, 0.6, 'square', 0.03, 1600);
    }
    if (t > ULT.cut && t < ULT.beam) {
      p.y = FLOOR - 14 * easeOut((t - ULT.cut) / 0.3);
      for (let i = 0; i < 3; i++)
        fx.push({ x: p.x + rnd(-30, 30), y: p.y - rnd(0, 100), vy: -rnd(60, 160), c: pick(GOLD), t: rnd(0.3, 0.7), spark: true });
    }
    if (crossed(ULT.charge)) {
      for (const h of hazards)
        for (let i = 0; i < 4; i++) fx.push({ x: h.x + rnd(-8, 8), y: h.y + rnd(-8, 8), vy: -rnd(30, 90), c: pick(GOLD), t: 0.6, spark: true });
      hazards = []; shots = [];
      shake = 0.2;
      noise(1.2, 0.07);
      beep(70, 1.2, 'sawtooth', 0.06, 50);
    }
    if (t >= ULT.charge && t < ULT.beam) {
      shake = Math.max(shake, 0.08);
      boss.x = clamp(boss.x + ult.dir * 45 * dt, 50, W - 50);
      if ((ult.tick -= dt) <= 0 && ult.hits < 12) {
        ult.tick = 0.09; ult.hits++;
        damageBoss(true);
        if (state !== 'play') return;
        for (let i = 0; i < 6; i++) fx.push({ x: boss.x - ult.dir * 30 + rnd(-10, 10), y: boss.y - 75 + rnd(-30, 30), vy: -rnd(-120, 120), c: pick(GOLD), t: 0.35, spark: true });
      }
    }
    if (t >= ULT.beam) p.y = Math.min(FLOOR, p.y + 200 * dt);
    if (t >= ULT.end) {
      p.y = FLOOR; p.inv = 0.6; ult = null;
      say(boss, 'ЖИЗНЬ... ХОРОША...', 2);
    }
  }

  // ---------- логика ----------
  function update(dt) {
    clock += dt;
    lock -= dt;
    shake = Math.max(0, shake - dt);
    for (const f of fx) { f.t -= dt; f.y += (f.vy ?? -30) * dt; }
    fx = fx.filter(f => f.t > 0);
    if (state !== 'play') return;

    for (const who of [p, boss]) if (who.say) who.say.t -= dt;
    boss.hurtT -= dt;
    if (ult) return updateUlt(dt);
    time += dt;

    // Хуга
    if (keys.left) { p.x -= 190 * dt; p.face = -1; }
    if (keys.right) { p.x += 190 * dt; p.face = 1; }
    p.x = clamp(p.x, 24, W - 24);
    if (keys.jump && p.ground) { p.vy = -520; p.ground = false; beep(330, 0.12, 'square', 0.04, 330); }
    p.vy += G * dt; p.y += p.vy * dt;
    if (p.y >= FLOOR) { p.y = FLOOR; p.vy = 0; p.ground = true; }
    p.inv -= dt; p.cd -= dt; p.atkT -= dt;
    addEnergy(4 * dt);
    if (keys.fire && p.cd <= 0) {
      p.cd = 0.3; p.atkT = 0.18;
      shots.push({ x: p.x + p.face * 40, y: p.y - 70, vx: 380 * p.face, text: pick(JOKES) });
      beep(660, 0.06, 'square', 0.03, 220);
      if (Math.random() < 0.08) say(p, pick(HUGA_LINES));
    }

    // шутки летят в Босса
    for (const s of shots) {
      s.x += s.vx * dt;
      if (overlap({ x: s.x - 14, y: s.y - 6, w: 28, h: 12 }, bossBox())) { s.dead = true; damageBoss(); if (state !== 'play') return; }
      if (s.x < -60 || s.x > W + 60) s.dead = true;
    }

    // Босс
    const phase = boss.hp > 26 ? 0 : boss.hp > 13 ? 1 : 2;
    boss.poseT -= dt;
    if (Math.abs(boss.tx - boss.x) < 4) boss.tx = rnd(380, 590);
    if (boss.y >= FLOOR && boss.poseT <= 0) boss.x += Math.sign(boss.tx - boss.x) * (40 + phase * 25) * dt;
    boss.vy += G * dt; boss.y += boss.vy * dt;
    if (boss.y >= FLOOR) {
      if (boss.stomp) {
        boss.stomp = false; shake = 0.35;
        beep(70, 0.3, 'sawtooth', 0.07, -30);
        const v = 250 + phase * 60;
        hazards.push({ kind: 'wave', x: boss.x - 40, y: FLOOR, vx: -v, vy: 0, g: 0 });
        hazards.push({ kind: 'wave', x: boss.x + 40, y: FLOOR, vx: v, vy: 0, g: 0 });
      }
      boss.y = FLOOR; boss.vy = 0;
    }
    boss.atk -= dt;
    if (boss.atk <= 0) {
      boss.atk = [1.7, 1.25, 0.9][phase];
      const r = Math.random();
      if (r < 0.45) throwChain(phase);
      else if (r < 0.75) moneyRain(phase);
      else if (boss.y >= FLOOR) { boss.vy = -560; boss.stomp = true; }
      if (Math.random() < 0.35) say(boss, pick(TAUNTS));
    }
    if (overlap(playerBox(), bossBox())) { hurt(); p.x += p.x < boss.x ? -50 : 50; }

    // цепи, деньги, ударная волна
    for (const h of hazards) {
      h.vy += h.g * dt; h.x += h.vx * dt; h.y += h.vy * dt;
      if (h.kind === 'money') h.x += Math.sin(time * 4 + h.sway) * 30 * dt;
      if (h.kind === 'chain') h.rot += dt * 10;
      if ((h.kind !== 'wave' && h.y > FLOOR) || h.x < -60 || h.x > W + 60) h.dead = true;
      if (!h.dead && overlap(hazardBox(h), playerBox())) { hurt(); if (h.kind !== 'wave') h.dead = true; }
    }

    // лайки лечат
    heartT -= dt;
    if (heartT <= 0) { heartT = rnd(9, 14); if (p.hp < 5) pickups.push({ x: rnd(40, 360), y: -20, t: 0 }); }
    for (const k of pickups) {
      k.y = Math.min(FLOOR - 12, k.y + 110 * dt); k.t += dt;
      if (k.t > 9) k.dead = true;
      if (overlap({ x: k.x - 10, y: k.y - 10, w: 20, h: 20 }, playerBox())) {
        k.dead = true; p.hp = Math.min(5, p.hp + 1);
        beep(990, 0.15, 'square', 0.04, 600);
        fx.push({ x: k.x, y: k.y - 24, text: '+ЛАЙК', t: 0.9, c: '#7dff7d' });
      }
    }

    shots = shots.filter(s => !s.dead);
    hazards = hazards.filter(h => !h.dead);
    pickups = pickups.filter(k => !k.dead);
  }

  // ---------- отрисовка ----------
  function fill(img, alignBottom) {
    if (!img.naturalWidth) { ctx.fillStyle = '#1c2529'; ctx.fillRect(0, 0, W, H); return; }
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, (W - w) / 2, alignBottom ? H - h : (H - h) / 2, w, h);
  }

  function sprite(name, anim, fps, x, y, flip) {
    const img = IMG[name], sh = SHEET[name];
    if (!img.naturalWidth) return;
    const frames = sh[anim], i = frames[Math.floor(clock * fps) % frames.length];
    const cw = img.naturalWidth / sh.n, ch = img.naturalHeight;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, i * cw, 0, cw, ch, -cw / 2, -ch, cw, ch);
    ctx.restore();
  }

  function hugaAnim() {
    if (ult && ult.t > ULT.cut) return 'ult';
    if (state === 'win') return 'win';
    if (state === 'lose' || p.inv > 0.9) return 'hurt';
    if (!p.ground) return 'jump';
    if (p.atkT > 0) return 'attack';
    if ((keys.left || keys.right) && state === 'play' && !ult) return 'walk';
    return 'idle';
  }

  function bossAnim() {
    if (state === 'win') return 'laugh';
    if (boss.hurtT > 0 || (ult && ult.t > ULT.charge)) return 'hurt';
    if (boss.y < FLOOR) return 'stomp';
    if (boss.poseT > 0) return 'attack';
    if (Math.abs(boss.tx - boss.x) > 4 && state === 'play' && !ult) return 'walk';
    return 'idle';
  }

  function shadow(x, w) {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(x, FLOOR + 1, w, 5, 0, 0, 7); ctx.fill();
  }

  function text(t, x, y, size, color, align = 'center') {
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 2.5); ctx.strokeStyle = '#000'; ctx.lineJoin = 'round';
    ctx.strokeText(t, x, y);
    ctx.fillStyle = color; ctx.fillText(t, x, y);
  }

  function bubble(who, x, y) {
    if (!who.say || who.say.t <= 0) return;
    ctx.font = `8px ${FONT}`;
    const w = ctx.measureText(who.say.text).width + 14;
    const bx = Math.round(clamp(x - w / 2, 4, W - w - 4));
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.fillRect(bx, y - 20, w, 20); ctx.strokeRect(bx, y - 20, w, 20);
    ctx.fillRect(x - 4, y - 1, 8, 6);
    ctx.fillStyle = '#000'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(who.say.text, bx + 7, y - 9);
  }

  const HEART = ['01100110', '11111111', '11111111', '01111110', '00111100', '00011000'];
  function heart(x, y, s, color) {
    ctx.fillStyle = color;
    HEART.forEach((row, j) => [...row].forEach((c, i) => c === '1' && ctx.fillRect(x + i * s, y + j * s, s, s)));
  }

  // аниме-линии скорости, расходящиеся из точки
  function radial(cx, cy, n, color, alpha, inner = 40) {
    ctx.save();
    ctx.globalAlpha = alpha; ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.04, 0.04), w = rnd(0.008, 0.03), r0 = inner + rnd(0, 60);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a - w) * 900, cy + Math.sin(a - w) * 900);
      ctx.lineTo(cx + Math.cos(a + w) * 900, cy + Math.sin(a + w) * 900);
      ctx.fill();
    }
    ctx.restore();
  }

  function aura(x, y, r) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 4, x, y, r);
    g.addColorStop(0, 'rgba(255,240,150,.9)');
    g.addColorStop(0.45, 'rgba(255,190,40,.45)');
    g.addColorStop(1, 'rgba(255,120,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.75, r, 0, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawBeam(t) {
    const grow = easeOut((t - ULT.charge) / 0.12) * clamp((ULT.beam - t) / 0.2, 0, 1);
    const x0 = p.x + ult.dir * 40, y0 = p.y - 72, x1 = ult.dir > 0 ? W + 40 : -40;
    const left = Math.min(x0, x1), len = Math.abs(x1 - x0), wob = Math.sin(clock * 70) * 3;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [h, c, a] of [[64, '#ff5a1f', 0.45], [42, '#ffb020', 0.8], [24, '#fff3a0', 1], [10, '#fff', 1]]) {
      const hh = (h + wob) * grow;
      ctx.globalAlpha = a; ctx.fillStyle = c;
      ctx.fillRect(left, y0 - hh / 2, len, hh);
      ctx.beginPath(); ctx.arc(x0, y0, hh * 0.65, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#fff';
    for (let i = 0; i < 16; i++) {
      const sx = left + ((i * 83 + clock * 1600 * ult.dir) % len + len) % len;
      ctx.fillRect(sx, y0 + rnd(-18, 18) * grow, rnd(10, 40), 2);
    }
    ctx.restore();
    if (grow > 0.5) text('LIFE IS GOOOOOD!', W / 2, y0 - 46, 12, pick(['#fff3a0', '#ffd23f']));
  }

  function drawCutin(t) {
    const local = t - ULT.flash, dur = ULT.cut - ULT.flash;
    ctx.fillStyle = 'rgba(10,0,0,.82)'; ctx.fillRect(0, 0, W, H);
    radial(W / 2, H / 2, 48, '#b0001a', 0.55, 20);

    const bandH = 180, by = 70;
    const off = (1 - easeOut(local / 0.18)) * -W + (local > dur - 0.16 ? easeOut((local - dur + 0.16) / 0.16) * W : 0);
    ctx.save();
    ctx.translate(off, 0);
    ctx.beginPath();
    ctx.moveTo(40, by); ctx.lineTo(W + 10, by); ctx.lineTo(W - 30, by + bandH); ctx.lineTo(-10, by + bandH); ctx.closePath();
    ctx.save();
    ctx.clip();
    const img = IMG.cutin, z = 1 + local * 0.06;
    if (img.naturalWidth) {
      const s = Math.max(W / img.naturalWidth, bandH / img.naturalHeight) * z;
      const w = img.naturalWidth * s, h = img.naturalHeight * s;
      ctx.drawImage(img, (W - w) / 2 - local * 20, by + (bandH - h) / 2, w, h);
    }
    ctx.globalAlpha = 0.55; ctx.fillStyle = '#fff';
    for (let i = 0; i < 22; i++) {
      const y = by + ((i * 53) % bandH), x = ((i * 137 - clock * 2200) % (W + 300) + W + 300) % (W + 300) - 150;
      ctx.fillRect(x, y, 60 + (i * 31) % 90, 2);
    }
    ctx.restore();
    ctx.lineWidth = 5; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
    ctx.restore();

    text('СУПЕРПРИЁМ ХУГИ', 26 + off, by - 14, 10, '#ff4d4d', 'left');

    const size = 26, y = by + bandH + 8, x0 = W - 22 - ULT_TEXT.length * size;
    for (let i = 0; i < ult.letters; i++) {
      const age = local - 0.2 - i * 0.05, s = 1 + Math.max(0, 0.18 - age) * 10;
      const flashWhite = local > dur - 0.35 && (clock * 20 | 0) % 2;
      ctx.save();
      ctx.translate(x0 + i * size + size / 2 + rnd(-1.5, 1.5), y + rnd(-1.5, 1.5));
      ctx.scale(s, s);
      text(ULT_TEXT[i], 3, 3, size, '#c4001a');
      text(ULT_TEXT[i], 0, 0, size, flashWhite ? '#fff' : '#ffe14d');
      ctx.restore();
    }
  }

  function drawWorld() {
    fill(IMG.bg, true);
    const t = ult ? ult.t : 0;
    if (ult && t > ULT.cut) {
      const k = t < ULT.beam ? 1 : clamp((ULT.end - t) / (ULT.end - ULT.beam), 0, 1);
      ctx.fillStyle = `rgba(40,10,0,${0.55 * k})`; ctx.fillRect(0, 0, W, H);
      radial(p.x, p.y - 60, 40, '#ffd23f', 0.35 * k, 60);
    }

    for (const k of pickups) heart(k.x - 8, k.y - 6, 2, Math.sin(clock * 10) > 0 ? '#ff2a4a' : '#ff7d93');

    // Босс
    shadow(boss.x, 46);
    const bob = boss.y >= FLOOR && bossAnim() === 'idle' ? Math.sin(clock * 3) * 2 : 0;
    sprite('boss', bossAnim(), 3, boss.x, boss.y + bob, p.x > boss.x);

    // Хуга
    shadow(p.x, 22);
    if (ult && t > ULT.cut) aura(p.x, p.y - 55, 80 + Math.sin(clock * 30) * 6);
    const anim = hugaAnim();
    if (ult || !(p.inv > 0 && anim !== 'hurt' && (clock * 20 | 0) % 2)) sprite('huga', anim, anim === 'walk' ? 10 : 2.5, p.x, p.y, p.face < 0);

    for (const s of shots) text(s.text, s.x, s.y, 10, '#ffe14d');

    for (const h of hazards) {
      if (h.kind === 'chain') {
        ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.rot);
        ctx.beginPath(); ctx.ellipse(0, 0, h.r, h.r * 0.6, 0, 0, 7);
        ctx.strokeStyle = '#6b4500'; ctx.lineWidth = 6; ctx.stroke();
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3; ctx.stroke();
        ctx.restore();
      } else if (h.kind === 'money') {
        ctx.fillStyle = '#1e5e2a'; ctx.fillRect(h.x - 12, h.y - 7, 24, 14);
        ctx.fillStyle = '#9fe08a'; ctx.fillRect(h.x - 10, h.y - 5, 20, 10);
        ctx.fillStyle = '#1e5e2a'; ctx.font = `7px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('€', h.x, h.y + 1);
      } else {
        const f = Math.sin(clock * 30) * 3;
        ctx.fillStyle = '#ff5a1f';
        ctx.beginPath(); ctx.moveTo(h.x - 14, FLOOR); ctx.lineTo(h.x - 7, FLOOR - 20 - f); ctx.lineTo(h.x, FLOOR - 10);
        ctx.lineTo(h.x + 7, FLOOR - 24 + f); ctx.lineTo(h.x + 14, FLOOR); ctx.fill();
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.moveTo(h.x - 8, FLOOR); ctx.lineTo(h.x - 3, FLOOR - 10); ctx.lineTo(h.x + 3, FLOOR - 13); ctx.lineTo(h.x + 8, FLOOR); ctx.fill();
      }
    }

    if (ult && t >= ULT.charge && t < ULT.beam) drawBeam(t);

    bubble(boss, boss.x, boss.y - 158);
    bubble(p, p.x, p.y - 112);

    for (const f of fx) {
      if (f.conf) { ctx.fillStyle = f.c; ctx.fillRect(f.x + Math.sin(f.y / 12) * 6, f.y, 4, 4); }
      else if (f.spark) { ctx.fillStyle = f.c; ctx.fillRect(f.x, f.y, 3, 3); }
      else text(f.text, f.x, f.y, 10, f.c);
    }
  }

  function drawHUD() {
    text('HUGA', 12, 16, 10, '#fff', 'left');
    for (let i = 0; i < 5; i++) heart(12 + i * 20, 28, 2, i < p.hp ? '#ff2a4a' : '#3a3a3a');
    const full = p.energy >= 100, blink = full && (clock * 6 | 0) % 2;
    text('ULT', 12, 52, 7, full ? '#ffd23f' : '#aaa', 'left');
    ctx.fillStyle = '#000'; ctx.fillRect(38, 47, 64, 10);
    ctx.fillStyle = full ? (blink ? '#fff' : '#ffd23f') : '#4dd2ff';
    ctx.fillRect(39, 48, 62 * p.energy / 100, 8);
    if (full && state === 'play' && !ult) text('E', 110, 52, 7, blink ? '#fff' : '#ffd23f', 'left');

    text('BIG RUSSIAN BOSS', W - 12, 16, 10, '#ffd23f', 'right');
    ctx.fillStyle = '#000'; ctx.fillRect(W - 214, 28, 202, 12);
    ctx.fillStyle = '#3a3a3a'; ctx.fillRect(W - 213, 29, 200, 10);
    ctx.fillStyle = boss.hp > 13 ? '#ffd23f' : '#ff4d4d'; ctx.fillRect(W - 213, 29, 200 * Math.max(0, boss.hp) / boss.max, 10);
    text(time.toFixed(1) + 's', W / 2, 16, 10, '#fff');
  }

  function overlay(title, color, sub) {
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 120, W, 120);
    text(title, W / 2, 152, 16, color);
    text(sub, W / 2, 186, 9, '#fff');
    if ((performance.now() / 500 | 0) % 2) text('ПРОБЕЛ ИЛИ ТАП — ЕЩЁ РАЗ', W / 2, 218, 9, '#ffd23f');
  }

  function draw() {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (shake > 0) ctx.translate(rnd(-4, 4), rnd(-4, 4));
    if (state === 'title') {
      fill(IMG.cover, false);
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(0, H - 74, W, 74);
      if ((performance.now() / 500 | 0) % 2) text('ПРОБЕЛ ИЛИ ТАП — СТАРТ', W / 2, H - 52, 12, '#ffd23f');
      text('← → ХОДИТЬ  ↑ ПРЫЖОК  ПРОБЕЛ ШУТКА  E УЛЬТА', W / 2, H - 28, 8, '#fff');
      if (best) text('РЕКОРД: ' + best.toFixed(1) + 's', W / 2, H - 12, 7, '#7dff7d');
    } else {
      // во время заряда и луча камера наезжает на дуэль, оба героя остаются в кадре
      const t = ult ? ult.t : 0;
      const a = Math.min(p.x, boss.x), b = Math.max(p.x, boss.x);
      const zMax = clamp((W - 160) / Math.max(1, b - a), 1, 1.18);
      const z = !ult || t < ULT.cut ? 1 : 1 + (zMax - 1) * easeOut((t - ULT.cut) / 0.35) * clamp((ULT.end - t) / (ULT.end - ULT.beam), 0, 1);
      const mid = clamp((a + b) / 2, W / (2 * z), W - W / (2 * z)), cy = FLOOR - 70;
      ctx.save();
      ctx.translate(W / 2, cy); ctx.scale(z, z); ctx.translate(-mid, -cy);
      drawWorld();
      ctx.restore();
      if (ult && t >= ULT.charge && t < ULT.charge + 0.15) { ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - (t - ULT.charge) / 0.15)})`; ctx.fillRect(0, 0, W, H); }
      drawHUD();
      if (ult && t < ULT.flash) { ctx.fillStyle = `rgba(255,255,255,${1 - t / ULT.flash})`; ctx.fillRect(0, 0, W, H); }
      if (ult && t >= ULT.flash && t < ULT.cut) drawCutin(t);
      if (state === 'win') overlay('БОСС ПОВЕРЖЕН СМЕХОМ!', '#7dff7d', 'ВРЕМЯ: ' + time.toFixed(1) + 's   РЕКОРД: ' + best.toFixed(1) + 's');
      if (state === 'lose') overlay('БОСС ОКАЗАЛСЯ БОГАЧЕ...', '#ff4d4d', 'У БОССА ОСТАЛОСЬ ' + boss.hp + ' HP. ПОПРОБУЙ ЕЩЁ!');
    }
    ctx.restore();
    syncUltButton();
  }

  // кнопка ульты под игровым полем
  let ultShown = '';
  function syncUltButton() {
    const e = state === 'play' && p ? Math.floor(p.energy) : 0;
    const ready = state === 'play' && !ult && e >= 100;
    const key = e + (ready ? 'r' : '') + (ult ? 'u' : '');
    if (key === ultShown) return;
    ultShown = key;
    ultBtn.style.setProperty('--e', e + '%');
    ultBtn.classList.toggle('ready', ready);
    ultBtn.disabled = !ready;
    ultBtn.querySelector('span').textContent = ult ? 'LIFE IS GOOOOOD!!!' : ready ? '⚡ LIFE IS GOOOOD! ⚡' : `УЛЬТА ${e}%`;
  }

  // ---------- ввод ----------
  const keys = {};
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump',
    Space: 'fire', KeyJ: 'fire', Enter: 'fire', KeyE: 'ult', KeyQ: 'ult', ShiftLeft: 'ult', ShiftRight: 'ult',
  };
  function press(k) {
    if (k === 'ult') return startUlt();
    if (state !== 'play' && (k === 'fire' || k === 'jump')) start();
    keys[k] = true;
  }

  addEventListener('keydown', e => {
    if (modal.hidden) return;
    if (e.code === 'Escape') return close();
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    if (!e.repeat) press(k);
  });
  addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
  document.querySelectorAll('.game-pad [data-k]').forEach(b => {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', e => { e.preventDefault(); press(k); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => b.addEventListener(t, () => { keys[k] = false; }));
  });
  ultBtn.addEventListener('pointerdown', e => { e.preventDefault(); startUlt(); });
  canvas.addEventListener('pointerdown', () => { if (state !== 'play') start(); });

  // ---------- окно игры ----------
  let raf = 0, last = 0;
  function loop(now) {
    update(Math.min(0.033, (now - last) / 1000));
    last = now;
    draw();
    raf = requestAnimationFrame(loop);
  }
  function open() {
    modal.hidden = false;
    document.body.classList.add('game-open');
    document.fonts && document.fonts.load(`10px ${FONT}`);
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
  function close() {
    modal.hidden = true;
    document.body.classList.remove('game-open');
    cancelAnimationFrame(raf);
    for (const k in keys) keys[k] = false;
    if (location.hash === '#game') history.replaceState(null, '', location.pathname);
  }

  document.querySelectorAll('[data-open-game]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); open(); }));
  $('gameClose').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  $('gameMute').addEventListener('click', e => { muted = !muted; e.currentTarget.textContent = muted ? '🔇' : '🔊'; });
  if (location.hash === '#game') open();
})();
