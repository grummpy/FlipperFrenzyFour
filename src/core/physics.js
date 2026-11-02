import {
  BALL_R,
  BUMPER_BOOST,
  CENTER,
  DRAIN_HALF,
  FLIPPER_OMEGA,
  FLIPPER_R,
  FLIPPER_RESTITUTION,
  MAX_BALL_SPEED,
  MIN_BALL_SPEED,
  NUDGE_ACCEL,
  TABLE,
  TARGET_COOLDOWN,
  TILT_DECAY,
  TILT_LOCK,
  TILT_RATE,
  VORTEX_ACCEL,
  WALL_RESTITUTION,
} from "./constants.js";
import { approach, closestOnSegment } from "./math.js";

const MOUTH_PULL = 420;
import {
  BASIS,
  flipperAngles,
  flipperEndpoints,
  flipperPointVelocity,
  inDrainGap,
  worldToLocal,
} from "./table.js";

function playingSide(player) {
  return player.role !== "off" && !player.eliminated;
}

function drainIsOpen(player, time, x, y) {
  if (!playingSide(player)) return false;
  if (time < player.shieldUntil) return false;
  return inDrainGap(player.side, x, y);
}

/**
 * One collision substep. Mutates balls and player angles.
 * Returns drains that happened during this substep.
 */
export function simulateSubstep(game, dt, intents) {
  const drains = [];
  const events = game.events;

  for (let i = 0; i < 4; i++) {
    const player = game.players[i];
    const intent = intents[i] || { left: false, right: false };
    const locked = player.tiltLock > 0 || !playingSide(player);
    moveFlipper(player, "left", !locked && !!intent.left, dt);
    moveFlipper(player, "right", !locked && !!intent.right, dt);
  }

  let nudgeX = 0;
  let nudgeY = 0;
  for (let i = 0; i < 4; i++) {
    const player = game.players[i];
    const intent = intents[i];
    if (!intent || player.tiltLock > 0 || !playingSide(player)) continue;
    nudgeX += intent.moveX || 0;
    nudgeY += intent.moveY || 0;
  }
  const nudgeMag = Math.hypot(nudgeX, nudgeY);
  if (nudgeMag > 1.15) {
    nudgeX = (nudgeX / nudgeMag) * 1.15;
    nudgeY = (nudgeY / nudgeMag) * 1.15;
  }

  for (const ball of game.balls) {
    const dx = CENTER - ball.x;
    const dy = CENTER - ball.y;
    const dist = Math.hypot(dx, dy) || 1;
    let ax = (dx / dist) * VORTEX_ACCEL + nudgeX * NUDGE_ACCEL;
    let ay = (dy / dist) * VORTEX_ACCEL + nudgeY * NUDGE_ACCEL;
    // An open drain pulls balls down the lane once they are in the mouth.
    for (let i = 0; i < 4; i++) {
      const player = game.players[i];
      if (!drainIsOpen(player, game.time, ball.x, ball.y)) continue;
      const local = worldToLocal(player.side, ball.x, ball.y);
      if (local.y < 240 && local.y > -40) {
        const basis = BASIS[player.side];
        ax -= basis.inward.x * MOUTH_PULL;
        ay -= basis.inward.y * MOUTH_PULL;
      }
    }
    ball.vx += ax * dt;
    ball.vy += ay * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
  }

  const spinner = game.solids.spinner;
  spinner.angle += spinner.omega * dt;

  const survivors = [];
  for (const ball of game.balls) {
    collideFlippers(game, ball, events);
    collideBumpers(game, ball, events);
    collideSpinner(game, ball, events);
    const targetHit = collideTargets(game, ball);
    if (targetHit) game._targetHits.push(targetHit);
    const drained = resolveWalls(game, ball);
    if (drained != null) {
      drains.push({
        playerIndex: drained,
        lastTouch: ball.lastTouch,
        x: ball.x,
        y: ball.y,
      });
      events.push({ type: "drain", player: drained, x: ball.x, y: ball.y, lastTouch: ball.lastTouch });
    } else {
      clampSpeed(ball);
      if (!Number.isFinite(ball.x) || !Number.isFinite(ball.vx)) {
        ball.x = CENTER;
        ball.y = CENTER;
        ball.vx = MIN_BALL_SPEED;
        ball.vy = 0;
      }
      survivors.push(ball);
    }
  }
  game.balls = survivors;
  resolveBalls(game.balls);
  return drains;
}

export function updateTilts(game, intents, dt) {
  for (let i = 0; i < 4; i++) {
    const player = game.players[i];
    const intent = intents[i];
    if (player.tiltLock > 0) {
      player.tiltLock = Math.max(0, player.tiltLock - dt);
      player.tilt = Math.max(0, player.tilt - TILT_DECAY * dt);
      continue;
    }
    const mag = intent ? Math.hypot(intent.moveX || 0, intent.moveY || 0) : 0;
    if (mag > 0.2 && player.role !== "off" && !player.eliminated) {
      player.tilt += TILT_RATE * Math.min(1, mag) * dt;
      if (player.tilt >= 1) {
        player.tilt = 0;
        player.tiltLock = TILT_LOCK;
        game.events.push({ type: "tilt", player: i });
      }
    } else {
      player.tilt = Math.max(0, player.tilt - TILT_DECAY * dt);
    }
  }
}

export function coolTargets(game, dt) {
  for (const target of game.solids.targets) {
    if (target.cool > 0) target.cool = Math.max(0, target.cool - dt);
  }
}

function moveFlipper(player, which, pressed, dt) {
  const angles = flipperAngles(which);
  const target = pressed ? angles.active : angles.rest;
  const key = which === "left" ? "leftAngle" : "rightAngle";
  const before = player[key];
  player[key] = approach(before, target, FLIPPER_OMEGA * dt);
  player[which === "left" ? "leftOmega" : "rightOmega"] = (player[key] - before) / (dt || 1);
}

function collideFlippers(game, ball, events) {
  for (let i = 0; i < 4; i++) {
    const player = game.players[i];
    if (!playingSide(player)) continue;
    for (const which of ["left", "right"]) {
      const pose = flipperEndpoints(player, which, game.time);
      const omega = which === "left" ? player.leftOmega || 0 : player.rightOmega || 0;
      const hit = collideCapsule(ball, pose.pivot, pose.tip, FLIPPER_R, (t) =>
        flipperPointVelocity(player, which, t, omega, pose.length),
        FLIPPER_RESTITUTION,
      );
      if (hit) {
        ball.lastTouch = i;
        if (hit.impact < -50) {
          events.push({ type: "flip", player: i, x: ball.x, y: ball.y });
        }
      }
    }
  }
}

function collideBumpers(game, ball, events) {
  for (const bumper of game.solids.bumpers) {
    const hit = collideCircle(ball, bumper.x, bumper.y, bumper.r, 0.2);
    if (hit && hit.approach < 0) {
      const speed = Math.max(BUMPER_BOOST, Math.hypot(ball.vx, ball.vy));
      ball.vx = hit.nx * speed;
      ball.vy = hit.ny * speed;
      events.push({ type: "bumper", x: bumper.x, y: bumper.y });
    }
  }
}

function collideSpinner(game, ball, events) {
  const spinner = game.solids.spinner;
  const c = Math.cos(spinner.angle);
  const s = Math.sin(spinner.angle);
  const tip = {
    x: spinner.x + c * spinner.len,
    y: spinner.y + s * spinner.len,
  };
  const tail = {
    x: spinner.x - c * spinner.len,
    y: spinner.y - s * spinner.len,
  };
  const hit = collideCapsule(ball, tail, tip, spinner.r, (t) => {
    const px = tail.x + (tip.x - tail.x) * t - spinner.x;
    const py = tail.y + (tip.y - tail.y) * t - spinner.y;
    return { x: spinner.omega * -py, y: spinner.omega * px };
  }, 0.55);
  if (hit && hit.impact < -30) {
    events.push({ type: "spin", x: ball.x, y: ball.y });
  }
}

function collideTargets(game, ball) {
  for (let i = 0; i < game.solids.targets.length; i++) {
    const target = game.solids.targets[i];
    const hit = collideCircle(ball, target.x, target.y, target.r, 0.45);
    if (!hit) continue;
    if (target.cool <= 0 && hit.approach < 0) {
      target.cool = TARGET_COOLDOWN;
      return {
        index: i,
        lastTouch: ball.lastTouch,
        x: target.x,
        y: target.y,
      };
    }
  }
  return null;
}

/**
 * Walls are the table border. An open drain lets the center of the ball
 * cross; shields, elimination, and an off slot close it.
 * Returns the player index who was drained, or null.
 */
export function resolveWalls(game, ball) {
  const r = ball.r || BALL_R;

  if (ball.x < r) {
    const open = drainIsOpen(game.players[3], game.time, ball.x, ball.y);
    if (open) {
      if (ball.x < 0) return 3;
    } else {
      ball.x = r;
      if (ball.vx < 0) ball.vx = -ball.vx * WALL_RESTITUTION;
    }
  } else if (ball.x > TABLE - r) {
    const open = drainIsOpen(game.players[1], game.time, ball.x, ball.y);
    if (open) {
      if (ball.x > TABLE) return 1;
    } else {
      ball.x = TABLE - r;
      if (ball.vx > 0) ball.vx = -ball.vx * WALL_RESTITUTION;
    }
  }

  if (ball.y < r) {
    const open = drainIsOpen(game.players[2], game.time, ball.x, ball.y);
    if (open) {
      if (ball.y < 0) return 2;
    } else {
      ball.y = r;
      if (ball.vy < 0) ball.vy = -ball.vy * WALL_RESTITUTION;
    }
  } else if (ball.y > TABLE - r) {
    const open = drainIsOpen(game.players[0], game.time, ball.x, ball.y);
    if (open) {
      if (ball.y > TABLE) return 0;
    } else {
      ball.y = TABLE - r;
      if (ball.vy > 0) ball.vy = -ball.vy * WALL_RESTITUTION;
    }
  }
  return null;
}

function resolveBalls(balls) {
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        collidePair(balls[i], balls[j]);
      }
    }
  }
}

function collidePair(a, b) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dist = Math.hypot(dx, dy);
  const min = (a.r || BALL_R) + (b.r || BALL_R);
  if (dist >= min) return;
  if (dist < 1e-6) {
    dx = 1;
    dy = 0;
    dist = 1;
  }
  const nx = dx / dist;
  const ny = dy / dist;
  const pen = min - dist;
  a.x -= nx * pen * 0.5;
  a.y -= ny * pen * 0.5;
  b.x += nx * pen * 0.5;
  b.y += ny * pen * 0.5;
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv < 0) {
    const impulse = -rv;
    a.vx -= impulse * nx;
    a.vy -= impulse * ny;
    b.vx += impulse * nx;
    b.vy += impulse * ny;
  }
}

function collideCircle(ball, cx, cy, radius, restitution) {
  let dx = ball.x - cx;
  let dy = ball.y - cy;
  let dist = Math.hypot(dx, dy);
  const min = (ball.r || BALL_R) + radius;
  if (dist >= min) return null;
  if (dist < 1e-6) {
    dx = 1;
    dy = 0;
    dist = 1;
  }
  const nx = dx / dist;
  const ny = dy / dist;
  const approach = ball.vx * nx + ball.vy * ny;
  ball.x += nx * (min - dist);
  ball.y += ny * (min - dist);
  if (approach < 0) {
    const j = -(1 + restitution) * approach;
    ball.vx += j * nx;
    ball.vy += j * ny;
  }
  return { nx, ny, approach };
}

function collideCapsule(ball, a, b, radius, velocityAt, restitution) {
  const cp = closestOnSegment(ball.x, ball.y, a.x, a.y, b.x, b.y);
  let dx = ball.x - cp.x;
  let dy = ball.y - cp.y;
  let dist = Math.hypot(dx, dy);
  const min = (ball.r || BALL_R) + radius;
  if (dist >= min) return null;
  let nx;
  let ny;
  if (dist < 1e-6) {
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const sl = Math.hypot(sx, sy) || 1;
    nx = -sy / sl;
    ny = sx / sl;
    dist = 0;
  } else {
    nx = dx / dist;
    ny = dy / dist;
  }
  ball.x += nx * (min - dist);
  ball.y += ny * (min - dist);
  const vp = velocityAt(cp.t);
  const rvx = ball.vx - vp.x;
  const rvy = ball.vy - vp.y;
  const impact = rvx * nx + rvy * ny;
  if (impact < 0) {
    const j = -(1 + restitution) * impact;
    ball.vx += j * nx;
    ball.vy += j * ny;
  }
  return { impact, nx, ny };
}

function clampSpeed(ball) {
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > MAX_BALL_SPEED) {
    const s = MAX_BALL_SPEED / speed;
    ball.vx *= s;
    ball.vy *= s;
  } else if (speed < MIN_BALL_SPEED) {
    if (speed > 8) {
      const s = MIN_BALL_SPEED / speed;
      ball.vx *= s;
      ball.vy *= s;
    } else {
      const angle = (ball.id || 1) * 1.7;
      ball.vx = Math.cos(angle) * MIN_BALL_SPEED;
      ball.vy = Math.sin(angle) * MIN_BALL_SPEED;
    }
  }
}

export function gapHalfWidth() {
  return DRAIN_HALF;
}
