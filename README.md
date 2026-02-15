# Shrubbi

Shrubbi is a mobile app that helps people track plants, estimate carbon impact, and engage with local climate communities.

## Project Highlights

- Plant tracking with per-user plant inventory
- CO2 estimation based on plant defaults and optional user overrides
- Community features:
  - Team leaderboard
  - City leaderboard
  - People leaderboard
- Events and social features (teams, chat, community interactions)
- Supabase-backed auth, data, and row-level security

## Tech Stack

- Expo + React Native + TypeScript
- Supabase (Auth, Postgres, Storage, Realtime)
- Expo Router

## Quick Start

### 1. Prerequisites

- Node.js 20+
- npm
- Supabase CLI
- Expo CLI tooling (via `npx expo ...`)

### 2. Install

```bash
npm install
```

### 3. Environment

Create `.env` from `.env.example` and provide:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_KEY`
- `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`
- `SUPABASE_ACCESS_TOKEN` (for CLI workflows)

### 4. Run

```bash
npm run start
```

Platform-specific:

```bash
npm run android
npm run ios
```

## Database and Supabase Workflow

Useful scripts from `package.json`:

```bash
npm run supabase:link
npm run supabase:db:pull
npm run supabase:db:push
npm run supabase:migration:new -- <name>
npm run supabase:types
npm run supabase:sync
```

Notes:

- Keep schema changes in migrations.
- Regenerate `supabase/database.types.ts` after schema updates.
- Use linked project workflows during hackathon unless explicitly testing local DB.

## Repository Layout

```text
app/            Expo Router app screens
components/     Shared UI components
hooks/          Reusable hooks
lib/            App logic utilities
supabase/       Migrations, functions, schema, generated DB types
assets/         Images and static app assets
```
