import React from 'react';
import fs from 'fs';
import util from 'util';
import path from 'path';

import { getUser, cleanup, render, fireEvent } from '../lib/testingUtils';
import UploadPage from '../pages/upload';
import { setApp } from '../lib/firebaseWrapper';
import * as firebaseTesting from '@firebase/testing';
import NextJSRouter from 'next/router';
import PuzzlePage, { getServerSideProps } from '../pages/crosswords/[puzzleId]';
import waitForExpect from 'wait-for-expect';

const readFile = util.promisify(fs.readFile);


jest.mock('next/router', () => ({ push: jest.fn() }));
jest.mock('../lib/firebaseWrapper');
jest.mock('../lib/WordDB');

afterEach(() => {
  jest.clearAllMocks();
});

let serverApp: firebase.app.App, randoApp: firebase.app.App, adminUserApp: firebase.app.App, app: firebase.app.App, admin: firebase.app.App;

beforeAll(async () => {
  serverApp = firebaseTesting.initializeTestApp({ projectId }) as firebase.app.App;
  randoApp = firebaseTesting.initializeTestApp({
    projectId,
    auth: {
      uid: 'tom', admin: false, firebase: {
        sign_in_provider: 'google'
      }
    }
  }) as firebase.app.App;
  adminUserApp = firebaseTesting.initializeTestApp({
    projectId,
    auth: {
      uid: 'miked', admin: true, firebase: {
        sign_in_provider: 'google'
      }
    }
  }) as firebase.app.App;
  app = firebaseTesting.initializeTestApp({
    projectId,
    auth: {
      uid: 'mike', admin: false, firebase: {
        sign_in_provider: 'google'
      }
    }
  }) as firebase.app.App;
  admin = firebaseTesting.initializeAdminApp({ projectId }) as firebase.app.App;
});

afterAll(async () => {
  await app.delete();
  await admin.delete();
  await serverApp.delete();
  await randoApp.delete();
  await adminUserApp.delete();
});

window.HTMLElement.prototype.scrollIntoView = function() { return; };

const mike = getUser('mike', false);
const rando = getUser('tom', false);
const projectId = 'upload-test';

test('cannot upload if not logged in', async () => {
  sessionStorage.clear();
  localStorage.clear();

  await firebaseTesting.clearFirestoreData({ projectId });

  setApp(serverApp as firebase.app.App);

  const r = render(
    <UploadPage />, {}
  );

  expect(await r.findByText('log in with Google first', { exact: false })).toBeInTheDocument();
  expect(r.queryByText('Select a .puz file', { exact: false })).not.toBeInTheDocument();
});

test('upload a puzzle', async () => {
  sessionStorage.clear();
  localStorage.clear();

  await firebaseTesting.clearFirestoreData({ projectId });

  setApp(app as firebase.app.App);

  const r = render(
    <UploadPage />, { user: mike }
  );

  const input = await r.findByLabelText('Select a .puz file', { exact: false });
  const puz = await readFile(path.resolve(__dirname, 'converter/puz/av110622.puz'));

  const file = new File([puz], 'blah.puz', {
    type: 'text/puz',
  });
  fireEvent.change(input, { target: { files: [file] } });

  expect(await r.findByText('Across')).toBeInTheDocument();
  fireEvent.click(r.getByText('Publish', { exact: true }));
  fireEvent.click(await r.findByText('Publish Puzzle', { exact: true }));
  await (r.findByText(/Published Successfully/));

  const puzzles = await admin.firestore().collection('c').get();
  expect(puzzles.size).toEqual(1);
  const puzzle = puzzles.docs[0].data();
  const puzzleId = puzzles.docs[0].id;
  expect(puzzle['m']).toEqual(false);
  expect(puzzle['p']).not.toEqual(null);
  expect(puzzle['c']).toEqual(null);
  expect(puzzle['t']).toEqual('AV Club xword, 6 22 11');
  await waitForExpect(async () => expect(NextJSRouter.push).toHaveBeenCalledTimes(1));
  expect(NextJSRouter.push).toHaveBeenCalledWith('/crosswords/' + puzzles.docs[0].id);

  await cleanup();

  // The puzzle should be visible on the puzzle page, even to a rando
  setApp(serverApp as firebase.app.App);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props1 = await getServerSideProps({ params: { puzzleId }, res: { setHeader: jest.fn() } } as any);
  setApp(randoApp as firebase.app.App);
  const r5 = render(<PuzzlePage {...props1.props} />, { user: rando });
  expect(await r5.findByText('Begin Puzzle')).toBeInTheDocument();
  expect(r5.queryByText(/AV Club xword/)).toBeInTheDocument();
  expect(r5.queryByText(/Daily Mini/)).toBeNull();
  await r5.findByText(/Enter Rebus/i);
  expect(r5.queryByText(/Moderate/i)).toBeNull();

  expect(r5.getByLabelText('grid')).toMatchSnapshot();
});