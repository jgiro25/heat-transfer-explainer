(() => {
  'use strict';

  // ——— Tabs ———
  const tabs = [...document.querySelectorAll('.tab')];
  const panels = {
    conduction: document.getElementById('panel-conduction'),
    convection: document.getElementById('panel-convection'),
    radiation: document.getElementById('panel-radiation'),
  };
  const indicator = document.getElementById('tab-indicator');
  let activeMode = 'conduction';

  function setTab(mode) {
    activeMode = mode;
    tabs.forEach((t, i) => {
      const on = t.dataset.mode === mode;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) indicator.style.transform = `translateX(${i * 100}%)`;
    });
    Object.entries(panels).forEach(([k, el]) => {
      const on = k === mode;
      el.classList.toggle('active', on);
      if (on) el.removeAttribute('hidden');
      else el.setAttribute('hidden', '');
    });
  }
  tabs.forEach((t) => t.addEventListener('click', () => setTab(t.dataset.mode)));
  setTab('conduction');

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function heatColor(t) {
    // t 0..1 cold→hot
    const r = Math.round(lerp(60, 255, t));
    const g = Math.round(lerp(140, 70, t * 0.85));
    const b = Math.round(lerp(255, 40, t));
    return `rgb(${r},${g},${b})`;
  }

  // ——— Conduction ———
  const cCond = document.getElementById('canvas-conduction');
  const ctxC = cCond.getContext('2d');
  const COLS = 18, ROWS = 8;
  let condTemp = [...Array(ROWS)].map((_, r) =>
    [...Array(COLS)].map((_, c) => (c < 2 ? 0.85 : 0.08 + Math.random() * 0.04))
  );
  const condTempEl = document.getElementById('cond-temp');
  const condKEl = document.getElementById('cond-k');
  const condTempVal = document.getElementById('cond-temp-val');
  const condKVal = document.getElementById('cond-k-val');
  let painting = false;

  function resetConduction() {
    condTemp = [...Array(ROWS)].map((_, r) =>
      [...Array(COLS)].map((_, c) => (c < 2 ? condTempEl.value / 100 : 0.1))
    );
  }
  function applyHeatAt(clientX, clientY) {
    const rect = cCond.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * cCond.width;
    const y = ((clientY - rect.top) / rect.height) * cCond.height;
    const cellW = cCond.width / COLS;
    const cellH = cCond.height / ROWS;
    const c = clamp(Math.floor(x / cellW), 0, COLS - 1);
    const r = clamp(Math.floor(y / cellH), 0, ROWS - 1);
    const boost = condTempEl.value / 100;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
        condTemp[rr][cc] = clamp(condTemp[rr][cc] + boost * 0.35, 0, 1);
      }
    }
  }
  cCond.addEventListener('pointerdown', (e) => { painting = true; applyHeatAt(e.clientX, e.clientY); cCond.setPointerCapture(e.pointerId); });
  cCond.addEventListener('pointermove', (e) => { if (painting) applyHeatAt(e.clientX, e.clientY); });
  cCond.addEventListener('pointerup', () => { painting = false; });
  document.getElementById('cond-reset').addEventListener('click', resetConduction);
  document.getElementById('cond-pulse').addEventListener('click', () => {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < 3; c++) condTemp[r][c] = 1;
    }
  });
  condTempEl.addEventListener('input', () => {
    condTempVal.textContent = condTempEl.value + '%';
    for (let r = 0; r < ROWS; r++) {
      condTemp[r][0] = Math.max(condTemp[r][0], condTempEl.value / 100);
      condTemp[r][1] = Math.max(condTemp[r][1], condTempEl.value / 100 * 0.9);
    }
  });
  condKEl.addEventListener('input', () => {
    const v = +condKEl.value;
    condKVal.textContent = v >= 7 ? 'High' : v >= 4 ? 'Medium' : 'Low';
  });

  function stepConduction(dt) {
    const k = (+condKEl.value / 10) * 2.8;
    const next = condTemp.map((row) => row.slice());
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        let sum = 0, n = 0;
        [[0,1],[0,-1],[1,0],[-1,0]].forEach(([dr, dc]) => {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) return;
          sum += condTemp[rr][cc]; n++;
        });
        const avg = sum / n;
        next[r][c] = clamp(condTemp[r][c] + (avg - condTemp[r][c]) * k * dt, 0, 1);
      }
    }
    // hold left edge hot, right edge cool sink
    const hot = condTempEl.value / 100;
    for (let r = 0; r < ROWS; r++) {
      next[r][0] = Math.max(next[r][0], hot * 0.95);
      next[r][COLS - 1] *= 0.985;
    }
    condTemp = next;
  }

  function drawConduction() {
    const w = cCond.width, h = cCond.height;
    ctxC.clearRect(0, 0, w, h);
    const g = ctxC.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#1a0a08'); g.addColorStop(1, '#061018');
    ctxC.fillStyle = g; ctxC.fillRect(0, 0, w, h);

    const cellW = w / COLS, cellH = h / ROWS;
    const t = performance.now() / 1000;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const heat = condTemp[r][c];
        const cx = c * cellW + cellW / 2;
        const cy = r * cellH + cellH / 2;
        const vib = Math.sin(t * (8 + heat * 20) + r + c) * heat * 2.2;
        const rad = 7 + heat * 5;
        ctxC.beginPath();
        ctxC.arc(cx + vib, cy + vib * 0.4, rad, 0, Math.PI * 2);
        ctxC.fillStyle = heatColor(heat);
        ctxC.globalAlpha = 0.55 + heat * 0.45;
        ctxC.fill();
        if (heat > 0.55) {
          ctxC.beginPath();
          ctxC.arc(cx + vib, cy, rad * 1.8, 0, Math.PI * 2);
          ctxC.fillStyle = `rgba(255,120,40,${(heat - 0.55) * 0.35})`;
          ctxC.fill();
        }
      }
    }
    ctxC.globalAlpha = 1;
    // bonds
    ctxC.strokeStyle = 'rgba(255,255,255,0.06)';
    ctxC.lineWidth = 1;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        ctxC.beginPath();
        ctxC.moveTo(c * cellW + cellW / 2, r * cellH + cellH / 2);
        ctxC.lineTo((c + 1) * cellW + cellW / 2, r * cellH + cellH / 2);
        ctxC.stroke();
      }
    }
  }

  // ——— Convection ———
  const cConv = document.getElementById('canvas-convection');
  const ctxV = cConv.getContext('2d');
  const NPART = 90;
  let particles = [];
  let heatSrc = { x: cConv.width * 0.3, y: cConv.height * 0.78 };
  let convPaused = false;
  const convHeat = document.getElementById('conv-heat');
  const convVisc = document.getElementById('conv-visc');
  const convHeatVal = document.getElementById('conv-heat-val');
  const convViscVal = document.getElementById('conv-visc-val');
  const convHint = document.getElementById('conv-hint');

  function spawnParticles() {
    particles = [];
    for (let i = 0; i < NPART; i++) {
      particles.push({
        x: Math.random() * cConv.width,
        y: Math.random() * cConv.height,
        vx: 0, vy: 0,
        t: Math.random(),
      });
    }
  }
  spawnParticles();

  cConv.addEventListener('pointerdown', (e) => {
    const rect = cConv.getBoundingClientRect();
    heatSrc.x = ((e.clientX - rect.left) / rect.width) * cConv.width;
    heatSrc.y = ((e.clientY - rect.top) / rect.height) * cConv.height;
    convHint.classList.add('hidden');
  });
  document.getElementById('conv-reset').addEventListener('click', spawnParticles);
  document.getElementById('conv-toggle').addEventListener('click', () => { convPaused = !convPaused; });
  convHeat.addEventListener('input', () => { convHeatVal.textContent = convHeat.value + '%'; });
  convVisc.addEventListener('input', () => {
    const v = +convVisc.value;
    convViscVal.textContent = v >= 7 ? 'Thick' : v >= 4 ? 'Medium' : 'Thin';
  });

  function stepConvection(dt) {
    if (convPaused) return;
    const strength = (+convHeat.value / 100) * 220;
    const drag = 0.92 + (+convVisc.value) * 0.006;
    const w = cConv.width, h = cConv.height;
    for (const p of particles) {
      const dx = p.x - heatSrc.x;
      const dy = p.y - heatSrc.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 1;
      const near = Math.exp(-dist / 90);
      p.t = clamp(p.t + near * 0.8 * dt - 0.08 * dt, 0, 1);
      // buoyancy + swirl around heat
      p.vy += -strength * p.t * dt * 0.02;
      p.vy += (1 - p.t) * 40 * dt * 0.02;
      p.vx += (-dy / dist) * near * strength * 0.008 * dt;
      p.vx *= Math.pow(drag, dt * 60);
      p.vy *= Math.pow(drag, dt * 60);
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
      if (p.y < 8) { p.y = 8; p.vy *= -0.3; p.t *= 0.85; }
      if (p.y > h - 8) { p.y = h - 8; p.vy *= -0.2; }
    }
  }

  function drawConvection() {
    const w = cConv.width, h = cConv.height;
    ctxV.fillStyle = '#06101c';
    ctxV.fillRect(0, 0, w, h);
    // soft heat glow
    const grd = ctxV.createRadialGradient(heatSrc.x, heatSrc.y, 4, heatSrc.x, heatSrc.y, 120);
    grd.addColorStop(0, 'rgba(255,100,40,0.55)');
    grd.addColorStop(1, 'rgba(255,100,40,0)');
    ctxV.fillStyle = grd;
    ctxV.fillRect(0, 0, w, h);
    // source
    ctxV.beginPath();
    ctxV.arc(heatSrc.x, heatSrc.y, 14, 0, Math.PI * 2);
    ctxV.fillStyle = '#ff6b3d';
    ctxV.shadowColor = '#ff6b3d';
    ctxV.shadowBlur = 18;
    ctxV.fill();
    ctxV.shadowBlur = 0;
    for (const p of particles) {
      ctxV.beginPath();
      ctxV.arc(p.x, p.y, 4 + p.t * 3, 0, Math.PI * 2);
      ctxV.fillStyle = heatColor(p.t);
      ctxV.globalAlpha = 0.75;
      ctxV.fill();
    }
    ctxV.globalAlpha = 1;
    // flow arrows hint
    ctxV.strokeStyle = 'rgba(255,255,255,0.12)';
    ctxV.setLineDash([4, 6]);
    ctxV.beginPath();
    ctxV.ellipse(heatSrc.x + 40, heatSrc.y - 40, 70, 90, -0.2, 0, Math.PI * 1.6);
    ctxV.stroke();
    ctxV.setLineDash([]);
  }

  // ——— Radiation ———
  const cRad = document.getElementById('canvas-radiation');
  const ctxR = cRad.getContext('2d');
  const radTemp = document.getElementById('rad-temp');
  const radInt = document.getElementById('rad-int');
  const radTempVal = document.getElementById('rad-temp-val');
  const radIntVal = document.getElementById('rad-int-val');
  const radBlockerBtn = document.getElementById('rad-blocker');
  let blockerOn = false;
  let waves = [];
  let burst = 0;

  function spawnWave(extra = false) {
    const n = extra ? 8 : 1;
    for (let i = 0; i < n; i++) {
      waves.push({
        x: 90,
        y: cRad.height / 2 + (Math.random() - 0.5) * 100,
        r: 10 + Math.random() * 6,
        speed: 80 + (+radInt.value) * 18 + Math.random() * 30,
        amp: 0.5 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        life: 1,
      });
    }
  }
  radTemp.addEventListener('input', () => {
    const v = +radTemp.value;
    radTempVal.textContent = v >= 75 ? 'Hot' : v >= 50 ? 'Warm' : 'Cool';
  });
  radInt.addEventListener('input', () => {
    const v = +radInt.value;
    radIntVal.textContent = v >= 7 ? 'High' : v >= 4 ? 'Medium' : 'Low';
  });
  radBlockerBtn.addEventListener('click', () => {
    blockerOn = !blockerOn;
    radBlockerBtn.setAttribute('aria-pressed', blockerOn ? 'true' : 'false');
    radBlockerBtn.textContent = blockerOn ? 'Remove blocker' : 'Add blocker';
  });
  document.getElementById('rad-pulse').addEventListener('click', () => { burst = 0.4; spawnWave(true); });

  let radAcc = 0;
  function stepRadiation(dt) {
    const rate = (+radTemp.value / 100) * (+radInt.value) * 2.2;
    radAcc += rate * dt;
    while (radAcc > 0.12) { spawnWave(false); radAcc -= 0.12; }
    if (burst > 0) burst -= dt;
    const blockX = cRad.width * 0.55;
    for (const w of waves) {
      w.x += w.speed * dt;
      w.phase += dt * 10;
      w.life -= dt * 0.15;
      if (blockerOn && w.x > blockX - 8 && w.x < blockX + 8) {
        w.life = 0;
      }
    }
    waves = waves.filter((w) => w.life > 0 && w.x < cRad.width + 40);
  }

  function drawRadiation() {
    const w = cRad.width, h = cRad.height;
    ctxR.fillStyle = '#04060e';
    ctxR.fillRect(0, 0, w, h);
    // stars / vacuum dots
    ctxR.fillStyle = 'rgba(255,255,255,0.15)';
    for (let i = 0; i < 40; i++) {
      ctxR.fillRect((i * 97) % w, (i * 53) % h, 1.5, 1.5);
    }
    // source
    const hotness = radTemp.value / 100;
    const sx = 70, sy = h / 2;
    const glow = ctxR.createRadialGradient(sx, sy, 5, sx, sy, 70 + hotness * 40);
    glow.addColorStop(0, `rgba(255,${Math.round(200 - hotness * 80)},40,0.9)`);
    glow.addColorStop(1, 'rgba(255,80,20,0)');
    ctxR.fillStyle = glow;
    ctxR.beginPath(); ctxR.arc(sx, sy, 90, 0, Math.PI * 2); ctxR.fill();
    ctxR.beginPath(); ctxR.arc(sx, sy, 22 + hotness * 8, 0, Math.PI * 2);
    ctxR.fillStyle = heatColor(hotness);
    ctxR.fill();
    ctxR.fillStyle = '#c9d7f5';
    ctxR.font = '12px system-ui';
    ctxR.fillText('Source', sx - 20, sy + 48);
    ctxR.fillText('Vacuum', w * 0.35, 28);
    // target
    const tx = w - 70;
    ctxR.fillStyle = '#2a3550';
    ctxR.fillRect(tx - 18, sy - 50, 36, 100);
    ctxR.fillStyle = '#9aabd0';
    ctxR.fillText('Target', tx - 18, sy + 68);
    // blocker
    if (blockerOn) {
      const bx = w * 0.55;
      ctxR.fillStyle = 'rgba(180,200,230,0.85)';
      ctxR.fillRect(bx - 8, 40, 16, h - 80);
      ctxR.fillStyle = '#e8eefc';
      ctxR.fillText('Blocker', bx - 22, 30);
    }
    // waves
    for (const wave of waves) {
      ctxR.beginPath();
      for (let i = 0; i < 28; i++) {
        const px = wave.x + i * 3;
        const py = wave.y + Math.sin(wave.phase + i * 0.45) * 10 * wave.amp;
        if (i === 0) ctxR.moveTo(px, py); else ctxR.lineTo(px, py);
      }
      ctxR.strokeStyle = `rgba(255, ${Math.round(180 - hotness * 60)}, 60, ${0.35 + wave.life * 0.5})`;
      ctxR.lineWidth = 2;
      ctxR.stroke();
      // ray arrow tip
      ctxR.beginPath();
      ctxR.arc(wave.x, wave.y, 3, 0, Math.PI * 2);
      ctxR.fillStyle = `rgba(255,200,80,${wave.life})`;
      ctxR.fill();
    }
  }

  // ——— Main loop ———
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (activeMode === 'conduction') { stepConduction(dt); drawConduction(); }
    else if (activeMode === 'convection') { stepConvection(dt); drawConvection(); }
    else { stepRadiation(dt); drawRadiation(); }
    requestAnimationFrame(frame);
  }
  resetConduction();
  drawConduction();
  requestAnimationFrame(frame);
})();
