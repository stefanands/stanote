# Changelog

All notable changes to Stanote are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## \[1.2.0] — 2026-07-15

### Added

* "Ask Claude": the terminal panel can switch to an in-app conversation with
  Claude (headless `claude` CLI, streaming answers, continued sessions, Claude
  can read and edit the files of the open folder; activity trace collapsed
  behind a chevron; always uses the best available Sonnet model).

* Find & replace in the current note (`⌘F`): floating bar with match count,
  highlighted occurrences, replace / replace all.

* Lightweight code editor for `.json` / `.yaml` files (syntax highlighting,
  line numbers, same auto-save and conflict handling as markdown, built-in
  find & replace).

* "Copy path" button in the title bar (icon flips to a check on copy) and a
  "Copy path" entry in the file tree's context menu.

* File tree: per-type icons — open/closed folder, text, image, and code
  documents.

### Changed

* Tabs now live in the title bar, next to the "stanote" wordmark (editor-left
  layout; other layouts keep them above the editor); they can be reordered by
  dragging and use the system font.

* HTML preview: relative stylesheets, images and fonts of the previewed file
  now load (served through an internal file protocol); the preview sits in a
  rounded card like the other panes.

* File tree: chevrons removed — a folder's open/closed state shows on its icon.

* Thinner line icons (stroke 1) across the whole interface.

### Fixed

* The window name shown by Mission Control / App Exposé is now "Stanote"
  (was still "StanCode").

## \[1.1.0] — 2026-07-11

### Changed

* Refreshed, flat "floating" interface: solid background, file tree and terminal
  as rounded cards, borderless floating editor.

* Minimal underlined tabs in JetBrains Mono; the "stanote" wordmark now uses
  JetBrains Mono too. The rest of the UI stays on the system font.

* Light and dark themes reworked to match the new look.

## \[1.0.2] — 2026-07-11

### Added

* Drag and drop a file or folder onto another folder to move it (the tree stays
  alphabetically sorted).

* Drop a folder (or file) from Finder onto the window to open it.

* New note (`⌘N`): write first, choose where to save later ("Save As"), even
  with no folder open.

* Spelling suggestions in the editor's right-click menu (with "Add to
  Dictionary"), alongside cut/copy/paste.

* New files default to the `.md` extension when none is given.

### Changed

* Rename now happens **in place** in the tree (no more dialog at the top), and
  can be triggered by double-clicking an item.

## \[1.0.1] — 2026-07-10

### Fixed

* Editor no longer loses focus / jumps to the top while reading or typing in
  longer notes (auto-save no longer triggers a spurious reload; disk sync now
  compares content instead of relying on a timing window).

* Opening a note no longer marks it dirty from initial formatting normalization.

### Added

* Rename a file/folder from the tree with **F2** or **Enter** (Finder-style).

* Slightly more breathing room between file-tree items.

## \[1.0.0] — 2026-07-10

First public release.

### Added

* WYSIWYG markdown editor (Milkdown) with slash commands, tabs, and auto-save.

* Integrated terminal (xterm.js + node-pty) opened in the current folder.

* Silent disk-sync of open files, with a conflict banner for unsaved edits.

* File browser: tree, create / rename / delete, "Reveal in Finder".

* Full-text search (ripgrep) and quick-open (`⌘P`).

* Three layouts (editor left, editor right, sidebar) and multi-window support.

* Open `.md` files from Finder (file association).

* Built-in viewer for PDF, image, and HTML files.

* Export the current note to a formatted PDF.

* Light (warm white) and dark themes; selectable font pairings.

* Bilingual interface and menus (French / English).

