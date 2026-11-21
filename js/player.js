/* One page = a list of sentences. Each sentence: its voice plays, the board animates, then the writing appears,
   and the page waits for you (unless "Auto" is on). */
(function () {
  const P = window.PAGE, PAGES = window.PAGES ?? [];
  const { mixed } = window.TEX;
  const $ = (q) => document.querySelector(q);

  document.title = `${P.title} · Chapter 4`;
  $("#title").innerHTML = mixed(P.title);
  $("#title-ar").textContent = P.ar;
  $("#slide").textContent = /–/.test(P.slide) ? `SLIDES ${P.slide} / 65` : `SLIDE ${P.slide} / 65`;
  const at = PAGES.findIndex((p) => p.file === P.file);
  const prevPage = PAGES[at - 1], nextPage = PAGES[at + 1];
  $("#page-prev").innerHTML = prevPage ? `‹ ${mixed(prevPage.title)}` : "";
  $("#page-prev").href = prevPage ? `${prevPage.file}.html` : "#";
  $("#page-next").innerHTML = nextPage ? `${mixed(nextPage.title)} ›` : "";
  $("#page-next").href = nextPage ? `${nextPage.file}.html` : "#";


  const board = window.BOARD.create($("#board"), P);
  const lines = P.lines;
  let i = 0, playing = false, auto = false, rate = 1;
  const audio = new Audio();
  audio.preload = "auto";


  // the sentence being said: big and clear, under the board
  function showSentence() {
    const l = lines[i];
    $("#now-en").innerHTML = mixed(l.d ?? l.en);
    $("#now-ar").textContent = l.ar;
    $("#counter").textContent = `sentence ${i + 1} / ${lines.length}`;
    $("#bar-fill").style.width = `${((i + 1) / lines.length) * 100}%`;
  }
  function setPlayIcon() { $("#play").textContent = playing ? "❚❚ Pause" : i >= lines.length - 1 && audio.ended ? "↻ Again" : "▶ Play"; }

  async function go(k, play) {
    i = Math.max(0, Math.min(lines.length - 1, k));
    $("#start").classList.add("gone");
    showSentence();
    audio.pause();
    audio.src = lines[i].audio;
    audio.playbackRate = rate;
    playing = !!play;
    setPlayIcon();
    if (play) {
      audio.currentTime = 0;
      audio.play().catch(() => { playing = false; setPlayIcon(); });
      board.setStep(lines[i].s, true, rate);
    } else board.setStep(lines[i].s, false, rate);
    refreshTry();
  }
  audio.onended = () => {
    playing = false;
    setPlayIcon();
    $("#next").classList.add("pulse");
    if (auto && i < lines.length - 1) setTimeout(() => go(i + 1, true), 600 / rate);
  };


  const next = () => { $("#next").classList.remove("pulse"); if (i < lines.length - 1) go(i + 1, true); else if (nextPage) location.href = `${nextPage.file}.html`; };
  const prev = () => { $("#next").classList.remove("pulse"); if (i > 0) go(i - 1, true); };
  const replay = () => go(i, true);
  const toggle = () => {
    if ($("#start").classList.contains("gone") === false) return go(0, true);
    if (playing) { audio.pause(); playing = false; }
    else if (audio.ended || !audio.src) { go(i, true); return; }
    else { audio.play(); playing = true; }
    setPlayIcon();
  };
  $("#next").onclick = next; $("#prev").onclick = prev; $("#replay").onclick = replay; $("#play").onclick = toggle;
  $("#start").onclick = () => go(0, true);
  $("#auto").onchange = (e) => { auto = e.target.checked; };
  $("#speed").onchange = (e) => { rate = +e.target.value; audio.playbackRate = rate; };
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
    if (e.key === " ") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowRight") next();
    else if (e.key === "ArrowLeft") prev();
    else if (e.key === "r" || e.key === "R") replay();
  });

  // ---- try it yourself: change the inputs of the circuit on this page ----
  function refreshTry() {
    const box = $("#try");
    const s = lines[i].s;
    const visible = P.tryables.filter((t) => !t.item.node.classList.contains("hidden") && !t.item.node.closest(".hidden"));
    box.innerHTML = "";
    box.classList.toggle("gone", !visible.length);
    if (!visible.length) return;
    const t = visible[visible.length - 1];
    t.values = t.values ?? { ...t.defaults };
    t.item.node.appendChild(box); // right under its circuit
    box.innerHTML = `<div class="try-title">Try it: click an input</div>`;
    const row = document.createElement("div");
    row.className = "try-row";
    t.inputs.forEach((name) => {
      const btn = document.createElement("button");
      btn.className = "bit" + (t.values[name] ? " one" : "");
      // block pins get the names used on the board: the first adder's A/B are the numbers x and y
      const shown = name.includes(".") ? name.split(".")[1].replace(/^A_(\d)$/, "x_$1").replace(/^B_(\d)$/, "y_$1").replace(/^C_i$/, "carry in").replace(/^C_0$/, "carry in") : name;
      btn.innerHTML = `${mixed(shown)} = <b>${t.values[name]}</b>`;
      btn.onclick = () => { t.values[name] = t.values[name] ? 0 : 1; t.active = true; t.item.setTry({ ...t.values }, s); refreshTry(); };
      row.appendChild(btn);
    });
    const reset = document.createElement("button");
    reset.className = "bit reset";
    reset.textContent = "reset";
    reset.onclick = () => { t.values = { ...t.defaults }; t.active = false; t.item.setTry(null, s); refreshTry(); };
    row.appendChild(reset);
    box.appendChild(row);
  }

  // first screen: the page is shown at its first sentence, waiting for the start
  showSentence();
  board.setStep(lines[0].s, false);
  setTimeout(refreshTry, 100);
  setPlayIcon();
})();
