# Supabase backend deployment

The production API runs in the Supabase Edge Function `roomie-api`. Netlify serves the React frontend only. The FastAPI app under `backend/` remains available for local development; it is not part of production hosting.

## One-time Supabase setup

1. In the Supabase dashboard, sign in to the project `dtwvvcfqokatlaikhlnm`. The frontend is configured for `https://dtwvvcfqokatlaikhlnm.supabase.co`.
2. Apply the database migration. From a logged-in Supabase CLI, run `supabase link --project-ref dtwvvcfqokatlaikhlnm` and `supabase db push`. Or run `supabase/add_roomie_auth_tables.sql` in **SQL Editor**. This creates the custom Roomie account and session tables; existing `rooms` tables are still used for saved rooms.
3. Deploy with `supabase functions deploy roomie-api --no-verify-jwt`. The CLI links this to the project above. The function validates Roomie's own session tokens on protected routes.
4. Add `OPENAI_API_KEY` and `GROQ_API_KEY` as Edge Function secrets in **Edge Functions → Secrets**. Supabase injects the project URL and secret database key into Edge Functions; do not put a service-role/secret key in the frontend.
5. Set Netlify environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, then trigger a frontend deploy.

After deployment, verify `https://dtwvvcfqokatlaikhlnm.supabase.co/functions/v1/roomie-api/health`; it should return JSON with `status: "ok"`. Then reload the Netlify site.

## Runtime notes

Supabase Edge Functions run TypeScript/Deno, so the production API is implemented in `supabase/functions/roomie-api/index.ts`. Roomie object segmentation runs in the browser using its existing lightweight segmentation utilities; PyTorch/YOLO models cannot fit the hosted Edge Function runtime limits. AI image requests still require a separately billed OpenAI API account. The Supabase Free plan has request, storage, and compute limits and may pause inactive projects; confirm current limits in the Supabase dashboard before launch.

For local development, omit `VITE_API_URL` and the frontend uses `http://localhost:8000` when running in development mode.
