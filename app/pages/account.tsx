import { useState, useEffect } from 'react';
import Head from 'next/head';

import { getDisplayName, DisplayNameForm } from '../components/DisplayNameForm';
import { requiresAuth, AuthProps } from '../components/AuthContext';
import { AuthoredPuzzlesV, PlayWithoutUserT } from '../lib/dbtypes';
import { getFromSessionOrDB } from '../lib/dbUtils';
import { App } from '../lib/firebaseWrapper';
import { DefaultTopBar } from '../components/TopBar';
import { getPlays } from '../lib/plays';
import { PuzzleLink } from '../components/PuzzleLink';

export const PlayListItem = ({ play, authoredPuzzles }: { play: PlayWithoutUserT, authoredPuzzles: Array<AuthoredPuzzle> | null }) => {
  return <PuzzleLink id={play.c} title={play.n} pending={authoredPuzzles ?.find(ap => ap.id === play.c) ? true : false} />;
};

export const AuthoredListItem = (props: AuthoredPuzzle) => {
  // TODO We need to use /pending/ here since we don't know if a play is for a puzzle
  // that hasn't been published yet. Any better way to do this?
  return <PuzzleLink key={props.id} id={props.id} pending={true} title={props.title} />;
};

interface AuthoredPuzzle {
  id: string,
  createdAt: firebase.firestore.Timestamp,
  title: string,
}

export default requiresAuth(({ user }: AuthProps) => {
  const [authoredPuzzles, setAuthoredPuzzles] = useState<Array<AuthoredPuzzle> | null>(null);
  const [plays, setPlays] = useState<Array<PlayWithoutUserT> | null>(null);
  const [error, setError] = useState(false);
  const [displayName, setDisplayName] = useState(getDisplayName(user));

  useEffect(() => {
    console.log('loading authored puzzles and plays');
    // TODO pagination on both of these
    Promise.all([
      getFromSessionOrDB({ collection: 'uc', docId: user.uid, validator: AuthoredPuzzlesV, ttl: -1 }),
      getPlays(user)
    ])
      .then(([authoredResult, playsResult]) => {
        if (authoredResult === null) {
          setAuthoredPuzzles([]);
        } else {
          const authored = Object.entries(authoredResult).map(([id, val]) => {
            const [createdAt, title] = val;
            return { id, createdAt, title };
          });
          // Sort in reverse order by createdAt
          authored.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
          setAuthoredPuzzles(authored);
        }
        if (playsResult === null) {
          setPlays([]);
        } else {
          const plays = Object.values(playsResult);
          // Sort in reverse order by updatedAt
          plays.sort((a, b) => b.ua.toMillis() - a.ua.toMillis());
          setPlays(plays);
        }
      }).catch(reason => {
        console.error(reason);
        setError(true);
      });
  }, [user]);

  if (error) {
    return <div>Error loading plays / authored puzzles</div>;
  }
  return (
    <>
      <Head>
        <title>Account | Crosshare</title>
      </Head>
      <DefaultTopBar />
      <div css={{ margin: '1em', }}>
        <h2>Account</h2>
        <p>You&apos;re logged in as <b>{user.email}</b>. <button onClick={() => App.auth().signOut()}>Log out</button></p>
        <p>Your display name - <i>{displayName}</i> - is displayed next to any comments you make or puzzles you create.</p>
        <DisplayNameForm user={user} onChange={setDisplayName} />
        {plays && plays.length ?
          <>
            <h2>Recent Plays</h2>
            {plays.map((play) => <PlayListItem key={play.c} play={play} authoredPuzzles={authoredPuzzles} />)}
          </>
          :
          ''
        }
        {authoredPuzzles && authoredPuzzles.length ?
          <>
            <h2>Authored Puzzles</h2>
            {authoredPuzzles.map(AuthoredListItem)}
          </>
          :
          ''
        }
      </div>
    </>
  );
});