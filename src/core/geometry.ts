export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getCenter(rect: Rect): Point {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

/**
 * Calculates the intersection point of a line segment from the center of rectA to the center of rectB,
 * with the boundary of rectA.
 */
export function getBoundaryIntersection(rectA: Rect, rectB: Rect): Point {
  const centerA = getCenter(rectA);
  const centerB = getCenter(rectB);

  const dx = centerB.x - centerA.x;
  const dy = centerB.y - centerA.y;

  if (dx === 0 && dy === 0) {
    return centerA; // Same center
  }

  // Ray from centerA to centerB: P(t) = centerA + t * D
  // The boundary of rectA consists of 4 lines:
  // x = rectA.x, x = rectA.x + rectA.width
  // y = rectA.y, y = rectA.y + rectA.height

  let tMin = Infinity;
  let intersectionX = centerA.x;
  let intersectionY = centerA.y;

  // Check left and right boundaries
  if (dx !== 0) {
    const tLeft = (rectA.x - centerA.x) / dx;
    if (tLeft > 0 && tLeft < tMin) {
      const yIntersect = centerA.y + tLeft * dy;
      if (yIntersect >= rectA.y && yIntersect <= rectA.y + rectA.height) {
        tMin = tLeft;
        intersectionX = rectA.x;
        intersectionY = yIntersect;
      }
    }
    const tRight = (rectA.x + rectA.width - centerA.x) / dx;
    if (tRight > 0 && tRight < tMin) {
      const yIntersect = centerA.y + tRight * dy;
      if (yIntersect >= rectA.y && yIntersect <= rectA.y + rectA.height) {
        tMin = tRight;
        intersectionX = rectA.x + rectA.width;
        intersectionY = yIntersect;
      }
    }
  }

  // Check top and bottom boundaries
  if (dy !== 0) {
    const tTop = (rectA.y - centerA.y) / dy;
    if (tTop > 0 && tTop < tMin) {
      const xIntersect = centerA.x + tTop * dx;
      if (xIntersect >= rectA.x && xIntersect <= rectA.x + rectA.width) {
        tMin = tTop;
        intersectionX = xIntersect;
        intersectionY = rectA.y;
      }
    }
    const tBottom = (rectA.y + rectA.height - centerA.y) / dy;
    if (tBottom > 0 && tBottom < tMin) {
      const xIntersect = centerA.x + tBottom * dx;
      if (xIntersect >= rectA.x && xIntersect <= rectA.x + rectA.width) {
        tMin = tBottom;
        intersectionX = xIntersect;
        intersectionY = rectA.y + rectA.height;
      }
    }
  }

  if (tMin === Infinity) {
    // If centers overlap or rectB is entirely inside rectA, fallback to centerA
    return centerA;
  }

  return { x: intersectionX, y: intersectionY };
}
