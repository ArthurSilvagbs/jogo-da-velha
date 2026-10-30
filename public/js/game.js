/*
 * Regras puras do Jogo da Velha (sem DOM).
 * Funciona no navegador (window.Velha.game) e no Node (module.exports) para testes.
 * Todo estado é imutável: play() sempre devolve um novo estado.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Velha = Object.assign(root.Velha || {}, { game: api });
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LINES = Object.freeze([
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ]);
  // Centro, cantos, bordas: melhora a poda alfa-beta.
  const SEARCH_ORDER = Object.freeze([4, 0, 2, 6, 8, 1, 3, 5, 7]);
  const MAX_PIECES_INFINITE = 3;
  const INFINITE_MOVE_LIMIT = 40;
  const INFINITE_SEARCH_DEPTH = 7;
  const WIN_SCORE = 100;
  const MISTAKE_CHANCE = Object.freeze({ easy: 0.7, medium: 0.3, hard: 0 });

  const other = (player) => (player === 'X' ? 'O' : 'X');

  function createGame({ mode = 'classic', starter = 'X' } = {}) {
    if (mode !== 'classic' && mode !== 'infinite') throw new Error(`Modo inválido: ${mode}`);
    if (starter !== 'X' && starter !== 'O') throw new Error(`Jogador inválido: ${starter}`);
    return Object.freeze({
      mode,
      board: Object.freeze(Array(9).fill(null)),
      turn: starter,
      pieces: Object.freeze({ X: [], O: [] }),
      moveCount: 0,
      lastMove: null,
      winner: null,
      line: null,
      isDraw: false,
    });
  }

  function findWinner(board) {
    for (const line of LINES) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { player: board[a], line };
      }
    }
    return null;
  }

  const isOver = (state) => Boolean(state.winner) || state.isDraw;

  function canPlay(state, index) {
    return !isOver(state) && Number.isInteger(index) && index >= 0 && index < 9 && state.board[index] === null;
  }

  function emptyCells(state) {
    return SEARCH_ORDER.filter((i) => state.board[i] === null);
  }

  // Peça que some quando o jogador da vez jogar (só no modo infinito).
  function vanishingIndex(state) {
    if (state.mode !== 'infinite' || isOver(state)) return -1;
    const queue = state.pieces[state.turn];
    return queue.length >= MAX_PIECES_INFINITE ? queue[0] : -1;
  }

  function play(state, index) {
    if (!canPlay(state, index)) return state;

    const player = state.turn;
    const board = state.board.slice();
    let queue = state.pieces[player];
    let removed = -1;

    if (state.mode === 'infinite' && queue.length >= MAX_PIECES_INFINITE) {
      removed = queue[0];
      board[removed] = null;
      queue = queue.slice(1);
    }
    board[index] = player;

    const moveCount = state.moveCount + 1;
    const win = findWinner(board);
    const isDraw = !win && (state.mode === 'classic'
      ? board.every(Boolean)
      : moveCount >= INFINITE_MOVE_LIMIT);

    return Object.freeze({
      ...state,
      board: Object.freeze(board),
      pieces: Object.freeze({ ...state.pieces, [player]: [...queue, index] }),
      turn: other(player),
      moveCount,
      lastMove: Object.freeze({ index, player, removed }),
      winner: win ? win.player : null,
      line: win ? win.line : null,
      isDraw,
    });
  }

  function minimax(state, depth, alpha, beta, me, stats, maxDepth) {
    stats.nodes += 1;
    if (state.winner) return state.winner === me ? WIN_SCORE - depth : depth - WIN_SCORE;
    if (state.isDraw || depth >= maxDepth) return 0;

    const maximizing = state.turn === me;
    let best = maximizing ? -Infinity : Infinity;
    for (const i of emptyCells(state)) {
      const score = minimax(play(state, i), depth + 1, alpha, beta, me, stats, maxDepth);
      if (maximizing) {
        best = Math.max(best, score);
        alpha = Math.max(alpha, best);
      } else {
        best = Math.min(best, score);
        beta = Math.min(beta, best);
      }
      if (beta <= alpha) break;
    }
    return best;
  }

  // Avalia todas as jogadas e devolve as melhores (empates sorteados pelo chamador).
  function rankMoves(state) {
    const me = state.turn;
    const maxDepth = state.mode === 'infinite' ? INFINITE_SEARCH_DEPTH : 9;
    const stats = { nodes: 0 };
    let bestScore = -Infinity;
    let best = [];
    for (const i of emptyCells(state)) {
      const score = minimax(play(state, i), 1, -Infinity, Infinity, me, stats, maxDepth);
      if (score > bestScore) {
        bestScore = score;
        best = [i];
      } else if (score === bestScore) {
        best.push(i);
      }
    }
    return { best, score: bestScore, nodes: stats.nodes };
  }

  function immediateWin(state) {
    return emptyCells(state).find((i) => play(state, i).winner === state.turn);
  }

  const pick = (list, rng) => list[Math.floor(rng() * list.length)];

  /**
   * Escolhe a jogada da CPU.
   * @returns {{index:number, nodes:number, score:number, kind:'win'|'optimal'|'random'}}
   */
  function chooseMove(state, difficulty = 'hard', rng = Math.random) {
    if (!(difficulty in MISTAKE_CHANCE)) throw new Error(`Dificuldade inválida: ${difficulty}`);
    if (isOver(state)) throw new Error('A partida já acabou');

    const { best, score, nodes } = rankMoves(state);
    const winNow = immediateWin(state);

    if (difficulty !== 'easy' && winNow !== undefined) {
      return { index: winNow, nodes, score, kind: 'win' };
    }
    if (rng() < MISTAKE_CHANCE[difficulty]) {
      return { index: pick(emptyCells(state), rng), nodes, score, kind: 'random' };
    }
    return { index: pick(best, rng), nodes, score, kind: 'optimal' };
  }

  return Object.freeze({
    LINES,
    MAX_PIECES_INFINITE,
    INFINITE_MOVE_LIMIT,
    createGame,
    findWinner,
    isOver,
    canPlay,
    emptyCells,
    vanishingIndex,
    play,
    chooseMove,
    other,
  });
});
