# Contributing to Stanote

Thanks for your interest in improving Stanote! This is a small, focused project — contributions of all sizes are welcome.

## Ways to contribute

- **Report a bug** — open an issue with steps to reproduce, your macOS version, and what you expected.
- **Suggest a feature** — open an issue describing the problem it solves (not just the solution).
- **Send a pull request** — for fixes and small improvements. For larger changes, please open an issue first so we can agree on the direction before you invest time.

## Development setup

Requirements: Node.js 20+, npm, and Xcode Command Line Tools (for the native `node-pty` module).

```bash
npm install        # installs deps and rebuilds node-pty for Electron
npm run dev        # launch the app with hot reload
```

Before opening a PR, make sure the project type-checks and builds:

```bash
npx tsc --noEmit   # type check
npm run dist:mac   # optional: verify a production build
```

## Project layout

```
src/main/      Main process: window, menus, node-pty, fs + chokidar, ripgrep, PDF export
src/preload/   Secure bridge between the main process and the renderer
src/renderer/  React interface: App, components/, stores/ (zustand), styles/, i18n
src/shared/    Types shared between main and renderer
assets/        README screenshots and presentation assets
build/         App icon (icon.png / icon.icns)
docs/          Changelog and contributor documentation
```

## Conventions

- **TypeScript everywhere**, strict mode. Keep `npx tsc --noEmit` clean.
- **Bilingual UI**: never hard-code user-facing strings in components. Add them to `src/renderer/i18n.ts` (renderer) or the label dictionary in `src/main/menu.ts` (app menu).
- **Theming**: use the CSS variables in `src/renderer/styles/index.css` — no hard-coded colors in components.
- Match the style and structure of the surrounding code.

## Commit & PR

- Keep pull requests focused; one topic per PR.
- Describe what changed and why, and how you verified it.
- Link the related issue if there is one.

By contributing, you agree that your contributions are licensed under the [MIT License](../LICENSE).
