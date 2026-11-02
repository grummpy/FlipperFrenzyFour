import {
  AMBIENT_BALLS,
  BUMPER_R,
  CENTER,
  DRAIN_HALF,
  FLIPPER_INSET,
  FLIPPER_LEN,
  LEFT_ACTIVE,
  LEFT_REST,
  RIGHT_ACTIVE,
  RIGHT_REST,
  SIDES,
  SPINNER_LEN,
  SPINNER_OMEGA,
  SPINNER_R,
  TABLE,
  TARGET_R,
  WIDE_SCALE,
} from "./constants.js";

/** Screen basis: +x right, +y down. inward points from the wall toward center. */
export const BASIS = {
  south: { right: { x: 1, y: 0 }, inward: { x: 0, y: -1 } },
  north: { right: { x: -1, y: 0 }, inward: { x: 0, y: 1 } },
  east: { right: { x: 0, y: 1 }, inward: { x: -1, y: 0 } },
  west: { right: { x: 0, y: -1 }, inward: { x: 1, y: 0 } },
};

export function wallOrigin(side) {
  switch (side) {
    case "south":
      return { x: CENTER, y: TABLE };
    case "north":
      return { x: CENTER, y: 0 };
    case "east":
      return { x: TABLE, y: CENTER };
    case "west":
      return { x: 0, y: CENTER };
    default:
      return { x: CENTER, y: CENTER };
  }
}

export function localToWorld(side, lx, ly) {
  const origin = wallOrigin(side);
  const basis = BASIS[side];
  return {
    x: origin.x + basis.right.x * lx + basis.inward.x * ly,
    y: origin.y + basis.right.y * lx + basis.inward.y * ly,
  };
}

export function worldToLocal(side, x, y) {
  const origin = wallOrigin(side);
  const basis = BASIS[side];
  const dx = x - origin.x;
  const dy = y - origin.y;
  return {
    x: dx * basis.right.x + dy * basis.right.y,
    y: dx * basis.inward.x + dy * basis.inward.y,
  };
}

export function velToLocal(side, vx, vy) {
  const basis = BASIS[side];
  return {
    x: vx * basis.right.x + vy * basis.right.y,
    y: vx * basis.inward.x + vy * basis.inward.y,
  };
}

export function flipperAngles(which) {
  if (which === "left") return { rest: LEFT_REST, active: LEFT_ACTIVE };
  return { rest: RIGHT_REST, active: RIGHT_ACTIVE };
}

export function flipperLength(player, time) {
  const wide = time < player.wideUntil;
  return FLIPPER_LEN * (wide ? WIDE_SCALE : 1);
}

export function flipperLocalPivot(which) {
  const x = which === "left" ? -(DRAIN_HALF - 6) : DRAIN_HALF - 6;
  return { x, y: FLIPPER_INSET };
}

export function flipperEndpoints(player, which, time) {
  const pivotL = flipperLocalPivot(which);
  const angle = which === "left" ? player.leftAngle : player.rightAngle;
  const length = flipperLength(player, time);
  const tipL = {
    x: pivotL.x + Math.cos(angle) * length,
    y: pivotL.y + Math.sin(angle) * length,
  };
  return {
    pivot: localToWorld(player.side, pivotL.x, pivotL.y),
    tip: localToWorld(player.side, tipL.x, tipL.y),
    angle,
    length,
  };
}

/** Velocity of a point at fraction t (0 pivot → 1 tip) for a local angular rate. */
export function flipperPointVelocity(player, which, tAlong, omega, length) {
  const angle = which === "left" ? player.leftAngle : player.rightAngle;
  const basis = BASIS[player.side];
  const tx = -basis.right.x * Math.sin(angle) + basis.inward.x * Math.cos(angle);
  const ty = -basis.right.y * Math.sin(angle) + basis.inward.y * Math.cos(angle);
  const speed = omega * tAlong * length;
  return { x: tx * speed, y: ty * speed };
}

export function tangentCoord(side, x, y) {
  if (side === "south" || side === "north") return x;
  return y;
}

export function inDrainGap(side, x, y) {
  return Math.abs(tangentCoord(side, x, y) - CENTER) <= DRAIN_HALF;
}

export function createSolids() {
  const c = CENTER;
  return {
    bumpers: [
      { x: c, y: c - 160, r: BUMPER_R },
      { x: c + 160, y: c, r: BUMPER_R },
      { x: c, y: c + 160, r: BUMPER_R },
      { x: c - 160, y: c, r: BUMPER_R },
    ],
    targets: [
      { x: c - 112, y: c - 112, r: TARGET_R, cool: 0 },
      { x: c + 112, y: c - 112, r: TARGET_R, cool: 0 },
      { x: c + 112, y: c + 112, r: TARGET_R, cool: 0 },
      { x: c - 112, y: c + 112, r: TARGET_R, cool: 0 },
    ],
    spinner: {
      x: c,
      y: c,
      len: SPINNER_LEN,
      r: SPINNER_R,
      angle: 0,
      omega: SPINNER_OMEGA,
    },
  };
}

export function resetSolids(solids) {
  for (const target of solids.targets) target.cool = 0;
  solids.spinner.angle = 0;
}

export function sideOf(index) {
  return SIDES[index];
}

export const LAYOUT = {
  ambientBalls: AMBIENT_BALLS,
};
