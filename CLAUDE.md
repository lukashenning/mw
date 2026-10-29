# CLAUDE.md

Guidance for Claude Code working in this repo.

## What this is

**MWengine** ("Muriels Wald" engine) — a text-based, choice-driven adventure game engine,
originally built in Figma Make and ported here to be fully self-hosted (no Figma servers).
It runs games written in a small declarative scripting language.

- The entire engine is one big React component: `src/app/App.tsx` (~6k lines). It parses game
  scripts and runs the interactive UI.
- Games are authored as `.txt` script files (+ PNG assets), loaded into the app via ZIP/folder
  upload. The script language is documented in **`mw_engine.md` — read it before touching any
  parsing/game logic or writing any game script.** It is code-verified against `App.tsx`.

## Tech stack

React 18 + TypeScript, built with **Vite 6**. Styling via Tailwind CSS v4 + Radix UI. Other
notable deps: react-dnd (drag-drop inventory), motion (animations), jszip (game upload),
recharts. No test suite.

## Commands

```bash
npm install      # first-time setup (node_modules is gitignored)
npm run dev      # dev server at http://localhost:5173/  (prefer the IDE preview tooling)
npm run build    # production build → dist/
```

## Deployment — IMPORTANT, it's manual

GitHub Pages serves **https://lukashenning.github.io/mw/** from the **`gh-pages` branch**
(built output at its root), *not* from `main`. `main` holds source only.

To redeploy: `npm run build`, then publish the contents of `dist/` to the root of the
`gh-pages` branch (e.g. via a `git worktree` on `gh-pages`, copy `dist/*` in, commit, push).
There is intentionally **no** GitHub Actions workflow — the in-app git integration can't push
`.github/workflows/` (needs a token with `workflow` scope). If adding CI deploy, commit the
workflow from a real terminal.

### Vite base path gotcha
`vite.config.ts` sets `base` to `/mw/` in production (for the Pages subpath) and `/` in dev.
If you rename the GitHub repo, update that `/mw/` base or the deployed site loads blank.

## Repo hygiene notes

- `main` has some vestigial build cruft from early Pages setup (a root `assets/` folder and a
  tracked `dist/index.html`). Not source — ignore, and don't let it mislead you.
- Known-fragile area: the game script parser had invalid regexes (`[+\-%]` → `[+%-]`) that had
  to be fixed to build. If the build dies on "Range out of order in character class", look
  there.

## Conventions

- This is a personal project; commit directly to `main` for source changes, deploy to
  `gh-pages` separately (see above).
- Keep the ported engine behavior identical to the original unless asked — it's a faithful
  self-host, not a rewrite.
