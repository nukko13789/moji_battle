// 問題づくりを画面とは別の処理（Web Worker）で行う
importScripts("engine.js");
self.onmessage = e => {
  const { id, level, avoid, debug } = e.data;
  const puzzle = self.Engine.makePuzzle(level, { avoid: new Set(avoid || []), debug, timeLimit: 4000 });
  self.postMessage({ id, puzzle });
};
