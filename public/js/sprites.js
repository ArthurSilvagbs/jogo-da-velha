/*
 * Pixel art do jogo. Cada sprite é uma lista de linhas; cada caractere é um pixel.
 * '.' = transparente. As cores de cada letra ficam em PALETTES.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Velha = Object.assign(root.Velha || {}, { sprites: api });
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const X = [
    'XX......XX',
    'XXX....XXX',
    '.XXX..XXX.',
    '..XXXXXX..',
    '...XXXX...',
    '...XXXX...',
    '..XXXXXX..',
    '.XXX..XXX.',
    'XXX....XXX',
    'XX......XX',
  ];

  const O = [
    '...OOOO...',
    '.OOOOOOOO.',
    '.OOO..OOO.',
    'OOO....OOO',
    'OO......OO',
    'OO......OO',
    'OOO....OOO',
    '.OOO..OOO.',
    '.OOOOOOOO.',
    '...OOOO...',
  ];

  // A "velha" que aparece quando dá empate.
  const GRANNY = [
    '......HHHH......',
    '.....HHHHHH.....',
    '......HHHH......',
    '....HHHHHHHH....',
    '...HHHHHHHHHH...',
    '..HHSSSSSSSSHH..',
    '..HSSSSSSSSSSH..',
    '..HGGGGSSGGGGH..',
    '..SGEWGGGGEWGS..',
    '..SGGGGSSGGGGS..',
    '..SSSSSssSSSSS..',
    '...SSSMMMMSSS...',
    '....SSSSSSSS....',
    '...RRRRRRRRRR...',
    '..RRrRRRRRRrRR..',
    '.RRRRRRRRRRRRRR.',
  ];

  // NIMBUS, a nuvem que joga contra você.
  const NIMBUS = [
    '......NNNN........',
    '.....NWWWWN.NNN...',
    '...NNWWWWWWNWWWN..',
    '..NWWWWWWWWWWWWWN.',
    '.NWWWWWWWWWWWWWWWN',
    '.NWWWEEWWWWWEEWWWN',
    'NWWWWEEWWWWWEEWWWN',
    'NWWWWWWWWWWWWWWWWN',
    'NWWPWWWWMMMWWWWPWN',
    'NWWWWWWWWWWWWWWWWN',
    '.NWWWWWWWWWWWWWWN.',
    '..NNNNNNNNNNNNNN..',
  ];

  const CLOUD = [
    '....CCCC......',
    '..CCCCCCCC.CC.',
    '.CCCCCCCCCCCCC',
    'CCCCCCCCCCCCCC',
    '.CCCCCCCCCCCC.',
  ];

  // Ícones do diagrama de infraestrutura.
  const DEVICE = [
    'NNNNNNNNNNNN',
    'NWWWWWWWWWWN',
    'NWRWRWWNNWWN',
    'NWWRWWWNWNWN',
    'NWRWRWWNNWWN',
    'NWWWWWWWWWWN',
    'NNNNNNNNNNNN',
    '.....NN.....',
    '...NNNNNN...',
  ];

  const GLOBE = [
    '....NNNN....',
    '..NNRWWRNN..',
    '.NRRWWWWRRN.',
    '.NWWRWWRWWN.',
    'NWWWRWWRWWWN',
    'NRRRRRRRRRRN',
    'NWWWRWWRWWWN',
    'NWWWRWWRWWWN',
    '.NWWRWWRWWN.',
    '.NRRWWWWRRN.',
    '..NNRWWRNN..',
    '....NNNN....',
  ];

  const BUCKET = [
    '.NNNNNNNNNN.',
    'NRRRRRRRRRRN',
    '.NNNNNNNNNN.',
    '.NWWWWWWWWN.',
    '.NWRRWWRRWN.',
    '..NWWWWWWN..',
    '..NWRRRRWN..',
    '..NWWWWWWN..',
    '...NWWWWN...',
    '...NNNNNN...',
  ];

  const INK = '#0E1A22';
  const RED = '#E2231A';
  const RED_DARK = '#A3160F';
  const WHITE = '#FFFFFF';

  const PALETTES = Object.freeze({
    X: { X: RED },
    O: { O: INK },
    GRANNY: { H: '#C8CDD3', S: '#F3C9A4', s: '#D9A27E', G: INK, E: INK, W: WHITE, M: RED_DARK, R: RED, r: RED_DARK },
    NIMBUS: { N: INK, W: WHITE, E: RED, P: '#FFB4AE', M: INK },
    CLOUD: { C: '#EEF0F3' },
    ICON: { N: INK, W: WHITE, R: RED },
  });

  const SPRITES = Object.freeze({ X, O, GRANNY, NIMBUS, CLOUD, DEVICE, GLOBE, BUCKET });

  return Object.freeze({ SPRITES, PALETTES, COLORS: Object.freeze({ INK, RED, RED_DARK, WHITE }) });
});
