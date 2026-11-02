import assert from "node:assert/strict";
import { test } from "node:test";
import { BALL_R, CENTER, FLIPPER_LEN, LEFT_REST, STEP, TABLE, WIDE_SCALE } from "../src/core/constants.js";
import { createGame, startMatch, update } from "../src/core/game.js";
import { emptyFrame } from "../src/core/input.js";
import { flipperEndpoints } from "../src/core/table.js";

function humans(seed = 1) {
  const game = createGame({ seed, winsNeeded: 4 });
  for (const player of game.players) player.role = "human";
  startMatch(game, { skipCountdown: true });
  return game;
}

test("a moving ball changes position", () => {
  const game = humans(1);
  game.balls = [{ id: 6, x: 200, y: 240, vx: 240, vy: 0, r: BALL_R, lastTouch: null }];
  update(game, STEP, emptyFrame());
  assert.ok(game.balls[0].x > 200);
});

test("the vortex pulls a ball toward the center", () => {
  const game = humans(2);
  game.balls = [{ id: 5, x: 640, y: 420, vx: 0, vy: 210, r: BALL_R, lastTouch: null }];
  update(game, STEP, emptyFrame());
  assert.ok(game.balls[0].vx < 0);
});

test("a closed wall reflects the ball", () => {
  const game = humans(3);
  game.balls = [{ id: 7, x: 8, y: 120, vx: -400, vy: 0, r: BALL_R, lastTouch: null }];
  update(game, STEP, emptyFrame());
  const ball = game.balls.find((item) => item.id === 7);
  assert.ok(ball);
  assert.ok(ball.vx > 0);
  assert.ok(ball.x >= BALL_R - 0.2);
});

test("bumpers kick the ball back harder", () => {
  const game = humans(4);
  const bumper = game.solids.bumpers[0];
  game.balls = [{
    id: 4,
    x: bumper.x - bumper.r - BALL_R - 0.5,
    y: bumper.y,
    vx: 300,
    vy: 0,
    r: BALL_R,
    lastTouch: null,
  }];
  update(game, STEP, emptyFrame());
  const ball = game.balls[0];
  assert.ok(ball.vx < 0);
  assert.ok(Math.hypot(ball.vx, ball.vy) > 300);
});

test("overlapping balls separate and exchange their approach", () => {
  const game = humans(5);
  game.balls = [
    { id: 1, x: 220, y: 220, vx: 160, vy: 0, r: BALL_R, lastTouch: null },
    { id: 2, x: 240, y: 220, vx: -160, vy: 0, r: BALL_R, lastTouch: null },
  ];
  update(game, STEP, emptyFrame());
  const a = game.balls.find((ball) => ball.id === 1);
  const b = game.balls.find((ball) => ball.id === 2);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= BALL_R * 2 - 0.05);
  assert.ok(a.vx < 0);
  assert.ok(b.vx > 0);
});

test("touching a flipper records the last player", () => {
  const game = humans(6);
  const pose = flipperEndpoints(game.players[0], "left", game.time);
  game.balls = [{
    id: 70,
    x: pose.pivot.x,
    y: pose.pivot.y - 3,
    vx: 0,
    vy: 0,
    r: BALL_R,
    lastTouch: null,
  }];
  update(game, STEP, emptyFrame());
  const ball = game.balls.find((item) => item.id === 70);
  assert.ok(ball);
  assert.equal(ball.lastTouch, 0);
});

test("wide flippers are longer for their whole timer", () => {
  const game = humans(7);
  game.players[0].wideUntil = game.time + 10;
  const pose = flipperEndpoints(game.players[0], "left", game.time);
  assert.ok(Math.abs(pose.length - FLIPPER_LEN * WIDE_SCALE) < 0.001);
  const normal = flipperEndpoints(game.players[1], "right", game.time);
  assert.ok(Math.abs(normal.length - FLIPPER_LEN) < 0.001);
  assert.equal(game.players[0].leftAngle, LEFT_REST);
  void TABLE;
});
