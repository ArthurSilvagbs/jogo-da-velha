/*
 * Camada "nuvem" da apresentação:
 *  - lê cloud.json (gerado no deploy) e mede latência real até a borda do CloudFront;
 *  - mostra tudo no HUD do rodapé e no diagrama de infra;
 *  - roda a tela de boot.
 * Dados externos só entram na página via textContent (nunca innerHTML).
 */
(function (root) {
  'use strict';

  const { sprites, pixel, audio, fx } = root.Velha;
  const { SPRITES, PALETTES, COLORS } = sprites;

  const META_URL = 'cloud.json';
  const PING_URL = 'ping.txt';
  const PING_EVERY_MS = 4000;
  const FETCH_TIMEOUT_MS = 2500;
  const HISTORY = 18;
  const TEXT_MAX = 48;
  const BOOT_LINE_MS = 240;

  const REGIONS = {
    'sa-east-1': 'São Paulo', 'us-east-1': 'N. Virginia', 'us-east-2': 'Ohio', 'us-west-1': 'N. California',
    'us-west-2': 'Oregon', 'ca-central-1': 'Canadá', 'eu-west-1': 'Irlanda', 'eu-west-2': 'Londres',
    'eu-central-1': 'Frankfurt', 'eu-south-2': 'Espanha', 'ap-northeast-1': 'Tóquio',
  };
  // Primeiras 3 letras do POP do CloudFront = código IATA do aeroporto mais próximo.
  const AIRPORTS = {
    GRU: 'São Paulo', GIG: 'Rio de Janeiro', FOR: 'Fortaleza', POA: 'Porto Alegre', BOG: 'Bogotá',
    EZE: 'Buenos Aires', SCL: 'Santiago', LIM: 'Lima', MIA: 'Miami', IAD: 'Washington', JFK: 'Nova York',
    ATL: 'Atlanta', DFW: 'Dallas', LAX: 'Los Angeles', SFO: 'São Francisco', SEA: 'Seattle',
    LHR: 'Londres', FRA: 'Frankfurt', CDG: 'Paris', MAD: 'Madri', LIS: 'Lisboa', NRT: 'Tóquio',
  };

  const $ = (id) => document.getElementById(id);
  const clean = (v) => (typeof v === 'string' ? v.replace(/[^\p{L}\p{N} .:+\-/()_,]/gu, '').slice(0, TEXT_MAX) : '');
  const regionLabel = (code) => (REGIONS[code] ? `${code} · ${REGIONS[code]}` : code || '—');
  const popCity = (pop) => AIRPORTS[pop.slice(0, 3)] || '';

  let cloud = { meta: null, last: null, history: [] };

  /* ---------------- Coleta ---------------- */

  async function fetchWithTimeout(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadMeta() {
    try {
      const res = await fetchWithTimeout(META_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return {
        isCloud: true,
        provider: clean(data.provider) || 'AWS',
        service: clean(data.service) || 'S3 + CloudFront',
        region: clean(data.region),
        version: clean(data.version),
        deployedAt: clean(data.deployedAt),
      };
    } catch (error) {
      // Sem cloud.json = rodando fora da AWS (dev local). Não é erro para o jogador.
      return { isCloud: false, provider: 'Local', service: 'Servidor de dev', region: '', version: 'dev', reason: error.message };
    }
  }

  async function ping() {
    const t0 = performance.now();
    try {
      const res = await fetchWithTimeout(`${PING_URL}?t=${Date.now()}`);
      await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xcache = clean(res.headers.get('x-cache') || '');
      return {
        ok: true,
        ms: Math.round(performance.now() - t0),
        pop: clean(res.headers.get('x-amz-cf-pop') || ''),
        cache: /hit/i.test(xcache) ? 'HIT' : /miss/i.test(xcache) ? 'MISS' : '',
      };
    } catch (error) {
      return { ok: false, ms: null, pop: '', cache: '', error: error.message };
    }
  }

  async function sample() {
    const result = await ping();
    cloud = { ...cloud, last: result, history: [...cloud.history, result].slice(-HISTORY) };
    renderHud();
    return result;
  }

  /* ---------------- HUD ---------------- */

  function renderHud() {
    const { meta, last, history } = cloud;
    if (!meta) return;
    const online = last ? last.ok : true;
    $('hud').classList.toggle('is-live', meta.isCloud && online);
    $('hudStatus').textContent = !online ? 'Offline' : meta.isCloud ? 'Online' : 'Local';
    $('hudProvider').textContent = meta.provider;
    $('hudService').textContent = meta.service;
    $('hudRegion').textContent = meta.isCloud ? regionLabel(meta.region) : 'localhost';
    $('hudEdge').textContent = last && last.pop ? `${last.pop} · ${popCity(last.pop)}`.replace(/ · $/, '') : '—';
    $('hudCache').textContent = (last && last.cache) || '—';
    $('hudPing').textContent = last && last.ok ? `${last.ms} ms` : '—';

    const max = Math.max(40, ...history.filter((s) => s.ok).map((s) => s.ms));
    const bars = history.map((s) => {
      const bar = document.createElement('i');
      if (!s.ok) bar.className = 'is-fail';
      else bar.style.height = `${4 + Math.round((s.ms / max) * 12)}px`;
      return bar;
    });
    $('hudSpark').replaceChildren(...bars);
  }

  /* ---------------- Diagrama de infra ---------------- */

  function node(sprite, name, detail) {
    const li = document.createElement('li');
    li.className = 'node';
    const icon = document.createElement('div');
    icon.className = 'node__icon';
    icon.appendChild(pixel.spriteSvg(sprite, PALETTES.ICON));
    const n = document.createElement('span');
    n.className = 'node__name';
    n.textContent = name;
    const d = document.createElement('span');
    d.className = 'node__detail';
    d.textContent = detail;
    li.append(icon, n, d);
    return li;
  }

  function wire() {
    const li = document.createElement('li');
    li.className = 'wire';
    li.setAttribute('aria-hidden', 'true');
    return li;
  }

  function fact(label, text) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    span.append(strong, text);
    li.appendChild(span);
    return li;
  }

  function renderInfra() {
    const { meta, last } = cloud;
    const isCloud = meta && meta.isCloud;
    const pop = last && last.pop;
    const edge = pop ? `Borda ${pop.slice(0, 3)} · ${popCity(pop) || pop}` : 'CDN global';

    $('infraFlow').replaceChildren(
      node(SPRITES.DEVICE, 'Você', 'Navegador · a IA roda aqui'),
      wire(),
      node(SPRITES.GLOBE, isCloud ? 'CloudFront' : 'Servidor local', isCloud ? edge : 'localhost'),
      wire(),
      node(SPRITES.BUCKET, isCloud ? 'Amazon S3' : 'Pasta /public', isCloud ? regionLabel(meta.region) : 'arquivos estáticos'),
    );

    const live = last && last.ok
      ? `último ping ${last.ms} ms${last.cache ? ` · cache ${last.cache}` : ''}${meta && meta.version ? ` · versão ${meta.version}` : ''}`
      : 'sem resposta do servidor agora';

    $('infraFacts').replaceChildren(
      fact('Hospedagem', isCloud
        ? `HTML, CSS e JS num bucket S3 privado em ${regionLabel(meta.region)}. Só o CloudFront lê o bucket (Origin Access Control).`
        : 'rodando localmente. Faça o deploy com deploy/deploy.sh para ver a AWS aqui.'),
      fact('Entrega', 'CloudFront com HTTPS, HTTP/2 e HTTP/3, compressão e cache na borda mais perto de quem joga.'),
      fact('Computação', 'a IA minimax roda no navegador do jogador. Mil pessoas jogando = zero servidor para escalar.'),
      fact('Infra como código', 'bucket, CDN e permissões saem de um template CloudFormation (infra/template.yaml).'),
      fact('Ao vivo', live),
    );
  }

  function openInfra() {
    const dialog = $('infra');
    if (dialog.open) return;
    renderInfra();
    dialog.showModal();
  }

  /* ---------------- Boot ---------------- */

  function bootLine(key, value) {
    const li = document.createElement('li');
    const k = document.createElement('span');
    k.className = 'k';
    k.textContent = `> ${key}`;
    const dots = document.createElement('span');
    dots.className = 'dots';
    const v = document.createElement('span');
    v.className = 'v';
    v.textContent = value;
    li.append(k, dots, v);
    return li;
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, fx.reduceMotion() ? 0 : ms));

  async function runBoot(onStart) {
    const log = $('bootLog');
    const startBtn = $('startBtn');
    let started = false;

    const start = () => {
      if (started || startBtn.disabled) return;
      started = true;
      root.removeEventListener('keydown', onKey);
      audio.play('start');
      fx.dissolve($('dissolve'), COLORS.RED, () => {
        $('boot').hidden = true;
        onStart();
      });
    };
    const onKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        start();
      }
    };
    startBtn.addEventListener('click', start);
    root.addEventListener('keydown', onKey);

    log.appendChild(bootLine('Sistema', 'VELHA.OS 1.0'));
    const [meta, first] = await Promise.all([loadMeta(), ping()]);
    cloud = { ...cloud, meta, last: first, history: [first] };
    renderHud();
    setInterval(sample, PING_EVERY_MS);

    const lines = meta.isCloud
      ? [
        ['Nuvem', `${meta.provider} · ${meta.service}`],
        ['Região', regionLabel(meta.region)],
        ['Borda', first.pop ? `${first.pop} ${popCity(first.pop)}`.trim() : 'CloudFront'],
        ['Latência', first.ok ? `${first.ms} ms` : '—'],
      ]
      : [['Nuvem', 'modo local'], ['Latência', first.ok ? `${first.ms} ms` : '—']];
    lines.push(['IA Nimbus', 'pronta'], ['Partidas possíveis', '255.168']);

    for (const [k, v] of lines) {
      await wait(BOOT_LINE_MS);
      log.appendChild(bootLine(k, v));
    }
    await wait(BOOT_LINE_MS);
    startBtn.disabled = false;
    startBtn.focus();
  }

  root.Velha = Object.assign(root.Velha || {}, {
    cloud: { runBoot, openInfra },
  });
})(window);
