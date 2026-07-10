# Changelog

All notable changes to Stanote are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] — 2026-07-10

### Fixed

- Editor no longer loses focus / jumps to the top while reading or typing in
  longer notes (auto-save no longer triggers a spurious reload; disk sync now
  compares content instead of relying on a timing window).
- Opening a note no longer marks it dirty from initial formatting normalization.

### Added

- Rename a file/folder from the tree with **F2** or **Enter** (Finder-style).
- Slightly more breathing room between file-tree items.

## [1.0.0] — 2026-07-10

First public release.

### Added

- WYSIWYG markdown editor (Milkdown) with slash commands, tabs, and auto-save.
- Integrated terminal (xterm.js + node-pty) opened in the current folder.
- Silent disk-sync of open files, with a conflict banner for unsaved edits.
- File browser: tree, create / rename / delete, "Reveal in Finder".
- Full-text search (ripgrep) and quick-open (`⌘P`).
- Three layouts (editor left, editor right, sidebar) and multi-window support.
- Open `.md` files from Finder (file association).
- Built-in viewer for PDF, image, and HTML files.
- Export the current note to a formatted PDF.
- Light (warm white) and dark themes; selectable font pairings.
- Bilingual interface and menus (French / English).
