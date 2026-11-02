export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function len(x, y) {
  return Math.hypot(x, y);
}

export function closestOnSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby || 1;
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return { x: ax + abx * t, y: ay + aby * t, t };
}

export function approach(current, target, maxDelta) {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}
