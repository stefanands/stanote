# Changelog

All notable changes to Stanote are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## \[1.4.0] — 2026-09-02

### Added

* Terminal tabs: open several shells in the panel, switch between them, close
  the ones you no longer need.

* Two files side by side: drag a tab onto the right half of the editor to split
  it into two resizable columns, each with its own tabs.

* Scroll position is remembered per file, so switching tabs no longer jumps back
  to the top.

### Changed

* Heading levels are now indented step by step (deeper levels dimmed), making a
  long document's structure readable at a glance.

* Tables size themselves to their content, with a distinct header row and first
  column.

### Fixed

* Double-clicking a file no longer opens two tabs for it.

* "Ask Claude" no longer waits forever when the CLI is installed but not signed
  in: the panel now checks the session on open and says what to do.

### Changed

* Find in note (`⌘F`) jumps to the first match as you type, highlights matches
  more clearly, and marks their position along the right edge of the document.

* New app icon (Stanote logo), and a clearer "new tab" pictogram on the new
  terminal and new conversation buttons.

## \[1.3.0] — 2026-07-28

### Added

* Built-in **lofi radio** in the status bar: a cassette button unfolds
  play/pause, next station, and a floating animated cover. Ad-free stations
  (Claude FM and others via YouTube, Radio Paradise streams).

* One radio for the whole app: with several windows open, the radio is shared —
  any window shows and controls the same station, and playback carries over if
  the window that was playing is closed.

* More editable file types: `.csv`, `.env`, `.ini` / `.cfg` / `.conf`, `.toml`,
  `.xml`, `.css`, `.log`, `.py` and `.php` now open in the code editor,
  alongside `.json` and `.yaml`.

* HTML files: a button (or `⌘⇧P`) toggles between the rendered preview and the
  editable source code. The preview now runs the page's JavaScript — slide
  decks and interactive pages display properly — inside an isolated frame with
  no access to the app or your files.

* Code editor assistance: fold blocks and tags, auto-close brackets and tags,
  completion for HTML tags/attributes and CSS properties, matching-tag
  highlight, JSON syntax error reporting, auto-indent with indentation guides,
  and a colour swatch with picker next to CSS colours.

### Changed

* Code blocks in notes now **wrap** instead of scrolling horizontally, and their
  text is more legible in the light theme.

* Files (`⌘⇧E`) and Terminal (`⌘J`) are now entries in the View menu.

* Status bar: the active file path moved to the left.

## \[1.2.1] — 2026-07-17

### Fixed

* macOS builds are now code-signed and notarized by Apple: the downloaded app
  opens without the misleading "damaged" Gatekeeper warning.

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

