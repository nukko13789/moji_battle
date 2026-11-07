/*
 * 唯一解パズル：ゲームの中身（構文解析・計算・解の一意性チェック・作問・採点）
 * ブラウザでは window.Engine、Node では module.exports として使える。
 */
(function (root) {
  "use strict";

  // =================================================================
  //  カード
  // =================================================================
  const CARD = {
    num: n => ({ k: "num", v: n, s: String(n) }),
    pi: () => ({ k: "num", v: Math.PI, s: "π", cls: "const" }),
    e: () => ({ k: "num", v: Math.E, s: "e", cls: "const" }),
    op: o => ({ k: "op", s: o }),
    fn: f => ({ k: "fn", s: f }),
    fact: () => ({ k: "post", s: "!" }),
    lp: () => ({ k: "lp", s: "(" }),
    rp: () => ({ k: "rp", s: ")" }),
  };
  const FUNCS = ["sin", "cos", "tan", "ln", "log", "log₂", "√", "|·|"];

  function cardFromLabel(s) {
    if (s === "π") return CARD.pi();
    if (s === "e") return CARD.e();
    if (s === "!") return CARD.fact();
    if (s === "(") return CARD.lp();
    if (s === ")") return CARD.rp();
    if (["+", "−", "×", "÷", "^", "C"].includes(s)) return CARD.op(s);
    if (/^\d+$/.test(s)) return CARD.num(Number(s));
    if (FUNCS.includes(s)) return CARD.fn(s);
    throw new Error("unknown card: " + s);
  }

  // =================================================================
  //  構文解析
  //  強い順：( ) → 関数と ! → ^（右から）→ C → × ÷ → + −
  // =================================================================
  class ParseError extends Error {
    constructor(msg, pos) { super(msg); this.pos = pos; }
  }

  function parse(tokens) {
    let i = 0;
    const peek = () => tokens[i];
    const isOp = (t, ops) => t && t.k === "op" && ops.includes(t.s);

    function expr() {
      let node = term();
      while (isOp(peek(), ["+", "−"])) { const op = tokens[i++].s; node = { k: "bin", op, l: node, r: term() }; }
      return node;
    }
    function term() {
      let node = comb();
      while (isOp(peek(), ["×", "÷"])) { const op = tokens[i++].s; node = { k: "bin", op, l: node, r: comb() }; }
      return node;
    }
    function comb() {
      const n = factor();
      if (isOp(peek(), ["C"])) { i++; return { k: "bin", op: "C", l: n, r: factor() }; }
      return n;
    }
    function factor() {
      const base = unary();
      if (isOp(peek(), ["^"])) { i++; return { k: "bin", op: "^", l: base, r: factor() }; }
      return base;
    }
    function unary() {
      const t = peek();
      if (t && t.k === "fn") { i++; return { k: "fn", f: t.s, a: unary() }; }
      let node = primary();
      while (peek() && peek().k === "post") { i++; node = { k: "fact", a: node }; }
      return node;
    }
    function primary() {
      const t = peek();
      if (!t) throw new ParseError("式が途中で終わっています", i);
      if (t.k === "num") { i++; return { k: "num", v: t.v, s: t.s }; }
      if (t.k === "lp") {
        i++;
        const inner = expr();
        if (!peek() || peek().k !== "rp") throw new ParseError("「(」が「)」で閉じていません", i);
        i++;
        return { k: "paren", a: inner };
      }
      if (t.k === "rp") throw new ParseError("「)」に対応する「(」がありません", i);
      if (t.k === "op") throw new ParseError(`「${t.s}」の前に数や式が必要です`, i);
      if (t.k === "post") throw new ParseError("! の前に数が必要です", i);
      throw new ParseError("ここに置けないカードです", i);
    }

    const ast = expr();
    if (i < tokens.length) {
      const t = tokens[i];
      const msg = t.k === "rp" ? "「)」に対応する「(」がありません"
        : (t.k === "num" || t.k === "fn" || t.k === "lp") ? `「${t.s}」の前に演算子（＋−×÷^ C）が必要です`
        : "ここで式が切れています";
      throw new ParseError(msg, i);
    }
    return ast;
  }

  // =================================================================
  //  計算
  // =================================================================
  const BAD = NaN;
  function binom(n, r) {
    const N = Math.round(n), K = Math.round(r);
    if (Math.abs(n - N) > 1e-9 || Math.abs(r - K) > 1e-9 || K < 0 || N < K || N > 30) return BAD;
    let v = 1;
    for (let j = 1; j <= K; j++) v = v * (N - K + j) / j;
    return Math.round(v);
  }

  function evaluate(n) {
    switch (n.k) {
      case "num": return n.v;
      case "paren": return evaluate(n.a);
      case "fn": {
        const a = evaluate(n.a);
        if (!Number.isFinite(a)) return BAD;
        switch (n.f) {
          case "sin": return Math.sin(a);
          case "cos": return Math.cos(a);
          case "tan": return Math.abs(Math.cos(a)) < 1e-9 ? BAD : Math.tan(a);
          case "ln": return a <= 0 ? BAD : Math.log(a);
          case "log": return a <= 0 ? BAD : Math.log10(a);
          case "log₂": return a <= 0 ? BAD : Math.log2(a);
          case "√": return a < -1e-12 ? BAD : Math.sqrt(Math.max(0, a));
          case "|·|": return Math.abs(a);
        }
        return BAD;
      }
      case "bin": {
        const l = evaluate(n.l), r = evaluate(n.r);
        if (!Number.isFinite(l) || !Number.isFinite(r)) return BAD;
        let v;
        switch (n.op) {
          case "+": v = l + r; break;
          case "−": v = l - r; break;
          case "×": v = l * r; break;
          case "÷": v = Math.abs(r) < 1e-12 ? BAD : l / r; break;
          case "^": v = (l === 0 && r <= 0) ? BAD : Math.pow(l, r); break;
          case "C": v = binom(l, r); break;
        }
        return Number.isFinite(v) && Math.abs(v) < 1e9 ? v : BAD;
      }
      case "fact": {
        const a = evaluate(n.a), k = Math.round(a);
        if (!Number.isFinite(a) || Math.abs(a - k) > 1e-9 || k < 0 || k > 12) return BAD;
        let f = 1;
        for (let j = 2; j <= k; j++) f *= j;
        return f;
      }
    }
    return BAD;
  }

  function valueOf(tokens) {
    try { return evaluate(parse(tokens)); } catch (e) { return BAD; }
  }

  const close = (a, b) => Math.abs(a - b) < 1e-7 * Math.max(1, Math.abs(b));

  // =================================================================
  //  正規形：足し算・かけ算の順番の入れ替えと、かっこによるまとめ方の違いを同一視する
  // =================================================================
  function canon(n) {
    switch (n.k) {
      case "num": return n.s;
      case "paren": return canon(n.a);
      case "fn": return `${n.f}(${canon(n.a)})`;
      case "fact": return `F(${canon(n.a)})`;
      case "bin": {
        if (n.op === "+" || n.op === "−") {
          const items = [];
          (function walk(m, sign) {
            if (m.k === "paren") return walk(m.a, sign);
            if (m.k === "bin" && m.op === "+") { walk(m.l, sign); walk(m.r, sign); }
            else if (m.k === "bin" && m.op === "−") { walk(m.l, sign); walk(m.r, -sign); }
            else items.push((sign > 0 ? "+" : "-") + canon(m));
          })(n, 1);
          return "S(" + items.sort().join(",") + ")";
        }
        if (n.op === "×" || n.op === "÷") {
          const items = [];
          (function walk(m, inv) {
            if (m.k === "paren") return walk(m.a, inv);
            if (m.k === "bin" && m.op === "×") { walk(m.l, inv); walk(m.r, inv); }
            else if (m.k === "bin" && m.op === "÷") { walk(m.l, inv); walk(m.r, !inv); }
            else items.push((inv ? "/" : "*") + canon(m));
          })(n, false);
          return "P(" + items.sort().join(",") + ")";
        }
        return `${n.op === "C" ? "C" : "W"}(${canon(n.l)},${canon(n.r)})`;
      }
    }
    return "?";
  }

  // =================================================================
  //  全探索：手札の並べ方をすべて試す
  //  文法上ありえない並びは途中で打ち切る（式になりうる並びは決して捨てない）
  // =================================================================
  function enumerate(cards, visit) {
    const groups = [];
    for (const c of cards) {
      let g = groups.find(x => x.card.s === c.s);
      if (!g) { g = { card: c, n: 0 }; groups.push(g); }
      g.n++;
    }
    const total = cards.length;
    let remRp = cards.filter(c => c.k === "rp").length;
    const seq = [];
    let stop = false;

    // expectOperand: 次は数・関数・「(」でなければならない
    function rec(expectOperand, depth) {
      if (stop) return;
      if (seq.length === total) {
        if (!expectOperand && depth === 0) { if (visit(seq) === false) stop = true; }
        return;
      }
      for (const g of groups) {
        if (!g.n) continue;
        const t = g.card;
        let nextExpect, nextDepth = depth;
        if (expectOperand) {
          if (t.k === "num") nextExpect = false;
          else if (t.k === "fn") nextExpect = true;
          else if (t.k === "lp") { nextExpect = true; nextDepth = depth + 1; if (nextDepth > remRp) continue; }
          else continue;
        } else {
          if (t.k === "op") nextExpect = true;
          else if (t.k === "post") nextExpect = false;
          else if (t.k === "rp") { if (depth === 0) continue; nextExpect = false; nextDepth = depth - 1; }
          else continue;
        }
        g.n--; seq.push(t);
        if (t.k === "rp") remRp--;
        rec(nextExpect, nextDepth);
        if (t.k === "rp") remRp++;
        seq.pop(); g.n++;
        if (stop) return;
      }
    }
    rec(true, 0);
  }

  // 一意性と「惑わせる並び」の数をまとめて調べる
  function analyze(cards, target, opts = {}) {
    const solutions = new Map(); // 正規形 → 並びの例
    let valid = 0;
    const wrongNice = new Set(), near = new Set();
    const full = !!opts.full;
    enumerate(cards, seq => {
      let ast;
      try { ast = parse(seq); } catch (e) { return; }
      const v = evaluate(ast);
      if (!Number.isFinite(v)) return;
      valid++;
      if (close(v, target)) {
        const c = canon(ast);
        if (!solutions.has(c)) solutions.set(c, seq.slice());
        if (solutions.size >= 2) return false; // 2つ目が見つかったら一意ではない
      } else if (full) {
        const key = Math.round(v * 1e6);
        if (isNiceRational(v)) wrongNice.add(key);
        if (Math.abs(v - target) <= Math.max(1, 0.1 * Math.abs(target))) near.add(key);
      }
    });
    return { solutions: solutions.size, example: [...solutions.values()][0], valid, decoys: wrongNice.size, near: near.size };
  }

  // =================================================================
  //  「きれいな答え」の判定と表示
  // =================================================================
  const gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a);
  function asFraction(v, maxQ, maxP) {
    for (let q = 1; q <= maxQ; q++) {
      const p = Math.round(v * q);
      if (Math.abs(v * q - p) < 1e-10 * Math.max(1, Math.abs(v * q)) && Math.abs(p) <= maxP && gcd(p, q) === 1) return [p, q];
    }
    return null;
  }
  const isNiceRational = v => !!asFraction(v, 12, 999);

  const SQUAREFREE = [];
  for (let c = 2; c <= 30; c++) {
    let ok = true;
    for (let k = 2; k * k <= c; k++) if (c % (k * k) === 0) ok = false;
    if (ok) SQUAREFREE.push(c);
  }

  const fracHtml = (p, q, unit = "") => {
    const P = Math.abs(p);
    const num = unit ? (P === 1 ? unit : P + unit) : String(P);
    return `${p < 0 ? "−" : ""}<span class="frac"><span>${num}</span><span>${q}</span></span>`;
  };
  const ratHtml = ([p, q], showSign = true) => {
    const s = showSign && p < 0 ? "−" : "";
    return q === 1 ? s + Math.abs(p) : s + fracHtml(Math.abs(p), q);
  };
  const sqrtHtml = inner => `√<span class="ov">${inner}</span>`;
  const coefHtml = ([p, q], unit) => {
    // 係数 p/q（正）× unit
    if (q === 1) return (p === 1 ? "" : p) + unit;
    return fracHtml(p, q, unit);
  };
  const ratText = ([p, q]) => (q === 1 ? String(p) : `${p}/${q}`);

  /* 戻り値: { kind, html, text, irr, a, b, c }   kind: zero int frac pi root mix e */
  function niceTarget(v, maxInt = 99) {
    if (!Number.isFinite(v)) return null;
    if (Math.abs(v) < 1e-9) return { kind: "zero", html: "0", text: "0", irr: 0 };
    let f = asFraction(v, 12, maxInt);
    if (f) {
      return { kind: f[1] === 1 ? "int" : "frac", html: ratHtml(f), text: ratText(f), irr: 0, a: f };
    }
    // π の有理数倍
    f = asFraction(v / Math.PI, 6, 12);
    if (f) {
      const [p, q] = f;
      return { kind: "pi", html: (p < 0 ? "−" : "") + coefHtml([Math.abs(p), q], "<i>π</i>"), text: `${ratText(f)}π`, irr: v };
    }
    // a + b√c（a, b は有理数、c は平方因子なし）
    for (const c of SQUAREFREE) {
      const s = Math.sqrt(c);
      for (let q = 1; q <= 4; q++) {
        for (let p = 1; p <= 12; p++) {
          if (gcd(p, q) !== 1) continue;
          for (const sign of [1, -1]) {
            const b = sign * p / q;
            const rest = v - b * s;
            const a = Math.abs(rest) < 1e-10 ? [0, 1] : asFraction(rest, 6, 99);
            if (!a) continue;
            const bPart = coefHtml([p, q], sqrtHtml(c));
            let html;
            if (a[0] === 0) html = (sign < 0 ? "−" : "") + bPart;
            else html = `${ratHtml(a)} ${sign > 0 ? "+" : "−"} ${bPart}`;
            const text = (a[0] === 0 ? "" : ratText(a) + (sign > 0 ? " + " : " - ")) + `${p === 1 && q === 1 ? "" : p + (q > 1 ? "/" + q : "")}√${c}`;
            return { kind: a[0] === 0 ? "root" : "mix", html, text, irr: b * s, a, b: [sign * p, q], c };
          }
        }
      }
    }
    // a + kπ, a + ke
    for (const [cst, ch] of [[Math.PI, "π"], [Math.E, "e"]]) {
      for (const k of [1, -1, 2, -2, 3, -3]) {
        const a = asFraction(v - k * cst, 12, maxInt);
        if (!a || a[0] === 0) continue;
        const K = Math.abs(k);
        return {
          kind: "mix", html: `${ratHtml(a)} ${k > 0 ? "+" : "−"} ${K === 1 ? "" : K}<i>${ch}</i>`,
          text: `${ratText(a)} ${k > 0 ? "+" : "-"} ${K === 1 ? "" : K}${ch}`, irr: k * cst,
        };
      }
    }
    f = asFraction(v / Math.E, 1, 9);
    if (f) return { kind: "e", html: (f[0] < 0 ? "−" : "") + (Math.abs(f[0]) === 1 ? "" : Math.abs(f[0])) + "<i>e</i>", text: `${f[0]}e`, irr: v };
    for (const k of [2, 3]) {
      if (Math.abs(v - Math.exp(k)) < 1e-8) return { kind: "e", html: `<i>e</i><sup>${k}</sup>`, text: `e^${k}`, irr: v };
    }
    return null;
  }

  // a + b√c (> 0) を √(A + B√c) の形（二重根号）で書けるなら、その表示を返す
  function nestedHtml(t) {
    if (!t || !(t.kind === "mix" || t.kind === "root") || !t.c) return null;
    const a = t.a[0] / t.a[1], b = t.b[0] / t.b[1], c = t.c;
    const v = a + b * Math.sqrt(c);
    if (v <= 0) return null;
    const A = asFraction(a * a + b * b * c, 4, 200), B = asFraction(2 * a * b, 4, 200);
    if (!A || !B || B[0] === 0 || A[0] <= 0) return null;
    const Bp = [Math.abs(B[0]), B[1]];
    const inner = `${ratHtml(A)} ${B[0] > 0 ? "+" : "−"} ${coefHtml(Bp, sqrtHtml(c))}`;
    const text = `√(${ratText(A)} ${B[0] > 0 ? "+" : "-"} ${ratText(Bp)}√${c})`;
    return { html: sqrtHtml(inner), text };
  }


  // =================================================================
  //  正確な値：有理数 × π^a × e^b × √c の和として計算する（誤答の値を分数・ルートのまま見せるため）
  // =================================================================
  const LIMIT = 1e12;
  function rat(n, d = 1) {
    if (d < 0) { n = -n; d = -d; }
    if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0 || Math.abs(n) > LIMIT || d > LIMIT) throw new Error("too big");
    const g = gcd(n, d) || 1;
    return [n / g, d / g];
  }
  const radd = (a, b) => rat(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
  const rmul = (a, b) => rat(a[0] * b[0], a[1] * b[1]);
  const rinv = a => { if (a[0] === 0) throw new Error("div0"); return rat(a[1], a[0]); };
  function squarePart(n) { // n = k² × m（m は平方因子なし）
    let k = 1, m = n;
    for (let f = 2; f * f <= m; f++) while (m % (f * f) === 0) { m /= f * f; k *= f; }
    return [k, m];
  }
  // 値は Map: "π指数|e指数|根号の中身" → 有理数
  const key = (p, q, c) => `${p}|${q}|${c}`;
  const unkey = k => k.split("|").map(Number);
  function xConst(r) { const m = new Map(); if (r[0] !== 0) m.set(key(0, 0, 1), r); return m; }
  function xAddTerm(m, k, r) {
    const cur = m.get(k);
    const v = cur ? radd(cur, r) : r;
    if (v[0] === 0) m.delete(k); else m.set(k, v);
  }
  function xAdd(a, b, sign = 1) {
    const m = new Map(a);
    for (const [k, r] of b) xAddTerm(m, k, sign > 0 ? r : [-r[0], r[1]]);
    return m;
  }
  function xMul(a, b) {
    const m = new Map();
    for (const [ka, ra] of a) {
      const [pa, qa, ca] = unkey(ka);
      for (const [kb, rb] of b) {
        const [pb, qb, cb] = unkey(kb);
        const [k, c] = squarePart(ca * cb);
        if (ca * cb > LIMIT) throw new Error("too big");
        xAddTerm(m, key(pa + pb, qa + qb, c), rmul(rmul(ra, rb), [k, 1]));
      }
    }
    return m;
  }
  const isRational = m => [...m.keys()].every(k => k === key(0, 0, 1));
  const ratOf = m => m.get(key(0, 0, 1)) || [0, 1];
  // 割り算：分母が1項ならその逆数をかける。√だけの和なら、素因数ごとに符号を反転させた共役をかけて有理化する
  function xDiv(a, b) {
    if (b.size === 0) throw new Error("div0");
    if (b.size === 1) {
      const [[k, r]] = [...b];
      const [p, q, c] = unkey(k);
      const inv = new Map([[key(-p, -q, c), rmul(rinv(r), [1, c])]]);
      return xMul(a, inv);
    }
    if ([...b.keys()].some(k => { const [p, q] = unkey(k); return p !== 0 || q !== 0; })) throw new Error("unsupported");
    let num = a, den = b;
    for (let guard = 0; guard < 8 && !isRational(den); guard++) {
      const c = [...den.keys()].map(k => unkey(k)[2]).find(c => c > 1);
      let prime = 2;
      while (c % prime !== 0) prime++;
      const conj = new Map();
      for (const [k, r] of den) conj.set(k, unkey(k)[2] % prime === 0 ? [-r[0], r[1]] : r);
      num = xMul(num, conj); den = xMul(den, conj);
    }
    if (!isRational(den)) throw new Error("unsupported");
    return xMul(num, xConst(rinv(ratOf(den))));
  }
  function ratSqrt(r) { // √(n/d) = √(n·d)/d
    if (r[0] < 0) throw new Error("negative");
    const [k, m] = squarePart(r[0] * r[1]);
    return new Map(r[0] === 0 ? [] : [[key(0, 0, m), rat(k, r[1])]]);
  }
  function xSqrt(a) {
    if (a.size === 0) return new Map();
    if (isRational(a)) return ratSqrt(ratOf(a));
    // a0 + b√c → √x ± √y（二重根号を外す）
    if (a.size === 2 && a.has(key(0, 0, 1))) {
      const a0 = ratOf(a);
      const [[k2, b]] = [...a].filter(([k]) => k !== key(0, 0, 1));
      const [p, q, c] = unkey(k2);
      if (p === 0 && q === 0) {
        // x + y = a0, xy = b²c/4
        const disc = radd(rmul(a0, a0), [-b[0] * b[0] * c, b[1] * b[1]]);
        if (disc[0] >= 0) {
          const sd = ratSqrt(disc);
          if (isRational(sd)) {
            const s = ratOf(sd);
            const x = rmul(radd(a0, s), [1, 2]), y = rmul(radd(a0, [-s[0], s[1]]), [1, 2]);
            if (x[0] >= 0 && y[0] >= 0) return xAdd(ratSqrt(x), ratSqrt(y), b[0] > 0 ? 1 : -1);
          }
        }
      }
    }
    throw new Error("unsupported");
  }
  function exactOf(n) {
    switch (n.k) {
      case "num":
        if (n.s === "π") return new Map([[key(1, 0, 1), [1, 1]]]);
        if (n.s === "e") return new Map([[key(0, 1, 1), [1, 1]]]);
        return xConst(rat(n.v));
      case "paren": return exactOf(n.a);
      case "fn": {
        if (n.f === "√") return xSqrt(exactOf(n.a));
        const v = evaluate(n);
        if (!Number.isFinite(v)) throw new Error("bad");
        if (n.f === "|·|") { const a = exactOf(n.a); return v < 0 ? xAdd(new Map(), a, -1) : evaluate(n.a) < 0 ? xAdd(new Map(), a, -1) : a; }
        const f = asFraction(v, 12, 1e6);
        if (!f) throw new Error("unsupported");
        return xConst(f);
      }
      case "fact": { const v = evaluate(n); if (!Number.isFinite(v)) throw new Error("bad"); return xConst(rat(v)); }
      case "bin": {
        if (n.op === "C") { const v = evaluate(n); if (!Number.isFinite(v)) throw new Error("bad"); return xConst(rat(v)); }
        const l = exactOf(n.l), r = exactOf(n.r);
        switch (n.op) {
          case "+": return xAdd(l, r, 1);
          case "−": return xAdd(l, r, -1);
          case "×": return xMul(l, r);
          case "÷": return xDiv(l, r);
          case "^": {
            if (!isRational(r)) throw new Error("unsupported");
            const [en, ed] = ratOf(r);
            let base = l;
            if (ed === 2) base = xSqrt(l);
            else if (ed !== 1) throw new Error("unsupported");
            const k = Math.abs(en);
            if (k > 12) throw new Error("too big");
            let out = xConst([1, 1]);
            for (let i = 0; i < k; i++) out = xMul(out, base);
            return en < 0 ? xDiv(xConst([1, 1]), out) : out;
          }
        }
      }
    }
    throw new Error("unsupported");
  }
  // 正確な値を、封印数と同じ形の HTML にする（できなければ null）
  function exactHtml(ast) {
    let m;
    try { m = exactOf(ast); } catch (e) { return null; }
    const v = evaluate(ast);
    if (Number.isFinite(v)) { // 念のため数値でも一致を確かめる
      let check = 0;
      for (const [k, r] of m) { const [p, q, c] = unkey(k); check += r[0] / r[1] * Math.pow(Math.PI, p) * Math.pow(Math.E, q) * Math.sqrt(c); }
      if (!close(check, v)) return null;
    }
    if (m.size === 0) return "0";
    const terms = [...m].map(([k, r]) => ({ r, p: unkey(k) })).sort((a, b) =>
      (a.p[0] - b.p[0]) || (a.p[1] - b.p[1]) || (a.p[2] - b.p[2]));
    let html = "";
    terms.forEach((t, i) => {
      const [p, q, c] = t.p;
      if (p < 0 || q < 0) throw null;
      let unit = "";
      if (p) unit += "<i>π</i>" + (p > 1 ? `<sup>${p}</sup>` : "");
      if (q) unit += "<i>e</i>" + (q > 1 ? `<sup>${q}</sup>` : "");
      if (c > 1) unit += sqrtHtml(c);
      const neg = t.r[0] < 0;
      const abs = [Math.abs(t.r[0]), t.r[1]];
      const body = unit ? coefHtml(abs, unit) : ratHtml(abs);
      html += i === 0 ? (neg ? "−" : "") + body : ` ${neg ? "−" : "+"} ${body}`;
    });
    return html;
  }
  function exactHtmlSafe(ast) { try { return exactHtml(ast); } catch (e) { return null; } }

  // =================================================================
  //  表示用：読み取った式をかっこ付きで描く
  // =================================================================
  function render(n) {
    switch (n.k) {
      case "num": return n.s === "π" || n.s === "e" ? `<i>${n.s}</i>` : n.s;
      case "paren": return `(${render(n.a)})`;
      case "fn": {
        const inner = n.a.k === "paren" ? render(n.a.a) : render(n.a);
        if (n.f === "√") return `√(${inner})`;
        if (n.f === "|·|") return `|${inner}|`;
        if (n.f === "log₂") return `log<sub>2</sub>(${inner})`;
        return `${n.f}(${inner})`;
      }
      case "fact": return (n.a.k === "num" || n.a.k === "paren" ? render(n.a) : `(${render(n.a)})`) + "!";
      case "bin": {
        if (n.op === "C") {
          if (n.l.k === "num" && n.r.k === "num") return `<sub>${render(n.l)}</sub>C<sub>${render(n.r)}</sub>`;
          return `C(${render(n.l)}, ${render(n.r)})`;
        }
        if (n.op === "^") {
          let base = render(n.l);
          if (n.l.k === "fn" || n.l.k === "fact" || n.l.k === "bin") base = `(${base})`;
          const ex = n.r.k === "paren" ? render(n.r.a) : render(n.r);
          return `${base}<sup>${ex}</sup>`;
        }
        return `${render(n.l)} ${n.op} ${render(n.r)}`;
      }
    }
    return "";
  }
  function renderText(n) {
    const d = render(n)
      .replace(/<sup>(.*?)<\/sup>/g, "^($1)").replace(/<sub>(.*?)<\/sub>/g, "_$1")
      .replace(/<[^>]+>/g, "");
    return d;
  }

  // =================================================================
  //  作問
  // =================================================================
  const CONFIG = {
    easy: { min: 5, max: 8, pNestPuzzle: 0.2, nestWeight: 0.35, pFn: 0.35, pParen: 0.18, pNest: 0.04, pFrac: 0.07, extra1: 0.45, extra2: 0.12, pMul: 0.6, pMul2: 0.2, maxInt: 99, candidates: 30, pickFrom: 2 },
    hard: { min: 10, max: 12, pNestPuzzle: 0.22, nestWeight: 0.45, pFn: 0.32, pParen: 0.3, pNest: 0.06, pFrac: 0.14, extra1: 0.6, extra2: 0.25, pMul: 0.7, pMul2: 0.3, maxInt: 999, candidates: 18, pickFrom: 1 },
  };

  // 二重根号を外せる組：√(x² + y²c ± 2xy√c) = x ± y√c
  const NESTS = [];
  for (const c of [2, 3, 5, 6, 7]) {
    for (let x = 1; x <= 3; x++) {
      for (let y = 1; y <= 2; y++) {
        const A = x * x + y * y * c, B = 2 * x * y;
        if (A <= 20 && B <= 12) NESTS.push({ A, B, c });
      }
    }
  }

  // 二重根号を外すと √p ± √q になる組：√(p + q ± 2√(pq)) = √p ± √q
  const PAIRS = [];
  for (const p of [2, 3, 5, 6, 7]) {
    for (const q of [1, 2, 3, 5, 6]) {
      if (q >= p) continue;
      const B = p * q, sq = Math.round(Math.sqrt(B));
      if (sq * sq === B || p + q > 13) continue;
      PAIRS.push({ p, q, A: p + q, B });
    }
  }

  // 二重根号の問題：二重根号を外した形（√p ± √q など）を使わないとうまく解けない式を作る
  function nestedPuzzle(cfg, rnd) {
    const pick = a => a[Math.floor(rnd() * a.length)];
    const out = [];
    const push = c => out.push(c);
    const hard = cfg.max >= 10;
    const plus = rnd() < 0.65;
    // 中身の書き方：「A ± 2 × √B」か「A ± √(4B)」
    function core(A, B) {
      push(CARD.fn("√")); push(CARD.lp());
      push(CARD.num(A)); push(CARD.op(plus ? "+" : "−"));
      if ((!hard || rnd() < 0.4) && 4 * B <= 99) { push(CARD.fn("√")); push(CARD.num(4 * B)); }
      else { push(CARD.num(2)); push(CARD.op("×")); push(CARD.fn("√")); push(CARD.num(B)); }
      push(CARD.rp());
    }
    let pq = null;
    if (hard || rnd() < 0.7) {
      pq = pick(PAIRS);           // → √p ± √q
      core(pq.A, pq.B);
    } else {
      const t = pick(NESTS);      // → x ± y√c
      core(t.A, (t.B / 2) * (t.B / 2) * t.c); // √(A ± 2√((B/2)²c))
    }
    // 外した形を活かす組み合わせ
    const r = hard ? rnd() * 0.65 : rnd();
    if (pq && r < 0.45) {
      // ÷√r や ×√r（r は p か q）：外した √p ± √q の片方だけが整数に変わる
      // 例：√(5 + 2√6) ÷ √3 = (√3 + √2) ÷ √3 = 1 + √6/3
      push(CARD.op(rnd() < 0.6 ? "÷" : "×"));
      push(CARD.fn("√")); push(CARD.num(rnd() < 0.5 ? pq.p : pq.q));
    } else if (pq && r < 0.65 && hard) {
      // ×(√p ∓ √q)：無理数が打ち消し合う
      push(CARD.op("×")); push(CARD.lp());
      push(CARD.fn("√")); push(CARD.num(pq.p)); push(CARD.op(plus ? "−" : "+")); push(CARD.fn("√")); push(CARD.num(pq.q));
      push(CARD.rp());
    } else if (r < 0.85) {
      push(CARD.op(pick(["÷", "×"]))); push(CARD.num(pick([2, 3, 4, 6])));
    }
    // 長さが足りなければ整数を足し引きする
    while (out.length < cfg.min) {
      push(CARD.op(rnd() < 0.5 ? "+" : "−"));
      push(CARD.num(1 + Math.floor(rnd() * 9)));
    }
    return out;
  }

  function makeRng(seed) {
    if (seed === undefined) return Math.random;
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  function generate(cfg, rnd) {
    const pick = a => a[Math.floor(rnd() * a.length)];
    const out = [];
    const push = c => out.push(c);

    function num() {
      const r = rnd();
      if (r < 0.1) push(CARD.pi());
      else if (r < 0.13) push(CARD.e());
      else push(CARD.num(pick([1, 2, 2, 3, 3, 4, 5, 6, 7, 8, 9, 0])));
    }
    function niceArg(f) {
      switch (f) {
        case "sin": case "cos": case "tan": push(rnd() < 0.5 ? CARD.pi() : CARD.num(0)); break;
        case "ln": push(rnd() < 0.5 ? CARD.e() : CARD.num(1)); break;
        case "log": push(CARD.num(rnd() < 0.6 ? 10 : 1)); break;
        case "log₂": push(CARD.num(pick([2, 4, 8, 16]))); break;
        case "|·|": { const r = Math.floor(rnd() * 2); if (r) { push(CARD.fn("cos")); push(CARD.pi()); } else { push(CARD.fn("sin")); push(CARD.num(3)); } break; }
        case "√": push(CARD.num(pick([4, 9, 2, 3, 8, 12, 18, 16]))); break;
      }
    }
    function nested() {
      const t = pick(NESTS);
      push(CARD.fn("√")); push(CARD.lp());
      push(CARD.num(t.A)); push(CARD.op(rnd() < 0.7 ? "+" : "−"));
      if (t.B !== 1) { push(CARD.num(t.B)); push(CARD.op("×")); }
      push(CARD.fn("√")); push(CARD.num(t.c));
      push(CARD.rp());
    }
    // かっこの中身：少なくとも2項の和・差
    function group(d) {
      push(CARD.lp());
      if (rnd() < cfg.pFrac) { fracPair(); push(CARD.rp()); return; }
      term(d + 1);
      push(CARD.op(rnd() < 0.55 ? "+" : "−"));
      term(d + 1);
      if (rnd() < 0.2) { push(CARD.op(rnd() < 0.5 ? "+" : "−")); term(d + 1); }
      push(CARD.rp());
    }
    function primary(d) {
      const r = rnd();
      if (d < 2 && r < cfg.pNest) { nested(); return; }
      if (d < 2 && r < cfg.pNest + cfg.pParen) { group(d); return; }
      if (r < cfg.pNest + cfg.pParen + 0.06) { push(CARD.num(3 + Math.floor(rnd() * 3))); push(CARD.fact()); return; }
      if (r < cfg.pNest + cfg.pParen + 0.12) { push(CARD.num(4 + Math.floor(rnd() * 4))); push(CARD.op("C")); push(CARD.num(2 + Math.floor(rnd() * 2))); return; }
      num();
    }
    function unary(d) {
      if (d < 2 && rnd() < cfg.pFn) {
        const f = pick(["sin", "cos", "tan", "ln", "log", "log₂", "√", "√", "√", "|·|"]);
        push(CARD.fn(f));
        const r = rnd();
        if (r < 0.6) niceArg(f);
        else if (r < 0.85 && d < 2) group(d);
        else unary(d + 1);
        return;
      }
      primary(d);
    }
    function factor(d) {
      unary(d);
      if (rnd() < 0.25) { push(CARD.op("^")); push(CARD.num(rnd() < 0.67 ? 2 : 3)); }
    }
    function term(d) {
      factor(d);
      if (rnd() < cfg.pMul) {
        push(CARD.op(rnd() < 0.55 ? "×" : "÷")); factor(d);
        if (rnd() < cfg.pMul2) { push(CARD.op(rnd() < 0.55 ? "×" : "÷")); factor(d); }
      }
    }
    // 分数どうしの足し算・引き算（a÷p ± b÷q）。途中で分数を扱う必要が出る
    function fracPair() {
      const q1 = pick([2, 3, 4, 6]), q2 = pick([2, 3, 4, 6]);
      let a = 1 + Math.floor(rnd() * 9), b = 1 + Math.floor(rnd() * 9);
      if (a % q1 === 0) a++;
      if (b % q2 === 0) b++;
      push(CARD.num(a)); push(CARD.op("÷")); push(CARD.num(q1));
      push(CARD.op(rnd() < 0.6 ? "+" : "−"));
      push(CARD.num(b)); push(CARD.op("÷")); push(CARD.num(q2));
    }
    function expr(d) {
      if (d < 2 && rnd() < cfg.pFrac) {
        if (d === 0 || rnd() < 0.5) fracPair(); else term(d);
        const extra = rnd() < 0.5 ? 1 : 0;
        for (let k = 0; k < extra; k++) { push(CARD.op(rnd() < 0.5 ? "+" : "−")); term(d); }
        return;
      }
      term(d);
      const extra = rnd() < cfg.extra1 ? 1 : (rnd() < cfg.extra2 ? 2 : 0);
      for (let k = 0; k < extra; k++) { push(CARD.op(rnd() < 0.5 ? "+" : "−")); term(d); }
    }
    expr(0);
    return out;
  }

  // 「+ 0」「× 1」のような水増しの項があるか
  function isPadded(ast) {
    let bad = false;
    (function walk(n) {
      if (bad || !n) return;
      if (n.k === "paren") return walk(n.a);
      if (n.k === "bin" && ["+", "−", "×", "÷"].includes(n.op)) {
        const sum = n.op === "+" || n.op === "−";
        const items = [];
        (function f(m) {
          if (m.k === "paren") return f(m.a);
          if (m.k === "bin" && (sum ? (m.op === "+" || m.op === "−") : (m.op === "×" || m.op === "÷"))) { f(m.l); f(m.r); }
          else items.push(m);
        })(n);
        for (const t of items) {
          const v = evaluate(t);
          if (Math.abs(v) < 1e-9 || (!sum && Math.abs(v - 1) < 1e-9)) bad = true;
        }
        items.forEach(walk);
        return;
      }
      if (n.k === "bin") {
        if (n.op === "^" && Math.abs(evaluate(n.r) - 1) < 1e-9) bad = true;
        walk(n.l); walk(n.r); return;
      }
      if (n.k === "fn" || n.k === "fact") walk(n.a);
    })(ast);
    return bad;
  }

  // 手札のかっこがすべて必要か（外しても同じ式になるかっこがあれば不要とみなす）
  function parensNeeded(cards, ast) {
    const base = canon(ast);
    const pairs = [];
    const stack = [];
    cards.forEach((c, i) => {
      if (c.k === "lp") stack.push(i);
      else if (c.k === "rp") pairs.push([stack.pop(), i]);
    });
    for (const [a, b] of pairs) {
      const rest = cards.filter((_, i) => i !== a && i !== b);
      try {
        if (canon(parse(rest)) === base) return false;
      } catch (e) { /* 外すと式にならない＝必要 */ }
    }
    return pairs.length;
  }

  function nodeCount(n) {
    switch (n.k) {
      case "bin": return 1 + nodeCount(n.l) + nodeCount(n.r);
      case "fn": case "fact": return 1 + nodeCount(n.a);
      case "paren": return nodeCount(n.a);
      default: return 1;
    }
  }

  // 封印数の無理数部分（π・√c・e）が、手札の中で小さな項として丸見えか
  function irrationalExposed(ast, irr) {
    if (!irr) return false;
    const items = [];
    (function f(m) {
      if (m.k === "paren") return f(m.a);
      if (m.k === "bin" && (m.op === "+" || m.op === "−")) { f(m.l); f(m.r); }
      else items.push(m);
    })(ast);
    for (const it of items) {
      if (!close(Math.abs(evaluate(it)), Math.abs(irr))) continue;
      if (nodeCount(it) <= 3) return true;
      if (it.k === "bin" && (it.op === "×" || it.op === "÷")) {
        const fs = [];
        (function f(m) { if (m.k === "paren") return f(m.a); if (m.k === "bin" && (m.op === "×" || m.op === "÷")) { f(m.l); f(m.r); } else fs.push(m); })(it);
        let tinyIrr = 0, rest = 0;
        for (const x of fs) {
          if (!isNiceRational(evaluate(x)) && nodeCount(x) <= 2 && !tinyIrr) tinyIrr = 1;
          else rest += nodeCount(x);
        }
        if (tinyIrr && rest <= 3) return true;
      }
    }
    return false;
  }

  // 途中の値を調べる
  //  fracNodes: 並べ替えても避けられない分数（和の項・関数や累乗の中身が分数）の数
  //  irrNodes : 途中に出てくる無理数の数（最後に有理数になれば「打ち消し合い」）
  //  maxAbs   : 途中の値の最大の大きさ
  function intermediates(ast) {
    let fracNodes = 0, irrNodes = 0, maxAbs = 0;
    const isFrac = v => { const f = asFraction(v, 12, 999); return !!f && f[1] > 1; };
    const unwrap = n => (n.k === "paren" ? unwrap(n.a) : n);
    (function walk(n, isRoot) {
      n = unwrap(n);
      if (n.k === "num") return;
      const v = evaluate(n);
      if (Number.isFinite(v)) maxAbs = Math.max(maxAbs, Math.abs(v));
      if (!isRoot && !asFraction(v, 12, 999)) irrNodes++;
      if (n.k === "bin" && (n.op === "+" || n.op === "−")) {
        const items = [];
        (function f(m) { m = unwrap(m); if (m.k === "bin" && (m.op === "+" || m.op === "−")) { f(m.l); f(m.r); } else items.push(m); })(n);
        for (const it of items) if (isFrac(evaluate(it))) fracNodes++;
        items.forEach(it => walk(it, false));
        return;
      }
      if (n.k === "bin" && (n.op === "×" || n.op === "÷")) {
        const items = [];
        (function f(m) { m = unwrap(m); if (m.k === "bin" && (m.op === "×" || m.op === "÷")) { f(m.l); f(m.r); } else items.push(m); })(n);
        items.forEach(it => walk(it, false));
        return;
      }
      if (n.k === "bin") {
        if (isFrac(evaluate(n.l))) fracNodes++;
        if (isFrac(evaluate(n.r))) fracNodes++;
        walk(n.l, false); walk(n.r, false);
        return;
      }
      if (n.k === "fn" || n.k === "fact") {
        if (isFrac(evaluate(n.a))) fracNodes++;
        walk(n.a, false);
      }
    })(ast, true);
    return { fracNodes, irrNodes, maxAbs };
  }

  const WEIGHTS = { frac: 2.2, irrCancel: 1.6, nonComm: 0.6, breadth: 0.8, decoys: 0.8, swing: 0.6, parens: 1.0, nested: 1.0, twoRoot: 1.5 };

  function scorePuzzle(p) {
    const m = p.metrics;
    const W = WEIGHTS;
    let s = 0;
    // 分数を経由して「きれいな答え」に戻る問題を高く評価する（答え自体が分数なら控えめに）
    s += W.frac * Math.min(3, m.fracNodes) * (m.targetKind === "int" ? 1 : 0.35);
    s += W.irrCancel * (m.irrCancel ? Math.min(2, m.irrNodes) : 0);
    s += W.nonComm * Math.min(5, m.nonComm);
    s += W.breadth * Math.log10(1 + m.valid);
    s += W.decoys * Math.min(4, Math.log2(1 + m.decoys));
    s += W.swing * Math.min(3, Math.log10(Math.max(1, m.swing)));
    s += W.parens * Math.min(2, m.parens);
    s += W.nested * (m.nested ? 1 : 0);
    s += W.twoRoot * (m.twoRoot ? 1 : 0);
    return Math.round(s * 100) / 100;
  }

  // 条件を満たす候補を1つ作る（作れなければ null）
  // 式の中に「ルートの中にルート」があるか
  function hasDoubleRadical(ast) {
    let found = false;
    (function walk(n, inRoot) {
      if (found || !n) return;
      if (n.k === "fn" && n.f === "√") { if (inRoot) { found = true; return; } walk(n.a, true); return; }
      if (n.k === "bin") { walk(n.l, inRoot); walk(n.r, inRoot); }
      else if (n.k === "fn" || n.k === "fact" || n.k === "paren") walk(n.a, inRoot);
    })(ast, false);
    return found;
  }

  function makeCandidate(cfg, rnd, opts = {}) {
    const cards = !opts.noNest && rnd() < cfg.pNestPuzzle ? nestedPuzzle(cfg, rnd) : generate(cfg, rnd);
    if (cards.length < cfg.min || cards.length > cfg.max) return null;
    let ast;
    try { ast = parse(cards); } catch (e) { return null; }
    const v = evaluate(ast);
    if (!Number.isFinite(v)) return null;

    // 使っている記号の種類
    const ops = cards.filter(c => c.k === "op").map(c => c.s);
    const kinds = new Set();
    if (ops.some(o => o === "×" || o === "÷")) kinds.add("muldiv");
    if (ops.includes("^")) kinds.add("pow");
    if (ops.includes("C") || cards.some(c => c.k === "post")) kinds.add("comb");
    if (cards.some(c => c.k === "fn")) kinds.add("fn");
    if (cards.some(c => c.k === "lp")) kinds.add("paren");
    if (kinds.size === 0) return null;                       // 足し算・引き算だけ
    if (cfg === CONFIG.hard && kinds.size < 3) return null;   // Hard は3種類以上

    const t = niceTarget(v, cfg.maxInt);
    if (!t) return null;
    if (t.kind === "zero") return null;
    if (isPadded(ast)) return null;
    const parens = parensNeeded(cards, ast);
    if (parens === false) return null;
    if (irrationalExposed(ast, t.irr)) return null;

    const inter = intermediates(ast);
    const res = analyze(cards, v, { full: true });
    if (res.solutions !== 1) return null;

    const nonComm = ops.filter(o => o === "−" || o === "÷" || o === "^" || o === "C").length;
    const hasNested = hasDoubleRadical(ast);
    // 二重根号を外した √p ± √q に、√r をかける・割る（または (√p ∓ √q) をかける）形
    const lab = cards.map(c => c.s).join(" ");
    const twoRoot = hasNested && /\) [÷×] √ \d+|\) × \( √/.test(lab);
    // 二重根号の形で見せる（手札では外した形を作らせる）
    let html = t.html, text = t.text, nestedShown = false;
    const alt = nestedHtml(t);
    if (alt && !hasNested && rnd() < 0.5) { html = alt.html; text = alt.text; nestedShown = true; }

    const p = {
      cards: cards.map(c => c.s),
      answer: cards.map(c => c.s),
      target: v,
      targetHtml: html,
      targetText: text,
      metrics: {
        cards: cards.length,
        targetKind: t.kind,
        fracNodes: inter.fracNodes,
        irrNodes: inter.irrNodes,
        irrCancel: inter.irrNodes > 0 && isNiceRational(v),
        nonComm,
        valid: res.valid,
        decoys: res.decoys,
        near: res.near,
        swing: inter.maxAbs / Math.max(1, Math.abs(v)),
        parens,
        nested: hasNested || nestedShown,
        twoRoot,
      },
    };
    p.score = scorePuzzle(p);
    const m = p.metrics;
    p.tag = m.fracNodes > 0 ? "frac"
      : m.nested ? "nested"
      : m.parens ? "paren"
      : m.irrCancel ? "irr"
      : "mix";
    return p;
  }

  // 候補をいくつか集め、いちばん「考えさせる」ものを選ぶ
  function makePuzzle(level, opts = {}) {
    const cfg = CONFIG[level];
    const rnd = opts.rnd || Math.random;
    const want = opts.candidates || cfg.candidates;
    const deadline = Date.now() + (opts.timeLimit || 4000);
    const found = [];
    let seen = 0;
    for (let tries = 0; tries < 200000 && found.length < want && seen < want * 3; tries++) {
      if (found.length && Date.now() > deadline) break;
      const c = makeCandidate(cfg, rnd, { noNest: nestFull(found, want) });
      if (c) { seen++; if (accept(found, c, want)) found.push(c); }
    }
    if (!found.length) return fallbackPuzzle();
    const best = choose(found, cfg, rnd);
    best.candidates = found.length;
    if (opts.debug) best.others = found.slice(1).map(f => ({ score: f.score, text: f.targetText, answer: f.answer.join(" ") }));
    return best;
  }

  // 同じ種類の候補が集まりすぎないようにする（1種類あたり全体の3分の1まで）
  // 二重根号の候補が十分集まったら、それ以外の候補づくりに時間を回す
  function nestFull(found, want) {
    return found.filter(f => f.tag === "nested").length >= Math.ceil(want / 3);
  }
  function accept(found, c, want) {
    const cap = Math.ceil(want / 3);
    return found.filter(f => f.tag === c.tag).length < cap;
  }

  // 種類（分数・二重根号・かっこ・無理数の打ち消し・その他）をまず等確率で選び、
  // その中で点数の高いものを出す。同じ種類ばかり続かないようにするため
  function choose(found, cfg, rnd) {
    const byTag = {};
    for (const f of found) (byTag[f.tag] = byTag[f.tag] || []).push(f);
    const tags = Object.keys(byTag);
    // 二重根号は nestWeight の確率で優先し、残りは種類ごとに等確率
    let tag;
    if (byTag.nested && rnd() < cfg.nestWeight) tag = "nested";
    else {
      const rest = tags.filter(t => t !== "nested" || tags.length === 1);
      tag = rest[Math.floor(rnd() * rest.length)];
    }
    const list = byTag[tag];
    list.sort((a, b) => b.score - a.score);
    return list[Math.floor(rnd() * Math.min(cfg.pickFrom, list.length))];
  }

  function fallbackPuzzle() {
    const cards = ["7", "−", "(", "cos", "π", "+", "3", ")", "÷", "2"];
    const v = valueOf(cards.map(cardFromLabel));
    const t = niceTarget(v);
    return { cards, answer: cards.slice(), target: v, targetHtml: t.html, targetText: t.text, metrics: {}, score: 0 };
  }

  // 非同期版（ブラウザで画面を固めないため、少しずつ処理する）
  async function makePuzzleAsync(level, opts = {}) {
    const cfg = CONFIG[level];
    const rnd = opts.rnd || Math.random;
    const want = opts.candidates || cfg.candidates;
    const deadline = Date.now() + (opts.timeLimit || 3000);
    const found = [];
    let tries = 0, seen = 0;
    while (found.length < want && seen < want * 3 && tries < 200000) {
      const sliceEnd = Date.now() + 30;
      while (Date.now() < sliceEnd && found.length < want && seen < want * 3 && tries < 200000) {
        tries++;
        const c = makeCandidate(cfg, rnd, { noNest: nestFull(found, want) });
        if (c) { seen++; if (accept(found, c, want)) found.push(c); }
      }
      if (found.length && Date.now() > deadline) break;
      await new Promise(r => setTimeout(r, 0));
    }
    if (!found.length) return fallbackPuzzle();
    const best = choose(found, cfg, rnd);
    best.candidates = found.length;
    if (opts.debug) best.others = found.slice(1).map(f => ({ score: f.score, text: f.targetText, answer: f.answer.join(" ") }));
    return best;
  }

  const Engine = {
    exactHtml: exactHtmlSafe,
    CARD, FUNCS, CONFIG, WEIGHTS, cardFromLabel, ParseError, parse, evaluate, valueOf, close, canon, enumerate, analyze,
    niceTarget, nestedHtml, render, renderText, generate, isPadded, parensNeeded, irrationalExposed, intermediates,
    scorePuzzle, makeCandidate, makePuzzle, makePuzzleAsync, makeRng, asFraction,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(typeof self !== "undefined" ? self : this);
