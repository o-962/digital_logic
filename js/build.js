/* ported from the video project: src/lesson/build.mjs */
(function () {
// Decides WHEN each element of a drawn circuit appears, so the circuit is drawn step by step with the narration.
// Rules:
//  - b.build: [{at, ids}] explicit stages (optional). An id listed there appears at that step.
//  - otherwise an id appears at the first highlight step that mentions it (b.hl), never before b.at.
//  - b.buildMode === "all": everything is drawn during the first step (still animated, left to right).
//  - elements without id: gates/boxes -> b.at; wires -> latest step of the gates/boxes they touch;
//    labels -> step of the nearest element; junction dots -> step of the wire that branches there.
// Each element gets {st: step, ord: drawing order inside that step}.
const near = (p, q, d = 2.5) => Math.abs(p[0] - q[0]) <= d && Math.abs(p[1] - q[1]) <= d;
const onSeg = (p, a, b, d = 1.5) => p[0] >= Math.min(a[0], b[0]) - d && p[0] <= Math.max(a[0], b[0]) + d && p[1] >= Math.min(a[1], b[1]) - d && p[1] <= Math.max(a[1], b[1]) + d &&
    (Math.abs(a[0] - b[0]) < 0.5 || Math.abs(a[1] - b[1]) < 0.5);
const inBB = (p, bb, pad = 3) => p[0] >= bb[0] - pad && p[0] <= bb[2] + pad && p[1] >= bb[1] - pad && p[1] <= bb[3] + pad;
const bbDist = (p, bb) => {
    const dx = Math.max(bb[0] - p[0], 0, p[0] - bb[2]);
    const dy = Math.max(bb[1] - p[1], 0, p[1] - bb[3]);
    return Math.hypot(dx, dy);
};
const pinsOf = (e) => {
    if (e.e === "gate")
        return [...e.in, e.out, ...(e.ctrl ? [e.ctrl] : [])];
    if (e.e === "box")
        return e.pins.map((p) => [p.x, p.y]);
    return [];
};
function buildSteps(b) {
    const base = b.at ?? 0;
    const els = b.els;
    const stage = {};
    const add = (id, at) => { if (id && (stage[id] === undefined || at < stage[id]))
        stage[id] = Math.max(at, base); };
    if (b.buildMode !== "all") {
        const locked = new Set();
        (b.build ?? []).forEach((s) => s.ids.forEach((id) => { add(id, s.at); locked.add(id); }));
        (b.hl ?? []).forEach((h) => (h.ids ?? []).forEach((id) => { if (!locked.has(id))
            add(id, h.at); }));
    }
    const st = els.map((e) => (e.id && stage[e.id] !== undefined ? stage[e.id] : null));
    // solid parts without a stage
    els.forEach((e, i) => { if (st[i] === null && e.e !== "wire" && e.e !== "txt" && e.e !== "dot")
        st[i] = base; });
    const solids = els.map((e, i) => [e, i]).filter(([e]) => e.e === "gate" || e.e === "box");
    // wires: never before the parts they connect to
    els.forEach((e, i) => {
        if (e.e !== "wire")
            return;
        let s = st[i] ?? base;
        const ends = [e.pts[0], e.pts[e.pts.length - 1]];
        for (const [g, gi] of solids) {
            const pins = pinsOf(g);
            if (ends.some((p) => pins.some((q) => near(p, q))))
                s = Math.max(s, st[gi]);
        }
        st[i] = s;
    });
    // a wire that starts on another wire (a branch) cannot appear before that wire
    for (let pass = 0; pass < 3; pass++) {
        els.forEach((e, i) => {
            if (e.e !== "wire")
                return;
            const p0 = e.pts[0];
            els.forEach((w, j) => {
                if (j === i || w.e !== "wire")
                    return;
                const hit = w.pts.slice(1).some((q, k) => onSeg(p0, w.pts[k], q));
                if (hit && st[j] > st[i] && e.id === undefined)
                    st[i] = st[j];
            });
        });
    }
    // dots: with the wire that branches there (latest touching wire)
    els.forEach((e, i) => {
        if (e.e !== "dot")
            return;
        const p = [e.x, e.y];
        let s = null;
        els.forEach((w, j) => {
            if (w.e !== "wire")
                return;
            if (w.pts.slice(1).some((q, k) => onSeg(p, w.pts[k], q, 2)))
                s = s === null ? st[j] : Math.max(s, st[j]);
        });
        st[i] = s ?? base;
    });
    // labels: own id, else nearest drawn thing
    els.forEach((e, i) => {
        if (e.e !== "txt" || st[i] !== null)
            return;
        const p = [e.x, e.y];
        let best = Infinity, s = base;
        els.forEach((o, j) => {
            if (j === i || o.e === "txt" || st[j] === null)
                return;
            let d;
            if (o.e === "wire") {
                d = Math.min(...o.pts.slice(1).map((q, k) => segDist(p, o.pts[k], q)));
            }
            else
                d = bbDist(p, o.bb);
            if (d < best) {
                best = d;
                s = st[j];
            }
        });
        st[i] = s;
    });
    // explicit windows win over everything
    els.forEach((e, i) => { if (e.from !== undefined)
        st[i] = Math.max(e.from, base); });
    // drawing order inside a step: signal flow (left to right, then top to bottom); labels follow their neighbour
    const key = (e) => {
        const bb = e.bb ?? [0, 0, 0, 0];
        if (e.e === "wire")
            return [e.pts[0][0], e.pts[0][1]];
        if (e.e === "txt")
            return [e.x - 1, e.y];
        return [bb[0], bb[1]];
    };
    const ord = new Array(els.length).fill(0);
    const steps = [...new Set(st)];
    for (const s of steps) {
        const idx = els.map((_, i) => i).filter((i) => st[i] === s);
        // parts first (gates, blocks), then the wires that connect them, then dots and labels
        const tier = (e) => (e.e === "wire" ? 1 : e.e === "txt" || e.e === "dot" ? 2 : 0);
        idx.sort((a, c) => {
            const ka = key(els[a]), kc = key(els[c]);
            return tier(els[a]) - tier(els[c]) || Math.round(ka[0] / 30) - Math.round(kc[0] / 30) || ka[1] - kc[1];
        });
        idx.forEach((i, k) => { ord[i] = idx.length > 1 ? k / (idx.length - 1) : 0; });
    }
    return { st, ord };
}
function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

window.BUILD = { buildSteps };
})();
