## 2024-08-26 - Improve Form and Button Accessibility
**Learning:** Missed form label association for select inputs and textarea as well as ARIA labels for icon buttons in `index.html`. Using explicit `<label for="...">` and `aria-label` is crucial for screen reader compatibility on interactive elements.
**Action:** Next time, ensure all `<select>`, `<textarea>`, and icon-only `<button>` tags include proper accessible labels or `aria-label`s.
