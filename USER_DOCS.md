Dash Auto - Guide utilisateur (résumé)

API endpoints (backend):
- GET /health - check
- POST /auth/register?email=...&password=... - register user
- POST /auth/login?email=...&password=... - login user
- POST /vehicles - create vehicle (JSON body matching VehicleCreate)
- GET /vehicles - list vehicles
- GET /vehicles/{id} - get vehicle
- POST /charges - create charge
- GET /charges - list charges
- POST /documents/upload?vehicle_id=ID - multipart file upload
- GET /stats - KPIs summary
- POST /ai/query - body {"query": "..."} returns AI analysis (requires OPENAI_API_KEY)

Front-end
- In /frontend run `npm install` then `npm run dev` to start Next.js (port 3000)
- The frontend calls backend at relative paths. In production, set FRONTEND_URL in backend env for CORS.

AI agent
- Set OPENAI_API_KEY in environment to enable OpenAI-powered answers. Without it, agent returns local-analysis only and explains that external data was not fetched.

Data and uploads
- Uploaded files are stored in backend/uploads and served at /uploads/{filename}

Seed data
- Run `python run_seed.py` inside backend to populate example vehicles.
