Dash Auto - Scaffolding (updated)

Stack
- Backend: FastAPI (Python)
- DB: PostgreSQL (docker-compose) or local SQLite fallback
- Frontend: Next.js (React)
- AI: optional OpenAI integration via OPENAI_API_KEY

What was created
- backend/: FastAPI app (models, crud, auth, AI agent, stats)
- frontend/: minimal Next.js app (pages for dashboard, vehicles, AI)
- docker-compose.yml: postgres + backend
- uploads/: backend file storage (served at /uploads)
- seed_data.py + run_seed.py to populate example vehicles

Quickstart (dev)
1. Copy .env.example to .env and set values (OPENAI_API_KEY optional, JWT_SECRET recommended)
2. From project root run:
   docker-compose up --build
   This starts Postgres and the backend service on port 8000. The backend will use DATABASE_URL from env.
3. Seed data (inside backend container or locally):
   - Locally: python backend/run_seed.py
   - In container: docker-compose exec backend python run_seed.py
4. Frontend: go to frontend/, run `npm install` then `npm run dev` (port 3000). The frontend calls backend endpoints at /api/* during development; set FRONTEND_URL env in .env for CORS.

Notes & next steps
- Authentication endpoints implemented (register/login) with JWT.
- AI agent endpoint /ai/query returns a local analysis and calls OpenAI if OPENAI_API_KEY is set.
- File uploads store files in backend/uploads and serve them at /uploads/{filename}.
- Recommended: add Alembic for migrations, secure JWT secret, enable HTTPS in production, and configure object storage (S3/Supabase) for file durability.
