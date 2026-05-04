// Find a free spot near (preferredX, preferredY) that doesn't overlap any of
// the existing AABB rects. Spiral search outward in increasing radii.

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

export function findFreeSpot(
  preferred: { x: number; y: number },
  size: { w: number; h: number },
  existing: Rect[],
  step = 24,
  maxIter = 400,
): { x: number; y: number } {
  const candidate: Rect = { x: preferred.x, y: preferred.y, w: size.w, h: size.h };
  if (!existing.some((r) => overlaps(candidate, r))) return preferred;

  // Spiral: right, down, left, up, growing arms.
  let x = preferred.x;
  let y = preferred.y;
  let dirX = 1;
  let dirY = 0;
  let armLen = 1;
  let stepsThisArm = 0;
  let armsAtThisLen = 0;

  for (let i = 0; i < maxIter; i++) {
    x += dirX * step;
    y += dirY * step;
    stepsThisArm++;
    candidate.x = x;
    candidate.y = y;
    if (!existing.some((r) => overlaps(candidate, r))) {
      return { x, y };
    }
    if (stepsThisArm >= armLen) {
      stepsThisArm = 0;
      // Rotate 90° clockwise: (dx, dy) -> (-dy, dx)
      const nx = -dirY;
      const ny = dirX;
      dirX = nx;
      dirY = ny;
      armsAtThisLen++;
      if (armsAtThisLen === 2) {
        armsAtThisLen = 0;
        armLen++;
      }
    }
  }

  return preferred;
}
