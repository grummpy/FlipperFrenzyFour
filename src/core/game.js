import { decideBot } from "./bots.js";
import {
  BALL_ADD_INTERVAL,
  BALL_R,
  BANNER_SECONDS,
  CENTER,
  COUNTDOWN_SECONDS,
  LEFT_REST,
  MAX_BALLS,
  PLAYER_META,
  POWERUPS,
  RIGHT_REST,
  SHIELD_DURATION,
  SPAWN_RADIUS,
  SPAWN_SPEED_MAX,
  SPAWN_SPEED_MIN,
  START_LIVES,
  SUBSTEPS,
  WIDE_DURATION,
  WINS_NEEDED_DEFAULT,
} from "./constants.js";
import { emptyFrame, sanitizeBindings, setBinding, BIND_FIELDS, defaultBindings } from "./input.js";
import { clamp } from "./math.js";
import { coolTargets, simulateSubstep, updateTilts } from "./physics.js";
import { deriveSeed, makeRng } from "./rng.js";
import { createSolids, resetSolids } from "./table.js";

const PAUSE_ITEMS = ["resume", "settings", "controls", "quit"];
const SETTINGS_ITEMS = ["volume", "wins", "controls", "back"];
const MATCH_ITEMS = ["rematch", "title"];

function makePlayer(index) {
  const meta = PLAYER_META[index];
  return {
    index,
    name: meta.name,
    side: meta.side,
    label: meta.label,
    role: "bot",
    lives: START_LIVES,
    score: 0,
    roundWins: 0,
    eliminated: false,
    tilt: 0,
    tiltLock: 0,
    wideUntil: 0,
    shieldUntil: 0,
    leftAngle: LEFT_REST,
    rightAngle: RIGHT_REST,
    leftOmega: 0,
    rightOmega: 0,
  };
}

export function createGame(opts = {}) {
  const seed = (opts.seed ?? 1) >>> 0;
  return {
    phase: "title",
    time: 0,
    animTime: 0,
    matchSeed: seed,
    rng: makeRng(seed),
    roundIndex: 0,
    roundNumber: 0,
    roundTime: 0,
    nextBallAt: BALL_ADD_INTERVAL,
    nextBallId: 1,
    countdown: 0,
    countdownShown: 0,
    bannerTimer: 0,
    matchPending: false,
    winsNeeded: clamp(opts.winsNeeded ?? WINS_NEEDED_DEFAULT, 1, 9),
    volume: clamp(opts.volume ?? 0.8, 0, 1),
    muted: !!opts.muted,
    bindings: sanitizeBindings(opts.bindings),
    players: [0, 1, 2, 3].map(makePlayer),
    balls: [],
    solids: createSolids(),
    events: [],
    winner: null,
    roundWinner: null,
    menuIndex: 0,
    rebind: null,
    returnPhase: "title",
    pausedFrom: "playing",
    message: "",
    messageTimer: 0,
    shake: 0,
    padsConnected: [false, false, false, false],
    _held: {},
    _targetHits: [],
  };
}

export function rollPowerUp(rng) {
  const index = Math.floor(rng() * POWERUPS.length);
  return POWERUPS[Math.max(0, Math.min(POWERUPS.length - 1, index))];
}

export function standings(game) {
  return game.players
    .filter((player) => player.role !== "off")
    .map((player) => ({
      index: player.index,
      name: player.name,
      roundWins: player.roundWins,
      score: player.score,
      lives: player.lives,
      eliminated: player.eliminated,
      role: player.role,
    }))
    .sort((a, b) => b.roundWins - a.roundWins || b.score - a.score || a.index - b.index);
}

export function controlTarget(index) {
  if (index < 24) {
    return {
      kind: "bind",
      player: Math.floor(index / BIND_FIELDS.length),
      field: BIND_FIELDS[index % BIND_FIELDS.length],
    };
  }
  if (index === 24) return { kind: "reset" };
  return { kind: "back" };
}

export function startMatch(game, opts = {}) {
  const contenders = game.players.filter((player) => player.role !== "off");
  if (contenders.length < 2) {
    game.message = "Need at least 2 players or bots";
    game.messageTimer = 2.4;
    return false;
  }
  if (opts.seed != null) game.matchSeed = opts.seed >>> 0;
  game.winner = null;
  game.roundWinner = null;
  game.matchPending = false;
  game.roundIndex = 0;
  game.message = "";
  for (const player of game.players) {
    player.score = 0;
    player.roundWins = 0;
  }
  beginRound(game, !!opts.skipCountdown);
  return true;
}

export function update(game, dt, input) {
  const frame = normalize(input);
  game.events = [];
  game.animTime += dt;
  if (game.messageTimer > 0) game.messageTimer = Math.max(0, game.messageTimer - dt);
  if (game.shake > 0) game.shake = Math.max(0, game.shake - dt);
  game.padsConnected = frame.padsConnected.slice();

  const edges = readEdges(game, frame);
  const keys = frame.keysDown;
  const clicks = frame.clicks;

  if (game.phase === "controls" && game.rebind) {
    resolveRebind(game, keys);
    return game.events;
  }

  if (keys.includes("KeyM")) game.muted = !game.muted;

  const nav = menuNav(keys, edges, frame.padsConnected);

  switch (game.phase) {
    case "title":
      updateTitle(game, keys, edges, clicks);
      break;
    case "join":
      updateJoin(game, keys, edges, clicks);
      break;
    case "countdown":
      updateCountdown(game, dt, frame, keys, edges);
      break;
    case "playing":
      updatePlaying(game, dt, frame, keys, edges);
      break;
    case "paused":
      updatePaused(game, nav, keys, edges, clicks);
      break;
    case "settings":
      updateSettings(game, nav, keys, clicks);
      break;
    case "controls":
      updateControls(game, nav, keys, clicks);
      break;
    case "roundEnd":
      updateRoundEnd(game, dt);
      break;
    case "matchEnd":
      updateMatchEnd(game, nav, keys, edges, clicks);
      break;
    default:
      break;
  }
  return game.events;
}

function updateTitle(game, keys, edges, clicks) {
  const start = keys.includes("Enter") || edges.some((edge) => edge.pause || edge.action) || clicks.includes("title-start");
  if (start) {
    game.phase = "join";
    game.menuIndex = 0;
    game.message = "";
  }
}

function updateJoin(game, keys, edges, clicks) {
  for (let i = 0; i < 4; i++) {
    if (clicks.includes(`join-${i}`)) {
      cycleRole(game.players[i]);
      continue;
    }
    if (edges[i].action) {
      game.players[i].role = game.players[i].role === "human" ? "bot" : "human";
    } else if (edges[i].secondary) {
      const role = game.players[i].role;
      if (role === "human") game.players[i].role = "bot";
      else game.players[i].role = role === "bot" ? "off" : "bot";
    }
  }
  if (keys.includes("KeyC") || clicks.includes("join-settings")) {
    openSettings(game, "join");
    return;
  }
  if (keys.includes("Escape") || clicks.includes("join-back")) {
    game.phase = "title";
    return;
  }
  if (keys.includes("Enter") || edges.some((edge) => edge.pause) || clicks.includes("join-start")) {
    startMatch(game);
  }
}

function updateCountdown(game, dt, frame, keys, edges) {
  if (keys.includes("Escape") || edges.some((edge) => edge.pause)) {
    enterPause(game);
    return;
  }
  game.time += dt;
  game.countdown -= dt;
  const show = Math.ceil(game.countdown - 1e-8);
  if (show > 0 && show < game.countdownShown) {
    game.countdownShown = show;
    game.events.push({ type: "countdown", n: show });
  }
  const intents = buildIntents(game, frame);
  const sub = dt / SUBSTEPS;
  for (let step = 0; step < SUBSTEPS; step++) {
    simulateSubstep(game, sub, intents);
  }
  if (game.countdown <= 0) {
    game.phase = "playing";
    game.time += 0;
    game.roundTime = 0;
    game.nextBallAt = BALL_ADD_INTERVAL;
    spawnBall(game);
    game.events.push({ type: "go" });
  }
}

function updatePlaying(game, dt, frame, keys, edges) {
  if (keys.includes("Escape") || edges.some((edge) => edge.pause)) {
    enterPause(game);
    return;
  }
  game.time += dt;
  game.roundTime += dt;
  if (checkEnd(game)) return;
  const intents = buildIntents(game, frame);
  updateTilts(game, intents, dt);
  game._targetHits = [];
  const sub = dt / SUBSTEPS;
  for (let step = 0; step < SUBSTEPS; step++) {
    if (game.phase !== "playing") return;
    const drains = simulateSubstep(game, sub, intents);
    for (const drain of drains) {
      applyDrain(game, drain);
      if (checkEnd(game)) return;
    }
  }
  if (game.phase !== "playing") return;
  coolTargets(game, dt);
  for (const hit of game._targetHits) {
    if (hit.lastTouch == null) {
      game.events.push({ type: "target", x: hit.x, y: hit.y });
      continue;
    }
    applyPowerUp(game, hit.lastTouch, rollPowerUp(game.rng), { x: hit.x, y: hit.y });
  }
  if (game.phase === "playing") maintainBalls(game);
}

function updatePaused(game, nav, keys, edges, clicks) {
  if (nav.up) stepMenu(game, -1, PAUSE_ITEMS.length);
  if (nav.down) stepMenu(game, 1, PAUSE_ITEMS.length);
  if (keys.includes("Escape") || clicks.includes("pause-back")) {
    game.phase = game.pausedFrom || "playing";
    return;
  }
  const picked = clickIndex(clicks, "pause-item-");
  if (picked != null) game.menuIndex = picked;
  const confirm = keys.includes("Enter") || edges.some((edge) => edge.pause || edge.action) || picked != null;
  if (confirm) activatePause(game);
}

function updateSettings(game, nav, keys, clicks) {
  if (nav.up) stepMenu(game, -1, SETTINGS_ITEMS.length);
  if (nav.down) stepMenu(game, 1, SETTINGS_ITEMS.length);
  if (nav.left) adjustSetting(game, -1);
  if (nav.right) adjustSetting(game, 1);
  if (clicks.includes("volume-down")) adjustSetting(game, -1, "volume");
  if (clicks.includes("volume-up")) adjustSetting(game, 1, "volume");
  if (clicks.includes("wins-down")) adjustSetting(game, -1, "wins");
  if (clicks.includes("wins-up")) adjustSetting(game, 1, "wins");
  if (clicks.includes("settings-controls")) {
    game.menuIndex = SETTINGS_ITEMS.indexOf("controls");
    activateSettings(game);
    return;
  }
  if (clicks.includes("settings-back") || keys.includes("Escape")) {
    leaveOverlay(game);
    return;
  }
  const picked = clickIndex(clicks, "settings-item-");
  if (picked != null) game.menuIndex = picked;
  if (keys.includes("Enter") || picked != null) activateSettings(game);
}

function updateControls(game, nav, keys, clicks) {
  const count = 26;
  if (nav.up) stepMenu(game, -1, count);
  if (nav.down) stepMenu(game, 1, count);
  const picked = clickIndex(clicks, "bind-");
  if (picked != null) game.menuIndex = picked;
  if (clicks.includes("controls-reset")) {
    game.menuIndex = 24;
    activateControl(game);
    return;
  }
  if (clicks.includes("controls-back") || keys.includes("Escape")) {
    leaveOverlay(game);
    return;
  }
  if (keys.includes("Enter") || picked != null) activateControl(game);
}

function updateRoundEnd(game, dt) {
  game.bannerTimer -= dt;
  if (game.bannerTimer > 0) return;
  if (game.matchPending) {
    game.phase = "matchEnd";
    game.menuIndex = 0;
    game.events.push({ type: "match", player: game.winner });
    return;
  }
  beginRound(game, false);
}

function updateMatchEnd(game, nav, keys, edges, clicks) {
  if (nav.up) stepMenu(game, -1, MATCH_ITEMS.length);
  if (nav.down) stepMenu(game, 1, MATCH_ITEMS.length);
  if (clicks.includes("match-rematch")) {
    game.menuIndex = 0;
    startMatch(game);
    return;
  }
  if (clicks.includes("match-title") || keys.includes("Escape")) {
    quitToTitle(game);
    return;
  }
  const picked = clickIndex(clicks, "match-item-");
  if (picked != null) game.menuIndex = picked;
  if (keys.includes("Enter") || edges.some((edge) => edge.pause || edge.action) || picked != null) {
    if ((MATCH_ITEMS[game.menuIndex] || "rematch") === "rematch") startMatch(game);
    else quitToTitle(game);
  }
}

function beginRound(game, skipCountdown) {
  game.rng = makeRng(deriveSeed(game.matchSeed, game.roundIndex));
  game.roundNumber = game.roundIndex + 1;
  game.roundIndex += 1;
  game.roundTime = 0;
  game.nextBallAt = BALL_ADD_INTERVAL;
  game.balls = [];
  game.nextBallId = 1;
  resetSolids(game.solids);
  for (const player of game.players) {
    player.tilt = 0;
    player.tiltLock = 0;
    player.wideUntil = 0;
    player.shieldUntil = 0;
    player.leftAngle = LEFT_REST;
    player.rightAngle = RIGHT_REST;
    player.leftOmega = 0;
    player.rightOmega = 0;
    if (player.role === "off") {
      player.lives = 0;
      player.eliminated = true;
    } else {
      player.lives = START_LIVES;
      player.eliminated = false;
    }
  }
  if (skipCountdown) {
    game.phase = "playing";
    game.countdown = 0;
    spawnBall(game);
    game.events.push({ type: "go" });
    return;
  }
  game.phase = "countdown";
  game.countdown = COUNTDOWN_SECONDS;
  game.countdownShown = COUNTDOWN_SECONDS;
  game.events.push({ type: "countdown", n: COUNTDOWN_SECONDS });
}

function maintainBalls(game) {
  if (game.balls.length === 0) {
    spawnBall(game);
    return;
  }
  if (game.balls.length < 3 && game.roundTime >= game.nextBallAt) {
    spawnBall(game);
    game.nextBallAt += BALL_ADD_INTERVAL;
  }
}

function spawnBall(game) {
  if (game.balls.length >= MAX_BALLS) return false;
  const rng = game.rng;
  let x = CENTER;
  let y = CENTER;
  let angle = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    angle = rng() * Math.PI * 2;
    x = CENTER + Math.cos(angle) * SPAWN_RADIUS;
    y = CENTER + Math.sin(angle) * SPAWN_RADIUS;
    const blocked = game.balls.some((ball) => Math.hypot(ball.x - x, ball.y - y) < BALL_R * 3.2);
    if (!blocked) break;
  }
  const speed = SPAWN_SPEED_MIN + rng() * (SPAWN_SPEED_MAX - SPAWN_SPEED_MIN);
  const dir = angle + 0.5;
  game.balls.push({
    id: game.nextBallId++,
    x,
    y,
    vx: Math.cos(dir) * speed,
    vy: Math.sin(dir) * speed,
    r: BALL_R,
    lastTouch: null,
  });
  game.events.push({ type: "spawn", x, y });
  return true;
}

export function applyPowerUp(game, playerIndex, type, at) {
  const player = game.players[playerIndex];
  if (!player || player.role === "off" || player.eliminated) return false;
  if (type === "multiball") {
    const spawned = spawnBall(game);
    game.events.push({ type: "power", player: playerIndex, kind: type, spawned, x: at?.x, y: at?.y });
    return spawned;
  }
  if (type === "wide") player.wideUntil = game.time + WIDE_DURATION;
  else if (type === "shield") player.shieldUntil = game.time + SHIELD_DURATION;
  else return false;
  game.events.push({ type: "power", player: playerIndex, kind: type, x: at?.x, y: at?.y });
  return true;
}

function applyDrain(game, drain) {
  const victim = game.players[drain.playerIndex];
  if (!victim || victim.eliminated || victim.role === "off") return;
  if (game.time < victim.shieldUntil) return;
  victim.lives -= 1;
  if (drain.lastTouch != null && game.players[drain.lastTouch]) {
    game.players[drain.lastTouch].score += 1;
  }
  game.shake = 0.3;
  game.events.push({
    type: "scored",
    victim: victim.index,
    scorer: drain.lastTouch,
  });
  if (victim.lives <= 0) {
    victim.lives = 0;
    victim.eliminated = true;
    game.events.push({ type: "ko", player: victim.index });
  }
}

function checkEnd(game) {
  if (game.phase !== "playing") return false;
  const contenders = game.players.filter((player) => player.role !== "off");
  const alive = contenders.filter((player) => !player.eliminated && player.lives > 0);
  if (contenders.length >= 2 && alive.length <= 1) {
    endRound(game, alive[0] || null);
    return true;
  }
  return false;
}

function endRound(game, winner) {
  if (game.phase === "roundEnd" || game.phase === "matchEnd") return;
  game.roundWinner = winner ? winner.index : null;
  game.phase = "roundEnd";
  game.bannerTimer = BANNER_SECONDS;
  game.menuIndex = 0;
  if (winner) {
    winner.roundWins += 1;
    game.events.push({ type: "round", player: winner.index });
    if (winner.roundWins >= game.winsNeeded) {
      game.matchPending = true;
      game.winner = winner.index;
    }
  }
}

function buildIntents(game, frame) {
  return game.players.map((player, index) => {
    if (player.role === "bot" && !player.eliminated) return decideBot(player, game.balls);
    if (player.role !== "human" || player.eliminated) {
      return { moveX: 0, moveY: 0, left: false, right: false };
    }
    const src = frame.players[index];
    return {
      moveX: src.moveX || 0,
      moveY: src.moveY || 0,
      left: !!src.action,
      right: !!src.secondary,
    };
  });
}

function enterPause(game) {
  game.pausedFrom = game.phase === "paused" ? game.pausedFrom : game.phase;
  game.phase = "paused";
  game.menuIndex = 0;
}

function activatePause(game) {
  const item = PAUSE_ITEMS[game.menuIndex] || "resume";
  if (item === "resume") game.phase = game.pausedFrom || "playing";
  else if (item === "settings") openSettings(game, "paused");
  else if (item === "controls") openControls(game, "paused");
  else quitToTitle(game);
}

function openSettings(game, returnPhase) {
  game.returnPhase = returnPhase;
  game.phase = "settings";
  game.menuIndex = 0;
}

function openControls(game, returnPhase) {
  game.returnPhase = returnPhase;
  game.phase = "controls";
  game.menuIndex = 0;
  game.rebind = null;
}

function leaveOverlay(game) {
  game.rebind = null;
  game.phase = game.returnPhase || "paused";
  game.menuIndex = 0;
}

function activateSettings(game) {
  const item = SETTINGS_ITEMS[game.menuIndex] || "back";
  if (item === "controls") openControls(game, game.returnPhase || "paused");
  else if (item === "back") leaveOverlay(game);
}

function activateControl(game) {
  const target = controlTarget(game.menuIndex);
  if (target.kind === "bind") {
    game.rebind = { player: target.player, field: target.field };
    return;
  }
  if (target.kind === "reset") {
    game.bindings = defaultBindings();
    return;
  }
  leaveOverlay(game);
}

function adjustSetting(game, dir, forced) {
  const item = forced || SETTINGS_ITEMS[game.menuIndex];
  if (item === "volume") {
    game.volume = clamp(Math.round((game.volume + dir * 0.1) * 10) / 10, 0, 1);
  } else if (item === "wins") {
    game.winsNeeded = clamp(game.winsNeeded + dir, 1, 9);
  }
}

function resolveRebind(game, keys) {
  if (keys.includes("Escape")) {
    game.rebind = null;
    return;
  }
  const key = keys.find((code) => code !== "Escape");
  if (!key) return;
  setBinding(game.bindings, game.rebind.player, game.rebind.field, key);
  game.rebind = null;
}

function quitToTitle(game) {
  game.phase = "title";
  game.balls = [];
  game.winner = null;
  game.roundWinner = null;
  game.matchPending = false;
  game.menuIndex = 0;
  game.rebind = null;
  game.message = "";
}

function cycleRole(player) {
  const order = ["bot", "human", "off"];
  const index = Math.max(0, order.indexOf(player.role));
  player.role = order[(index + 1) % order.length];
}

function stepMenu(game, delta, count) {
  game.menuIndex = (game.menuIndex + delta + count) % count;
}

function menuNav(keys, edges, padsConnected) {
  const nav = {
    up: keys.includes("ArrowUp") || keys.includes("KeyW"),
    down: keys.includes("ArrowDown") || keys.includes("KeyS"),
    left: keys.includes("ArrowLeft") || keys.includes("KeyA"),
    right: keys.includes("ArrowRight") || keys.includes("KeyD"),
  };
  for (let i = 0; i < 4; i++) {
    if (!padsConnected[i]) continue;
    if (edges[i].up) nav.up = true;
    if (edges[i].down) nav.down = true;
    if (edges[i].left) nav.left = true;
    if (edges[i].right) nav.right = true;
  }
  return nav;
}

function readEdges(game, frame) {
  const edges = [];
  for (let i = 0; i < 4; i++) {
    const player = frame.players[i];
    edges.push({
      action: rise(game, `action${i}`, player.action),
      secondary: rise(game, `secondary${i}`, player.secondary),
      pause: rise(game, `pause${i}`, player.pause),
      up: rise(game, `up${i}`, player.moveY < -0.5),
      down: rise(game, `down${i}`, player.moveY > 0.5),
      left: rise(game, `left${i}`, player.moveX < -0.5),
      right: rise(game, `right${i}`, player.moveX > 0.5),
    });
  }
  return edges;
}

function rise(game, id, on) {
  const value = !!on;
  const was = !!game._held[id];
  game._held[id] = value;
  return value && !was;
}

function clickIndex(clicks, prefix) {
  for (const click of clicks) {
    if (typeof click === "string" && click.startsWith(prefix)) {
      const index = Number(click.slice(prefix.length));
      if (Number.isInteger(index)) return index;
    }
  }
  return null;
}

function normalize(input) {
  const frame = emptyFrame();
  if (!input) return frame;
  if (Array.isArray(input.players)) {
    for (let i = 0; i < 4; i++) {
      if (input.players[i]) frame.players[i] = { ...frame.players[i], ...input.players[i] };
    }
  }
  frame.keysDown = Array.isArray(input.keysDown) ? input.keysDown.slice() : [];
  frame.clicks = Array.isArray(input.clicks) ? input.clicks.slice() : [];
  if (Array.isArray(input.padsConnected)) frame.padsConnected = input.padsConnected.slice();
  return frame;
}
