// Step generators for Claude's /model menu: the M29 short path and the M30 effort row.
import type { ModelRow, ParameterFrame } from './parameter-screen.ts';

/** `quiet`: a key that may change nothing (an effort row at its end) advances after this many ms (M30). */
export type Step = { command: string } | { key: string; frame: ParameterFrame['kind']; quiet?: number } | { until: (f: ParameterFrame) => boolean };
export type Flow = Generator<Step, void, ParameterFrame>;
/** The live frame of the engine; it changes between the yielded steps. */
export type FrameView = () => ParameterFrame;
export class CatalogChanged extends Error { constructor() { super('Каталог Claude изменился'); } }

/**
 * M29: the menu opens on the current model; move by the cached row number towards the target and
 * stop on its label. A row with the target's number but another label means a changed catalog.
 */
export function* seekRow(frame: FrameView, target: ModelRow): Flow {
  for (let i = 0; i < 64; i++) {
    const f = frame(); const row = f.rows.find(r => r.selected);
    if (row?.key === target.key) return;
    if (f.selected === 'more') {
      if (target.group === 'more' && f.more === 'closed' && /Enter to expand/.test(f.text)) yield { key: 'enter', frame: 'model' };
      else yield { key: target.group === 'more' ? 'down' : 'up', frame: 'model' };
      continue;
    }
    const at = typeof f.selected === 'number' ? f.selected : null;
    if (at !== null && at === target.index && row && row.key !== target.key) throw new CatalogChanged();
    yield { key: at === null || (target.group === 'more' && f.more === 'closed') || target.index > at ? 'down' : 'up', frame: 'model' };
  }
  throw new Error('Модель не найдена в меню Claude');
}

/**
 * M30: the effort row of /model: ← to its end, → to its end (a key at the end changes nothing, so it
 * is `quiet`), levels and the (default) mark recorded, then the starting level restored. Nothing is
 * saved here; a row without an effort line means a model without effort choice (`values: []`).
 */
export function* effortLevels(frame: FrameView): Generator<Step, { values: string[]; recommended: string | null }, ParameterFrame> {
  const start = frame().effortLevel; const values: string[] = []; let recommended: string | null = null;
  if (!start) return { values, recommended };
  const move = function* (key: 'left' | 'right'): Generator<Step, boolean, ParameterFrame> {
    const before = frame().effortLevel; yield { key, frame: 'model', quiet: 400 }; return frame().effortLevel !== before;
  };
  for (let i = 0; i < 6 && (yield* move('left')); i++);
  for (let i = 0; i < 6; i++) {
    const f = frame(); values.push(f.effortLevel!); if (f.effortDefault) recommended = f.effortLevel;
    if (!(yield* move('right'))) break;
  }
  for (let i = 0; i < 6 && frame().effortLevel !== start; i++) yield { key: 'left', frame: 'model' };
  if (frame().effortLevel !== start) throw new Error('Уровень усилия не восстановлен');
  return { values, recommended };
}
