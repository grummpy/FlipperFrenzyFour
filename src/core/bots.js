import { BASIS, velToLocal, worldToLocal } from "./table.js";

/**
 * Simple keepers. They swing at balls leaving through their drain and
 * hesitate on the center seam, so shots still sneak through.
 */
export function decideBot(player, balls) {
  let left = false;
  let right = false;
  let nudgeX = 0;
  let nudgeY = 0;
  const basis = BASIS[player.side];

  for (const ball of balls) {
    const local = worldToLocal(player.side, ball.x, ball.y);
    const vel = velToLocal(player.side, ball.vx, ball.vy);
    const outward = -vel.y;
    // React late, and leave the center lane alone so balls can still escape.
    if (local.y > 170 || local.y < -4 || outward < 70) continue;

    let predictX = local.x;
    if (vel.y < -40 && local.y > 48) {
      const t = Math.min(0.16, (local.y - 48) / -vel.y);
      predictX = local.x + vel.x * t;
    }
    if (Math.abs(predictX) < 72) continue;
    if (predictX < -6) left = true;
    if (predictX > 6) right = true;

    if (local.y < 78 && Math.abs(local.x) < 36 && player.tilt < 0.42 && player.tiltLock <= 0) {
      nudgeX += basis.inward.x;
      nudgeY += basis.inward.y;
    }
  }

  const mag = Math.hypot(nudgeX, nudgeY);
  if (mag > 1) {
    nudgeX /= mag;
    nudgeY /= mag;
  }

  return { left, right, moveX: nudgeX, moveY: nudgeY };
}
