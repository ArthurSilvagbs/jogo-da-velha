const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../public/js/game.js');
const { SPRITES, PALETTES } = require('../public/js/sprites.js');

// RNG determinístico para os testes de IA.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const playAll = (state, moves) => moves.reduce(game.play, state);

test('findWinner detecta linha, coluna e diagonal', () => {
  assert.deepEqual(game.findWinner(['X', 'X', 'X', null, null, null, null, null, null]), { player: 'X', line: [0, 1, 2] });
  assert.deepEqual(game.findWinner(['O', null, null, 'O', null, null, 'O', null, null]), { player: 'O', line: [0, 3, 6] });
  assert.deepEqual(game.findWinner([null, null, 'X', null, 'X', null, 'X', null, null]), { player: 'X', line: [2, 4, 6] });
  assert.equal(game.findWinner(Array(9).fill(null)), null);
});

test('play não altera o estado original', () => {
  const start = game.createGame();
  const next = game.play(start, 4);
  assert.equal(start.board[4], null);
  assert.equal(next.board[4], 'X');
  assert.equal(next.turn, 'O');
  assert.ok(Object.isFrozen(next.board));
});

test('play ignora casa ocupada, índice inválido e partida encerrada', () => {
  const s = game.play(game.createGame(), 0);
  assert.equal(game.play(s, 0), s);
  assert.equal(game.play(s, 9), s);
  assert.equal(game.play(s, -1), s);
  assert.equal(game.play(s, 1.5), s);
  const won = playAll(game.createGame(), [0, 3, 1, 4, 2]);
  assert.equal(won.winner, 'X');
  assert.equal(game.play(won, 8), won);
});

test('createGame valida modo e jogador inicial', () => {
  assert.throws(() => game.createGame({ mode: 'turbo' }));
  assert.throws(() => game.createGame({ starter: 'Z' }));
  assert.equal(game.createGame({ starter: 'O' }).turn, 'O');
});

test('modo clássico detecta empate com tabuleiro cheio', () => {
  // X O X / X O O / O X X
  const s = playAll(game.createGame(), [0, 1, 2, 4, 3, 5, 7, 6, 8]);
  assert.equal(s.winner, null);
  assert.equal(s.isDraw, true);
});

test('modo infinito: a 4ª peça apaga a mais antiga do mesmo jogador', () => {
  let s = playAll(game.createGame({ mode: 'infinite' }), [0, 4, 8, 2, 6]);
  // X: 0, 8, 6 | O: 4, 2 — vez do O (ainda com 2 peças)
  assert.equal(game.vanishingIndex(s), -1);
  s = game.play(s, 7); // O: 4, 2, 7
  assert.equal(game.vanishingIndex(s), 0); // próxima jogada do X apaga a casa 0
  s = game.play(s, 1);
  assert.equal(s.board[0], null);
  assert.equal(s.board[1], 'X');
  assert.deepEqual(s.pieces.X, [8, 6, 1]);
  assert.equal(s.lastMove.removed, 0);
});

test('modo infinito nunca passa de 3 peças por jogador e empata no limite de jogadas', () => {
  const rng = mulberry32(7);
  let s = game.createGame({ mode: 'infinite' });
  while (!game.isOver(s)) {
    const safe = game.emptyCells(s).filter((i) => !game.play(s, i).winner);
    const options = safe.length ? safe : game.emptyCells(s);
    s = game.play(s, options[Math.floor(rng() * options.length)]);
    assert.ok(s.board.filter((c) => c === 'X').length <= game.MAX_PIECES_INFINITE);
    assert.ok(s.board.filter((c) => c === 'O').length <= game.MAX_PIECES_INFINITE);
  }
  assert.ok(s.moveCount <= game.INFINITE_MOVE_LIMIT);
  if (!s.winner) assert.equal(s.moveCount, game.INFINITE_MOVE_LIMIT);
});

test('IA difícil vence quando pode e bloqueia quando precisa', () => {
  // X X _ / O O _ / _ _ _ — vez do X: deve fechar em 2
  const win = playAll(game.createGame(), [0, 3, 1, 4]);
  assert.equal(game.chooseMove(win, 'hard').index, 2);
  // X X _ / O _ _ / _ _ _ — vez do O: deve bloquear em 2
  const block = playAll(game.createGame(), [0, 3, 1]);
  assert.equal(game.chooseMove(block, 'hard').index, 2);
});

test('IA difícil contra ela mesma sempre empata', () => {
  const rng = mulberry32(42);
  for (let round = 0; round < 6; round += 1) {
    let s = game.createGame({ starter: round % 2 ? 'O' : 'X' });
    while (!game.isOver(s)) s = game.play(s, game.chooseMove(s, 'hard', rng).index);
    assert.equal(s.isDraw, true);
  }
});

test('IA difícil nunca perde para jogadas aleatórias', () => {
  const rng = mulberry32(1337);
  for (let round = 0; round < 60; round += 1) {
    let s = game.createGame({ starter: round % 2 ? 'O' : 'X' });
    while (!game.isOver(s)) {
      const empty = game.emptyCells(s);
      const index = s.turn === 'O'
        ? game.chooseMove(s, 'hard', rng).index
        : empty[Math.floor(rng() * empty.length)];
      s = game.play(s, index);
    }
    assert.notEqual(s.winner, 'X');
  }
});

test('chooseMove informa posições analisadas e valida entradas', () => {
  const r = game.chooseMove(game.createGame(), 'hard', mulberry32(1));
  assert.ok(r.nodes > 1000);
  assert.ok(game.canPlay(game.createGame(), r.index));
  assert.throws(() => game.chooseMove(game.createGame(), 'insano'));
  const won = playAll(game.createGame(), [0, 3, 1, 4, 2]);
  assert.throws(() => game.chooseMove(won, 'hard'));
});

test('IA no modo infinito responde rápido e com jogada válida', () => {
  const s = playAll(game.createGame({ mode: 'infinite' }), [4, 0]);
  const t0 = Date.now();
  const r = game.chooseMove(s, 'hard', mulberry32(3));
  assert.ok(Date.now() - t0 < 1500, 'busca lenta demais');
  assert.ok(game.canPlay(s, r.index));
});

test('sprites são retangulares e toda letra tem cor', () => {
  const paletteFor = { X: 'X', O: 'O', GRANNY: 'GRANNY', NIMBUS: 'NIMBUS', CLOUD: 'CLOUD', DEVICE: 'ICON', GLOBE: 'ICON', BUCKET: 'ICON' };
  for (const [name, rows] of Object.entries(SPRITES)) {
    const width = rows[0].length;
    rows.forEach((row, i) => assert.equal(row.length, width, `${name} linha ${i}`));
    const palette = PALETTES[paletteFor[name]];
    for (const ch of rows.join('').replace(/\./g, '')) {
      assert.ok(palette[ch], `${name}: cor faltando para "${ch}"`);
    }
  }
});
