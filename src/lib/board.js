// Board reader — turns the live 82-0.com DOM into a plain state object for the policy.
//
// Stateless: every call re-reads the DOM. Roster/lineup tracking (which needs history)
// lives in content.js. This file only knows how to *parse the current screen*.
//
// @ref LLP 0002#dom-contract — the selectors below are reverse-engineered from the live
//   site (June 2026). They are the most brittle part of the extension; each is chosen to
//   lean on stable structure/text rather than minified Tailwind classes where possible.
//   If 82-0.com restyles, this is the file to fix (see the DOM contract section).

(() => {
  const C820 = (globalThis.C820 = globalThis.C820 || {});

  const txt = (el) => (el && el.innerText ? el.innerText.trim() : "");
  const norm = (s) =>
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // strip accents (Jokic/Jokić)
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  // Player cards are draggable rows: <div draggable="true"> with three <p> (name,
  // positions, "TEAM · DECADE") and .w-7 stat cells.  @ref LLP 0002#dom-contract
  function readCard(el) {
    const ps = el.querySelectorAll("p");
    const name = txt(ps[0]);
    const posLine = txt(ps[1]); // "C" or "PF · SF · SG"
    const tdLine = txt(ps[2]); // "LAL · 1990s"
    const pos = posLine ? posLine.split("·").map((s) => s.trim()).filter(Boolean) : [];
    let team = null, decade = null;
    if (tdLine && tdLine.includes("·")) {
      const m = tdLine.split("·").map((s) => s.trim());
      team = m[0];
      decade = m[1];
    }
    // Visible stats (Classic mode). Hidden in HoopIQ — enriched from dataset later.
    const stats = {};
    el.querySelectorAll('[class*="w-7"]').forEach((c) => {
      const sp = c.querySelectorAll("span");
      const v = parseFloat(txt(sp[0]));
      const lab = txt(sp[1]).toLowerCase();
      if (lab) stats[lab] = Number.isNaN(v) ? null : v;
    });
    return {
      n: name, t: team, d: decade, pos, el,
      ppg: stats.ppg ?? null, rpg: stats.rpg ?? null, apg: stats.apg ?? null,
      spg: stats.spg ?? null, bpg: stats.bpg ?? null,
      key: `${norm(name)}|${team}|${decade}`,
    };
  }

  function poolCards() {
    return [...document.querySelectorAll('[draggable="true"]')]
      .map(readCard)
      .filter((c) => c.n && c.t && c.d);
  }

  // "Round N/5" in the header.
  function readRound() {
    const m = (document.body.innerText.match(/Round\s+(\d)(?:\s*\/\s*5)?/i) || [])[1];
    return m ? parseInt(m, 10) : null;
  }

  // Skip controls: top-right <button>Team</button> / <button>Era</button>.
  // disabled (or absent) once spent.  @ref LLP 0002#dom-contract
  function skipButton(label) {
    return [...document.querySelectorAll("button")].find((b) => txt(b) === label) || null;
  }

  // "Placing {Name} — select a court position" hint names the in-flight pick.
  function placingName() {
    const m = document.body.innerText.match(/Placing\s+(.+?)\s+[—\-]\s+select/i);
    return m ? m[1].trim() : null;
  }

  // Completion screen: shows a final record / "TEAM OVR" / a share affordance.
  function readComplete() {
    const body = document.body.innerText;
    const rec = body.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\b/); // e.g. 82-0 / 74-8
    const isComplete =
      /TEAM OVR|Share your team|Play Again|your final|season complete/i.test(body) &&
      !document.querySelector('[draggable="true"]');
    if (!isComplete) return null;
    const wins = rec ? parseInt(rec[1], 10) : null;
    return { wins, is820: wins === 82, text: rec ? rec[0] : null };
  }

  function read() {
    const complete = readComplete();
    if (complete) return { phase: "complete", complete };
    const pool = poolCards();
    const round = readRound();
    const teamBtn = skipButton("Team");
    const eraBtn = skipButton("Era");
    const decade = pool[0]?.d || null;
    const team = pool[0]?.t || null;
    const phase = pool.length ? "selecting" : "spinning";
    return {
      phase, round, team, decade, pool,
      teamSkipAvail: !!teamBtn && !teamBtn.disabled,
      eraSkipAvail: !!eraBtn && !eraBtn.disabled,
      teamSkipBtn: teamBtn, eraSkipBtn: eraBtn,
      placingName: placingName(),
    };
  }

  C820.board = { read, norm, poolCards, readRound };
})();
