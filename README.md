<div align="center">
  <img src="build/icon.png" alt="Stanote" width="120" />
  <h1>Stanote</h1>
  <p><strong>Your markdown notes, a terminal, and your files — in a single window.</strong></p>
  <p>A local-first note editor for macOS, built for people who write <em>and</em> code.</p>
</div>

---

Stanote brings together three tools you juggle all day: a WYSIWYG markdown editor, a real terminal, and a file browser. Open a project folder, write your notes with live formatting, and run your commands right beside them — without leaving the app. When a command-line tool edits an open file, the editor updates on its own. Your notes stay plain `.md` files on your disk: nothing is locked in.

## Features

- **WYSIWYG markdown editor** — live formatting (headings, bold, lists, tasks, tables, code, quotes), a `/` slash command menu, multiple tabs, and auto-save. Fully bilingual UI (French / English).
- **Integrated terminal** — a real shell (zsh) opened in your project folder. Great for running scripts or command-line assistants without switching windows.
- **Disk sync** — an open file changed on disk reloads silently; if you had unsaved edits, a banner lets you choose. Designed to live alongside tools that write to your files.
- **File browser** — folder tree, create / rename / delete, "Reveal in Finder", active-file highlight, live refresh.
- **Instant search** — full-text search across the folder (ripgrep) and quick-open a file by name (`⌘P`).
- **Three layouts & multi-window** — editor left, editor right, or sidebar — switch in one click. Open as many projects as you like in independent windows.
- **Built-in viewer** — preview PDFs, images, and HTML files without leaving your workspace.
- **PDF export** — export any note to a formatted PDF.
- **Made yours** — light (warm white) or dark theme, and a choice of font pairings (SF Pro, Didot, Futura, Optima).
- **Local-first** — your notes are plain markdown files on your machine. No cloud, no proprietary format.

## Install

Stanote ships as a desktop app. Download the latest build from the [Releases page](https://github.com/stefanands/stanote/releases) (macOS, Apple Silicon).

> The app is currently **unsigned** for personal distribution. On first launch, macOS Gatekeeper may block it — right-click the app → **Open**, then confirm. (Signed/notarized builds are supported in CI; see below.)

## Build from source

Requirements: **Node.js 20+**, **npm**, and **Xcode Command Line Tools** (for the native `node-pty` module).

```bash
git clone https://github.com/stefanands/stanote.git
cd stanote
npm install          # also rebuilds node-pty for Electron (postinstall)
npm run dev          # launch in development
npm run dist:mac     # build a .dmg into release/
```

## Tech stack

Electron · electron-vite · React · TypeScript · [Milkdown](https://milkdown.dev) (editor) · [xterm.js](https://xtermjs.org) + node-pty (terminal) · [@vscode/ripgrep](https://github.com/microsoft/vscode-ripgrep) (search) · react-resizable-panels · zustand.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md). Security issues: see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Stefana Andriason
