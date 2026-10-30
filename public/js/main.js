/*
 * Orquestra a partida: tabuleiro, CPU (NIMBUS), placar, configurações e teclado.
 */
(function (root) {
  'use strict';

  const { game, sprites, pixel, audio, fx, cloud } = root.Velha;
  const { SPRITES, PALETTES, COLORS } = sprites;

  const SETTINGS_KEY = 'velha:settings';
  const SCORES_KEY = 'velha:scores';
  const ALLOWED = Object.freeze({ opponent: ['cpu', 'pvp'], difficulty: ['easy', 'medium', 'hard'], mode: ['classic', 'infinite'] });
  const DEFAULT_SETTINGS = Object.freeze({ opponent: 'cpu', difficulty: 'hard', mode: 'classic' });
  const ZERO = Object.freeze({ X: 0, O: 0, D: 0 });
  const DEFAULT_SCORES = Object.freeze({ cpu: ZERO, pvp: ZERO });
  const CPU_DELAY_MS = 480;
  const CPU_JITTER_MS = 380;
  const RESULT_DELAY_MS = 950;
  const TYPE_MS = 16;
  const LEAVE_MS = 450;
  const HUMAN = 'X';
  const CPU = 'O';

  const LINES = {
    intro: {
      easy: 'Modo fácil: vou jogar de olhos fechados. Pode começar.',
      medium: 'Modo médio: às vezes eu me distraio. Às vezes.',
      hard: 'Eu rodo na nuvem. Você roda no café. Modo impossível: eu não perco.',
      infinite: 'Velha infinita: só 3 peças cada. A mais antiga evapora. Boa sorte.',
      pvp: 'Modo 2 jogadores. Eu só narro. Que vença o melhor deploy.',
    },
    cpuStarts: ['Minha vez de abrir. Nada pessoal.', 'Eu começo essa. Já calculei o final.'],
    thinkingRandom: ['Vou no instinto dessa vez.', 'Modo econômico de CPU ativado.', 'Joguei sem olhar. Confia.'],
    cpuWin: {
      h: 'Escalei horizontalmente. Literalmente.',
      v: 'Escalabilidade vertical, na prática.',
      d: 'Diagonal. Nem o load balancer viu essa.',
    },
    humanWin: ['Impossível... deve ter sido latência.', 'Vou abrir um chamado no suporte.', 'Erro 500: meu orgulho caiu.'],
    draw: ['Deu velha. Alta disponibilidade dos dois lados.', 'Empate. 100% de uptime, 0% de vencedor.'],
    timeout: 'Limite de jogadas. Timeout da partida: deu velha.',
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    board: $('board'), frame: $('boardFrame'), boardFx: $('boardFx'), confetti: $('confetti'),
    result: $('result'), resultSprite: $('resultSprite'), resultTitle: $('resultTitle'), resultSub: $('resultSub'), again: $('againBtn'),
    turn: $('turn'), turnChip: $('turnChip'), turnLabel: $('turnLabel'), turnMeta: $('turnMeta'), hint: $('stageHint'),
    scoreX: $('scoreX'), scoreO: $('scoreO'), scoreD: $('scoreD'), labelX: $('scoreLabelX'), labelO: $('scoreLabelO'),
    bot: $('bot'), botSay: $('botSay'), botSayLive: $('botSayLive'), botStats: $('botStats'),
    sound: $('soundBtn'), soundLabel: $('soundLabel'), infra: $('infra'),
  };

  /* ---------------- Persistência ---------------- */

  function load(key, fallback, isValid) {
    try {
      const raw = root.localStorage.getItem(key);
      const value = raw ? JSON.parse(raw) : null;
      return isValid(value) ? value : fallback;
    } catch {
      return fallback; // armazenamento bloqueado ou JSON corrompido: começa do zero
    }
  }

  function save(key, value) {
    try {
      root.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // armazenamento bloqueado: vale só nesta aba
    }
  }

  const isValidSettings = (v) => Boolean(v) && Object.keys(ALLOWED).every((k) => ALLOWED[k].includes(v[k]));
  const isValidScores = (v) => Boolean(v) && ['cpu', 'pvp'].every((m) => v[m] && ['X', 'O', 'D'].every((k) => Number.isInteger(v[m][k]) && v[m][k] >= 0));

  let settings = load(SETTINGS_KEY, DEFAULT_SETTINGS, isValidSettings);
  let scores = load(SCORES_KEY, DEFAULT_SCORES, isValidScores);
  let state = game.createGame({ mode: settings.mode });
  let round = 0;
  let started = false;
  let cpuTimer = null;
  let resultTimer = null;
  let typeTimer = null;

  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const fmt = (n) => n.toLocaleString('pt-BR');
  const isCpuTurn = () => settings.opponent === 'cpu' && state.turn === CPU && !game.isOver(state);
  const GHOST = { X: pixel.spriteDataUri(SPRITES.X, PALETTES.X), O: pixel.spriteDataUri(SPRITES.O, PALETTES.O) };

  /* ---------------- Tabuleiro ---------------- */

  const cells = Array.from({ length: 9 }, (_, i) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell is-empty';
    const num = document.createElement('span');
    num.className = 'cell__num';
    num.textContent = String(i + 1);
    num.setAttribute('aria-hidden', 'true');
    const mark = document.createElement('span');
    mark.className = 'cell__mark';
    cell.append(num, mark);
    cell.addEventListener('click', () => humanPlay(i));
    cell.addEventListener('mouseenter', () => {
      if (!cell.disabled) audio.play('hover');
    });
    el.board.appendChild(cell);
    return cell;
  });

  function updateMark(i, before, now) {
    const mark = cells[i].querySelector('.cell__mark');
    if (now) {
      mark.replaceChildren(pixel.spriteSvg(SPRITES[now], PALETTES[now], { className: 'is-drawing', order: pixel.DRAW_ORDER[now], shadow: true }));
      return;
    }
    const old = mark.firstElementChild;
    if (!before || !old) return;
    // "Evapora" pixel a pixel, em ordem aleatória.
    old.querySelectorAll('rect').forEach((r) => { r.style.animationDelay = `${Math.floor(Math.random() * 6) * 35}ms`; });
    old.classList.replace('is-drawing', 'is-leaving');
    setTimeout(() => old.remove(), LEAVE_MS);
  }

  function cellLabel(i, value, fading) {
    return `Casa ${i + 1}: ${value || 'vazia'}${fading ? ', vai evaporar na sua jogada' : ''}`;
  }

  function render(prev) {
    state.board.forEach((value, i) => {
      const before = prev ? prev.board[i] : null;
      if (value !== before) updateMark(i, before, value);
    });
    const fading = game.vanishingIndex(state);
    const over = game.isOver(state);
    const locked = !started || over || isCpuTurn();
    cells.forEach((cell, i) => {
      const value = state.board[i];
      cell.classList.toggle('is-empty', !value);
      cell.classList.toggle('is-fading', i === fading && !isCpuTurn());
      cell.classList.toggle('is-last', Boolean(state.lastMove) && state.lastMove.index === i);
      cell.classList.toggle('is-win', Boolean(state.line) && state.line.includes(i));
      cell.disabled = locked || Boolean(value);
      cell.setAttribute('aria-label', cellLabel(i, value, i === fading));
    });
    el.board.classList.toggle('is-over', over);
    el.board.style.setProperty('--ghost', GHOST[state.turn]);
    renderTurn(fading, over);
  }

  function renderTurn(fading, over) {
    const thinking = isCpuTurn();
    el.turn.classList.toggle('is-thinking', thinking);
    el.bot.classList.toggle('is-thinking', thinking);
    el.turnChip.replaceChildren(pixel.spriteSvg(SPRITES[state.turn], PALETTES[state.turn]));

    if (over) el.turnLabel.textContent = 'Fim da rodada';
    else if (thinking) el.turnLabel.textContent = 'Nimbus pensando';
    else el.turnLabel.textContent = settings.opponent === 'cpu' ? 'Sua vez' : `Vez do ${state.turn}`;

    const meta = [`Rodada ${round + 1}`];
    if (state.mode === 'infinite') meta.push(`Jogada ${state.moveCount}/${game.INFINITE_MOVE_LIMIT}`);
    el.turnMeta.textContent = meta.join(' · ');

    if (over) el.hint.textContent = 'Enter para jogar de novo.';
    else if (fading >= 0 && !thinking) el.hint.textContent = `Atenção: a peça da casa ${fading + 1} evapora quando ${state.turn} jogar.`;
    else el.hint.textContent = 'Clique numa casa ou use as teclas 1–9.';
  }

  /* ---------------- NIMBUS fala ---------------- */

  function say(text, stats = '') {
    el.botSayLive.textContent = text;
    el.botStats.textContent = stats;
    clearInterval(typeTimer);
    if (fx.reduceMotion()) {
      el.botSay.textContent = text;
      return;
    }
    let shown = 0;
    el.botSay.textContent = '';
    el.botSay.classList.add('is-typing');
    typeTimer = setInterval(() => {
      shown += 1;
      el.botSay.textContent = text.slice(0, shown);
      if (shown >= text.length) {
        clearInterval(typeTimer);
        el.botSay.classList.remove('is-typing');
      }
    }, TYPE_MS);
  }

  function introLine() {
    if (settings.opponent === 'pvp') return LINES.intro.pvp;
    if (settings.mode === 'infinite') return LINES.intro.infinite;
    return LINES.intro[settings.difficulty];
  }

  function cpuComment(move) {
    if (move.kind === 'win') return 'Xeque-mate. Quer dizer... velha-mate.';
    if (move.kind === 'random') return pick(LINES.thinkingRandom);
    return pick([
      `Analisei ${fmt(move.nodes)} posições. Casa ${move.index + 1}.`,
      `${fmt(move.nodes)} futuros simulados. Só um me agrada: casa ${move.index + 1}.`,
    ]);
  }

  /* ---------------- Jogadas ---------------- */

  function humanPlay(i) {
    if (!started || isCpuTurn() || !game.canPlay(state, i)) return;
    commit(game.play(state, i));
  }

  function commit(next) {
    const prev = state;
    state = next;
    audio.play(next.lastMove.player);
    if (next.lastMove.removed >= 0) audio.play('vanish');
    render(prev);
    if (game.isOver(next)) finish();
    else if (isCpuTurn()) scheduleCpu();
  }

  function scheduleCpu() {
    const snapshot = state;
    cpuTimer = setTimeout(() => {
      if (state !== snapshot) return; // rodada mudou enquanto "pensava"
      const t0 = performance.now();
      const move = game.chooseMove(state, settings.difficulty);
      const ms = (performance.now() - t0).toFixed(1).replace('.', ',');
      say(cpuComment(move), `${fmt(move.nodes)} posições · ${ms} ms · casa ${move.index + 1}`);
      commit(game.play(state, move.index));
    }, CPU_DELAY_MS + Math.random() * CPU_JITTER_MS);
  }

  function lineDirection(line) {
    const step = line[1] - line[0];
    if (step === 1) return 'h';
    return step === 3 ? 'v' : 'd';
  }

  function finish() {
    const key = settings.opponent;
    const result = state.winner || 'D';
    scores = { ...scores, [key]: { ...scores[key], [result]: scores[key][result] + 1 } };
    save(SCORES_KEY, scores);
    renderScores(result);

    if (!state.winner) {
      audio.play('draw');
      say(state.mode === 'infinite' ? LINES.timeout : pick(LINES.draw));
    } else {
      const cpuWon = key === 'cpu' && state.winner === CPU;
      fx.winLine(el.boardFx, cells, state.line, { color: COLORS.INK, shadow: COLORS.WHITE });
      fx.shake(el.frame);
      audio.play(cpuWon ? 'lose' : 'win');
      if (!cpuWon) fx.confetti(el.confetti, [COLORS.RED, COLORS.INK, COLORS.RED_DARK, '#FFB4AE']);
      if (key === 'pvp') say(`${state.winner} venceu! Deploy aprovado em produção.`);
      else if (cpuWon) {
        say(LINES.cpuWin[lineDirection(state.line)]);
        el.bot.classList.add('is-happy');
      } else say(pick(LINES.humanWin));
    }
    resultTimer = setTimeout(showResult, RESULT_DELAY_MS);
  }

  function showResult() {
    const w = state.winner;
    el.resultSprite.className = `result__sprite${w ? '' : ' is-granny'}`;
    el.resultSprite.replaceChildren(w
      ? pixel.spriteSvg(SPRITES[w], PALETTES[w], { shadow: true })
      : pixel.spriteSvg(SPRITES.GRANNY, PALETTES.GRANNY));

    const vsCpu = settings.opponent === 'cpu';
    if (!w) {
      el.resultTitle.textContent = 'Deu velha!';
      el.resultSub.textContent = 'Ninguém ganhou. A velha agradece a visita.';
    } else if (vsCpu) {
      el.resultTitle.textContent = w === HUMAN ? 'Você venceu!' : 'Nimbus venceu';
      el.resultSub.textContent = w === HUMAN ? 'Você derrotou a nuvem. Print ou não aconteceu.' : 'A nuvem calculou tudo antes de você.';
    } else {
      el.resultTitle.textContent = `${w} venceu!`;
      el.resultSub.textContent = 'Três em linha. Bonito de ver.';
    }
    el.result.hidden = false;
    el.again.focus();
  }

  function newRound({ advance = true } = {}) {
    clearTimeout(cpuTimer);
    clearTimeout(resultTimer);
    if (advance) round += 1;
    el.result.hidden = true;
    el.bot.classList.remove('is-happy');
    fx.clearCanvas(el.boardFx);
    const prev = state;
    state = game.createGame({ mode: settings.mode, starter: round % 2 === 0 ? 'X' : 'O' });
    render(prev);
    if (isCpuTurn()) {
      say(pick(LINES.cpuStarts));
      scheduleCpu();
    }
  }

  /* ---------------- Painéis ---------------- */

  function renderSettings() {
    document.querySelectorAll('.seg').forEach((seg) => {
      seg.querySelectorAll('.opt').forEach((opt) => {
        opt.setAttribute('aria-checked', String(settings[seg.dataset.setting] === opt.dataset.value));
      });
    });
    $('difficultyField').classList.toggle('is-disabled', settings.opponent === 'pvp');
  }

  function renderScores(bumped) {
    const s = scores[settings.opponent];
    el.scoreX.textContent = String(s.X);
    el.scoreO.textContent = String(s.O);
    el.scoreD.textContent = String(s.D);
    const vsCpu = settings.opponent === 'cpu';
    el.labelX.textContent = vsCpu ? 'Você' : 'Jogador X';
    el.labelO.textContent = vsCpu ? 'Nimbus' : 'Jogador O';
    const target = { X: el.scoreX, O: el.scoreO, D: el.scoreD }[bumped];
    if (target) {
      target.classList.remove('is-bump');
      void target.offsetWidth;
      target.classList.add('is-bump');
    }
  }

  function renderSound() {
    const on = !audio.isMuted();
    el.sound.setAttribute('aria-pressed', String(on));
    el.soundLabel.textContent = on ? 'Som on' : 'Som off';
  }

  function toggleSound() {
    audio.setMuted(!audio.isMuted());
    renderSound();
    audio.play('click');
  }

  function changeSetting(key, value) {
    if (!ALLOWED[key].includes(value) || settings[key] === value) return;
    settings = { ...settings, [key]: value };
    save(SETTINGS_KEY, settings);
    audio.play('click');
    renderSettings();
    renderScores();
    say(introLine());
    newRound({ advance: false });
  }

  /* ---------------- Eventos ---------------- */

  function bindEvents() {
    document.querySelectorAll('.seg').forEach((seg) => {
      seg.addEventListener('click', (e) => {
        const opt = e.target.closest('.opt');
        if (opt) changeSetting(seg.dataset.setting, opt.dataset.value);
      });
    });
    el.again.addEventListener('click', () => newRound());
    el.sound.addEventListener('click', toggleSound);
    $('infraBtn').addEventListener('click', cloud.openInfra);
    $('infraClose').addEventListener('click', () => el.infra.close());
    el.infra.addEventListener('click', (e) => {
      if (e.target === el.infra) el.infra.close(); // clique fora da caixa
    });
    $('resetScoreBtn').addEventListener('click', () => {
      scores = { ...scores, [settings.opponent]: ZERO };
      save(SCORES_KEY, scores);
      renderScores();
    });

    // Registrado antes do boot: enquanto started=false, o Enter é só do boot.
    root.addEventListener('keydown', (e) => {
      if (!started || el.infra.open || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[1-9]$/.test(e.key)) {
        humanPlay(Number(e.key) - 1);
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'r') newRound();
      else if (key === 'm') toggleSound();
      else if (key === 'i') cloud.openInfra();
      else if (e.key === 'Enter' && game.isOver(state) && document.activeElement !== el.again) newRound();
    });
  }

  function decorate() {
    $('brandLogo').appendChild(pixel.spriteSvg(SPRITES.X, PALETTES.X));
    $('botSprite').appendChild(pixel.spriteSvg(SPRITES.NIMBUS, PALETTES.NIMBUS, { groups: { E: 'eyes' } }));
    const sky = $('sky');
    const CLOUDS = [[12, 160, 95], [34, 112, 140], [58, 200, 120], [78, 128, 170], [90, 176, 110]];
    CLOUDS.forEach(([top, width, seconds], i) => {
      const c = document.createElement('div');
      c.className = 'cloud';
      c.style.top = `${top}%`;
      c.style.width = `${width}px`;
      c.style.animationDuration = `${seconds}s`;
      c.style.animationDelay = `${-seconds * (i / CLOUDS.length)}s`;
      c.appendChild(pixel.spriteSvg(SPRITES.CLOUD, PALETTES.CLOUD));
      sky.appendChild(c);
    });
  }

  decorate();
  bindEvents();
  renderSettings();
  renderScores();
  renderSound();
  render(null);

  cloud.runBoot(() => {
    started = true;
    render(null);
    say(introLine());
    const first = cells.find((c) => !c.disabled);
    if (first) first.focus({ preventScroll: true });
  });
})(window);
