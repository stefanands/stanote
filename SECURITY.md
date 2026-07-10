# Security Policy

## Supported versions

Stanote is under active development. Security fixes are applied to the latest
released version.

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Instead, email **bonjour@saintlemur.fr** with:

- a description of the vulnerability and its impact,
- steps to reproduce (a proof of concept if possible),
- the affected version and your environment.

You can expect an acknowledgement within a few days. Once the issue is
confirmed and fixed, we will credit you in the release notes unless you prefer
to remain anonymous.

## Scope & notes

Stanote is a local-first desktop app: it reads and writes files on your machine
and runs a shell in the integrated terminal. It does not send your notes to any
server. Loaded PDFs, images, and HTML previews are rendered locally; HTML
previews run in a sandboxed frame with scripts disabled.
