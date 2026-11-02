import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BALL_R,
  CENTER,
  LEFT_REST,
  SHIELD_DURATION,
  START_LIVES,
  STEP,
  TABLE,
  WIDE_DURATION,
} from "../src/core/constants.js";
import { applyPowerUp, createGame, rollPowerUp, standings, startMatch, update } from "../src/core/game.js";
import { buildFrame, emptyFrame } from "../src/core/input.js";

const root = fileURLToPath(new URL("..", import.meta.url));

function humans(seed = 1, winsNeeded = 4) {
  const game = createGame({ seed, winsNeeded });
  for (const player of game.players) player.role = "human";
  assert.equal(startMatch(game, { skipCountdown: true }), true);
  return game;
}

function tap(game, keys, held = keys) {
  return update(game, STEP, buildFrame({
    heldKeys: new Set(held),
    keysDown: keys,
    bindings: game.bindings,
  }));
}

test("players start with 10 lives and a countdown reaches play with one ball", () => {
  const game = createGame({ seed: 3 });
  assert.equal(startMatch(game), true);
  assert.equal(game.phase, "countdown");
  assert.equal(game.balls.length, 0);
  for (const player of game.players) assert.equal(player.lives, START_LIVES);
  let elapsed = 0;
  while (game.phase === "countdown" && elapsed < 5) {
    update(game, STEP, emptyFrame());
    elapsed += STEP;
  }
  assert.equal(game.phase, "playing");
  assert.ok(elapsed > 2.9 && elapsed < 3.2);
  assert.equal(game.balls.length, 1);
});

test("title, join, and start use the keyboard", () => {
  const game = createGame({ seed: 1 });
  tap(game, ["Enter"]);
  assert.equal(game.phase, "join");
  tap(game, ["KeyF"], ["KeyF"]);
  assert.equal(game.players[0].role, "human");
  tap(game, ["Enter"]);
  assert.equal(game.phase, "countdown");
});

test("a match needs two participants", () => {
  const game = createGame({ seed: 1 });
  for (const player of game.players) player.role = "off";
  game.players[0].role = "human";
  game.phase = "join";
  tap(game, ["Enter"]);
  assert.equal(game.phase, "join");
  assert.match(game.message, /2/);
});

test("a drain costs a life and scores for the last touch, including your own", () => {
  const game = humans(4);
  game.balls = [{ id: 51, x: -4, y: CENTER, vx: -80, vy: 0, r: BALL_R, lastTouch: 1 }];
  update(game, STEP, emptyFrame());
  assert.equal(game.players[3].lives, START_LIVES - 1);
  assert.equal(game.players[1].score, 1);
  assert.equal(game.balls.find((ball) => ball.id === 51), undefined);

  game.balls = [{ id: 52, x: CENTER, y: TABLE + 4, vx: 0, vy: 90, r: BALL_R, lastTouch: 0 }];
  update(game, STEP, emptyFrame());
  assert.equal(game.players[0].lives, START_LIVES - 1);
  assert.equal(game.players[0].score, 1);
});

test("zero lives walls the side off", () => {
  const game = humans(5);
  game.players[3].lives = 1;
  game.balls = [{ id: 53, x: -4, y: CENTER, vx: -40, vy: 0, r: BALL_R, lastTouch: 2 }];
  update(game, STEP, emptyFrame());
  assert.equal(game.players[3].lives, 0);
  assert.equal(game.players[3].eliminated, true);
  assert.equal(game.players[2].score, 1);

  game.balls = [{ id: 54, x: -4, y: CENTER, vx: -40, vy: 0, r: BALL_R, lastTouch: 2 }];
  update(game, STEP, emptyFrame());
  assert.equal(game.players[2].score, 1);
  const kept = game.balls.find((ball) => ball.id === 54);
  assert.ok(kept);
  assert.ok(kept.x > 0);
});

test("an off slot is walled and cannot win", () => {
  const game = createGame({ seed: 6, winsNeeded: 2 });
  game.players[3].role = "off";
  startMatch(game, { skipCountdown: true });
  assert.equal(game.players[3].eliminated, true);
  assert.equal(game.players[3].lives, 0);
  game.balls = [{ id: 9, x: -3, y: CENTER, vx: -50, vy: 0, r: BALL_R, lastTouch: 0 }];
  update(game, STEP, emptyFrame());
  const ball = game.balls.find((item) => item.id === 9);
  assert.ok(ball);
  assert.ok(ball.x > 0);
  assert.equal(game.players[0].score, 0);
  assert.ok(standings(game).every((row) => row.index !== 3));
});

test("shield blocks a drain and wide flippers last 10 seconds", () => {
  const game = humans(7);
  assert.equal(applyPowerUp(game, 3, "shield"), true);
  assert.equal(game.players[3].shieldUntil - game.time, SHIELD_DURATION);
  const lives = game.players[3].lives;
  game.balls = [{ id: 50, x: -4, y: CENTER, vx: -120, vy: 0, r: BALL_R, lastTouch: 0 }];
  update(game, STEP, emptyFrame());
  assert.equal(game.players[3].lives, lives);
  const ball = game.balls.find((item) => item.id === 50);
  assert.ok(ball);
  assert.ok(ball.x >= BALL_R - 0.5);

  const fresh = createGame({ seed: 1 });
  assert.equal(applyPowerUp(fresh, 0, "wide"), true);
  assert.equal(fresh.players[0].wideUntil - fresh.time, WIDE_DURATION);
});

test("power-up rolls are deterministic and targets pay the last touch", () => {
  assert.equal(rollPowerUp(() => 0), "multiball");
  assert.equal(rollPowerUp(() => 0.34), "wide");
  assert.equal(rollPowerUp(() => 0.67), "shield");
  assert.equal(rollPowerUp(() => 0.99), "shield");

  const game = humans(8);
  const before = game.balls.length;
  assert.equal(applyPowerUp(game, 0, "multiball"), true);
  assert.equal(game.balls.length, before + 1);
  assert.ok(game.balls.length <= 5);

  const target = game.solids.targets[0];
  game.balls = [{
    id: 80,
    x: target.x - target.r - BALL_R - 0.4,
    y: target.y,
    vx: 280,
    vy: 0,
    r: BALL_R,
    lastTouch: 2,
  }];
  const ballsBefore = game.balls.length;
  update(game, STEP, emptyFrame());
  const player = game.players[2];
  const gained = player.wideUntil - game.time === WIDE_DURATION
    || player.shieldUntil - game.time === SHIELD_DURATION
    || game.balls.length > ballsBefore;
  assert.ok(gained);
});

test("ambient play adds balls up to three", () => {
  const game = humans(9);
  assert.equal(game.balls.length, 1);
  game.roundTime = 8;
  game.nextBallAt = 8;
  update(game, STEP, emptyFrame());
  assert.ok(game.balls.length >= 2);
  assert.ok(game.balls.length <= 3);
  game.roundTime = game.nextBallAt;
  update(game, STEP, emptyFrame());
  assert.ok(game.balls.length <= 3);
  let guard = 0;
  while (game.balls.length < 3 && game.phase === "playing" && guard < 8) {
    game.roundTime = game.nextBallAt;
    update(game, STEP, emptyFrame());
    guard += 1;
  }
  assert.equal(game.balls.length, 3);
  game.roundTime = game.nextBallAt;
  update(game, STEP, emptyFrame());
  assert.ok(game.balls.length <= 3);
});

test("last player alive takes the round and first to two takes the match", () => {
  const game = humans(10, 2);
  for (const index of [1, 2, 3]) {
    game.players[index].lives = 0;
    game.players[index].eliminated = true;
  }
  update(game, STEP, emptyFrame());
  assert.equal(game.phase, "roundEnd");
  assert.equal(game.roundWinner, 0);
  assert.equal(game.players[0].roundWins, 1);
  assert.equal(game.matchPending, false);

  let guard = 0;
  while (game.phase === "roundEnd" && guard < 400) {
    update(game, STEP, emptyFrame());
    guard += 1;
  }
  assert.equal(game.phase, "countdown");
  assert.equal(game.players[0].score >= 0, true);

  const match = humans(11, 2);
  match.players[0].roundWins = 1;
  for (const index of [1, 2, 3]) {
    match.players[index].lives = 0;
    match.players[index].eliminated = true;
  }
  update(match, STEP, emptyFrame());
  assert.equal(match.matchPending, true);
  assert.equal(match.players[0].roundWins, 2);
  guard = 0;
  while (match.phase !== "matchEnd" && guard < 400) {
    update(match, STEP, emptyFrame());
    guard += 1;
  }
  assert.equal(match.phase, "matchEnd");
  assert.equal(match.winner, 0);
  const board = standings(match);
  assert.equal(board[0].index, 0);
});

test("over-nudging locks that player's flippers", () => {
  const game = humans(12);
  const input = emptyFrame();
  input.players[0].moveY = -1;
  let locked = false;
  for (let i = 0; i < 150 && game.phase === "playing"; i++) {
    update(game, STEP, input);
    if (game.players[0].tiltLock > 0) {
      locked = true;
      break;
    }
  }
  assert.equal(locked, true);
  input.players[0].moveY = 0;
  input.players[0].action = true;
  for (let i = 0; i < 8; i++) update(game, STEP, input);
  assert.ok(Math.abs(game.players[0].leftAngle - LEFT_REST) < 0.2);
});

test("bots swing at a ball leaving through their drain", () => {
  const game = createGame({ seed: 13 });
  startMatch(game, { skipCountdown: true });
  game.balls = [{ id: 1, x: CENTER - 105, y: TABLE - 100, vx: 0, vy: 260, r: BALL_R, lastTouch: null }];
  let peaked = game.players[0].leftAngle;
  for (let i = 0; i < 10; i++) {
    update(game, STEP, emptyFrame());
    peaked = Math.max(peaked, game.players[0].leftAngle);
  }
  assert.ok(peaked > LEFT_REST + 0.35);
});

test("the same seed plays the same game", () => {
  const run = (seed) => {
    const game = createGame({ seed });
    startMatch(game, { skipCountdown: true, seed });
    const frames = [];
    for (let i = 0; i < 360; i++) {
      update(game, STEP, emptyFrame());
      if (i % 45 === 0) {
        frames.push({
          phase: game.phase,
          balls: game.balls.map((ball) => [ball.x.toFixed(3), ball.y.toFixed(3), ball.lastTouch]),
          players: game.players.map((player) => [player.lives, player.score, player.roundWins, player.wideUntil.toFixed(2), player.shieldUntil.toFixed(2)]),
        });
      }
    }
    return JSON.stringify(frames);
  };
  assert.equal(run(21), run(21));
  assert.notEqual(run(21), run(22));
});

test("four bots finish a match", { timeout: 30000 }, () => {
  const game = createGame({ seed: 11, winsNeeded: 2 });
  assert.equal(startMatch(game, { skipCountdown: true }), true);
  let steps = 0;
  while (game.phase !== "matchEnd" && steps < 120000) {
    update(game, STEP, emptyFrame());
    steps += 1;
  }
  const summary = game.players.map((player) => `${player.name}:${player.lives}l/${player.roundWins}w/${player.score}p`).join(" ");
  assert.equal(game.phase, "matchEnd", `stuck in ${game.phase} after ${steps} steps (${summary})`);
  assert.ok(game.winner != null);
  assert.ok(game.players[game.winner].roundWins >= 2);
});

test("pause, settings, mute, and rebinding work", () => {
  const game = humans(14, 2);
  tap(game, ["Escape"]);
  assert.equal(game.phase, "paused");
  tap(game, ["ArrowDown"]);
  tap(game, ["Enter"]);
  assert.equal(game.phase, "settings");
  tap(game, ["ArrowDown"]);
  tap(game, ["ArrowRight"]);
  assert.equal(game.winsNeeded, 3);
  tap(game, ["KeyM"]);
  assert.equal(game.muted, true);
  tap(game, ["ArrowDown"]);
  tap(game, ["Enter"]);
  assert.equal(game.phase, "controls");
  game.rebind = { player: 0, field: "action" };
  tap(game, ["KeyZ"], ["KeyZ"]);
  assert.equal(game.bindings.players[0].action, "KeyZ");
  assert.equal(game.rebind, null);
});

test("core logic does not call Math.random", () => {
  const dir = join(root, "src", "core");
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".js")) continue;
    const text = readFileSync(join(dir, name), "utf8");
    assert.equal(text.includes("Math.random"), false, name);
    assert.equal(statSync(join(dir, name)).isFile(), true);
  }
});
