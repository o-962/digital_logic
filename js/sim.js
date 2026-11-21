/* ported from the video project: src/sim.ts */
(function () {
// Live logic simulation of a drawn circuit: nets are recovered from the drawing (wires that touch,
// gate pins, labelled inputs), then gates are evaluated, level by level, for an example input.
const near = (p, q, d = 3) => Math.abs(p[0] - q[0]) <= d && Math.abs(p[1] - q[1]) <= d;
const onSeg = (p, a, b, d = 1.6) => {
    if (Math.abs(a[0] - b[0]) < 0.5)
        return Math.abs(p[0] - a[0]) <= d && p[1] >= Math.min(a[1], b[1]) - d && p[1] <= Math.max(a[1], b[1]) + d;
    if (Math.abs(a[1] - b[1]) < 0.5)
        return Math.abs(p[1] - a[1]) <= d && p[0] >= Math.min(a[0], b[0]) - d && p[0] <= Math.max(a[0], b[0]) + d;
    return false;
};
function buildNet(els) {
    const wires = els.map((e, i) => (e.e === "wire" ? i : -1)).filter((i) => i >= 0);
    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) {
        parent.set(x, parent.get(parent.get(x)));
        x = parent.get(x);
    } return x; };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb)
        parent.set(ra, rb); };
    wires.forEach((i) => parent.set(i, i));
    const ends = (i) => [els[i].pts[0], els[i].pts[els[i].pts.length - 1]];
    const touches = (p, j) => els[j].pts.slice(1).some((q, k) => onSeg(p, els[j].pts[k], q));
    for (const i of wires)
        for (const j of wires) {
            if (i >= j)
                continue;
            if (ends(i).some((p) => touches(p, j)) || ends(j).some((p) => touches(p, i)))
                union(i, j);
        }
    const wireNet = els.map((_, i) => (els[i].e === "wire" ? find(i) : -1));
    const netAt = (p) => {
        for (const i of wires)
            if (ends(i).some((q) => near(p, q)))
                return wireNet[i];
        for (const i of wires)
            if (touches(p, i))
                return wireNet[i];
        return -1;
    };
    const gates = [];
    els.forEach((e, i) => {
        if (e.e !== "gate")
            return;
        gates.push({ i, type: e.g, ins: e.in.map((p) => netAt(p)), out: netAt(e.out), ctrl: e.ctrl ? netAt(e.ctrl) : -1 });
    });
    // labels name the net whose wire END is closest (inputs, outputs, constants)
    const names = {};
    const consts = {};
    const labelNet = {};
    els.forEach((t, k) => {
        if (t.e !== "txt" || t.plain || t.from !== undefined || t.until !== undefined)
            return;
        let best = 34, net = -1;
        for (const i of wires)
            for (const q of ends(i)) {
                const d = Math.hypot(q[0] - t.x, q[1] - t.y);
                if (d < best) {
                    best = d;
                    net = wireNet[i];
                }
            }
        if (net < 0)
            return;
        labelNet[k] = net;
        const s = String(t.s).trim();
        if (s === "0" || s === "1")
            consts[net] = +s;
        else if (!(names[s] ?? (names[s] = [])).includes(net))
            names[s].push(net);
    });
    const boxes = [];
    els.forEach((e, i) => {
        if (e.e !== "box")
            return;
        boxes.push({ i, label: String(e.label ?? ""), id: e.id, pins: e.pins.map((p) => ({ name: p.name, s: p.s, bub: !!p.bub, net: netAt([p.x, p.y]), x: p.x, y: p.y })) });
    });
    return { wireNet, gates, names, consts, labelNet, boxes, n: els.length };
}
const evalGate = (type, v) => {
    switch (type) {
        case "and": return v.every((x) => x === 1) ? 1 : 0;
        case "nand": return v.every((x) => x === 1) ? 0 : 1;
        case "or": return v.some((x) => x === 1) ? 1 : 0;
        case "nor": return v.some((x) => x === 1) ? 0 : 1;
        case "xor": return v.reduce((a, b) => a ^ b, 0);
        case "xnor": return 1 - v.reduce((a, b) => a ^ b, 0);
        case "not":
        case "trinot": return 1 - v[0];
        default: return v[0]; // buf, tri
    }
};
/** values per net and the logic level (gate depth) at which each net settles */
function simulate(net, inputs) {
    var _a;
    const val = {};
    const lvl = {};
    for (const [k, v] of Object.entries(net.consts)) {
        val[+k] = v;
        lvl[+k] = 0;
    }
    for (const [name, v] of Object.entries(inputs)) {
        if (name.includes(".")) { // "boxId.pin": drive a block pin directly
            const [bid, pin] = name.split(".");
            const p = net.boxes.find((b) => b.id === bid)?.pins.find((q) => q.name === pin);
            if (p && p.net >= 0) {
                val[p.net] = v;
                lvl[p.net] = 0;
            }
            continue;
        }
        for (const id of net.names[name] ?? []) {
            val[id] = v;
            lvl[id] = 0;
        }
    }
    // a label like z' on an input that no gate drives means "the complement of z"
    const driven = new Set(net.gates.map((g) => g.out));
    for (const [name, ids] of Object.entries(net.names)) {
        const base = name.endsWith("'") ? name.slice(0, -1) : null;
        if (base === null || inputs[base] === undefined)
            continue;
        for (const id of ids)
            if (!driven.has(id) && val[id] === undefined) {
                val[id] = 1 - inputs[base];
                lvl[id] = 1;
            }
    }
    const gateOut = {};
    const boxOut = {};
    for (let pass = 0; pass < 40; pass++) {
        let changed = false;
        for (const b of net.boxes) {
            const ins = {};
            let l = 0;
            b.pins.forEach((p) => { if (p.net >= 0 && val[p.net] !== undefined && !(boxOut[b.i] && p.name in boxOut[b.i])) {
                ins[p.name] = val[p.net];
                l = Math.max(l, lvl[p.net] ?? 0);
            } });
            const out = evalBox(b, ins);
            if (!out)
                continue;
            for (const [pin, v] of Object.entries(out)) {
                const p = b.pins.find((q) => q.name === pin);
                if (!p)
                    continue;
                if ((boxOut[_a = b.i] ?? (boxOut[_a] = {}))[pin] !== v) {
                    boxOut[b.i][pin] = v;
                    changed = true;
                }
                if (p.net >= 0 && (val[p.net] !== v || lvl[p.net] !== l + 1)) {
                    val[p.net] = v;
                    lvl[p.net] = l + 1;
                    changed = true;
                }
            }
        }
        for (const g of net.gates) {
            if (g.out < 0 || g.ins.some((n) => n < 0 || val[n] === undefined))
                continue;
            if (g.type.startsWith("tri")) {
                if (g.ctrl < 0 || val[g.ctrl] === undefined)
                    continue;
                if (val[g.ctrl] !== 1) {
                    if (gateOut[g.i] !== null) {
                        gateOut[g.i] = null;
                        changed = true;
                    }
                    continue;
                }
            }
            const o = evalGate(g.type, g.ins.map((n) => val[n]));
            const l = Math.max(...g.ins.map((n) => lvl[n] ?? 0), g.ctrl >= 0 ? lvl[g.ctrl] ?? 0 : 0) + 1;
            if (val[g.out] !== o || lvl[g.out] !== l || gateOut[g.i] !== o) {
                val[g.out] = o;
                lvl[g.out] = l;
                gateOut[g.i] = o;
                changed = true;
            }
        }
        if (!changed)
            break;
    }
    return { val, lvl, gateOut, boxOut };
}
/* ---------- behaviour of the block symbols, recognised from their name and pin names ---------- */
const idx = (name) => { const m = name.match(/(\d+)'?$/); return m ? +m[1] : -1; };
function evalBox(b, ins) {
    const L = b.label.toLowerCase();
    const pins = b.pins;
    const has = (n) => ins[n] !== undefined;
    const weightOf = (list) => {
        // inputs named I_k / x_k / S_k carry weight 2^k; plain letters (A B C, x y z) are listed MSB first
        const allIdx = list.every((p) => idx(p.name) >= 0);
        return list.map((p, k) => (allIdx ? 2 ** idx(p.name) : 2 ** (list.length - 1 - k)));
    };
    const num = (list) => { const w = weightOf(list); return list.every((p) => has(p.name)) ? list.reduce((a, p, k) => a + ins[p.name] * w[k], 0) : null; };
    if (L.includes("7-segment")) {
        const inp = pins.filter((p) => p.s === "l"), d = num(inp);
        const SEG = { 0: "abcdef", 1: "bc", 2: "abdeg", 3: "abcdg", 4: "bcfg", 5: "acdfg", 6: "acdefg", 7: "abc", 8: "abcdefg", 9: "abcdfg" };
        if (d === null || SEG[d] === undefined)
            return null;
        const o = {};
        pins.filter((p) => p.s === "r").forEach((p) => { o[p.name] = SEG[d].includes(p.name) ? 1 : 0; });
        return o;
    }
    if (L.includes("demux")) {
        const sel = pins.filter((p) => /^S/.test(p.name)), s = num(sel);
        if (s === null || !has("I"))
            return null;
        const o = {};
        pins.filter((p) => p.s === "r").forEach((p) => { o[p.name] = idx(p.name) === s ? ins.I : 0; });
        return o;
    }
    if (L.includes("decoder")) {
        const en = pins.find((p) => p.name === "E");
        const inp = pins.filter((p) => p.s === "l" && p !== en), s = num(inp);
        if (s === null || (en && !has("E")))
            return null;
        const on = en ? (en.bub ? ins.E === 0 : ins.E === 1) : true;
        const o = {};
        pins.filter((p) => p.s === "r").forEach((p) => { const v = on && idx(p.name) === s ? 1 : 0; o[p.name] = p.bub ? 1 - v : v; });
        return o;
    }
    if (L.includes("mux") || L === "") {
        const sel = pins.filter((p) => /^S(_\d)?$/.test(p.name)), s = num(sel);
        if (s === null)
            return null;
        const src = pins.find((p) => p.s === "l" && (idx(p.name) === s || p.name === String(s)));
        if (!src || !has(src.name))
            return null;
        return { Y: ins[src.name] };
    }
    if (L.includes("encoder")) {
        const inp = pins.filter((p) => p.s === "l");
        if (!inp.every((p) => has(p.name)))
            return null;
        const act = inp.filter((p) => ins[p.name] === 1).map((p) => idx(p.name));
        const k = act.length ? Math.max(...act) : 0;
        const o = {};
        pins.filter((p) => p.s === "r").forEach((p) => { o[p.name] = (k >> idx(p.name)) & 1; });
        return o;
    }
    if (L.includes("adder") || L.includes("cpa")) {
        const A = pins.filter((p) => /^A_\d$/.test(p.name)), B = pins.filter((p) => /^B_\d$/.test(p.name));
        const ci = pins.find((p) => /^C_(0|i)$/.test(p.name));
        const a = num(A), bb = num(B);
        if (a === null || bb === null || !ci || !has(ci.name))
            return null;
        const t = a + bb + ins[ci.name];
        const o = { Cy: t >> 4 };
        pins.filter((p) => /^S_\d$/.test(p.name)).forEach((p) => { o[p.name] = (t >> idx(p.name)) & 1; });
        return o;
    }
    if (L === "ha") {
        if (!has("a") || !has("b"))
            return null;
        return { S: ins.a ^ ins.b, C: ins.a & ins.b };
    }
    return null;
}

window.SIM = { buildNet, simulate };
})();
