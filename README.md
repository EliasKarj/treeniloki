# Treeniloki

Client-side running tools. **GPX workout analyzer** + Sports Tracker export script.

## Analyzer

Drag GPX files into the page → a dark topographic instrument dashboard: summary stats,
break-aware trends, and science-backed injury-spike / training-load / comeback insights.
100% client-side, no build, no dependencies.

**Run locally:** serve the folder over http (ES modules need it), e.g. `python -m http.server 8000`, then open <http://localhost:8000/>.

**Test:** `npm test` (node:test over `test/`).

Deployed to GitHub Pages via `.github/workflows/ci.yml` on push to `main`.

## License

2026 EliasKarj. See [LICENSE](./LICENSE).
