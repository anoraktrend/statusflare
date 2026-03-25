# AGENTS.md

This file provides essential technical context for AI agents working on this repository.

## 🛠 Setup & Dev Commands

- **Package Manager:** `pnpm`
- **Install Dependencies:** `pnpm install`
- **Build Commands:**
  - `pnpm build:css` (Compiles Tailwind CSS from `src/input.css` to `public/tailwind.css`)
  - `pnpm cf-typegen` (Generates TypeScript types for Cloudflare bindings)
- **Running (Development):**
  - `pnpm dev` (Runs CSS build and Wrangler development server)
  - `pnpm start` (Alias for `wrangler dev`)
- **Deployment:**
  - `pnpm deploy` (Builds CSS and deploys to Cloudflare via Wrangler)

## 🏗 Tech Stack

- **Language:** TypeScript (`.ts`, `.tsx`)
- **Environment:** Cloudflare Workers (Serverless)
- **Rendering:** Preact (Server-Side Rendering) with `preact-render-to-string`
- **Styling:** Tailwind CSS v4 with Catppuccin theme
- **Database:** Cloudflare D1 (SQL)

## 📂 Architecture & Directory Structure

- **Entry Points:** 
  - `src/index.ts` (Handles `fetch` events for HTTP and `scheduled` events for Crons)
  - **Crons:** Configured to run every minute (`* * * * *`) for health checks via `src/services/checker.ts`.
- **Directory Structure:**
  - `src/pages/`: Preact components rendered to string for the frontend
  - `src/services/`: Core logic (e.g., health checks in `checker.ts`)
  - `src/utils/`: Shared utilities (authentication, notifications, image processing)
  - `src/components/`: Low-level UI components
- **Pattern:** Functional and declarative. Avoid stateful classes; prefer pure functions and Cloudflare D1/KV for state.

## 🗄 Database Management (Cloudflare D1)

- **Database Name:** `status_db`
- **Apply Migrations (Local):** `pnpm wrangler d1 migrations apply status_db --local`
- **Create Migration:** `pnpm wrangler d1 migrations create status_db <name>`
- **Seed Data (Local):** `pnpm wrangler d1 execute status_db --local --file=./seed.sql`

## 🔐 Secrets & Environment Variables

- **Local Development:** Store secrets in `.dev.vars` in the root (do not commit this file).
- **Production Secrets:** Set via `pnpm wrangler secret put <KEY>`.
- **Static Vars:** Defined in `wrangler.jsonc`.

## 🧪 Testing

- **Test Runner:** `vitest`
- **Test Command:** `pnpm test`
- **Environment:** Uses `@cloudflare/vitest-pool-workers` for worker simulation.
- **Mandate:** All tests must pass before committing changes.

## 🎨 Code Style & Linting

- **Formatting:** Managed via Prettier (see `.prettierrc`)
  - `printWidth`: 140
  - `singleQuote`: true
  - `useTabs`: true
- **EditorConfig:** Tabs for indentation, LF line endings, final newline required.
- **TypeScript:** Strict typing is preferred. Use `worker-configuration.d.ts` for binding types.

## 🌿 Git Best Practices

- **Commits:** Mandatory sign-off is required for all commits (`git commit -sS`).
- **Signature:** `Signed-off-by: [Name] <[Email]>`
- **Style:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).
- **Scope:** Atomic commits; avoid bundling unrelated changes into a single commit.
