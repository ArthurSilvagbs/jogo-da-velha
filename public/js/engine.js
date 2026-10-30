/*
 * Motor visual e sonoro: sprites em SVG, efeitos sonoros chiptune (Web Audio) e
 * efeitos de tela (linha de vitória, confete, tremida, dissolução pixelada).
 */
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const reduceMotion = () => root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- Pixel art ---------------- */

  /**
   * Converte um sprite (linhas de caracteres) em <svg>.
   * @param {string[]} rows
   * @param {Record<string,string>} palette
   * @param {{className?:string, order?:(r:number,c:number)=>number, stepMs?:number, shadow?:boolean, groups?:Record<string,string>}} opts
   *   order: passo de desenho de cada pixel (anima o "imprimir" da peça)
   *   groups: letra -> classe de um <g> próprio (ex.: olhos que piscam)
   */
  function spriteSvg(rows, palette, { className = '', order = null, stepMs = 14, shadow = false, groups = {} } = {}) {
    const h = rows.length;
    const w = rows[0].length;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w + (shadow ? 1 : 0)} ${h + (shadow ? 1 : 0)}`);
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', `sprite ${className}`.trim());

    const shadowLayer = document.createElementNS(NS, 'g');
    const mainLayer = document.createElementNS(NS, 'g');
    const groupEls = {};
    Object.entries(groups).forEach(([ch, cls]) => {
      groupEls[ch] = document.createElementNS(NS, 'g');
      groupEls[ch].setAttribute('class', cls);
    });

    rows.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        if (ch === '.' || !palette[ch]) return;
        const delay = order ? `${Math.round(order(r, c) * stepMs)}ms` : null;
        if (shadow) shadowLayer.appendChild(rect(c + 1, r + 1, null, 'px-shadow', delay));
        (groupEls[ch] || mainLayer).appendChild(rect(c, r, palette[ch], 'px', delay));
      });
    });

    if (shadow) svg.appendChild(shadowLayer);
    svg.appendChild(mainLayer);
    Object.values(groupEls).forEach((g) => svg.appendChild(g));
    return svg;
  }

  function rect(x, y, fill, cls, delay) {
    const el = document.createElementNS(NS, 'rect');
    el.setAttribute('x', x);
    el.setAttribute('y', y);
    el.setAttribute('width', 1);
    el.setAttribute('height', 1);
    el.setAttribute('class', cls);
    if (fill) el.setAttribute('fill', fill);
    if (delay) el.style.animationDelay = delay;
    return el;
  }

  // Versão em data URI (usada como "fantasma" no hover das casas).
  function spriteDataUri(rows, palette) {
    const parts = [];
    rows.forEach((row, r) => [...row].forEach((ch, c) => {
      if (palette[ch]) parts.push(`<rect x='${c}' y='${r}' width='1' height='1' fill='${palette[ch]}'/>`);
    }));
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${rows[0].length} ${rows.length}' shape-rendering='crispEdges'>${parts.join('')}</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  // Ordem de desenho: X traça uma diagonal e depois a outra; O gira como um relógio.
  const DRAW_ORDER = {
    X: (r, c) => (Math.abs(r - c) <= 1 ? r : 10 + r),
    O: (r, c) => {
      const angle = Math.atan2(r - 4.5, c - 4.5) + Math.PI / 2;
      return (((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * 20;
    },
  };

  /* ---------------- Som (chiptune gerado na hora, sem arquivos) ---------------- */

  const MUTE_KEY = 'velha:muted';
  let audioCtx = null;
  let muted = readMuted();

  function readMuted() {
    try {
      return root.localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false; // armazenamento bloqueado: som ligado por padrão
    }
  }

  function getAudio() {
    if (muted) return null;
    if (!audioCtx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function note(freq, at, dur, { type = 'square', gain = 0.05, to = null } = {}) {
    const ac = getAudio();
    if (!ac) return;
    const t = ac.currentTime + at;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp).connect(ac.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  const seq = (notes, opts) => notes.forEach(([f, at, d]) => note(f, at, d, opts));

  const SFX = {
    start: () => seq([[988, 0, 0.08], [1319, 0.08, 0.4]]),
    blip: () => note(1400, 0, 0.025, { gain: 0.02 }),
    click: () => note(1100, 0, 0.03, { gain: 0.03 }),
    hover: () => note(1800, 0, 0.012, { gain: 0.012 }),
    X: () => seq([[660, 0, 0.05], [990, 0.04, 0.08]]),
    O: () => seq([[392, 0, 0.05], [294, 0.04, 0.09]], { type: 'triangle', gain: 0.09 }),
    vanish: () => note(700, 0, 0.22, { to: 110, gain: 0.035 }),
    win: () => seq([[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.12], [784, 0.42, 0.08], [1047, 0.5, 0.4]]),
    lose: () => seq([[392, 0, 0.16], [330, 0.17, 0.16], [262, 0.34, 0.45]], { type: 'sawtooth', gain: 0.035 }),
    draw: () => seq([[440, 0, 0.12], [415, 0.14, 0.12], [392, 0.28, 0.35]], { type: 'triangle', gain: 0.08 }),
  };

  const audio = {
    play(name) {
      if (SFX[name]) SFX[name]();
    },
    isMuted: () => muted,
    setMuted(value) {
      muted = Boolean(value);
      try {
        root.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        // armazenamento bloqueado: a preferência vale só nesta aba
      }
    },
  };

  /* ---------------- Efeitos de tela ---------------- */

  function fitCanvas(canvas, width, height) {
    const dpr = Math.min(root.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    return ctx;
  }

  function shake(el) {
    if (reduceMotion()) return;
    el.classList.remove('is-shaking');
    void el.offsetWidth; // reinicia a animação
    el.classList.add('is-shaking');
  }

  // Linha de vitória feita de blocos, "andando" de uma ponta à outra.
  function winLine(canvas, cells, line, { color, shadow }) {
    const box = canvas.getBoundingClientRect();
    const ctx = fitCanvas(canvas, box.width, box.height);
    const center = (i) => {
      const r = cells[i].getBoundingClientRect();
      return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 };
    };
    const a = center(line[0]);
    const b = center(line[2]);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const ext = box.width * 0.13;
    const unit = Math.max(6, Math.round(box.width / 56));
    const total = len + ext * 2;
    const steps = Math.ceil(total / unit);
    const startX = a.x - ux * ext;
    const startY = a.y - uy * ext;

    const snap = (v) => Math.round(v / unit) * unit;
    const paint = (count) => {
      ctx.clearRect(0, 0, box.width, box.height);
      [[shadow, unit], [color, 0]].forEach(([fill, offset]) => {
        ctx.fillStyle = fill;
        for (let k = 0; k <= count; k += 1) {
          const x = snap(startX + ux * k * unit) - unit;
          const y = snap(startY + uy * k * unit) - unit;
          ctx.fillRect(x + offset, y + offset, unit * 2, unit * 2);
        }
      });
    };

    if (reduceMotion()) {
      paint(steps);
      return;
    }
    const t0 = performance.now();
    const DURATION = 420;
    const frame = (now) => {
      const progress = Math.min(1, (now - t0) / DURATION);
      paint(Math.floor(progress * steps));
      if (progress < 1) root.requestAnimationFrame(frame);
    };
    root.requestAnimationFrame(frame);
  }

  function clearCanvas(canvas) {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }

  // Confete de quadradinhos saindo dos cantos de baixo da tela.
  function confetti(canvas, colors) {
    if (reduceMotion()) return;
    const w = root.innerWidth;
    const h = root.innerHeight;
    const ctx = fitCanvas(canvas, w, h);
    const COUNT = 140;
    const GRAVITY = 0.32;
    const parts = Array.from({ length: COUNT }, (_, i) => {
      const left = i % 2 === 0;
      return {
        x: left ? 0 : w,
        y: h * 0.9,
        vx: (left ? 1 : -1) * (4 + Math.random() * 9),
        vy: -(10 + Math.random() * 12),
        size: 4 * (1 + Math.floor(Math.random() * 3)),
        color: colors[i % colors.length],
      };
    });
    const t0 = performance.now();
    const DURATION = 2600;
    const frame = (now) => {
      const elapsed = now - t0;
      ctx.clearRect(0, 0, w, h);
      parts.forEach((p) => {
        p.vy += GRAVITY;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x / 4) * 4, Math.round(p.y / 4) * 4, p.size, p.size);
      });
      if (elapsed < DURATION) root.requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    };
    root.requestAnimationFrame(frame);
  }

  // Cobre a tela de uma cor e apaga em blocos aleatórios (transição do boot).
  function dissolve(canvas, color, onDone) {
    const w = root.innerWidth;
    const h = root.innerHeight;
    canvas.style.display = 'block';
    const ctx = fitCanvas(canvas, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    onDone();
    if (reduceMotion()) {
      canvas.style.display = 'none';
      return;
    }
    const BLOCK = 40;
    const blocks = [];
    for (let y = 0; y < h; y += BLOCK) for (let x = 0; x < w; x += BLOCK) blocks.push([x, y]);
    blocks.sort(() => Math.random() - 0.5);
    const t0 = performance.now();
    const DURATION = 650;
    let cleared = 0;
    const frame = (now) => {
      const target = Math.floor(Math.min(1, (now - t0) / DURATION) * blocks.length);
      for (; cleared < target; cleared += 1) ctx.clearRect(blocks[cleared][0], blocks[cleared][1], BLOCK, BLOCK);
      if (cleared < blocks.length) root.requestAnimationFrame(frame);
      else canvas.style.display = 'none';
    };
    root.requestAnimationFrame(frame);
  }

  root.Velha = Object.assign(root.Velha || {}, {
    pixel: { spriteSvg, spriteDataUri, DRAW_ORDER },
    audio,
    fx: { shake, winLine, clearCanvas, confetti, dissolve, reduceMotion },
  });
})(window);
