# AGENTS.md

Guidance for AI agents working in this repository. Read the [README](README.md)
first for the project overview, architecture, data contract, repository layout,
and build/test commands — this file only adds the rules for making changes.

## Conventions & invariants (do not regress)

- The backend and its `/-/api/fs/*` JSON contract are the API boundary; the
  frontend decides how to render and is responsible for sanitizing.
- Markdown HTML always passes through `DOMPurify.sanitize`; links are limited to
  safe protocols; only sanitized/escaped HTML is ever put into
  `dangerouslySetInnerHTML`. Render mode comes from the backend, never from the
  file extension alone.
- No CDN, external fonts, or network calls beyond `/-/api/fs/*` and `/-/raw/*`;
  everything is bundled by Vite. Keep the backend CSP intact.
- Preact JSX uses `class=` (not `className`). Light theme only (CSS custom
  properties are structured so a dark theme can be added later).
- Follow TDD: add or adjust tests with each change, and keep `task test` and
  `task typecheck` green before committing. Verify UI changes against a running
  build, not just tests.
- `task build` overwrites the tracked minimal
  `backend/internal/assets/web/index.html`; restore it with `task restore-web`
  before committing, and never stage `web/assets/`.

## Commit messages

Every AI-assisted commit ends with a `Co-Authored-By` trailer identifying the
model that produced it, on its own line after a blank line:

- Claude: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- GPT: `Co-Authored-By: GPT-5.5 <noreply@openai.com>`

Use your **actual** model name — the specific model you are running as, not a
copied example. Include only the model name; do not add extra descriptors such
as context-window size (e.g. write `Claude Opus 4.8`, not
`Claude Opus 4.8 (1M context)`).

The history was normalized so the initial commit is attributed to GPT and every
later commit to Claude; keep adding the appropriate trailer to new commits.
