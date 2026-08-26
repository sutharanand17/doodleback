## 2024-05-24 - Pre-compute inside Render Loops
**Learning:** The `render()` loop in canvas applications can be significantly slowed down by nested iterations (e.g. iterating over all comments for every node). Even if the lists are small, this O(N * C) complexity is executed constantly during pan/zoom interactions, causing jank.
**Action:** When working in tight render loops (like HTML Canvas or SVG generation in `canvas.ts`), pre-compute aggregations or mappings (like a `Map` of comment counts) before the main loop to flatten the complexity to O(N + C).
