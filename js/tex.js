/* Math text → HTML.
   tex(s):   a math string → italic variables, real subscripts, complements as OVERLINES (A' → Ā, (C+D)' → overline).
   mixed(s): free text → English words in the UI font, every variable / number / operator run in the TeX font. */
(function () {
  const SUB = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉", n: "ₙ", i: "ᵢ", j: "ⱼ", "+": "₊" };
  const UNSUB = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9", "ᵢ": "i", "ⱼ": "j", "ₙ": "n", "₊": "+" };
  const fmt = (s) => String(s).replace(/_([0-9nij+]+)/g, (_, d) => d.split("").map((c) => SUB[c] ?? c).join("")).replace(/\^n/g, "ⁿ");
  const KEYWORDS = new Set(["OR", "AND", "NAND", "NOR", "XOR", "XNOR", "NOT", "MUX", "DeMUX", "HA", "FA", "BCD", "SOP", "CPA", "Hi", "Err", "PSUT", "Mano", "ON", "OFF", "OK"]);
  const SHORT = new Set(["of", "if", "is", "to", "or", "in", "on", "by", "as", "be", "no", "so", "at", "it", "an", "we", "do", "up", "vs", "So", "If", "In", "On", "No", "To", "As", "At", "It", "An", "Is", "Or", "By", "We", "Do"]);
  const isVar = (w) => !KEYWORDS.has(w) && !SHORT.has(w) && (w === "Cy" || w.length === 1 || /^[A-Z]+$/.test(w) || /^[wxyz]+$/.test(w));
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const TOK = /([A-Za-z]+)|([₀-₉ᵢⱼₙ₊]+)|(['’])|(\()|(\))|(\s+)|([0-9]+)|(.)/g;
  function parse(s) {
    const stack = [[]];
    const cur = () => stack[stack.length - 1];
    let m;
    TOK.lastIndex = 0;
    while ((m = TOK.exec(s))) {
      if (m[1]) {
        if (isVar(m[1])) for (const c of m[1]) cur().push({ k: "v", s: c });
        else cur().push({ k: "w", s: m[1] });
      } else if (m[2]) {
        const last = cur()[cur().length - 1];
        const sub = m[2].split("").map((c) => UNSUB[c] ?? c).join("");
        if (last && last.k !== "t") last.sub = (last.sub ?? "") + sub;
        else cur().push({ k: "t", s: m[2] });
      } else if (m[3]) {
        const arr = cur(), last = arr[arr.length - 1];
        if (!last || (last.k === "t" && /^\s+$/.test(last.s))) arr.push({ k: "t", s: "'" });
        else { arr.pop(); arr.push(last.k === "g" ? { k: "o", ch: last.ch } : { k: "o", ch: [last] }); }
      } else if (m[4]) stack.push([]);
      else if (m[5]) {
        if (stack.length > 1) { const ch = stack.pop(); cur().push({ k: "g", ch }); }
        else cur().push({ k: "t", s: ")" });
      } else cur().push({ k: "t", s: m[6] ?? m[7] ?? m[8] ?? "" });
    }
    while (stack.length > 1) { const ch = stack.pop(); cur().push({ k: "t", s: "(" }, ...ch); }
    return stack[0];
  }
  const sub = (s) => (s ? `<sub>${esc(s)}</sub>` : "");
  const flat = (ns) => ns.map((q) => (q.ch ? flat(q.ch) : q.s ?? "")).join("");
  function render(nodes) {
    return nodes.map((n) => {
      switch (n.k) {
        case "v": return `<i>${esc(n.s)}</i>${sub(n.sub)}`;
        case "w": return `<span>${esc(n.s)}</span>${sub(n.sub)}`;
        case "t": return `${esc(n.s)}${sub(n.sub)}`;
        case "g": return `(${render(n.ch)})${sub(n.sub)}`;
        case "o": return `<span class="ovl${/^[acegmnopqrsuvwxyz]+$/.test(flat(n.ch)) ? " low" : ""}">${render(n.ch)}</span>${sub(n.sub)}`;
      }
      return "";
    }).join("");
  }
  const tex = (s) => `<span class="tex">${render(parse(fmt(s)))}</span>`;

  const MTOK = /([A-Za-z]+)|([0-9]+(?:\.[0-9]+)?)|([₀-₉ᵢⱼₙ₊]+)|(['’])|([+=−⊕·×<>≤≥→⇒⇔≠ΣΠ∑ⁿ²/^]|-(?=\d))|(\s+)|(.)/g;
  function splitMath(text) {
    const s = fmt(text), toks = [];
    let m;
    MTOK.lastIndex = 0;
    while ((m = MTOK.exec(s))) {
      if (m[1]) toks.push({ s: m[1], c: isVar(m[1]) ? "M" : "T" });
      else if (m[2] || m[3] || m[4] || m[5]) toks.push({ s: m[0], c: "M" });
      else toks.push({ s: m[0], c: "N" });
    }
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].s === "s" && /^[0-9]+$/.test(toks[i - 1]?.s ?? "")) toks[i].c = "T";
      if (toks[i].c === "T" && (toks[i + 1]?.s === "'" || toks[i + 1]?.s === "’") && /^[a-z]+$/.test(toks[i + 2]?.s ?? "")) { toks[i + 1].c = "T"; toks[i + 2].c = "T"; }
      if (toks[i].c === "M" && /^[A-Za-z]$/.test(toks[i].s) && toks[i + 1]?.s === "-" && /^[a-z]{2,}/.test(toks[i + 2]?.s ?? "")) toks[i].c = "T";
      if ((toks[i].s === "A" || toks[i].s === "a") && toks[i + 1]?.c === "N" && /^\s+$/.test(toks[i + 1].s) && toks[i + 2]?.c === "T" && /^[a-z]/.test(toks[i + 2].s)) toks[i].c = "T";
    }
    const isM = (i) => toks[i]?.c === "M";
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].c !== "N") continue;
      let a = i - 1; while (a >= 0 && toks[a].c === "N") a--;
      let b = i + 1; while (b < toks.length && toks[b].c === "N") b++;
      const ch = toks[i].s;
      if (isM(a) && isM(b) && !/[,;:.!?]/.test(ch)) toks[i].c = "M";
      else if (ch === "(" && isM(b)) toks[i].c = "M";
      else if (ch === ")" && isM(a)) toks[i].c = "M";
    }
    const segs = [];
    for (const t of toks) {
      const mm = t.c === "M", last = segs[segs.length - 1];
      if (last && last.m === mm) last.s += t.s; else segs.push({ m: mm, s: t.s });
    }
    return segs;
  }
  const mixed = (text) => splitMath(text).map((g) => (g.m ? tex(g.s) : esc(g.s))).join("");
  window.TEX = { fmt, tex, mixed, esc };
})();
