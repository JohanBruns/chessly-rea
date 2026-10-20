// PGN-Parser mit Varianten, Kommentaren, NAGs und Lichess-Annotationen
// ([%cal ...] Pfeile, [%csl ...] Kreise). Jede Partie wird zu einem Zugbaum,
// jeder Zug wird mit chess.js auf Legalität geprüft.
import { Chess, DEFAULT_POSITION } from 'chess.js';

const RESULT_TOKENS = new Set(['1-0', '0-1', '1/2-1/2', '*']);
const SUFFIX_NAGS = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 };
const BRUSHES = { G: 'green', R: 'red', Y: 'yellow', B: 'blue' };

export class PgnError extends Error {
  constructor(message, gameIndex) {
    super(gameIndex === undefined ? message : `Partie ${gameIndex + 1}: ${message}`);
    this.name = 'PgnError';
  }
}

function tokenize(text) {
  const tokens = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === '%' && (i === 0 || text[i - 1] === '\n')) {
      // Escape-Zeile laut PGN-Standard
      while (i < n && text[i] !== '\n') i++;
    } else if (ch === '[') {
      const end = findHeaderEnd(text, i);
      const body = text.slice(i + 1, end);
      const m = body.match(/^\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*$/s);
      if (m) tokens.push({ type: 'header', key: m[1], value: m[2].replace(/\\(.)/g, '$1') });
      i = end + 1;
    } else if (ch === '{') {
      const end = text.indexOf('}', i);
      const stop = end === -1 ? n : end;
      tokens.push({ type: 'comment', value: text.slice(i + 1, stop) });
      i = stop + 1;
    } else if (ch === ';') {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      tokens.push({ type: 'comment', value: text.slice(i + 1, stop) });
      i = stop;
    } else if (ch === '(') {
      tokens.push({ type: 'open' });
      i++;
    } else if (ch === ')') {
      tokens.push({ type: 'close' });
      i++;
    } else if (ch === '$') {
      const m = text.slice(i).match(/^\$(\d+)/);
      if (m) tokens.push({ type: 'nag', value: Number(m[1]) });
      i += m ? m[0].length : 1;
    } else {
      const m = text.slice(i).match(/^[^\s{}()[\];$]+/);
      const word = m[0];
      i += word.length;
      pushWord(tokens, word);
    }
  }
  return tokens;
}

function findHeaderEnd(text, start) {
  let inString = false;
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (inString && ch === '\\') i++;
    else if (ch === '"') inString = !inString;
    else if (ch === ']' && !inString) return i;
  }
  return text.length;
}

function pushWord(tokens, word) {
  if (RESULT_TOKENS.has(word)) {
    tokens.push({ type: 'result', value: word });
    return;
  }
  // Zugnummern wie "12." oder "12..." – auch direkt am Zug ("12.Nf3")
  const numbered = word.match(/^(\d+)\.+(.*)$/);
  if (numbered) {
    if (numbered[2]) pushWord(tokens, numbered[2]);
    return;
  }
  if (/^\d+$/.test(word) || /^\.+$/.test(word)) return;
  const suffix = word.match(/^(.*?)([!?]{1,2})$/);
  if (suffix && suffix[1]) {
    tokens.push({ type: 'move', value: suffix[1] });
    if (SUFFIX_NAGS[suffix[2]]) tokens.push({ type: 'nag', value: SUFFIX_NAGS[suffix[2]] });
    return;
  }
  tokens.push({ type: 'move', value: word });
}

// Trennt Lichess-Befehle ([%cal ...], [%csl ...], [%clk ...]) vom Kommentartext.
export function parseComment(raw) {
  const shapes = [];
  let title = null;
  const text = raw.replace(/\[%(\w+)\s+([^\]]*)\]/g, (_, cmd, args) => {
    if (cmd === 'cal') {
      for (const part of args.split(',')) {
        const m = part.trim().match(/^([GRYB])([a-h][1-8])([a-h][1-8])$/);
        if (m) shapes.push({ orig: m[2], dest: m[3], brush: BRUSHES[m[1]] });
      }
    } else if (cmd === 'csl') {
      for (const part of args.split(',')) {
        const m = part.trim().match(/^([GRYB])([a-h][1-8])$/);
        if (m) shapes.push({ orig: m[2], brush: BRUSHES[m[1]] });
      }
    } else if (cmd === 'title') {
      title = args.trim();
    }
    return '';
  });
  return { text: text.replace(/\s+/g, ' ').trim(), shapes, title };
}

function createNode(parent, fields) {
  return {
    san: null,
    uci: null,
    from: null,
    to: null,
    promotion: null,
    color: null,
    moveNumber: 0,
    ply: parent ? parent.ply + 1 : 0,
    fen: null,
    comment: '',
    commentBefore: '',
    shapes: [],
    title: null,
    nags: [],
    parent,
    children: [],
    ...fields,
  };
}

function appendComment(existing, addition) {
  if (!addition) return existing;
  return existing ? `${existing} ${addition}` : addition;
}

function playMove(parent, san, gameIndex) {
  const chess = new Chess(parent.fen);
  const normalized = san.replace(/0/g, 'O');
  let move;
  try {
    move = chess.move(normalized);
  } catch {
    move = null;
  }
  if (!move) {
    const where = parent.san ? `nach ${parent.moveNumber}${parent.color === 'w' ? '.' : '...'}${parent.san}` : 'in der Startstellung';
    throw new PgnError(`Ungültiger Zug "${san}" ${where}`, gameIndex);
  }
  const node = createNode(parent, {
    san: move.san,
    uci: move.from + move.to + (move.promotion || ''),
    from: move.from,
    to: move.to,
    promotion: move.promotion || null,
    color: move.color,
    moveNumber: Number(parent.fen.split(' ')[5]),
    fen: chess.fen(),
  });
  // Doppelte Varianten (gleicher Zug an gleicher Stelle) zusammenführen
  const existing = parent.children.find((c) => c.uci === node.uci);
  if (existing) return existing;
  parent.children.push(node);
  return node;
}

function buildGame(headers, tokens, gameIndex) {
  let startFen = DEFAULT_POSITION;
  if (headers.FEN) {
    try {
      startFen = new Chess(headers.FEN).fen();
    } catch {
      throw new PgnError(`Ungültige FEN im Header: ${headers.FEN}`, gameIndex);
    }
  }
  const root = createNode(null, { fen: startFen });
  let current = root;
  let atStart = true;
  let pendingComment = '';
  const stack = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'move': {
        const node = playMove(current, token.value, gameIndex);
        if (pendingComment) {
          node.commentBefore = appendComment(node.commentBefore, pendingComment);
          pendingComment = '';
        }
        current = node;
        atStart = false;
        break;
      }
      case 'comment': {
        const { text, shapes, title } = parseComment(token.value);
        if (atStart && current === root && !stack.length) {
          root.comment = appendComment(root.comment, text);
          root.shapes.push(...shapes);
          if (title) root.title = title;
        } else if (atStart) {
          pendingComment = appendComment(pendingComment, text);
        } else {
          current.comment = appendComment(current.comment, text);
          current.shapes.push(...shapes);
          if (title) current.title = title;
        }
        break;
      }
      case 'nag':
        if (current !== root && !atStart) current.nags.push(token.value);
        break;
      case 'open':
        if (current === root) throw new PgnError('Variante ohne vorherigen Zug', gameIndex);
        stack.push(current);
        current = current.parent;
        atStart = true;
        break;
      case 'close':
        if (!stack.length) throw new PgnError('Zu viele schließende Klammern', gameIndex);
        current = stack.pop();
        atStart = false;
        pendingComment = '';
        break;
      default:
        break;
    }
  }
  if (stack.length) throw new PgnError('Nicht geschlossene Variante', gameIndex);
  return { headers, root };
}

// Liefert alle Partien einer PGN-Datei als { headers, root }.
export function parsePgn(text) {
  const tokens = tokenize(text.replace(/^﻿/, ''));
  const games = [];
  let headers = {};
  let body = [];
  let hasBody = false;

  const flush = () => {
    if (hasBody || Object.keys(headers).length) {
      games.push(buildGame(headers, body, games.length));
    }
    headers = {};
    body = [];
    hasBody = false;
  };

  let depth = 0;
  for (const token of tokens) {
    if (token.type === 'header') {
      if (hasBody) flush();
      headers[token.key] = token.value;
    } else if (token.type === 'result' && depth === 0) {
      hasBody = true;
      flush();
    } else if (token.type !== 'result') {
      if (token.type === 'open') depth++;
      if (token.type === 'close') depth--;
      body.push(token);
      hasBody = true;
    }
  }
  flush();
  return games.filter((g) => g.root.children.length > 0);
}

// Formatiert einen Knoten als "5.Nf3" bzw. "5...Nf6".
export function moveLabel(node) {
  return `${node.moveNumber}${node.color === 'w' ? '.' : '...'}${node.san}`;
}
