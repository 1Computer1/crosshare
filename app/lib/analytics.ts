/* This gets used by the analytics cron function in the `functions` directory.

It lives here so we can test it. */
import type firebase from 'firebase-admin';
import { PathReporter } from 'io-ts/lib/PathReporter';
import { isRight } from 'fp-ts/lib/Either';

import {
  LegacyPlayV,
  PuzzleStatsT,
  PuzzleStatsV,
  DailyStatsV,
  DailyStatsT,
  DBPuzzleV,
  DBPuzzleT,
  getDateString,
  MetaSubmissionForPuzzleT,
} from './dbtypes';

import { FieldValue, TimestampType } from './firebaseWrapper';

export async function runAnalytics(
  db: firebase.firestore.Firestore,
  startTimestamp: TimestampType,
  endTimestamp: TimestampType
) {
  console.log(
    'Updating analytics btwn',
    startTimestamp.toDate().toLocaleString(),
    endTimestamp.toDate().toLocaleString()
  );

  const puzzleMap: Map<string, DBPuzzleT> = new Map();
  const puzzleNewSubs: Map<string, Array<MetaSubmissionForPuzzleT>> = new Map();
  const puzzleStatsMap: Map<string, PuzzleStatsT> = new Map();
  const dailyStatsMap: Map<string, DailyStatsT> = new Map();

  // Get puzzle obj from cache or db
  async function getPuzzle(puzzleId: string): Promise<DBPuzzleT | null> {
    const puzzle = puzzleMap.get(puzzleId);
    if (puzzle) {
      return puzzle;
    }
    const puzzleRes = await db.collection('c').doc(puzzleId).get();
    if (!puzzleRes.exists) {
      console.log('Missing puzzle but have play: ' + puzzleId);
      return null;
    }
    const dbpuzzle = DBPuzzleV.decode(puzzleRes.data());
    if (!isRight(dbpuzzle)) {
      console.error(PathReporter.report(dbpuzzle).join(','));
      throw new Error('Malformed puzzle');
    }
    puzzleMap.set(puzzleId, dbpuzzle.right);
    return dbpuzzle.right;
  }

  // Get puzzle stats from cache or db or create
  async function getPuzzleStats(
    puzzleId: string
  ): Promise<PuzzleStatsT | null> {
    // Make sure we have a puzzle stats obj in the cache for the relevant puzzle
    let puzzleStats = puzzleStatsMap.get(puzzleId);
    if (!puzzleStats) {
      // get puzzle stats from db or create a new stats object
      const psvalue = await db.collection('s').doc(puzzleId).get();
      if (psvalue.exists) {
        const result = PuzzleStatsV.decode(psvalue.data());
        if (!isRight(result)) {
          console.error(PathReporter.report(result).join(','));
          throw new Error('Malformed puzzle stats');
        }
        puzzleStats = result.right;
        puzzleStatsMap.set(puzzleId, puzzleStats);
      } else {
        const puzzle = await getPuzzle(puzzleId);
        if (!puzzle) {
          return null;
        }
        puzzleStats = {
          a: puzzle.a,
          ua: endTimestamp,
          n: 0,
          s: 0,
          nt: 0,
          st: 0,
          ct: [],
          uc: [],
          sct: Array.from(
            { length: 6 },
            () => Math.random().toString(36)[2]
          ).join(''),
        };
        puzzleStatsMap.set(puzzleId, puzzleStats);
      }
    }
    return puzzleStats;
  }

  const value = await db
    .collection('p')
    .where('f', '==', true)
    .where('ua', '>=', startTimestamp)
    .where('ua', '<', endTimestamp)
    .orderBy('ua', 'asc')
    .get();
  console.log('Updating analytics for ' + value.size + ' plays');

  for (const doc of value.docs) {
    const validationResult = LegacyPlayV.decode(doc.data());
    if (!isRight(validationResult)) {
      console.error(PathReporter.report(validationResult).join(','));
      throw new Error('Malformed play');
    }
    const play = validationResult.right;

    const puzzleStats = await getPuzzleStats(play.c);
    if (!puzzleStats) {
      continue;
    }

    // don't count the author's play in puzzle stats
    if (puzzleStats.a === play.u) {
      continue;
    }

    puzzleStats.ua = endTimestamp;
    puzzleStats.n += 1;
    puzzleStats.nt += play.t;
    if (!play.ch) {
      puzzleStats.s += 1;
      puzzleStats.st += play.t;
    }
    const maxTime = Math.max(...play.ct);
    const maxCount = Math.max(...play.uc);
    for (let i = 0; i < play.ct.length; i += 1) {
      let updateTime = play.ct[i];
      const updateIters = play.uc[i];
      if (updateTime === undefined || updateIters === undefined) {
        throw new Error('oob');
      }
      if (play.rc.indexOf(i) !== -1 || play.we.indexOf(i) !== -1) {
        /* If a cell was revealed or checked & wrong, make it's update time the
         * end of the play. This way cheat cells always show as taking the
         * longest for the user in question. */
        updateTime = play.t;
      }
      puzzleStats.ct[i] = (puzzleStats.ct[i] || 0) + updateTime / maxTime;
      puzzleStats.uc[i] = (puzzleStats.uc[i] || 0) + updateIters / maxCount;
    }

    // Next update daily stats for the relevant date
    const pd = play.ua.toDate();
    const dateString = getDateString(pd);
    let dailyStats = dailyStatsMap.get(dateString);
    if (!dailyStats) {
      // get daily stats from db or create a new stats object
      const dsvalue = await db.collection('ds').doc(dateString).get();
      if (dsvalue.exists) {
        const result = DailyStatsV.decode(dsvalue.data());
        if (!isRight(result)) {
          console.error(PathReporter.report(result).join(','));
          throw new Error('Malformed daily stats');
        }
        dailyStats = result.right;
        dailyStatsMap.set(dateString, dailyStats);
      } else {
        dailyStats = {
          ua: endTimestamp,
          n: 0,
          u: [],
          c: {},
          i: {},
          h: Array<number>(24).fill(0),
        };
        dailyStatsMap.set(dateString, dailyStats);
      }
    }
    dailyStats.ua = endTimestamp;
    dailyStats.n += 1;
    if (dailyStats.u.indexOf(play.u) === -1) {
      dailyStats.u.push(play.u);
    }
    dailyStats.c[play.c] = (dailyStats.c[play.c] || 0) + 1;
    if (dailyStats.i && !dailyStats.i[play.c]) {
      const puzzle = await getPuzzle(play.c);
      if (!puzzle) {
        continue;
      }
      dailyStats.i[play.c] = [puzzle.t, puzzle.n, puzzle.a];
    }
    const hour = pd.getUTCHours();
    dailyStats.h[hour] = (dailyStats.h[hour] || 0) + 1;
  }

  const metaSubmissions = await db
    .collection('p')
    .where('ct_t', '>=', startTimestamp)
    .where('ct_t', '<', endTimestamp)
    .orderBy('ct_t', 'asc')
    .get();
  console.log('Now updating meta stats for ' + metaSubmissions.size + ' plays');
  for (const doc of metaSubmissions.docs) {
    const validationResult = LegacyPlayV.decode(doc.data());
    if (!isRight(validationResult)) {
      console.error(PathReporter.report(validationResult).join(','));
      throw new Error('Malformed play');
    }
    const play = validationResult.right;

    if (!play.ct_n || !play.ct_sub || !play.ct_t) {
      throw new Error(
        'Bad meta submission for play u: ' + play.u + ' c: ' + play.c
      );
    }

    const puzzleStats = await getPuzzleStats(play.c);
    if (!puzzleStats) {
      continue;
    }

    if (!puzzleStats.ct_subs) {
      puzzleStats.ct_subs = [];
    }
    puzzleStats.ct_subs.push({
      n: play.ct_n,
      e: play.ct_em || null,
      u: play.u,
      s: play.ct_sub,
      t: play.ct_t,
    });

    const puzzle = await getPuzzle(play.c);
    if (!puzzle) {
      continue;
    }

    let subs = puzzleNewSubs.get(play.c);
    if (!subs) {
      subs = [];
    }
    subs.push({ n: play.ct_n, t: play.ct_t, s: play.ct_sub });
    puzzleNewSubs.set(play.c, subs);
  }

  console.log('Done, writing ' + puzzleStatsMap.size + ' puzzle stats objects');
  for (const [crosswordId, puzzleStats] of puzzleStatsMap.entries()) {
    await db.collection('s').doc(crosswordId).set(puzzleStats);
  }
  console.log('Writing ' + dailyStatsMap.size + ' daily stats objects');
  for (const [dateString, dailyStats] of dailyStatsMap.entries()) {
    await db.collection('ds').doc(dateString).set(dailyStats);
  }
  console.log('Writing ' + puzzleNewSubs.size + ' new puzzle submissions');
  for (const [crosswordId, subs] of puzzleNewSubs.entries()) {
    await db
      .collection('c')
      .doc(crosswordId)
      .update({
        ct_subs: FieldValue.arrayUnion(...subs),
      });
  }
}
