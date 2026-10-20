# ChatWave — Private Messaging

A responsive Next.js frontend with a Supabase backend integration. It opens in demo mode if Supabase environment variables are not configured. Demo messages are local to the current browser session and are not delivered to other users.

## Requirements

- Node.js 18.17+ (Node 20 LTS recommended)
- A Supabase project for real accounts and messaging

## Run the frontend

1. Extract this ZIP.
2. Open a terminal in the project directory.
3. Run `npm install`.
4. Copy `.env.local.example` to `.env.local`.
5. For preview mode, leave the example values as-is. For real messaging, replace them with your Supabase Project URL and publishable/anon key.
6. Run `npm run dev`.
7. Open `http://localhost:3000`.

## Connect the real backend

1. Create a project at https://supabase.com/.
2. In the Supabase dashboard, open **SQL Editor**.
3. Run the complete contents of `supabase/schema.sql`.
4. In **Project Settings → API** (or **Connect**), copy the Project URL and publishable/anon key into `.env.local`.
5. In **Authentication → URL Configuration**, add your local URL (`http://localhost:3000`) and the production URL once deployed. Configure email confirmation and password policies to your requirements.
6. Restart the Next.js development server after editing `.env.local`.
7. Sign up two separate test accounts in separate browser profiles. Each account gets a profile record automatically.
8. Find the other user's username using the People search / New conversation (`+`) box, then start a conversation. Messages should arrive through Supabase Realtime.

New accounts receive a username based on their name/email plus a short suffix, such as `maya_12ab34`. For the first test, use the username shown in the `profiles` table in Supabase. Keep usernames unique.

## Deploy

Deploy the project to Vercel or another Node-compatible host:
1. Push the project to a private Git repository.
2. Import the repository into Vercel.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to project environment variables.
4. Deploy and add your production domain to Supabase Auth URL configuration.

## Security notes

- Never put a Supabase `service_role` key in a browser/client environment.
- The SQL enables Row Level Security on the message/conversation tables. Review policies carefully before production use.
- The sample profile policy allows signed-in users to search/view profiles. If your app needs more privacy, restrict profile fields and add contact/request rules.
- This starter does **not** implement end-to-end encryption, read receipts, typing indicators, file uploads, spam controls, blocking, reporting, or rate limiting.
- The direct-conversation RPC is idempotent for ordinary use, but if you need robust high-concurrency creation, add a dedicated uniqueness strategy/transactional locking.
- Before public launch, test with two accounts and verify that one account cannot read another conversation by querying the Supabase API directly.
- Consider adding email verification, abuse reporting, rate limiting, backups, monitoring, and a privacy policy before production.

## Stack

- Next.js + React + TypeScript
- Supabase Auth
- Supabase Postgres + Row Level Security
- Supabase Realtime
- Lucide icons
