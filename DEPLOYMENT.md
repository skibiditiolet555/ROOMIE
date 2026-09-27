# Production deployment

The Netlify site builds only `frontend/`; it does not run the FastAPI app. The Netlify rules proxy `/api/*` and `/health` to the Render API, keeping browser requests same-origin. The default API host matches the service name in `render.yaml`.

1. In Render, create a new Blueprint from this repository and apply `render.yaml`. The service is named `roomie555-api`; Render will provide its public URL after creation.
2. Add the required secret values to the Render service: `OPENAI_API_KEY`, `GROQ_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Keep service-role and provider keys out of the frontend.
3. Ensure the Render service's public URL is `https://roomie555-api.onrender.com`. If Render assigns a different URL, update the two proxy targets in `netlify.toml` to match and deploy the repository to Netlify.
4. Check `https://roomie555.netlify.app/health`. It should return JSON with `status: "ok"` and `openai_key_configured: true` after the Render service is live.

The Render blueprint allows the Netlify origin through CORS and persists local authentication data on a disk. The API requires a paid Render instance because it uses a persistent disk. YOLOE segmentation dependencies are included; model weights are downloaded by the service when first needed.

For local development, `VITE_API_URL` may be omitted and the frontend continues to use `http://localhost:8000`.
