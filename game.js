// HUGA vs BIG RUSSIAN BOSS — маленькая пиксельная игра на canvas
(() => {
  const W = 640, H = 360, FLOOR = 330, G = 1300;
  const FONT = '"Press Start 2P", monospace';
  const $ = id => document.getElementById(id);
  const modal = $('game'), canvas = $('gameCanvas'), ctx = canvas.getContext('2d');

  const load = src => Object.assign(new Image(), { src });
  const IMG = { huga: load('game/huga.png'), boss: load('game/boss.png'), bg: load('game/bg.png'), cover: load('game/cover.jpg') };

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.random() * a.length | 0];
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  const JOKES = ['ХА!', 'ХА-ХА', 'ЛОЛ', 'ШУТКА!', 'ОДНАЖДЫ...'];
  const TAUNTS = ['Я БОСС!', 'ЗОЛОТО!', 'ГДЕ МОЙ ОСКАР?', 'ДЕНЕГ ХВАТИТ!', 'ЭТО BIG BOSS!', 'ТЫ КТО, ХЕТАГ?', 'ТЕПЛЕЕ ГИБРАЛТАРА!'];
  const HUGA_LINES = ['ОДНАЖДЫ В...', 'ДАЙ МИКРОФОН', 'СМЕШНО ЖЕ!', 'ПОДПИШИСЬ!'];
  const CONFETTI = ['#ffd23f', '#ff4d4d', '#4dd2ff', '#7dff7d', '#ff8f5a', '#fff'];

  // ---------- звук ----------
  let actx = null, muted = false;
  function beep(freq, dur = 0.08, type = 'square', vol = 0.05, slide = 0) {
    if (muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(actx.destination);
      o.start(t);
      o.stop(t + dur);
    } catch (e) {}
  }
  const melody = (notes, step) => notes.forEach((f, i) => setTimeout(() => beep(f, step / 1000 + 0.05, 'square', 0.05), i * step));

  // ---------- состояние ----------
  let state = 'title', p, boss, shots, hazards, fx, pickups, time = 0, shake = 0, heartT = 0, lock = 0, best = 0;
  try { best = +localStorage.getItem('hugaBest') || 0; } catch (e) {}

  const say = (who, text, t = 1.5) => { who.say = { text, t }; };
  const playerBox = () => ({ x: p.x - 16, y: p.y - 92, w: 32, h: 90 });
  const bossBox = () => ({ x: boss.x - 40, y: boss.y - 140, w: 80, h: 138 });

  function start() {
    if (lock > 0) return;
    state = 'play'; time = 0; shake = 0; heartT = 10;
    p = { x: 90, y: FLOOR, vy: 0, face: 1, hp: 5, inv: 0, cd: 0, ground: true, say: null };
    boss = { x: 520, y: FLOOR, vy: 0, hp: 40, max: 40, atk: 2, tx: 520, flash: 0, stomp: false, say: null };
    shots = []; hazards = []; fx = []; pickups = [];
    say(boss, 'Я БОСС!', 1.8);
    beep(220, 0.15, 'square', 0.05, 440);
  }

  function win() {
    state = 'win'; lock = 0.8; shake = 0.5;
    if (!best || time < best) {
      best = time;
      try { localStorage.setItem('hugaBest', best.toFixed(1)); } catch (e) {}
    }
    say(boss, 'ХА-ХА! ЛАДНО, ТЫ СМЕШНОЙ!', 99);
    say(p, 'ОДНАЖДЫ Я ПОБЕДИЛ БОССА', 99);
    for (let i = 0; i < 90; i++) fx.push({ conf: true, x: rnd(0, W), y: rnd(-200, 0), vy: rnd(60, 160), c: pick(CONFETTI), t: 5 });
    melody([523, 659, 784, 1046], 140);
  }

  function lose() {
    state = 'lose'; lock = 0.8;
    say(boss, 'BIG BOSS НЕ СМЕЁТСЯ', 99);
    melody([392, 330, 262, 196], 180);
  }

  function hurt() {
    if (p.inv > 0 || state !== 'play') return;
    p.hp--; p.inv = 1.2; shake = 0.25;
    beep(110, 0.25, 'sawtooth', 0.06, -60);
    fx.push({ x: p.x, y: p.y - 110, text: 'АЙ!', t: 0.8, c: '#ff4d4d' });
    if (p.hp <= 0) lose();
  }

  function damageBoss() {
    boss.hp--; boss.flash = 0.12;
    beep(140, 0.08, 'sawtooth', 0.04);
    fx.push({ x: boss.x + rnd(-24, 24), y: boss.y - 150, text: pick(['-1', 'ХА', 'ХЫ']), t: 0.8, c: '#ffe14d' });
    if (boss.hp <= 0) return win();
    if (boss.hp === 26) { say(boss, 'ТЫ ЧЁ, СМЕШНО?!', 2); shake = 0.3; }
    if (boss.hp === 13) { say(boss, 'ЩА БУДЕТ ДОЖДЬ ИЗ ДЕНЕГ!', 2); shake = 0.3; }
  }

  function throwChain(phase) {
    for (let i = 0; i < (phase === 2 ? 2 : 1); i++) {
      const sx = boss.x - 40, sy = boss.y - 115, T = rnd(0.8, 1.1) - phase * 0.08;
      const tx = p.x + rnd(-30, 30) + i * rnd(-90, 90), ty = p.y - 45;
      hazards.push({ kind: 'chain', x: sx, y: sy, vx: (tx - sx) / T, vy: (ty - sy - 0.5 * 900 * T * T) / T, g: 900, r: 10, rot: 0 });
    }
    beep(500, 0.1, 'triangle', 0.04, -300);
  }

  function moneyRain(phase) {
    for (let i = 0; i < 4 + phase * 3; i++)
      hazards.push({ kind: 'money', x: rnd(20, W - 20), y: rnd(-140, -10), vx: 0, vy: rnd(90, 150) + phase * 30, g: 0, sway: rnd(0, 6) });
    beep(880, 0.15, 'triangle', 0.03, 400);
  }

  function hazardBox(h) {
    if (h.kind === 'chain') return { x: h.x - h.r, y: h.y - h.r, w: h.r * 2, h: h.r * 2 };
    if (h.kind === 'money') return { x: h.x - 11, y: h.y - 6, w: 22, h: 12 };
    return { x: h.x - 12, y: FLOOR - 22, w: 24, h: 22 };
  }

  // ---------- логика ----------
  function update(dt) {
    lock -= dt;
    shake = Math.max(0, shake - dt);
    for (const f of fx || []) {
      f.t -= dt;
      if (f.conf) f.y += f.vy * dt; else f.y -= 30 * dt;
    }
    if (fx) fx = fx.filter(f => f.t > 0);
    if (state !== 'play') return;

    time += dt;
    for (const who of [p, boss]) if (who.say) who.say.t -= dt;

    // Хуга
    if (keys.left) { p.x -= 190 * dt; p.face = -1; }
    if (keys.right) { p.x += 190 * dt; p.face = 1; }
    p.x = Math.max(24, Math.min(W - 24, p.x));
    if (keys.jump && p.ground) { p.vy = -520; p.ground = false; beep(330, 0.12, 'square', 0.04, 330); }
    p.vy += G * dt; p.y += p.vy * dt;
    if (p.y >= FLOOR) { p.y = FLOOR; p.vy = 0; p.ground = true; }
    p.inv -= dt; p.cd -= dt;
    if (keys.fire && p.cd <= 0) {
      p.cd = 0.3;
      shots.push({ x: p.x + p.face * 30, y: p.y - 66, vx: 380 * p.face, text: pick(JOKES) });
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
    boss.flash -= dt;
    if (Math.abs(boss.tx - boss.x) < 4) boss.tx = rnd(380, 590);
    if (boss.y >= FLOOR) boss.x += Math.sign(boss.tx - boss.x) * (40 + phase * 25) * dt;
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

  function sprite(img, x, y, flip) {
    if (!img.naturalWidth) return;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -Math.round(img.naturalWidth / 2), -img.naturalHeight);
    ctx.restore();
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
    const bx = Math.round(Math.max(4, Math.min(W - w - 4, x - w / 2)));
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

  function drawScene() {
    fill(IMG.bg, true);

    for (const k of pickups) heart(k.x - 8, k.y - 6, 2, Math.sin(time * 10) > 0 ? '#ff2a4a' : '#ff7d93');

    // Босс
    shadow(boss.x, 42);
    const bob = boss.y >= FLOOR ? Math.sin(time * 3) * 2 : 0;
    if (!(boss.flash > 0 && (time * 30 | 0) % 2)) sprite(IMG.boss, boss.x, boss.y + bob, p.x > boss.x);

    // Хуга
    shadow(p.x, 22);
    const walk = (keys.left || keys.right) && p.ground && state === 'play' ? -Math.abs(Math.sin(time * 14)) * 3 : 0;
    if (!(p.inv > 0 && (time * 20 | 0) % 2)) sprite(IMG.huga, p.x, p.y + walk, p.face < 0);

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
        const f = Math.sin(time * 30) * 3;
        ctx.fillStyle = '#ff5a1f';
        ctx.beginPath(); ctx.moveTo(h.x - 14, FLOOR); ctx.lineTo(h.x - 7, FLOOR - 20 - f); ctx.lineTo(h.x, FLOOR - 10);
        ctx.lineTo(h.x + 7, FLOOR - 24 + f); ctx.lineTo(h.x + 14, FLOOR); ctx.fill();
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.moveTo(h.x - 8, FLOOR); ctx.lineTo(h.x - 3, FLOOR - 10); ctx.lineTo(h.x + 3, FLOOR - 13); ctx.lineTo(h.x + 8, FLOOR); ctx.fill();
      }
    }

    bubble(boss, boss.x, boss.y - 158);
    bubble(p, p.x, p.y - 112);

    for (const f of fx) {
      if (f.conf) { ctx.fillStyle = f.c; ctx.fillRect(f.x + Math.sin(f.y / 12) * 6, f.y, 4, 4); }
      else text(f.text, f.x, f.y, 10, f.c);
    }

    // HUD
    text('HUGA', 12, 16, 10, '#fff', 'left');
    for (let i = 0; i < 5; i++) heart(12 + i * 20, 28, 2, i < p.hp ? '#ff2a4a' : '#3a3a3a');
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
      text('← → ХОДИТЬ   ↑ ПРЫЖОК   ПРОБЕЛ — ШУТКА', W / 2, H - 28, 8, '#fff');
      if (best) text('РЕКОРД: ' + best.toFixed(1) + 's', W / 2, H - 12, 7, '#7dff7d');
    } else {
      drawScene();
      if (state === 'win') overlay('БОСС ПОВЕРЖЕН СМЕХОМ!', '#7dff7d', 'ВРЕМЯ: ' + time.toFixed(1) + 's   РЕКОРД: ' + best.toFixed(1) + 's');
      if (state === 'lose') overlay('БОСС ОКАЗАЛСЯ БОГАЧЕ...', '#ff4d4d', 'У БОССА ОСТАЛОСЬ ' + boss.hp + ' HP. ПОПРОБУЙ ЕЩЁ!');
    }
    ctx.restore();
  }

  // ---------- ввод ----------
  const keys = {};
  const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump', Space: 'fire', KeyJ: 'fire', Enter: 'fire' };
  const press = k => { if (state !== 'play' && (k === 'fire' || k === 'jump')) start(); keys[k] = true; };

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
    canvas.focus();
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
