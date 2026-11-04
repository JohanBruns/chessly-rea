// Prüft den PGN-Neubau aus downloader/lines/<Kurs>.json (ohne vorhandene PGN-Vorlage).
import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { buildNewPgn, buildPgn, slugify } from '../scripts/buildFromChessly.js';
import { buildCourse } from '../src/courseLoader.js';
import { parsePgn } from '../src/pgnParser.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_D4 = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1';
const AFTER_D5 = 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq d6 0 2';

function course(overrides = {}) {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    name: 'Test Course',
    description: 'Ein Testkurs.',
    color: 'w',
    chapters: [
      {
        id: 'c1',
        name: 'Kapitel Eins',
        description: 'Das erste Kapitel.',
        studies: [
          {
            id: 's1',
            name: 'Study Eins',
            hasVideo: true,
            videos: ['/downloader/downloads/Test Course/01-01 Kapitel Eins - Study Eins.mp4'],
            variations: [
              {
                id: 'v1',
                index: 1,
                startFen: START,
                moves: [
                  { fen: START, san: 'd4', nextFen: AFTER_D4 },
                  { fen: AFTER_D4, san: 'd5', nextFen: AFTER_D5 },
                ],
              },
            ],
            comments: {
              [START]: [{ text: 'Los geht es.', arrows: { opportunities: ['d2d4'] }, highlights: { threats: ['e5'] } }],
            },
          },
        ],
      },
      {
        id: 'c2',
        name: 'Kapitel Zwei',
        description: 'Das zweite Kapitel.',
        studies: [
          {
            id: 's2',
            name: 'Study Zwei',
            hasVideo: false,
            videos: [],
            variations: [
              {
                id: 'v2',
                index: 1,
                startFen: START,
                moves: [{ fen: START, san: 'd4', nextFen: AFTER_D4 }],
              },
            ],
            comments: {},
          },
          {
            id: 's3',
            name: 'Study Drei',
            hasVideo: false,
            videos: [],
            variations: [],
            comments: {},
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('buildNewPgn', () => {
  it('schreibt Kopfzeilen, Kapitel, Video und Farbe', () => {
    const pgn = buildNewPgn(course());
    const games = parsePgn(pgn);

    // Die study ohne Züge fällt beim Parsen weg – sie hat keine Varianten.
    expect(games).toHaveLength(2);
    expect(games[0].headers).toMatchObject({
      Course: 'Test Course',
      ChesslyCourse: '11111111-2222-3333-4444-555555555555',
      CourseDescription: 'Ein Testkurs.',
      CourseColor: 'white',
      Chapter: 'Kapitel Eins',
      ChapterDescription: 'Das erste Kapitel.',
      Study: 'Study Eins',
      Video: '/downloader/downloads/Test Course/01-01 Kapitel Eins - Study Eins.mp4',
      Orientation: 'white',
    });
    expect(games[1].headers.ChapterDescription).toBe('Das zweite Kapitel.');
    expect(games[1].headers.Video).toBeUndefined();
  });

  it('übernimmt Züge, Kommentare und Pfeile', () => {
    const [game] = parsePgn(buildNewPgn(course()));

    expect(game.root.comment).toContain('Los geht es.');
    expect(game.root.shapes).toEqual(
      expect.arrayContaining([
        { orig: 'd2', dest: 'd4', brush: 'green' },
        { orig: 'e5', brush: 'red' },
      ]),
    );
    expect(game.root.children[0].san).toBe('d4');
    expect(game.root.children[0].children[0].san).toBe('d5');
  });

  it('setzt bei abweichender Startstellung FEN und SetUp', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const afterC5 = new Chess(fen);
    afterC5.move('c5');
    const pgn = buildNewPgn(course({
      chapters: [{
        id: 'c1',
        name: 'Kapitel',
        description: '',
        studies: [{
          id: 's1',
          name: 'Study',
          videos: [],
          variations: [{
            id: 'v1',
            index: 1,
            startFen: fen,
            moves: [{ fen, san: 'c5', nextFen: afterC5.fen() }],
          }],
          comments: {},
        }],
      }],
    }));
    const [game] = parsePgn(pgn);

    expect(game.headers.FEN).toBe(fen);
    expect(game.headers.SetUp).toBe('1');
  });

  it('nutzt black, wenn der Kurs für Schwarz ist', () => {
    const [game] = parsePgn(buildNewPgn(course({ color: 'b' })));
    expect(game.headers.Orientation).toBe('black');
    expect(game.headers.CourseColor).toBe('black');
  });
});

// Beim Scandinavian-Kurs hängt Chessly die Einführung an den ersten Zug statt an die Startstellung.
describe('Einführung am ersten Zug', () => {
  function study(comments) {
    return course({
      chapters: [{
        id: 'c1',
        name: 'Kapitel',
        description: '',
        studies: [{
          id: 's1',
          name: 'Study',
          videos: [],
          variations: [{
            id: 'v1',
            index: 1,
            startFen: START,
            moves: [
              { fen: START, san: 'd4', nextFen: AFTER_D4 },
              { fen: AFTER_D4, san: 'd5', nextFen: AFTER_D5 },
            ],
          }],
          comments,
        }],
      }],
    });
  }
  const onFirstMove = { [AFTER_D4]: [{ text: 'Willkommen im Kurs.', arrows: { opportunities: ['d7d5'] } }] };

  it('macht den Text des ersten Zugs zur Einführung der Study', () => {
    const [game] = parsePgn(buildNewPgn(study(onFirstMove)));

    expect(game.root.comment).toBe('Willkommen im Kurs.');
  });

  it('zeigt den Text nicht noch einmal am Zug, lässt dort aber die Pfeile', () => {
    const [game] = parsePgn(buildNewPgn(study(onFirstMove)));
    const first = game.root.children[0];

    expect(first.comment || '').not.toContain('Willkommen');
    expect(first.shapes).toEqual([{ orig: 'd7', dest: 'd5', brush: 'green' }]);
  });

  it('bevorzugt den Kommentar der Startstellung und lässt den Zug-Kommentar stehen', () => {
    const comments = { ...onFirstMove, [START]: [{ text: 'Start.' }] };
    const [game] = parsePgn(buildNewPgn(study(comments)));

    expect(game.root.comment).toBe('Start.');
    expect(game.root.children[0].comment).toContain('Willkommen im Kurs.');
  });

  it('bevorzugt eine eigene Einführung aus der Übersetzung', () => {
    const [game] = parsePgn(buildNewPgn(study(onFirstMove), { translations: { 'intro:s1': 'Eigener Text.' } }));

    expect(game.root.comment).toBe('Eigener Text.');
    expect(game.root.children[0].comment).toContain('Willkommen im Kurs.');
  });

  it('übersetzt den Text, wenn eine Übersetzung vorliegt', () => {
    const translations = { 'Willkommen im Kurs.': 'Welcome to the course.' };
    const [game] = parsePgn(buildNewPgn(study(onFirstMove), { translations }));

    expect(game.root.comment).toBe('Welcome to the course.');
  });

  it('bleibt beim Neuaufbau einer vorhandenen PGN gleich (npm run neuaufbau)', () => {
    const chessly = study(onFirstMove);
    const pgn = buildNewPgn(chessly);

    expect(buildPgn(pgn, chessly)).toBe(pgn);
  });
});

// Skill-Kurse haben bei Chessly keine Linien: jede Lektion wird eine Study mit einem Video.
describe('Skill-Kurs (nur Videos)', () => {
  const lesson = (id, name, file) => ({
    id,
    name,
    hasVideo: true,
    videos: [`/downloader/downloads/Skills/${file}`],
    variations: [],
    comments: {},
  });
  const skill = course({
    kind: 'skill',
    color: '',
    chapters: [
      { id: 'c1', name: 'Gabeln', description: '', studies: [lesson('l1', 'Doppelangriff', '01-01 Gabeln - Doppelangriff.mp4'), lesson('l2', 'Fesselung', '01-02 Gabeln - Fesselung.mp4')] },
      { id: 'c2', name: 'Matt', description: '', studies: [lesson('l3', 'Matt in 1', '02-01 Matt - Matt in 1.mp4')] },
    ],
  });

  it('schreibt jede Lektion als Partie ohne Züge mit Video, aber ohne Farbe', () => {
    const pgn = buildNewPgn(skill);
    const games = parsePgn(pgn);

    expect(games.map((g) => g.headers.Study)).toEqual(['Doppelangriff', 'Fesselung', 'Matt in 1']);
    expect(games[0].headers.Video).toBe('/downloader/downloads/Skills/01-01 Gabeln - Doppelangriff.mp4');
    expect(pgn).not.toMatch(/CourseColor|Orientation/);
  });

  it('wird in der App zu einem Video-Kurs', () => {
    const built = buildCourse({ pgn: buildNewPgn(skill) });

    expect(built.videoOnly).toBe(true);
    expect(built.chapters.map((c) => c.studies.length)).toEqual([2, 1]);
    expect(built.chesslyId).toBe(skill.id);
  });
});

describe('slugify', () => {
  it('macht aus dem Kursnamen einen Dateinamen', () => {
    expect(slugify("The London System")).toBe('the-london-system');
    expect(slugify('Caro-Kann: Advance (3. e5)')).toBe('caro-kann-advance-3-e5');
    expect(slugify('Weiß & Schwarz')).toBe('weiss-schwarz');
  });
});
