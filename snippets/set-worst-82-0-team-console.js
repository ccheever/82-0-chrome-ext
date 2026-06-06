(async () => {
  const DATA_URL =
    "https://firebasestorage.googleapis.com/v0/b/project-4599904239656435772.firebasestorage.app/o/players_flat.json?alt=media";

  const TARGET = {
    PG: ["Jacob Gilyard", "MEM", "2020s"],
    SG: ["Dick Van Arsdale", "PHX", "1960s"],
    SF: ["Elgin Baylor", "LAL", "1960s"],
    PF: ["Elvin Hayes", "HOU", "1960s"],
    C: ["Mark Eaton", "UTA", "1980s"],
  };

  const raw = await fetch(DATA_URL).then((response) => {
    if (!response.ok) throw new Error("Player data fetch failed: " + response.status);
    return response.json();
  });

  const flat = Array.isArray(raw)
    ? raw.map((player) => ({ ...player, decade: player.decade || player.era }))
    : Object.entries(raw).flatMap(([team, eras]) =>
        Object.entries(eras).flatMap(([decade, players]) =>
          players.map((player) => ({ ...player, team, decade })),
        ),
      );

  const teamIds = new Map([...new Set(flat.map((player) => player.team))].map((team, index) => [team, index]));

  const normalizePlayer = (player) => ({
    ...player,
    decade: player.decade || player.era,
    teamId: teamIds.get(player.team),
    positions: Array.isArray(player.positions)
      ? player.positions.filter((position) => position && position !== "nan")
      : [player.pos].filter((position) => position && position !== "nan"),
  });

  const roster = Object.fromEntries(
    Object.entries(TARGET).map(([slot, [player, team, decade]]) => {
      const found = flat.find(
        (candidate) =>
          candidate.player === player &&
          candidate.team === team &&
          (candidate.decade || candidate.era) === decade,
      );
      if (!found) throw new Error("Missing target player: " + [slot, player, team, decade].join(" "));
      return [slot, normalizePlayer(found)];
    }),
  );

  const fibers = new Set();
  for (const element of [document.documentElement, document.body, ...document.querySelectorAll("*")]) {
    const key = Object.keys(element).find(
      (name) => name.startsWith("__reactFiber$") || name.startsWith("__reactContainer$"),
    );
    let fiber = key ? element[key] : null;
    if (fiber && fiber._internalRoot) fiber = fiber._internalRoot.current;
    for (; fiber; fiber = fiber.return) fibers.add(fiber);
  }

  const hooksOf = (fiber) => {
    const hooks = [];
    for (let hook = fiber.memoizedState; hook; hook = hook.next) hooks.push(hook);
    return hooks;
  };

  const isSkipState = (value) =>
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.team === "boolean" &&
    typeof value.decade === "boolean";

  let main = null;
  for (const fiber of fibers) {
    const hooks = hooksOf(fiber);
    const states = hooks.map((hook) => hook.memoizedState);
    const skipIndex = states.findIndex(isSkipState);
    if (skipIndex < 9) continue;

    const phase = states[skipIndex - 9];
    if (["mode-selection", "spinning", "selecting", "complete"].includes(phase)) {
      main = { hooks, states, skipIndex, phase };
      break;
    }
  }

  if (!main) {
    throw new Error("Could not find the 82-0 game React state. Wait for the app to load, then run again.");
  }

  const setHook = (index, value) => {
    const hook = main.hooks[index];
    if (!hook || !hook.queue || typeof hook.queue.dispatch !== "function") {
      throw new Error("Hook " + index + " was not a writable React state hook.");
    }
    hook.queue.dispatch(value);
  };

  const settingsIndex = main.states.findIndex(
    (value) => value && typeof value === "object" && Array.isArray(value.enabledDecades),
  );
  if (settingsIndex >= 0) {
    setHook(settingsIndex, (settings) => ({
      ...settings,
      ballKnowledgeMode: false,
      testMode: false,
      testModeTeamSelection: false,
    }));
  }

  localStorage.setItem("hasSeenInstructions", "true");
  localStorage.setItem(
    "82-consent-v1",
    JSON.stringify({
      decided: true,
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    }),
  );

  // The skip state is the stable anchor. The surrounding hooks are the page's
  // game state in this order: phase, team/decade locks, round, roster, skips.
  setHook(main.skipIndex - 8, null); // current team
  setHook(main.skipIndex - 7, null); // current decade
  setHook(main.skipIndex - 6, null); // locked team
  setHook(main.skipIndex - 5, null); // locked decade
  setHook(main.skipIndex - 4, null); // excluded team
  setHook(main.skipIndex - 3, null); // excluded decade
  setHook(main.skipIndex - 2, 5); // round
  setHook(main.skipIndex - 1, roster); // roster
  setHook(main.skipIndex, { team: false, decade: false }); // skips used
  setHook(main.skipIndex + 1, false); // is spinning
  setHook(main.skipIndex + 2, null); // selected player
  setHook(main.skipIndex - 9, "complete"); // phase

  setTimeout(() => {
    for (const label of ["Decline", "Don't Show Again", "Close"]) {
      for (const button of document.querySelectorAll("button")) {
        if (button.textContent.trim() === label) button.click();
      }
    }
  }, 100);

  console.table(
    Object.entries(roster).map(([slot, player]) => ({
      slot,
      player: player.player,
      team: player.team,
      decade: player.decade,
    })),
  );
  console.log("Set worst 82-0 team: projected 82-0, teamOVR 109.5.");
})();
