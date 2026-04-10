# Sprint Excellence Tracker

## Project Overview
A multi-tenant web app for weekly sprint planning and productivity tracking with accountability partner (reviewer) support. Replaces an Excel-based workflow.

## Tech Stack
- **Framework**: Next.js 14 (App Router) + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **Charts**: Recharts
- **Forms**: React Hook Form + Zod validation
- **Dates**: date-fns
- **Theme**: next-themes (system auto dark/light)
- **Hosting**: Vercel (frontend) + Supabase (backend), free tier

## Project Structure
```
sprint-tracker/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Auth pages (login, invite, callback)
│   ├── (app)/             # Authenticated pages (dashboard, sprint, daily, etc.)
│   └── api/               # API routes (invites, export)
├── components/
│   ├── ui/                # shadcn/ui base components
│   ├── layout/            # Sidebar, Header, Nav
│   ├── sprint/            # Sprint setup & detail components
│   ├── daily/             # Daily logging components
│   ├── dashboard/         # Dashboard widgets
│   └── shared/            # Reusable components
├── lib/
│   ├── supabase/          # Supabase clients (browser, server, middleware)
│   ├── hooks/             # Custom React hooks
│   ├── utils.ts           # Utility functions
│   └── constants.ts       # Enums, moods, categories, colors
├── supabase/
│   └── migrations/        # SQL migration files (ordered 001_, 002_, etc.)
└── .claude/               # Claude Code configuration
```

## Development Commands
```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
```

## Key Patterns

### Authentication
- Google OAuth via Supabase Auth
- Middleware refreshes sessions on every request
- `(app)/layout.tsx` guards authenticated routes
- User profile synced from auth.users via DB trigger

### Data Access
- Server Components fetch data via Supabase server client
- Client Components use Supabase browser client for mutations
- All tables have Row Level Security (RLS) policies
- Privacy: some fields (notes, reflections, gratitude) can be marked private

### Roles
- **Owner**: tracks their own sprints, invites reviewers
- **Reviewer**: read-only access to an owner's data (private entries hidden)
- A user can be both owner AND reviewer for different people

### Signal/Noise Task Categories
- Strong Signal (green) - High value + clear path
- Weak Signal (yellow) - Valuable but unclear
- Strong Noise (red) - Clear but low value
- Weak Noise (purple) - Low value + unclear
- Personal (blue) - Life essentials

### Theme Colors (GitHub Dark)
- Background: #0D1117 / #161B22 / #21262D
- Text: #E6EDF3 / #8B949E
- Border: #30363D

## Code Conventions
- Use TypeScript strict mode
- Prefer Server Components; use `'use client'` only when needed
- Component files: PascalCase (e.g., `SprintSetup.tsx`)
- Utility files: camelCase (e.g., `formatDate.ts`)
- Database types are generated from Supabase schema
- Use Zod schemas for form validation
- Keep components focused - extract when a file exceeds ~200 lines
