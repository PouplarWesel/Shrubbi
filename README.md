# Shrubbi

Shrubbi is a mobile app built for **SF Hacks 2026** under the theme **Tech for a Greener Tomorrow**.

It helps people track plants, estimate carbon impact, and engage with local climate communities through city, team, and personal leaderboards.

## Hackathon Context

- Event: **SF Hacks 2026**
- Dates: **Friday, February 13, 2026 (2:00 PM) to Sunday, February 15, 2026 (4:30 PM)**
- Venue: **Annex I, 1 N State Dr, San Francisco, CA 94132**
- Theme: **Tech for a Greener Tomorrow**

For the team: this README includes a practical summary of the SF Hacks Hacker's Handbook so contributors can quickly align on logistics, rules, and judging.

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

## SF Hacks 2026 Quick Handbook (Team Reference)

## Important Event Information

- Opening Ceremony: **Friday, Feb 13 at 3:30 PM**
- Doors closed overnight: **10:30 PM to 8:00 AM**
- Soft submission deadline: **Sunday, Feb 15 at 10:00 AM**
- Final submission deadline: **Sunday, Feb 15 at 11:00 AM**
- Judging period: **11:00 AM to 2:00 PM**
- Closing Ceremony and awards: **3:30 PM**

## Venue and Logistics

- Venue: Annex I, SFSU
- Parking: about **$10/day**
- Workshops may be capped for fire code
- Bring hacker badge and ID

Transit notes (handbook summary):

- BART to bus routes: 57 / 58 / 29 with short walk
- Muni M line to SFSU with walk

## What To Bring

- Laptop + chargers
- Any hardware for your build
- ID
- Warm clothes
- Hygiene essentials
- Reusable water bottle
- Optional sleeping setup (sleeping bag, pillow, blanket)
- Optional health and comfort items (first aid, meds, earplugs, headphones)

## Rules Summary (MLH + SF Hacks)

- Follow MLH Code of Conduct.
- Build during hackathon period.
- You may use existing ideas, open-source libs, and frameworks.
- Do not reuse prebuilt project code/materials from before the event.
- Stop major hacking at deadline; only small bug fixes after.
- Team members must actively participate.
- Organizers can disqualify for rule or conduct violations.

## Devpost Submission Checklist

- Public code repository
- Repo and demo remain public after event
- Complete all registration steps
- Submit by final deadline
- Do not include pre-hackathon work

## Judging Criteria (Equal Weight)

- Idea: fit to theme/track
- Implementation: working features and technical depth
- Design: usability and scalability
- Presentation: problem framing, decisions, challenges, communication
- Track Application: fit to selected track technology/problem

## Demos

- Live demos are strongly encouraged.
- Incomplete projects are still valid to present.
- Show what works, what was attempted, and what was learned.

## Mentoring and Community

- Use mentors for technical guidance, architecture, and pitch clarity.
- Collaborate with other teams and support beginners.
- Keep hacker spirit: learn, build, and help others.

## Code of Conduct and Reporting

Respectful behavior is mandatory across venue and online interactions.

Harassment, intimidation, discrimination, or unwelcome behavior is not tolerated.

Reporting channels from handbook:

- North America hotline: `+1 409 202 6060`
- Email: `incidents@mlh.io`

SF Hacks contact:

- `sfhacksteam@gmail.com`

## Prize Tracks (Handbook Snapshot)

SF Hacks tracks include:

- Best Beginner Hack
- Best Hardware Hack
- Best Design Hack
- Best Hack for Sustainability in Education
- Best Hack for Climate Action

MLH and sponsor tracks include technology-specific categories (Gemini, Solana, Vultr, ElevenLabs, Snowflake AI, MongoDB Atlas, .TECH, and sponsor-announced tracks).

Track details can change during event announcements. Confirm in Discord and official schedule.

## Team Operating Guidelines for This Repo

- Keep PRs focused and small.
- Prefer migration-based DB changes only.
- Run lint before shipping:

```bash
npx eslint "app/(protected)/(tabs)/index.tsx"
```

- Keep UI text and metrics consistent across tabs (especially CO2 semantics).
- If changing leaderboard logic, document metric meaning in migration comments and UI labels.

## License

MIT
