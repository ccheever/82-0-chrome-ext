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

  function compactText() {
    return txt(document.body).replace(/\s+/g, " ");
  }

  // "Placing: {Name} — click a court position" hint names the in-flight pick. The live
  // app has used small copy/layout variants, so keep this parser tolerant.
  function placingName() {
    const body = compactText();
    const patterns = [
      /\bPlacing\s*:?\s*(.+?)\s+(?:[—–-]\s*)?(?:click|select|choose|pick)\b/i,
      /\b(?:click|select|choose|pick)\s+(?:a\s+)?(?:court\s+)?position\s+(?:for|to place)\s+(.+?)(?:\s+(?:PG|SG|SF|PF|C)\b|\.|$)/i,
    ];
    for (const re of patterns) {
      const m = body.match(re);
      if (m && m[1]) return m[1].trim().replace(/[.。]+$/, "");
    }
    return null;
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

  const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
  const COACH_ROOT = "#c820-coach";

  function inCoach(el) {
    return !!(el && el.closest && el.closest(COACH_ROOT));
  }

  function isPoolPlayerCard(el) {
    const card = el?.matches?.('[draggable="true"]') ? el : el?.closest?.('[draggable="true"]');
    if (!card) return false;
    const ps = card.querySelectorAll("p");
    return !!(txt(ps[0]) && txt(ps[1]) && txt(ps[2]) && txt(ps[2]).includes("·"));
  }

  function findButton(label) {
    return [...document.querySelectorAll("button")].find((b) => txt(b) === label && !inCoach(b)) || null;
  }

  function findButtonMatching(re) {
    return [...document.querySelectorAll("button")].find((b) => re.test(txt(b)) && !inCoach(b)) || null;
  }

  // @ref LLP 0008#dom-action-targets — action targets extend the LLP 0002 reader contract.
  function classicModeButton() {
    return (
      findButton("Play Classic") ||
      findButtonMatching(/^play classic$/i)
    );
  }

  function spinButton() {
    const btn = findButton("Spin") || findButtonMatching(/^spin$/i);
    return btn && !btn.disabled ? btn : btn && btn.disabled ? btn : null;
  }

  function spinButtonEnabled() {
    const btn = findButton("Spin") || findButtonMatching(/^spin$/i);
    return !!(btn && !btn.disabled);
  }

  function newGameButton() {
    return (
      findButton("Play Again") ||
      findButton("Restart") ||
      findButton("New Game") ||
      findButtonMatching(/play again/i) ||
      findButtonMatching(/^(restart|new game|start over|give up)$/i)
    );
  }

  function slotLabel(el) {
    if (!el) return null;
    const direct = txt(el);
    if (POSITIONS.includes(direct)) return direct;
    const labels = [...el.querySelectorAll("span, p, div, button")]
      .map(txt)
      .filter(Boolean);
    return POSITIONS.find((p) =>
      direct === p ||
      direct.startsWith(`${p} `) ||
      direct.startsWith(`${p}\n`) ||
      labels.some((s) => s === p || s.startsWith(`${p} `) || s.startsWith(`${p}\n`))
    ) || null;
  }

  function isUsable(el) {
    if (!el || inCoach(el) || isPoolPlayerCard(el)) return false;
    const style = globalThis.getComputedStyle ? globalThis.getComputedStyle(el) : null;
    if (style && (style.display === "none" || style.visibility === "hidden")) return false;
    const r = typeof el.getBoundingClientRect === "function" ? el.getBoundingClientRect() : null;
    return !r || r.width > 0 || r.height > 0;
  }

  function slotCandidates(position) {
    if (!POSITIONS.includes(position)) return [];
    const aria = [
      ...document.querySelectorAll(
        `[aria-label="${position}"], [aria-label="${position} slot"], [aria-label^="${position}:"], [data-position="${position}"]`,
      ),
    ];
    const broad = [...document.querySelectorAll("button, [role='button'], div, section, article")];
    const seen = new Set();
    return [...aria, ...broad]
      .filter((el) => {
        if (seen.has(el)) return false;
        seen.add(el);
        return isUsable(el) && slotLabel(el) === position;
      });
  }

  function courtSlotContainer(clickEl, position, candidates) {
    let cur = clickEl;
    while (cur && cur !== document.body) {
      if (
        cur !== clickEl &&
        slotLabel(cur) === position &&
        !inCoach(cur) &&
        !isPoolPlayerCard(cur) &&
        (
          cur.getAttribute?.("draggable") === "true" ||
          /\babsolute\b/.test(cur.className || "") ||
          cur.getAttribute?.("role") === "button"
        )
      ) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return (
      candidates.find((el) => el.getAttribute?.("draggable") === "true") ||
      candidates.find((el) => el.getAttribute?.("role") === "button") ||
      clickEl ||
      null
    );
  }

  function slotParts(position) {
    const candidates = slotCandidates(position);
    const button = candidates.find((el) => el.tagName === "BUTTON" && !el.disabled) ||
      candidates.find((el) => el.tagName === "BUTTON") ||
      candidates.find((el) => el.getAttribute?.("role") === "button") ||
      candidates[0] ||
      null;
    const container = courtSlotContainer(button, position, candidates);
    const dragEl =
      candidates.find((el) => el.getAttribute?.("draggable") === "true") ||
      (container?.getAttribute?.("draggable") === "true" ? container : null) ||
      button;
    return {
      el: button,
      clickEl: button,
      dragEl,
      dropEl: container || button,
      text: button ? txt(button) : "",
    };
  }

  function slotElement(position) {
    return slotParts(position).el;
  }

  function slotOccupantCard(position) {
    const slot = slotParts(position).dropEl || slotElement(position);
    if (!slot) return null;
    const inner = slot.querySelector('[draggable="true"]');
    if (inner && isPoolPlayerCard(inner)) return { ...readCard(inner), _slotSource: "inner" };
    const ariaName = slot.getAttribute?.("aria-label")?.match(/^[A-Z]{1,2}:\s*(.+?),\s*tap/i)?.[1];
    if (ariaName) return { n: ariaName, el: slot, key: `${norm(ariaName)}|?|?`, _slotSource: "aria" };
    const parent = slot.parentElement;
    if (parent) {
      const sibling = [...parent.querySelectorAll('[draggable="true"]')].find((c) => {
        if (!isPoolPlayerCard(c)) return false;
        const label = slotLabel(slot) || position;
        const cardPos = txt(c.querySelectorAll("p")[1] || "");
        return cardPos.includes(label);
      });
      if (sibling) return { ...readCard(sibling), _slotSource: "sibling" };
    }
    return null;
  }

  function courtSlots() {
    const out = {};
    for (const p of POSITIONS) {
      const parts = slotParts(p);
      out[p] = { ...parts, occupant: slotOccupantCard(p) };
    }
    return out;
  }

  function read() {
    const complete = readComplete();
    if (complete) return { phase: "complete", complete };
    const pool = poolCards();
    const round = readRound();
    const placing = placingName();
    const classicBtn = classicModeButton();
    const teamBtn = skipButton("Team");
    const eraBtn = skipButton("Era");
    const decade = pool[0]?.d || null;
    const team = pool[0]?.t || null;
    const phase = placing ? "placing" : pool.length ? "selecting" : classicBtn ? "mode" : "spinning";
    return {
      phase, round, team, decade, pool,
      teamSkipAvail: !!teamBtn && !teamBtn.disabled,
      eraSkipAvail: !!eraBtn && !eraBtn.disabled,
      teamSkipBtn: teamBtn, eraSkipBtn: eraBtn,
      placingName: placing,
      classicBtn,
      spinBtn: spinButton(),
      spinEnabled: spinButtonEnabled(),
      newGameBtn: newGameButton(),
      slots: courtSlots(),
    };
  }

  C820.board = {
    read, norm, poolCards, readRound,
    classicModeButton, spinButton, spinButtonEnabled, newGameButton,
    slotElement, slotOccupantCard, courtSlots,
    POSITIONS,
  };
})();
