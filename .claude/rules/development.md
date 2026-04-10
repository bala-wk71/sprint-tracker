# Development Rules

## Iterative Development with Playwright MCP
- After building each feature, verify it visually using Playwright MCP
- Navigate to the page, take screenshots, interact with forms
- Fix visual/functional issues before moving to the next feature
- This creates a tight build-verify-fix loop

## Supabase
- Never expose the service role key in client-side code
- Always use the anon key + RLS for client access
- Migration files are numbered sequentially: 001_, 002_, etc.
- Generate types after schema changes: `npx supabase gen types typescript`

## Components
- Use shadcn/ui components from `components/ui/` as base building blocks
- Keep domain components in their own directories (sprint/, daily/, dashboard/)
- Server Components by default; add 'use client' only for interactivity
- Colocate hooks near their consumers in `lib/hooks/`

## Security
- All data access goes through RLS policies
- Private entries (is_private, reflection_private, gratitude_private) must be filtered for reviewers
- Invite tokens must be validated: not expired, not already used, correct email
- Never trust client-side role checks alone
