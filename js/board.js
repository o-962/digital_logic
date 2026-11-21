/* The board: draws every block of a page once, then shows the state of any step.
   setStep(s, animate) → items of earlier steps are shown finished, items of step s are animated:
   first the ANIMATIONS (circuit drawing, live example, K-map, addition), THEN the WRITING (lines, notes, rows).
   A white frame marks what is being explained right now. */
(function () {
  const { tex, mixed, esc } = window.TEX;
  const SVGNS = "http://www.w3.org/2000/svg";
  const C = { text: "#e8eefc", dim: "#94a3b8", gold: "#fcd34d", one: "#86efac", zero: "#cbd5e1", x: "#fbbf24", wire: "#7dd3fc", hl: "#fde047", stroke: "#e2e8f0" };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const cellColor = (v) => (v === "1" ? C.one : v === "0" ? C.zero : v === "x" || v === "X" ? C.x : C.text);

  /* ======================= text-like blocks (WRITING) ======================= */
  function writing(node, at, kind = "fade") {
    node.classList.add("w-item", "hidden");
    return {
      at, phase: "write", node,
      show() { node.classList.remove("hidden", "wipe-start", "fade-start"); },
      hide() { node.classList.add("hidden"); node.classList.remove("is-now"); },
      now(on) { node.classList.toggle("is-now", on); },
      async play(rate) {
        node.classList.remove("hidden");
        node.classList.add(kind === "wipe" ? "wipe-start" : "fade-start");
        void node.offsetWidth; // restart transition
        node.classList.remove("wipe-start", "fade-start");
        await wait((kind === "wipe" ? 900 : 450) / rate);
      },
    };
  }

  function bullets(b, items) {
    const box = el("div", "bullets");
    b.items.forEach((it) => {
      const [at, txt, lvl] = Array.isArray(it) ? it : [b.at, it, 0];
      const row = el("div", "bullet" + (lvl ? " sub" : ""), `<span class="dot">${lvl ? "▹" : "●"}</span><span>${mixed(txt)}</span>`);
      if (b.fs) row.style.fontSize = (lvl ? b.fs * 0.9 : b.fs) + "px";
      box.appendChild(row);
      items.push(writing(row, at));
    });
    return box;
  }
  function eq(b, items) {
    const box = el("div", "eq");
    box.style.alignItems = b.align === "center" ? "center" : "flex-start";
    b.lines.forEach(([at, txt, color]) => {
      const line = el("div", "eq-line", mixed(txt));
      line.style.fontSize = (b.fs ?? 36) * 1.02 + "px";
      if (color) line.style.color = color;
      box.appendChild(line);
      items.push(writing(line, at, "wipe"));
    });
    return box;
  }
  function note(b, items) {
    const n = el("div", "note", mixed(b.text));
    n.style.borderLeftColor = b.color ?? C.gold;
    if (b.fs) n.style.fontSize = b.fs + "px";
    items.push(writing(n, b.at));
    return n;
  }
  function text(b, items) {
    const n = el("div", "text", mixed(b.text));
    if (b.fs) n.style.fontSize = Math.min(b.fs, 34) + "px";
    if (b.color) n.style.color = b.color;
    if (b.fw) n.style.fontWeight = b.fw;
    if (b.align) n.style.textAlign = b.align;
    items.push(writing(n, b.at));
    return n;
  }

  /* ======================= table ======================= */
  function table(b, items) {
    const wrap = el("div", "tbl-wrap");
    if (b.cap) wrap.appendChild(el("div", "tbl-cap", mixed(b.cap)));
    const head = b.head.split(/\s+/), rows = b.rows.map((r) => r.trim().split(/\s+/));
    const t = el("table", "tbl");
    t.style.fontSize = (b.fs ?? 28) * 1.1 + "px";
    const sep = (ci) => head[ci - 1] === "|";
    const tr = el("tr");
    head.forEach((h, ci) => { if (h !== "|") { const th = el("th", sep(ci) ? "sep" : "", tex(h.replace(/~/g, " "))); tr.appendChild(th); } });
    t.appendChild(tr);
    const rowEls = rows.map((r, ri) => {
      const row = el("tr");
      r.forEach((v, ci) => {
        if (v === "|") return;
        const td = el("td", sep(ci) ? "sep" : "", tex(v === "_" ? "" : v.replace(/~/g, " ")));
        td.style.color = cellColor(v);
        td.dataset.ci = ci;
        row.appendChild(td);
      });
      t.appendChild(row);
      return row;
    });
    wrap.appendChild(t);
    items.push(writing(wrap, b.at ?? 0));
    rowEls.forEach((row, ri) => {
      const ra = Array.isArray(b.ra) ? b.ra[ri] : b.ra ?? b.at ?? 0;
      if (ra !== (b.at ?? 0)) items.push(writing(row, ra));
    });
    // highlights: a row or some cells, while their step is active (white frame = look here)
    const hls = b.hl ?? [];
    if (hls.length) items.push({
      at: -1, phase: "state", node: t,
      state(s) {
        rowEls.forEach((row) => { row.classList.remove("hl-row"); row.style.background = ""; [...row.children].forEach((td) => { td.classList.remove("hl-cell"); td.style.background = ""; }); });
        hls.filter((h) => s >= h.at && (h.to === undefined ? s < h.at + 1 : s < h.to)).forEach((h) => h.r.forEach((ri) => {
          const row = rowEls[ri];
          if (!row) return;
          if (!h.c) { row.classList.add("hl-row"); row.style.background = h.color ?? "rgba(56,189,248,0.28)"; }
          else [...row.children].forEach((td) => { if (h.c.includes(+td.dataset.ci)) { td.classList.add("hl-cell"); td.style.background = h.color ?? "rgba(250,204,21,0.35)"; } });
        }));
      },
    });
    return wrap;
  }

  /* ======================= K-map (Mano bracket style) ======================= */
  const gray = (bits) => (bits === 1 ? [0, 1] : [0, 1, 3, 2]);
  const bin = (v, n) => v.toString(2).padStart(n, "0");
  const intervals = (pos, n) => {
    const set = new Set(pos);
    if (set.size === n) return [[0, n - 1]];
    const sorted = [...set].sort((a, c) => a - c), runs = [];
    let s0 = sorted[0], p = sorted[0];
    for (const v of sorted.slice(1)) { if (v === p + 1) p = v; else { runs.push([s0, p]); s0 = v; p = v; } }
    runs.push([s0, p]);
    return runs;
  };
  function kmap(b, items) {
    const rb = b.rb ?? 2, cb = b.cb ?? 2, cs = b.cs ?? 66;
    const rows = gray(rb), cols = gray(cb);
    const vars = (t) => window.TEX.fmt(t).match(/[A-Za-z][₀-₉ᵢ]*/g) ?? [];
    const rV = vars(b.rv), cV = vars(b.cv);
    const BR = 42, codeW = 30 + rb * 10, codeH = 30, leftW = BR + codeW, topH = BR + codeH;
    const gridW = cols.length * cs, gridH = rows.length * cs;
    const rightW = rV.length > 1 ? BR : 8, botH = cV.length > 1 ? BR : 8;
    const W = leftW + gridW + rightW + 6, H = topH + gridH + botH + 6;
    const wrap = el("div", "kmap-wrap");
    if (b.name) wrap.appendChild(el("div", "kmap-name", mixed(b.name)));
    const box = el("div", "kmap");
    box.style.width = W + "px"; box.style.height = H + "px";
    const ones = (vals, n, k) => { const idx = vals.map((v, i) => (((v >> (n - 1 - k)) & 1) ? i : -1)).filter((i) => i >= 0); return [Math.min(...idx), Math.max(...idx)]; };
    let svg = `<svg width="${W}" height="${H}" class="kmap-svg"><line x1="${leftW * 0.3}" y1="${BR * 0.35}" x2="${leftW}" y2="${topH}" stroke="#e2e8f0" stroke-width="2"/>`;
    const fo = (x, y, w, h, html, align = "center") => `<foreignObject x="${x}" y="${y}" width="${w}" height="${h}"><div class="kfo" style="text-align:${align}">${html}</div></foreignObject>`;
    svg += fo(0, topH - 30, leftW * 0.75, 30, tex(b.rv), "left") + fo(leftW * 0.42, BR * 0.1 - 6, 120, 30, tex(b.cv), "left");
    const bracket = (side, i0, i1, name) => {
      const off = 12, tick = 10;
      if (side === "t" || side === "b") {
        const x0 = leftW + i0 * cs, x1 = leftW + (i1 + 1) * cs, y = side === "t" ? BR - off : topH + gridH + 6 + off, ty = side === "t" ? y + tick : y - tick;
        return `<path d="M ${x0} ${ty} L ${x0} ${y} L ${x1} ${y} L ${x1} ${ty}" fill="none" stroke="#e2e8f0" stroke-width="2.4"/>` + fo((x0 + x1) / 2 - 40, side === "t" ? y - 34 : y + 2, 80, 32, tex(name));
      }
      const y0 = topH + i0 * cs, y1 = topH + (i1 + 1) * cs, x = side === "l" ? BR - off : leftW + gridW + 6 + off, tx = side === "l" ? x + tick : x - tick;
      return `<path d="M ${tx} ${y0} L ${x} ${y0} L ${x} ${y1} L ${tx} ${y1}" fill="none" stroke="#e2e8f0" stroke-width="2.4"/>` + fo(side === "l" ? x - 36 : x + 4, (y0 + y1) / 2 - 16, 32, 32, tex(name), side === "l" ? "right" : "left");
    };
    if (rV[0]) { const [i0, i1] = ones(rows, rb, 0); svg += bracket("l", i0, i1, rV[0]); }
    if (rV[1]) { const [i0, i1] = ones(rows, rb, 1); svg += bracket("r", i0, i1, rV[1]); }
    if (cV[0]) { const [i0, i1] = ones(cols, cb, 0); svg += bracket("t", i0, i1, cV[0]); }
    if (cV[1]) { const [i0, i1] = ones(cols, cb, 1); svg += bracket("b", i0, i1, cV[1]); }
    svg += "</svg>";
    box.innerHTML = svg;
    cols.forEach((c, i) => { const d = el("div", "kcode", tex(bin(c, cb))); Object.assign(d.style, { left: leftW + i * cs + "px", top: BR + "px", width: cs + "px", height: codeH + "px", alignItems: "flex-end", justifyContent: "center" }); box.appendChild(d); });
    rows.forEach((r, i) => { const d = el("div", "kcode", tex(bin(r, rb))); Object.assign(d.style, { left: BR + "px", top: topH + i * cs + "px", width: codeW - 4 + "px", height: cs + "px", alignItems: "center", justifyContent: "flex-end" }); box.appendChild(d); });
    const grid = el("div", "kgrid");
    Object.assign(grid.style, { left: leftW + "px", top: topH + "px", width: gridW + "px", height: gridH + "px" });
    const cellVals = [];
    rows.forEach((r, ri) => cols.forEach((c, ci) => {
      const m = (r << cb) | c;
      const v = (b.ones ?? []).includes(m) ? "1" : (b.dc ?? []).includes(m) ? "x" : b.zeros ? "0" : "";
      const cell = el("div", "kcell", `<span class="kmin">${m}</span><span class="kval">${v === "x" ? "<i>x</i>" : v}</span>`);
      Object.assign(cell.style, { left: ci * cs + "px", top: ri * cs + "px", width: cs + "px", height: cs + "px", fontSize: cs * 0.48 + "px" });
      cell.querySelector(".kval").style.color = cellColor(v);
      grid.appendChild(cell);
      cellVals.push({ m, val: cell.querySelector(".kval") });
    }));
    box.appendChild(grid);
    wrap.appendChild(box);
    // the map itself (grid + values, filled in minterm order)
    cellVals.sort((a, c) => a.m - c.m);
    items.push({
      at: b.at ?? 0, phase: "anim", node: wrap,
      show() { wrap.classList.remove("hidden"); cellVals.forEach((c) => c.val.classList.remove("pop-start")); },
      hide() { wrap.classList.add("hidden"); },
      async play(rate) {
        wrap.classList.remove("hidden");
        cellVals.forEach((c) => c.val.classList.add("pop-start"));
        for (const c of cellVals) { await wait(70 / rate); c.val.classList.remove("pop-start"); }
        await wait(200 / rate);
      },
    });
    wrap.classList.add("hidden");
    // groups: one merged box per group (split only where it wraps around the edge)
    const chips = el("div", "kchips");
    wrap.appendChild(chips);
    const cellOf = (m) => [rows.indexOf(m >> cb), cols.indexOf(m & ((1 << cb) - 1))];
    (b.g ?? []).forEach((g, k) => {
      const cells = g.m.map(cellOf);
      const rI = intervals(cells.map((q) => q[0]), rows.length), cI = intervals(cells.map((q) => q[1]), cols.length);
      const inset = 4 + (k % 4) * 5, ext = 5, pieces = [];
      rI.forEach(([r0, r1]) => cI.forEach(([c0, c1]) => {
        const wrapL = cI.length > 1 && c0 === 0, wrapR = cI.length > 1 && c1 === cols.length - 1, wrapT = rI.length > 1 && r0 === 0, wrapB = rI.length > 1 && r1 === rows.length - 1;
        const p = el("div", "kgroup");
        Object.assign(p.style, {
          left: c0 * cs + inset - (wrapL ? inset + ext : 0) + "px", top: r0 * cs + inset - (wrapT ? inset + ext : 0) + "px",
          width: (c1 - c0 + 1) * cs - 2 * inset + (wrapL ? inset + ext : 0) + (wrapR ? inset + ext : 0) + "px",
          height: (r1 - r0 + 1) * cs - 2 * inset + (wrapT ? inset + ext : 0) + (wrapB ? inset + ext : 0) + "px",
          borderColor: g.c, background: g.c + "2e", boxShadow: `0 0 10px ${g.c}66`,
          borderLeftStyle: wrapL ? "dashed" : "solid", borderRightStyle: wrapR ? "dashed" : "solid", borderTopStyle: wrapT ? "dashed" : "solid", borderBottomStyle: wrapB ? "dashed" : "solid",
        });
        grid.appendChild(p);
        pieces.push(p);
      }));
      const chip = g.label ? el("span", "kchip", tex(g.label)) : null;
      if (chip) { chip.style.color = g.c; chip.style.borderColor = g.c; chips.appendChild(chip); }
      const all = chip ? [...pieces, chip] : pieces;
      all.forEach((p) => p.classList.add("hidden"));
      items.push({
        at: g.at, phase: "anim", node: pieces[0],
        show() { all.forEach((p) => p.classList.remove("hidden", "wipe-start")); },
        hide() { all.forEach((p) => p.classList.add("hidden")); pieces.forEach((p) => p.classList.remove("focus")); },
        now(on) { pieces.forEach((p) => p.classList.toggle("focus", on)); },
        async play(rate) {
          pieces.forEach((p) => { p.classList.remove("hidden"); p.classList.add("wipe-start"); void p.offsetWidth; p.classList.remove("wipe-start"); });
          await wait(700 / rate);
          if (chip) chip.classList.remove("hidden");
          await wait(250 / rate);
        },
      });
    });
    return wrap;
  }

  /* ======================= column addition with moving carries ======================= */
  function addition(b, items) {
    const A = b.a, B = b.b, n = A.length;
    const bit = (s, i) => +s[n - 1 - i];
    const c = [b.cin ?? 0], sm = [];
    for (let i = 0; i < n; i++) { const t = bit(A, i) + bit(B, i) + c[i]; sm.push(t & 1); c.push(t >> 1); }
    const fs = Math.min(b.fs ?? 40, 42), cw = fs * 0.95;
    const lw = Math.max(fs * 1.6, Math.max(String(b.la ?? "").length, String(b.lb ?? "").length + 2) * fs * 0.42 + 24);
    // rows: carry · first number · second number · (line) · result · note; the line has room above and below
    const rowY = [0, fs * 0.95, fs * 2.05, fs * 3.6, fs * 4.8];
    const lineY = fs * 3.32;
    const W = lw + (n + 1) * cw + 12, H = rowY[4] + fs * 1.1 + (b.cl ? fs * 0.6 : 0);
    const wrap = el("div", "add-wrap");
    if (b.cap) wrap.appendChild(el("div", "add-cap", mixed(b.cap)));
    const box = el("div", "add");
    Object.assign(box.style, { width: W + "px", height: H + "px" });
    const colX = (i) => lw + (n - i) * cw;
    const put = (x, y, html, cls, size, color) => { const d = el("div", "add-d " + (cls || ""), html); Object.assign(d.style, { left: x + "px", top: y + "px", width: cw + "px", fontSize: (size ?? fs) + "px", color: color ?? C.text }); box.appendChild(d); return d; };
    const lab = (y, html, size, color) => { const d = el("div", "add-lab", html); Object.assign(d.style, { top: y + "px", width: lw - 10 + "px", fontSize: size + "px", color }); box.appendChild(d); };
    lab(rowY[0], "carry", fs * 0.5, C.gold); lab(rowY[1], tex(b.la ?? ""), fs * 0.7, C.dim); lab(rowY[2], tex(b.lb ? `+ ${b.lb}` : "+"), fs * 0.7, C.dim);
    const line = el("div", "add-line"); Object.assign(line.style, { left: lw - 4 + "px", top: lineY + "px", width: (n + 1) * cw + 8 + "px" }); box.appendChild(line);
    for (let i = 0; i < n; i++) { put(colX(i), rowY[1], bit(A, i)); put(colX(i), rowY[2], bit(B, i)); }
    const frame = el("div", "add-frame hidden"); Object.assign(frame.style, { width: cw + 4 + "px", height: rowY[3] + fs * 1.25 + "px" }); box.appendChild(frame);
    const cin = b.cin !== undefined ? put(colX(0), rowY[0], c[0], "", fs * 0.7, C.gold) : null;
    const carries = [], sums = [];
    for (let i = 0; i < n; i++) {
      carries.push(put(colX(i + 1), rowY[0], c[i + 1], "carry", fs * 0.7, i === n - 1 && b.discard ? "#f87171" : C.gold));
      sums.push(put(colX(i), rowY[3], sm[i], "", fs, C.one));
    }
    const cout = put(colX(n), rowY[3], c[n], "", fs, b.discard ? "#f87171" : C.one);
    if (b.discard) cout.style.textDecoration = "line-through";
    const noteEl = b.note ? (() => { const d = el("div", "add-note", mixed(b.note)); d.style.top = rowY[4] + 4 + "px"; d.style.color = b.discard ? "#f87171" : C.one; box.appendChild(d); return d; })() : null;
    wrap.appendChild(box);
    const at = b.at ?? 0;
    const colStep = (i) => (b.steps ? b.steps[i] : at);
    const finalStep = b.final !== undefined ? b.final : b.steps ? b.steps[n - 1] : at;
    const showCol = (i, on) => { [carries[i], sums[i]].forEach((d) => d.classList.toggle("hidden", !on)); };
    const showFinal = (on) => { cout.classList.toggle("hidden", !on); if (noteEl) noteEl.classList.toggle("hidden", !on); };
    // the whole block appears at `at`; columns at their steps (right to left); the last carry drops at `final`
    items.push({
      at, phase: "anim", node: wrap,
      show() { wrap.classList.remove("hidden"); }, hide() { wrap.classList.add("hidden"); }, async play() { wrap.classList.remove("hidden"); },
    });
    items.push({
      at: -1, phase: "state", node: wrap,
      state(s, animate, rate) {
        const my = (this.tok = (this.tok ?? 0) + 1);
        for (let i = 0; i < n; i++) showCol(i, colStep(i) < s || (colStep(i) === s && !animate));
        if (cin) cin.classList.toggle("hidden", s < at);
        showFinal(finalStep < s || (finalStep === s && !animate));
        frame.classList.add("hidden");
        if (!animate) return 0;
        const todo = []; for (let i = 0; i < n; i++) if (colStep(i) === s) todo.push(i);
        const doFinal = finalStep === s;
        if (!todo.length && !doFinal) return 0;
        (async () => {
          for (const i of todo) {
            if (my !== this.tok) return;
            frame.classList.remove("hidden"); frame.style.left = colX(i) - 2 + "px";
            await wait(350 / rate); sums[i].classList.remove("hidden"); sums[i].classList.add("pop");
            await wait(350 / rate); carries[i].classList.remove("hidden"); carries[i].classList.add("slide");
            await wait(500 / rate);
          }
          if (my !== this.tok) return;
          frame.classList.add("hidden");
          if (doFinal) { await wait(200 / rate); showFinal(true); cout.classList.add("drop"); }
        })();
        return (todo.length * 1200 + (doFinal ? 600 : 0)) / rate;
      },
    });
    wrap.classList.add("hidden");
    return wrap;
  }

  /* ======================= circuit (SVG) ======================= */
  const gatePath = (g) => {
    const { x, y, h, L } = g, xo = g.g === "xor" || g.g === "xnor" ? 9 : 0;
    if (["and", "nand"].includes(g.g)) { const rx = Math.min(h / 2, L * 0.55); return `M ${x} ${y} H ${x + L - rx} A ${rx} ${h / 2} 0 0 1 ${x + L - rx} ${y + h} H ${x} Z`; }
    if (["or", "nor", "xor", "xnor"].includes(g.g)) { const b = x + xo; return `M ${b} ${y} Q ${b + 18} ${y + h / 2} ${b} ${y + h} Q ${b + L * 0.55} ${y + h} ${b + L} ${y + h / 2} Q ${b + L * 0.55} ${y} ${b} ${y} Z`; }
    return `M ${x} ${y} L ${x + L} ${y + h / 2} L ${x} ${y + h} Z`;
  };
  const fo = (x, y, s, a, size, color, plain, bold) => {
    const W = Math.max(40, String(s).length * size * 0.75 + 40), H = size * 1.9;
    const x0 = a === "start" ? x : a === "end" ? x - W : x - W / 2;
    const jc = a === "start" ? "flex-start" : a === "end" ? "flex-end" : "center";
    return `<foreignObject x="${x0}" y="${y - H / 2}" width="${W}" height="${H}" style="overflow:visible"><div class="clab" data-fs="${size}" style="width:${W}px;height:${H}px;justify-content:${jc};font-size:${size}px;color:${color};font-weight:${bold ? 700 : 500}">${plain ? `<span class="ui">${mixed(s)}</span>` : tex(s)}</div></foreignObject>`;
  };

  function circuit(b, items, page) {
    const els = b.els;
    const { st, ord } = window.BUILD.buildSteps(b);
    const wrap = el("div", "circ-wrap");
    const cap = el("div", "sim-cap hidden");
    wrap.appendChild(cap);
    const frameBox = el("div", "circ-box");
    const svg = document.createElementNS(SVGNS, "svg");
    const M = 34; // inner margin of the block, in drawing units
    svg.setAttribute("viewBox", `${-M} ${-M} ${b.vw + 2 * M} ${b.vh + 2 * M}`);
    svg.classList.add("circ-svg");
    svg.style.aspectRatio = `${b.vw + 2 * M} / ${b.vh + 2 * M}`;
    frameBox.appendChild(svg);
    wrap.appendChild(frameBox);
    if (b.src) wrap.appendChild(el("div", "src", esc(b.src)));
    // horizontal wire segments (labels keep a 2px gap above / below them)
    const hsegs = [];
    els.filter((e) => e.e === "wire").forEach((w) => w.pts.slice(1).forEach((p, k) => { const q = w.pts[k]; if (Math.abs(q[1] - p[1]) < 0.5) hsegs.push([Math.min(q[0], p[0]), Math.max(q[0], p[0]), p[1]]); }));
    const labelY = (e) => {
      const vis = String(e.s).replace(/[_'’]/g, "").length, w = vis * e.size * 0.55, hh = e.size * 0.42;
      const x0 = e.a === "start" ? e.x : e.a === "end" ? e.x - w : e.x - w / 2;
      let y = e.y;
      for (let it = 0; it < 3; it++) for (const [sx0, sx1, sy] of hsegs) {
        if (sx1 <= x0 + 1 || sx0 >= x0 + w - 1 || Math.abs(sy - e.y) < 0.6) continue;
        if (sy > y - hh - 3 && sy < y + hh + 3) y = e.y < sy ? sy - hh - 3 : sy + hh + 3;
      }
      return y;
    };
    // draw every element once, hidden; remember its parts for the animation
    // one colour per signal: wires that are electrically the same line share a colour; neighbours differ
    const PALETTE = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#fb923c", "#22d3ee", "#f87171", "#a3e635", "#e879f9", "#2dd4bf", "#fde047", "#93c5fd", "#fca5a5"];
    const allNet = window.SIM.buildNet(els);
    const netColor = {};
    {
      const first = {};
      els.forEach((e, i) => {
        if (e.e !== "wire") return;
        const id = allNet.wireNet[i], x = Math.min(...e.pts.map((p) => p[0])), y = Math.min(...e.pts.map((p) => p[1]));
        if (!(id in first) || x < first[id][0] - 1 || (Math.abs(x - first[id][0]) <= 1 && y < first[id][1])) first[id] = [x, y];
      });
      Object.keys(first).sort((a, c) => first[a][0] - first[c][0] || first[a][1] - first[c][1]).forEach((id, k) => { netColor[id] = PALETTE[k % PALETTE.length]; });
    }
    const wireColor = (i) => netColor[allNet.wireNet[i]] ?? C.wire;
    const labelColor = (k, e) => (allNet.labelNet[k] !== undefined && !e.c ? netColor[allNet.labelNet[k]] : e.c ?? "#f1f5f9");
    const dotColor = (e) => {
      for (let j = 0; j < els.length; j++) {
        const w = els[j];
        if (w.e !== "wire") continue;
        if (w.pts.some((p) => Math.abs(p[0] - e.x) < 2.5 && Math.abs(p[1] - e.y) < 2.5) || w.pts.slice(1).some((q, k) => { const a = w.pts[k]; return Math.min(a[0], q[0]) - 2 <= e.x && e.x <= Math.max(a[0], q[0]) + 2 && Math.min(a[1], q[1]) - 2 <= e.y && e.y <= Math.max(a[1], q[1]) + 2; })) return wireColor(j);
      }
      return C.wire;
    };
    const parts = els.map((e, i) => {
      const g = document.createElementNS(SVGNS, "g");
      g.dataset.i = i;
      let html = "";
      if (e.e === "wire") {
        const d = e.pts.map((p, k) => `${k ? "L" : "M"} ${p[0]} ${p[1]}`).join(" ");
        const last = e.pts[e.pts.length - 1], prev = e.pts[e.pts.length - 2], ang = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
        html = `<path class="draw wire" d="${d}" fill="none" stroke="${wireColor(i)}" style="--c:${wireColor(i)}" stroke-width="${Math.max(e.w ?? 2.8, 2.8)}" stroke-linejoin="round" pathLength="1" ${e.dash ? 'data-dash="1"' : ""}/>`;
        if (e.arrow) html += `<path class="arrow" d="M ${last[0]} ${last[1]} L ${last[0] - 13 * Math.cos(ang - 0.4)} ${last[1] - 13 * Math.sin(ang - 0.4)} L ${last[0] - 13 * Math.cos(ang + 0.4)} ${last[1] - 13 * Math.sin(ang + 0.4)} Z" fill="${wireColor(i)}"/>`;
      } else if (e.e === "gate") {
        const xo = e.g === "xor" || e.g === "xnor" ? 9 : 0, bubble = ["not", "nand", "nor", "xnor", "trinot"].includes(e.g);
        html = `<g ${e.rot ? `transform="rotate(${e.rot} ${e.x} ${e.y})"` : ""}><path class="draw body" d="${gatePath(e)}" fill="rgba(148,163,184,0.10)" stroke="${C.stroke}" stroke-width="2.6" stroke-linejoin="round" pathLength="1"/>`;
        if (xo) html += `<path class="draw" d="M ${e.x} ${e.y} Q ${e.x + 18} ${e.y + e.h / 2} ${e.x} ${e.y + e.h}" fill="none" stroke="${C.stroke}" stroke-width="2.6" pathLength="1"/>`;
        if (bubble) html += `<circle cx="${e.x + xo + e.L + 5}" cy="${e.y + e.h / 2}" r="5" fill="#0b1324" stroke="${C.stroke}" stroke-width="2"/>`;
        (e.inv ?? []).forEach((k) => { html += `<circle cx="${e.x - 5.5}" cy="${e.y + (e.h * (k + 0.5)) / e.n}" r="5" fill="#0b1324" stroke="${C.stroke}" stroke-width="2"/>`; });
        html += "</g>";
      } else if (e.e === "box") {
        html = `<rect class="draw body" x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="12" fill="${e.fill ?? "rgba(56,189,248,0.10)"}" stroke="#93c5fd" stroke-width="2.6" pathLength="1"/>`;
        const ls = e.ls ?? 26;
        String(e.label ?? "").split("\n").forEach((ln, k, arr) => { html += fo(e.x + e.w / 2, e.y + e.h / 2 + (k - (arr.length - 1) / 2) * ls * 1.15, ln, "middle", ls, "#f8fafc", true, true); });
        e.pins.forEach((p) => {
          const inset = 14 + (p.bub ? 10 : 0);
          const tx = p.s === "l" ? p.x + inset : p.s === "r" ? p.x - inset : p.x, ty = p.s === "t" ? p.y + inset + 4 : p.s === "b" ? p.y - inset - 4 : p.y;
          if (p.bub) html += `<circle cx="${p.s === "l" ? p.x + 5 : p.s === "r" ? p.x - 5 : p.x}" cy="${p.s === "t" ? p.y + 5 : p.s === "b" ? p.y - 5 : p.y}" r="5" fill="#0b1324" stroke="#93c5fd" stroke-width="2"/>`;
          if (p.show) html += fo(tx, ty, p.name, p.s === "l" ? "start" : p.s === "r" ? "end" : "middle", e.ps ?? 18, "#cbd5e1");
        });
      } else if (e.e === "dot") html = `<circle cx="${e.x}" cy="${e.y}" r="5" fill="${dotColor(e)}"/>`;
      else if (e.e === "txt") html = fo(e.x, labelY(e), e.s, e.a, Math.max(e.size, e.plain ? 15 : 24), labelColor(i, e), e.plain, e.bold); // names never too small
      else if (e.e === "lamp") html = `<circle class="lamp-c" cx="${e.x}" cy="${e.y}" r="${e.r ?? 16}" stroke-width="2.4"/>` + (e.label != null ? fo(e.x, e.y - (e.r ?? 16) - 14, String(e.label), "middle", 20, "#cbd5e1") : "");
      else if (e.e === "switch") html = `<rect class="sw-r" x="${e.x - 16}" y="${e.y - 12}" width="32" height="24" rx="6" stroke-width="2.2"/><circle class="sw-k" cx="${e.x - 7}" cy="${e.y}" r="6"/>` + (e.label != null ? fo(e.x - 26, e.y, String(e.label), "end", 20, "#cbd5e1") : "");
      else if (e.e === "cross") html = `<g stroke="#f43f5e" stroke-width="5" stroke-linecap="round"><line x1="${e.x - e.s}" y1="${e.y - e.s}" x2="${e.x + e.s}" y2="${e.y + e.s}"/><line x1="${e.x - e.s}" y1="${e.y + e.s}" x2="${e.x + e.s}" y2="${e.y - e.s}"/></g>`;
      else if (e.e === "seg7") {
        const { x, y } = e, sz = e.s, t = sz * 0.14, w = sz * 0.75;
        const segs = { a: [x + t, y, w - 2 * t, t], g: [x + t, y + sz * 0.75 - t / 2, w - 2 * t, t], d: [x + t, y + sz * 1.5 - t, w - 2 * t, t], f: [x, y + t, t, sz * 0.75 - 1.5 * t], b: [x + w - t, y + t, t, sz * 0.75 - 1.5 * t], e: [x, y + sz * 0.75 + t / 2, t, sz * 0.75 - 1.5 * t], c: [x + w - t, y + sz * 0.75 + t / 2, t, sz * 0.75 - 1.5 * t] };
        const lp = { a: [x + w / 2, y - 18], b: [x + w + 20, y + sz * 0.38], c: [x + w + 20, y + sz * 1.12], d: [x + w / 2, y + sz * 1.5 + 22], e: [x - 20, y + sz * 1.12], f: [x - 20, y + sz * 0.38], g: [x + w / 2, y + sz * 0.75 - 22] };
        html = Object.entries(segs).map(([k, [sx, sy, sw, sh]]) => `<rect class="seg" data-seg="${k}" x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="${t / 2}" stroke="#fda4af" stroke-width="1"/>` + fo(lp[k][0], lp[k][1], k, "middle", 22, "#fda4af")).join("");
      }
      else if (e.e === "grp") html = `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="14" fill="rgba(56,189,248,0.04)" stroke="${e.c ?? "#64748b"}" stroke-width="2" stroke-dasharray="9 6"/>` + (e.label ? fo(e.x + 10, e.y - 14, e.label, "start", 20, "#94a3b8", true) : "");
      g.innerHTML = html;
      g.classList.add("ce", "hidden");
      svg.appendChild(g);
      return g;
    });
    // lamps and switches show the value of the wire they sit on; a 7-segment display shows its decoder's outputs
    const ioNet = {};
    els.forEach((e, i) => {
      if (e.e !== "lamp" && e.e !== "switch") return;
      let best = 34;
      els.forEach((w, j) => { if (w.e !== "wire") return; for (const q of [w.pts[0], w.pts[w.pts.length - 1]]) { const d = Math.hypot(q[0] - e.x, q[1] - e.y); if (d < best) { best = d; ioNet[i] = allNet.wireNet[j]; } } });
    });
    const setIO = (i, on) => {
      const g = parts[i], e = els[i];
      if (e.e === "lamp") g.classList.toggle("lit-lamp", !!on);
      if (e.e === "switch") { g.classList.toggle("sw-on", !!on); const k = g.querySelector(".sw-k"); if (k) k.setAttribute("cx", on ? e.x + 7 : e.x - 7); }
      if (e.e === "seg7") g.querySelectorAll(".seg").forEach((r) => r.classList.toggle("seg-on", String(on).includes(r.dataset.seg)));
    };
    const resetIO = () => els.forEach((e, i) => { if (e.e === "lamp" || e.e === "switch") setIO(i, e.on); if (e.e === "seg7") setIO(i, e.on ?? "abcdefg"); });
    resetIO();
    const tagLayer = document.createElementNS(SVGNS, "g");
    const focusLayer = document.createElementNS(SVGNS, "g");
    svg.appendChild(tagLayer); svg.appendChild(focusLayer);

    const showEl = (i, on) => parts[i].classList.toggle("hidden", !on);
    const untilHide = (i, s) => els[i].until !== undefined && s >= els[i].until;
    // drawing order inside a step: signal flow (from build.js)
    let ctok = 0; // a new step cancels what is still running from the previous one
    const drawStep = async (s, rate, my) => {
      const idx = els.map((_, i) => i).filter((i) => st[i] === s && !untilHide(i, s)).sort((a, c) => ord[a] - ord[c]);
      if (!idx.length) return;
      const gap = Math.max(25, Math.min(110, 2200 / idx.length)) / rate;
      for (const i of idx) {
        if (my !== ctok) return;
        const g = parts[i];
        g.classList.remove("hidden");
        g.querySelectorAll(".draw").forEach((p) => { if (p.dataset.dash) return; p.classList.add("draw-start"); void p.getBoundingClientRect(); p.classList.remove("draw-start"); });
        g.classList.add("appear");
        await wait(gap);
      }
      await wait(350 / rate);
    };
    // ---- live example ----
    const net = b.sim ? allNet : null;
    let tryValues = null;
    const simAt = (s) => { let k = -1; (b.sim ?? []).forEach((x, j) => { if (s >= x.at && (x.to === undefined || s < x.to)) k = j; }); return k; };
    const levelStep = (sm, L) => { if (!sm.levelAt) return sm.at; const ks = Object.keys(sm.levelAt).map(Number).filter((k) => k <= L); return ks.length ? sm.levelAt[Math.max(...ks)] : sm.at; };
    const ONE = "#4ade80", ZERO = "#64748b";
    const clearSim = () => {
      tagLayer.innerHTML = "";
      parts.forEach((g, i) => { if (els[i].e === "wire") g.classList.remove("v1", "v0"); });
      resetIO();
      cap.classList.add("hidden");
    };
    const tag = (x, y, v, key) => {
      const t = document.createElementNS(SVGNS, "g");
      t.setAttribute("class", "tag pop");
      const k = +svg.dataset.k || 1, z = Math.max(1, 15 / (19 * k)); // never smaller than ~15px on screen
      t.setAttribute("transform", `translate(${x} ${y}) scale(${z})`);
      t.innerHTML = `<rect x="-11" y="-13" width="22" height="26" rx="6" fill="${v ? "rgba(22,101,52,0.95)" : "rgba(30,41,59,0.95)"}" stroke="${v ? ONE : "#94a3b8"}" stroke-width="1.6"/><text x="0" y="7" text-anchor="middle" font-size="19" font-weight="700" font-family="CMU Serif, serif" fill="${v ? "#dcfce7" : "#cbd5e1"}">${v}</text>`;
      tagLayer.appendChild(t);
    };
    // show the values of all nets whose level is allowed (maxLevel), only on parts that are drawn
    const paintSim = (r, inputs, maxLevel) => {
      tagLayer.innerHTML = "";
      parts.forEach((g, i) => { if (els[i].e === "wire") g.classList.remove("v1", "v0"); });
      parts.forEach((g, i) => {
        if (els[i].e !== "wire" || g.classList.contains("hidden")) return;
        const nid = net.wireNet[i], v = r.val[nid];
        if (v === undefined || (r.lvl[nid] ?? 0) > maxLevel) return;
        g.classList.toggle("v1", v === 1);
        g.classList.toggle("v0", v === 0);
      });
      els.forEach((e, i) => {
        if ((e.e === "lamp" || e.e === "switch") && ioNet[i] !== undefined) { const v = r.val[ioNet[i]]; if (v !== undefined && (r.lvl[ioNet[i]] ?? 0) <= maxLevel) setIO(i, v === 1); }
        if (e.e === "seg7") {
          const bx = net.boxes.find((q) => q.label.toLowerCase().includes("7-segment")), outs = bx && r.boxOut[bx.i];
          if (outs) setIO(i, Object.entries(outs).filter(([, v]) => v === 1).map(([k]) => k).join(""));
        }
      });
      net.gates.forEach((gt) => {
        const v = r.gateOut[gt.i];
        if (v === undefined || v === null || parts[gt.i].classList.contains("hidden") || (r.lvl[gt.out] ?? 0) > maxLevel) return;
        const e = els[gt.i], [ox, oy] = e.out;
        // tag beside the output, never on its label: down-pointing gates get it on the left
        const dx = e.rot === 90 ? -18 : e.rot === 180 ? -16 : 14, dy = e.rot === 90 ? 8 : e.rot === -90 ? -14 : -16;
        tag(ox + dx, oy + dy, v);
      });
      net.boxes.forEach((bx) => {
        const outs = r.boxOut[bx.i];
        if (!outs || parts[bx.i].classList.contains("hidden")) return;
        bx.pins.forEach((pn) => {
          if (!(pn.name in outs) || (pn.net >= 0 && (r.lvl[pn.net] ?? 0) > maxLevel)) return;
          const off = pn.s === "r" ? [16, -16] : pn.s === "l" ? [-16, -16] : pn.s === "b" ? [15, 16] : [15, -16];
          tag(pn.x + off[0], pn.y + off[1], outs[pn.name]);
        });
      });
      Object.entries(inputs).forEach(([name, v]) => (net.names[name] ?? []).forEach((nid) => {
        const k = Object.keys(net.labelNet).map(Number).find((t) => net.labelNet[t] === nid && els[t].s === name);
        if (k === undefined || parts[k].classList.contains("hidden")) return;
        const t = els[k];
        // names written above a wire (middle) get the tag on their right, on the same line
        const w = String(t.s).replace(/[_'’]/g, "").length * Math.max(t.size, 24) * 0.5;
        if (t.a === "middle") tag(t.x + w / 2 + 16, t.y, v);
        else tag(t.a === "end" ? t.x + 14 : t.x - 14, t.y - 18, v);
      }));
    };
    const capText = (sm) => sm.label ?? Object.entries(sm.v).map(([k, v]) => `${k} = ${v}`).join(",  ");
    const runSim = async (s, animate, rate, my = ctok) => {
      if (!net) return;
      if (tryValues) { const r = window.SIM.simulate(net, tryValues); cap.classList.add("hidden"); paintSim(r, tryValues, 99); return; } // no label: the values are on the circuit
      const k = simAt(s);
      if (k < 0) { clearSim(); return; }
      const sm = b.sim[k], r = window.SIM.simulate(net, sm.v);
      cap.innerHTML = "Example: " + mixed(capText(sm));
      cap.classList.remove("hidden");
      const maxL = Math.max(0, ...Object.values(r.lvl));
      // levels whose step is already done are shown at once; the ones of this step travel level by level
      let shown = -1;
      for (let L = 0; L <= maxL; L++) if (levelStep(sm, L) < s || (levelStep(sm, L) === s && !animate)) shown = L;
      paintSim(r, sm.v, shown);
      if (!animate) return;
      for (let L = shown + 1; L <= maxL; L++) {
        if (levelStep(sm, L) !== s) break;
        await wait(450 / rate);
        if (my !== ctok) return;
        paintSim(r, sm.v, L);
      }
    };
    // ---- white frame around the part being explained ----
    const focus = (s) => {
      focusLayer.innerHTML = "";
      (b.hl ?? []).filter((h) => h.ring !== false && s >= h.at && (h.to === undefined ? s < h.at + 1 : s < h.to)).forEach((h) => {
        const idx = els.map((_, i) => i).filter((i) => els[i].id && h.ids.includes(els[i].id) && !parts[i].classList.contains("hidden"));
        const solid = idx.filter((i) => !["wire", "txt", "dot"].includes(els[i].e)), use = solid.length ? solid : idx;
        if (!use.length) return;
        const bbs = use.map((i) => els[i].bb), pad = 12;
        const x0 = Math.min(...bbs.map((q) => q[0])) - pad, y0 = Math.min(...bbs.map((q) => q[1])) - pad, x1 = Math.max(...bbs.map((q) => q[2])) + pad, y1 = Math.max(...bbs.map((q) => q[3])) + pad;
        void x0; void y0; void x1; void y1;
      });
      parts.forEach((g, i) => g.classList.toggle("lit", !!els[i].id && (b.hl ?? []).some((h) => h.ids.includes(els[i].id) && s >= h.at && (h.to === undefined ? s < h.at + 1 : s < h.to))));
    };

    const at0 = b.at ?? 0;
    wrap.classList.add("hidden");
    items.push({ at: at0, phase: "anim", node: wrap, show() { wrap.classList.remove("hidden"); }, hide() { wrap.classList.add("hidden"); }, async play() { wrap.classList.remove("hidden"); } });
    const steps = [...new Set(st)];
    items.push({
      at: -1, phase: "state", node: wrap, circuit: true,
      state(s, animate, rate) {
        const my = ++ctok;
        // finished parts
        els.forEach((_, i) => showEl(i, (st[i] < s || (st[i] === s && !animate)) && !untilHide(i, s)));
        focusLayer.innerHTML = "";
        if (!animate) { focus(s); runSim(s, false, rate, my); return 0; }
        (async () => {
          if (steps.includes(s)) await drawStep(s, rate, my);
          if (my !== ctok) return;
          focus(s);
          await runSim(s, true, rate, my);
        })();
        const n = els.filter((_, i) => st[i] === s).length;
        const simLevels = b.sim && (b.sim.some((x) => x.at === s) || b.sim.some((x) => Object.values(x.levelAt ?? {}).includes(s))) ? 4 : 0;
        return (n ? Math.min(2600, n * 60 + 400) : 0) / rate + (simLevels * 450) / rate + 200;
      },
      setTry(values, s) { tryValues = values; runSim(s, false, 1, ++ctok); },
    });
    if (net) page.tryables.push({ b, inputs: Object.keys(b.sim[b.sim.length - 1].v), defaults: { ...b.sim[b.sim.length - 1].v }, item: items[items.length - 1] });
    return wrap;
  }

  /* ======================= live seven-segment display ======================= */
  const SEG_ON = { 0: "abcdef", 1: "bc", 2: "abdeg", 3: "abcdg", 4: "bcfg", 5: "acdfg", 6: "acdefg", 7: "abc", 8: "abcdefg", 9: "abcdfg" };
  function segDisplay(b, items) {
    const sz = (b.size ?? 120) * 1.45, t = sz * 0.15, w = sz * 0.78, x = 30, y = 20; // bigger on the website
    const segs = { a: [x + t, y, w - 2 * t, t], g: [x + t, y + sz * 0.78 - t / 2, w - 2 * t, t], d: [x + t, y + sz * 1.56 - t, w - 2 * t, t], f: [x, y + t, t, sz * 0.78 - 1.5 * t], b: [x + w - t, y + t, t, sz * 0.78 - 1.5 * t], e: [x, y + sz * 0.78 + t / 2, t, sz * 0.78 - 1.5 * t], c: [x + w - t, y + sz * 0.78 + t / 2, t, sz * 0.78 - 1.5 * t] };
    const lab = { a: [x + w / 2, y - 8], b: [x + w + 16, y + sz * 0.42], c: [x + w + 16, y + sz * 1.2], d: [x + w / 2, y + sz * 1.56 + 22], e: [x - 16, y + sz * 1.2], f: [x - 16, y + sz * 0.42], g: [x + w / 2, y + sz * 0.78 - 12] };
    const wrap = el("div", "segd");
    wrap.innerHTML = `<div class="segd-title">Display</div><svg class="segd-svg" width="${w + 60}" height="${sz * 1.56 + 50}">${Object.entries(segs).map(([k, [sx, sy, sw, sh]]) => `<rect data-seg="${k}" x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="${t / 2}"/><text x="${lab[k][0]}" y="${lab[k][1] + 6}" text-anchor="middle">${k}</text>`).join("")}</svg><div class="segd-code"></div><div class="segd-cap"></div><div class="segd-chips"></div>`;
    const rects = [...wrap.querySelectorAll("rect")], code = wrap.querySelector(".segd-code"), cap2 = wrap.querySelector(".segd-cap"), chips = wrap.querySelector(".segd-chips");
    const show = (d, focus, seen) => {
      const on = SEG_ON[d];
      rects.forEach((r) => { r.classList.toggle("on", on.includes(r.dataset.seg)); r.classList.toggle("focus", r.dataset.seg === focus); r.classList.toggle("focus-off", r.dataset.seg === focus && !on.includes(focus)); });
      code.innerHTML = tex(`wxyz = ${d.toString(2).padStart(4, "0")}`) + ` → ${d}`;
      cap2.innerHTML = focus ? `digit ${d}: ${tex(focus)} = ${on.includes(focus) ? 1 : 0}` : "";
      cap2.className = "segd-cap " + (focus ? (on.includes(focus) ? "is1" : "is0") : "");
      chips.innerHTML = seen ? Array.from({ length: 10 }, (_, k) => `<span class="${seen.includes(k) ? (SEG_ON[k].includes(focus) ? "c1" : "c0") : "cx"}">${k}</span>`).join("") : "";
    };
    items.push({ at: b.at ?? 0, phase: "anim", node: wrap, show() { wrap.classList.remove("hidden"); }, hide() { wrap.classList.add("hidden"); }, async play() { wrap.classList.remove("hidden"); } });
    wrap.classList.add("hidden");
    items.push({
      at: -1, phase: "state", node: wrap,
      state(s, animate, rate) {
        const my = (this.tok = (this.tok ?? 0) + 1);
        let digit = 8, focus, cyc = null;
        (b.show ?? []).forEach((x) => { if (s >= x.at) { digit = x.d; focus = x.focus; } });
        (b.cycle ?? []).forEach((x) => { if (s >= x.at) cyc = x; });
        if (!cyc) { show(digit, focus, null); return 0; }
        const all = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        if (!animate || cyc.at !== s) { show(9, cyc.focus, all); return 0; }
        (async () => { for (const d of all) { if (my !== this.tok) return; show(d, cyc.focus, all.slice(0, d + 1)); await wait(520 / rate); } })();
        return 0;
      },
    });
    return wrap;
  }

  /* ======================= layout ======================= */
  function block(b, items, page) {
    switch (b.t) {
      case "bullets": return bullets(b, items);
      case "eq": return eq(b, items);
      case "note": return note(b, items);
      case "text": return text(b, items);
      case "table": return table(b, items);
      case "kmap": return kmap(b, items);
      case "add": return addition(b, items);
      case "seg": return segDisplay(b, items);
      case "circ": return circuit(b, items, page);
      case "row": { const r = el("div", "row"); b.items.forEach((x) => r.appendChild(block(x, items, page))); return r; }
      case "zoom": return block(b.b, items, page);
      default: return el("div");
    }
  }

  window.BOARD = {
    create(container, page) {
      const items = [];
      page.tryables = [];
      if (page.kind === "title") {
        container.classList.add("title-page");
        const t = el("div", "title-block", `<div class="tp-part">${esc(page.part ?? "")}</div><div class="tp-title">${mixed(page.title)}</div><div class="tp-ar" dir="rtl">${esc(page.ar)}</div>`);
        page.cols.flat().forEach((b) => t.appendChild(block(b, items, page)));
        container.appendChild(t);
        return { items, fit() {}, async setStep(s, animate, rate = 1) {
          items.forEach((it) => { if (it.at < s || (it.at === s && !animate)) it.show(); else it.hide(); });
          if (animate) for (const it of items.filter((x) => x.at === s)) await it.play(rate);
        } };
      }
      const cols = page.cols.map((col, ci) => {
        const c = el("div", "col");
        c.style.flex = page.w[ci] ?? 1;
        const inner = el("div", "col-inner");
        // two K-maps (each with the lines under it) go side by side instead of on top of each other
        const kIdx = col.map((b, k) => (b.t === "kmap" ? k : -1)).filter((k) => k >= 0);
        if (kIdx.length === 2) {
          const row = el("div", "kpair");
          [col.slice(0, kIdx[1]), col.slice(kIdx[1])].forEach((part) => { const st = el("div", "kstack"); part.forEach((b) => st.appendChild(block(b, items, page))); row.appendChild(st); });
          inner.appendChild(row);
        } else col.forEach((b) => inner.appendChild(block(b, items, page)));
        c.appendChild(inner);
        container.appendChild(c);
        return { c, inner };
      });
      // every column scales down (never up) so that it fits the board
      // smart layout:
      //  - a column WITHOUT a circuit gets the width its content needs (capped);
      //  - a column WITH a circuit takes the rest of the width;
      //  - stacked circuits share the height by their shape (a tall circuit gets more height);
      //  - finally every column scales down (never up) so that it fits.
      const fit = () => {
        const boardW = container.clientWidth;
        const hasCirc = cols.map(({ inner }) => !!inner.querySelector(".circ-svg"));
        const anyCirc = hasCirc.some(Boolean);
        cols.forEach(({ c, inner }, i) => {
          inner.style.transform = "none";
          if (anyCirc && hasCirc[i]) { c.style.flex = `${page.w[i] ?? 1} 1 0px`; return; }
          inner.style.width = "max-content";
          const need = Math.min(inner.scrollWidth + 12, boardW * (anyCirc ? 0.45 : 0.6));
          inner.style.width = "";
          c.style.flex = anyCirc ? `0 0 ${need}px` : `${need} 1 0px`;
        });
        cols.forEach(({ c, inner }) => {
          const circs = [...inner.querySelectorAll(".circ-svg")];
          if (circs.length) {
            const others = [...inner.children].filter((x) => !x.classList.contains("circ-wrap") && !x.querySelector(".circ-svg")).reduce((a, x) => a + x.offsetHeight + 18, 0);
            const free = Math.max(200, c.clientHeight - others - 90 * circs.length);
            const ratio = circs.map((sv) => { const vb = sv.viewBox.baseVal; return vb.height / vb.width; });
            const sum = ratio.reduce((a, r) => a + r, 0);
            circs.forEach((sv, k) => { sv.style.maxHeight = (free * ratio[k]) / sum + "px"; });
          }
          const wide = inner.scrollWidth > inner.clientWidth + 2;
          inner.style.transform = "none";
          const k = Math.min(1.3, (c.clientHeight - 8) / inner.scrollHeight, (c.clientWidth - 4) / Math.max(inner.scrollWidth, inner.clientWidth)); // may grow a little on big screens
          inner.style.transformOrigin = wide ? "left center" : "center center";
          inner.style.transform = `scale(${k})`;
          // labels and value tags of the circuits: at least ~15px on the screen
          [...inner.querySelectorAll(".circ-svg")].forEach((sv) => {
            const vb = sv.viewBox.baseVal, sk = sv.getBoundingClientRect().width / vb.width;
            if (!sk) return;
            sv.dataset.k = sk;
            sv.querySelectorAll(".clab").forEach((d) => { d.style.fontSize = Math.max(+d.dataset.fs, 15 / sk) + "px"; });
            sv.querySelectorAll(".tag").forEach((t) => { const m = /translate\(([^)]+)\)/.exec(t.getAttribute("transform")); if (m) t.setAttribute("transform", `translate(${m[1]}) scale(${Math.max(1, 15 / (19 * sk))})`); });
          });
        });
      };
      window.addEventListener("resize", fit);
      setTimeout(fit, 50); setTimeout(fit, 600); setTimeout(fit, 1500);
      if (document.fonts) document.fonts.ready.then(fit);
      let token = 0;
      return {
        items,
        fit,
        /** show step s; if animate: animations first, then the writing; returns when everything has started */
        async setStep(s, animate, rate = 1) {
          const my = ++token;
          requestAnimationFrame(fit);
          // not this step: finished or hidden
          items.forEach((it) => { if (it.phase === "state") return; if (it.at < s || (it.at === s && !animate)) it.show(); else it.hide(); if (it.now) it.now(it.at === s); });
          // state items (tables highlight, additions, circuits)
          let animMs = 0;
          items.filter((it) => it.phase === "state").forEach((it) => { const ms = it.state(s, animate, rate); if (ms) animMs = Math.max(animMs, ms); });
          if (!animate) return;
          const mine = items.filter((it) => it.at === s && it.phase !== "state");
          // 1) animations
          const anims = mine.filter((it) => it.phase === "anim");
          for (const it of anims) { if (my !== token) return; await it.play(rate); }
          // 2) writing, only after the animation of this sentence is over
          const writes = mine.filter((it) => it.phase === "write");
          if (writes.length && animMs) await wait(animMs);
          for (const it of writes) { if (my !== token) return; it.now && it.now(true); await it.play(rate); }
        },
      };
    },
  };
})();
