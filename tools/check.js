// 動作確認用：node tools/check.js
// 1) 探索の枝刈りが「式になる並び」を捨てていないか（枝刈りなしの全探索と比較）
// 2) 作った問題の解が1つだけか（Easy は枝刈りなしの全探索でも確認）
// 3) 問題の傾向（カード枚数・分数を使う割合など）の集計
const E = require("../engine.js");

function naive(cards, visit) {
  const used = cards.map(() => false), seq = [], seen = new Set();
  (function rec() {
    if (seq.length === cards.length) {
      const key = seq.map(c => c.s).join(" ");
      if (!seen.has(key)) { seen.add(key); visit(seq); }
      return;
    }
    for (let i = 0; i < cards.length; i++) {
      if (used[i]) continue;
      used[i] = true; seq.push(cards[i]); rec(); seq.pop(); used[i] = false;
    }
  })();
}
function validKeys(enumFn, cards) {
  const keys = new Set();
  enumFn(cards, seq => { try { E.parse(seq); keys.add(seq.map(c => c.s).join(" ")); } catch (e) {} });
  return keys;
}

const rnd = E.makeRng(2024);
let ok = true;

// 1) 枝刈りの検証：ランダムな手札（8枚以下、かっこ入りを多めに）
let pruneCases = 0;
for (let n = 0; n < 400; n++) {
  const cfg = n % 2 ? E.CONFIG.easy : { ...E.CONFIG.hard, min: 4, max: 8 };
  const cards = E.generate({ ...cfg, min: 1, max: 99 }, rnd);
  if (cards.length > 8) continue;
  // 手札を少し崩して、式にならない並びも混ぜる
  const a = validKeys(E.enumerate, cards), b = validKeys(naive, cards);
  pruneCases++;
  for (const k of b) if (!a.has(k)) { ok = false; console.log("枝刈りで失われた並び:", k); break; }
}
console.log(`枝刈りの検証: ${pruneCases} 手札で一致 ${ok ? "OK" : "NG"}`);

// 2)(3) 作問の検証と集計
function stats(level, count) {
  const r = E.makeRng(level === "easy" ? 11 : 13);
  const acc = { n: 0, cards: 0, frac: 0, nonComm: 0, decoys: 0, parens: 0, nested: 0, onlyPM: 0, tags: {}, ms: 0, maxMs: 0, bad: 0 };
  for (let i = 0; i < count; i++) {
    const t0 = Date.now();
    const p = E.makePuzzle(level, { rnd: r });
    const dt = Date.now() - t0;
    const cards = p.answer.map(E.cardFromLabel);
    const res = E.analyze(cards, p.target);
    if (res.solutions !== 1) { acc.bad++; console.log("解が1つではない:", p.answer.join(" ")); }
    if (level === "easy") {
      const sols = new Set();
      naive(cards, seq => { try { const ast = E.parse(seq); if (E.close(E.evaluate(ast), p.target)) sols.add(E.canon(ast)); } catch (e) {} });
      if (sols.size !== 1) { acc.bad++; console.log("（枝刈りなし）解が1つではない:", p.answer.join(" ")); }
    }
    const m = p.metrics;
    acc.n++; acc.cards += m.cards; acc.frac += m.fracNodes > 0 ? 1 : 0; acc.nonComm += m.nonComm; acc.decoys += m.decoys;
    acc.parens += m.parens ? 1 : 0; acc.nested += m.nested ? 1 : 0; acc.ms += dt; acc.maxMs = Math.max(acc.maxMs, dt);
    const ops = p.answer.filter(s => ["+", "−", "×", "÷", "^", "C", "!"].includes(s));
    if (ops.length && ops.every(o => o === "+" || o === "−") && !p.answer.some(s => E.FUNCS.includes(s) || s === "(")) acc.onlyPM++;
    acc.tags[p.tag] = (acc.tags[p.tag] || 0) + 1;
  }
  const pct = x => Math.round(100 * x / acc.n) + "%";
  console.log(`${level}: ${acc.n}問  解が1つでない問題 ${acc.bad}  平均カード ${(acc.cards / acc.n).toFixed(1)}枚  分数を経由 ${pct(acc.frac)}  かっこ ${pct(acc.parens)}  二重根号 ${pct(acc.nested)}  ＋−だけ ${pct(acc.onlyPM)}  非可換演算子 平均${(acc.nonComm / acc.n).toFixed(2)}  ひっかけ 平均${(acc.decoys / acc.n).toFixed(1)}  作問 平均${Math.round(acc.ms / acc.n)}ms 最大${acc.maxMs}ms`);
  console.log("  種類の内訳:", JSON.stringify(acc.tags));
  if (acc.bad) ok = false;
}
const N = Number(process.argv[2] || 200);
stats("easy", N);
stats("hard", N);
console.log(ok ? "すべてOK" : "問題あり");
process.exit(ok ? 0 : 1);
