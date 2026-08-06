Dash Auto - Scaffolding\n\n1) Backend (FastAPI) + Docker\n- backend/app: FastAPI app, models, crud, schemas\n- docker-compose.yml starts Postgres + backend\n\nQuickstart (dev):\n- cd to project root\n- create .env or set DATABASE_URL if you want Postgres locally\n- docker-compose up --build\n- API available at http://localhost:8000\n\nNext steps:\n- Implement file storage (Supabase/S3)
- Add authentication
- Add migrations (alembic)
- Build frontend (Next.js) and connect to API
