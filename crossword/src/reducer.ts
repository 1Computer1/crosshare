import { PosAndDir, Position, Direction, BLOCK } from './types';
import { GridData } from './Grid';

interface GridInterfaceState {
  active: PosAndDir,
  grid: GridData,
  showKeyboard: boolean,
  isTablet: boolean,
  showExtraKeyLayout: boolean,
  isEnteringRebus: boolean,
  rebusValue: string,
  wrongCells: Set<number>,
  isEditable(cellIndex: number): boolean,
  postEdit(cellIndex: number): GridInterfaceState,
}

interface PuzzleState extends GridInterfaceState {
  answers: Array<string>,
  verifiedCells: Set<number>,
  revealedCells: Set<number>,
  success: boolean,
  filled: boolean,
  autocheck: boolean,
  dismissedKeepTrying: boolean,
  dismissedSuccess: boolean,
}

interface BuilderState extends GridInterfaceState {
  gridIsComplete: boolean,
  repeats: Set<string>,
  hasNoShortWords: boolean,
}

export interface PuzzleAction {
  type: string,
}

export interface KeypressAction extends PuzzleAction {
  key: string,
  shift: boolean,
}
function isKeypressAction(action: PuzzleAction): action is KeypressAction {
  return action.type === 'KEYPRESS'
}

interface SetActiveAction extends PuzzleAction {
  newActive: PosAndDir,
}
function isSetActiveAction(action: PuzzleAction): action is SetActiveAction {
  return action.type === 'SETACTIVE'
}

export interface ClickedEntryAction extends PuzzleAction {
  entryIndex: number,
}
function isClickedEntryAction(action: PuzzleAction): action is ClickedEntryAction {
  return action.type === 'CLICKEDENTRY'
}

export interface SetActivePositionAction extends PuzzleAction {
  newActive: Position,
}
function isSetActivePositionAction(action: PuzzleAction): action is SetActivePositionAction {
  return action.type === 'SETACTIVEPOSITION'
}

export enum CheatUnit {
  Square,
  Entry,
  Puzzle
}
export interface CheatAction extends PuzzleAction {
  unit: CheatUnit,
  isReveal?: boolean,
}
function isCheatAction(action: PuzzleAction): action is CheatAction {
  return action.type === 'CHEAT'
}

function cheatCells(state: PuzzleState, cellsToCheck: Array<Position>, isReveal: boolean) {
  const newRevealed = new Set(state.revealedCells);
  const newVerified = new Set(state.verifiedCells);
  const newWrong = new Set(state.wrongCells);
  let grid = state.grid;

  for (const cell of cellsToCheck) {
    const cellIndex = state.grid.cellIndex(cell);
    const shouldBe = state.answers[cellIndex];
    if (shouldBe === BLOCK) {
      continue;
    }
    const currentVal = state.grid.valAt(cell);
    if (shouldBe === currentVal) {
      newVerified.add(cellIndex);
    } else if (isReveal) {
      newRevealed.add(cellIndex);
      newWrong.delete(cellIndex);
      newVerified.add(cellIndex);
      grid = grid.gridWithNewChar(cell, shouldBe);
    } else if (currentVal.trim()) {
      newWrong.add(cellIndex);
    }
  }
  return (checkComplete({ ...state, grid: grid, wrongCells: newWrong, revealedCells: newRevealed, verifiedCells: newVerified }));
}

export function cheat(state: PuzzleState, cheatUnit: CheatUnit, isReveal: boolean) {
  let cellsToCheck: Array<Position> = [];
  if (cheatUnit === CheatUnit.Square) {
    cellsToCheck = [state.active];
  } else if (cheatUnit === CheatUnit.Entry) {
    const entry = state.grid.entryAtPosition(state.active)[0];
    if (!entry) { //block?
      return state;
    }
    cellsToCheck = entry.cells;
  } else if (cheatUnit === CheatUnit.Puzzle) {
    for (let rowidx = 0; rowidx < state.grid.height; rowidx += 1) {
      for (let colidx = 0; colidx < state.grid.width; colidx += 1) {
        cellsToCheck.push({ 'row': rowidx, 'col': colidx });
      }
    }
  }
  return cheatCells(state, cellsToCheck, isReveal);
}

export function checkComplete(state: PuzzleState) {
  state.filled = true;
  state.success = true;
  for (let i = 0; i < state.grid.cells.length; i += 1) {
    if (state.grid.cells[i].trim() === '') {
      state.filled = false;
      state.success = false;
      break;
    }
    if (state.answers && state.grid.cells[i] !== state.answers[i]) {
      state.success = false;
    }
  }
  return state;
}

export function gridInterfaceReducer<T extends GridInterfaceState>(state: T, action: PuzzleAction): T {
  if (action.type === "CHANGEDIRECTION") {
    return ({ ...state, active: { ...state.active, dir: (state.active.dir + 1) % 2 } });
  }
  if (action.type === "TOGGLEKEYBOARD") {
    return ({ ...state, showKeyboard: !state.showKeyboard });
  }
  if (action.type === "TOGGLETABLET") {
    return ({ ...state, isTablet: !state.isTablet });
  }
  if (isClickedEntryAction(action)) {
    const clickedEntry = state.grid.entries[action.entryIndex];
    for (let cell of clickedEntry.cells) {
      if (state.grid.valAt(cell) === " ") {
        return ({ ...state, active: { ...cell, dir: clickedEntry.direction } });
      }
    }
    return ({ ...state, active: { ...clickedEntry.cells[0], dir: clickedEntry.direction } });
  }
  if (isSetActiveAction(action)) {
    return ({ ...state, active: action.newActive });
  }
  if (isSetActivePositionAction(action)) {
    return ({ ...state, active: { ...action.newActive, dir: state.active.dir } });
  }
  if (isKeypressAction(action)) {
    const key = action.key;
    const shift = action.shift;
    if (key === '{num}' || key === '{abc}') {
      return ({ ...state, showExtraKeyLayout: !state.showExtraKeyLayout });
    }
    if (state.isEnteringRebus) {
      if (key.match(/^[A-Za-z0-9]$/)) {
        return ({ ...state, rebusValue: state.rebusValue + key.toUpperCase() });
      } else if (key === "Backspace" || key === "{bksp}") {
        return ({ ...state, rebusValue: state.rebusValue ? state.rebusValue.slice(0, -1) : "" });
      } else if (key === "Enter") {
        const cellIndex = state.grid.cellIndex(state.active);
        if (state.isEditable(cellIndex)) {
          state.grid = state.grid.gridWithNewChar(state.active, state.rebusValue);
          state = state.postEdit(cellIndex) as T; // TODO this is trash
        }
        return ({
          ...state,
          active: state.grid.advancePosition(state.active, state.wrongCells),
          isEnteringRebus: false, rebusValue: ''
        });
      } else if (key === "Escape") {
        return ({ ...state, isEnteringRebus: false, rebusValue: '' });
      }
      return state;
    }
    if (key === '{rebus}' || key === 'Escape') {
      return ({ ...state, showExtraKeyLayout: false, isEnteringRebus: true });
    } else if (key === " " || key === "{dir}") {
      return ({ ...state, active: { ...state.active, dir: (state.active.dir + 1) % 2 } });
    } else if (key === "{prev}") {
      return ({ ...state, active: state.grid.retreatPosition(state.active) });
    } else if (key === "{next}") {
      return ({ ...state, active: state.grid.advancePosition(state.active, state.wrongCells) });
    } else if ((key === "Tab" && !shift) || key === "{nextEntry}") {
      return ({ ...state, active: state.grid.moveToNextEntry(state.active) });
    } else if ((key === "Tab" && shift) || key === "{prevEntry}") {
      return ({ ...state, active: state.grid.moveToPrevEntry(state.active) });
    } else if (key === "ArrowRight") {
      return ({ ...state, active: { ...state.grid.moveRight(state.active), dir: Direction.Across } });
    } else if (key === "ArrowLeft") {
      return ({ ...state, active: { ...state.grid.moveLeft(state.active), dir: Direction.Across } });
    } else if (key === "ArrowUp") {
      return ({ ...state, active: { ...state.grid.moveUp(state.active), dir: Direction.Down } });
    } else if (key === "ArrowDown") {
      return ({ ...state, active: { ...state.grid.moveDown(state.active), dir: Direction.Down } });
    } else if ((key === '.' || key === '{block}') && state.grid.allowBlockEditing) {
      const cellIndex = state.grid.cellIndex(state.active);
      state.grid = state.grid.gridWithBlockToggled(state.active);
      return state.postEdit(cellIndex) as T; // TODO this is trash
    } else if (key.match(/^[A-Za-z0-9]$/)) {
      const char = key.toUpperCase();
      const cellIndex = state.grid.cellIndex(state.active);
      if (state.isEditable(cellIndex)) {
        state.grid = state.grid.gridWithNewChar(state.active, char);
        state = state.postEdit(cellIndex) as T; // TODO this is trash
      }
      return ({
        ...state,
        active: state.grid.advancePosition(state.active, state.wrongCells),
      });
    } else if (key === "Backspace" || key === "{bksp}") {
      const cellIndex = state.grid.cellIndex(state.active);
      if (state.isEditable(cellIndex)) {
        state.grid = state.grid.gridWithNewChar(state.active, " ");
        state = state.postEdit(cellIndex) as T; // TODO this is trash
      }
      return ({
        ...state,
        active: state.grid.retreatPosition(state.active),
      });
    }
  }
  return state;
}

export function builderReducer(state: BuilderState, action: PuzzleAction): BuilderState {
  state = gridInterfaceReducer(state, action);
  return state;
}

export function puzzleReducer(state: PuzzleState, action: PuzzleAction): PuzzleState {
  state = gridInterfaceReducer(state, action);
  if (isCheatAction(action)) {
    return cheat(state, action.unit, action.isReveal === true);
  }
  if (action.type === "TOGGLEAUTOCHECK") {
    state = cheat(state, CheatUnit.Puzzle, false);
    return ({ ...state, autocheck: !state.autocheck });
  }
  if (action.type === "DISMISSKEEPTRYING") {
    return ({ ...state, dismissedKeepTrying: true });
  }
  if (action.type === "DISMISSSUCCESS") {
    return ({ ...state, dismissedSuccess: true });
  }
  return state;
}

export function validateGrid(state: BuilderState) {
  let gridIsComplete = true;
  let repeats = new Set<string>();
  let hasNoShortWords = true;

  for (let i = 0; i < state.grid.cells.length; i += 1) {
    if (state.grid.cells[i].trim() === '') {
      gridIsComplete = false;
      break;
    }
  }

  for (let i = 0; i < state.grid.entries.length; i += 1) {
    if (state.grid.entries[i].cells.length <= 2) {
      hasNoShortWords = false;
    }
    for (let j = 0; j < state.grid.entries.length; j += 1) {
      if (!state.grid.entries[i].isComplete) continue;
      if (i === j) continue;
      if (state.grid.entryWord(i) === state.grid.entryWord(j)) {
        repeats.add(state.grid.entryWord(i))
      }
    }
  }

  return {
    ...state,
    gridIsComplete,
    repeats,
    hasNoShortWords
  };
}

export function advanceActiveToNonBlock(state: PuzzleState) {
  return { ...state, active: { ...state.grid.nextNonBlock(state.active), dir: Direction.Across } };
}