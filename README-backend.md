Buuzzer.io Backend (Node + Express + MongoDB)
=============================================

1) Install dependencies

    npm install

2) Configure environment

- Copy `.env.example` to `.env` (or set the same vars in Railway).
- Required for production:
  - `MONGO_URI` (Atlas or self-hosted Mongo connection string)
  - `JWT_SECRET` (long random string)
  - `FRONTEND_URL=https://bzzr.vercel.app`
  - `FRONTEND_ORIGIN=https://bzzr.vercel.app` (or `CORS_ALLOWED_ORIGINS=...`)
  - `ADMIN_EMAIL` and `ADMIN_PASSWORD` for the bootstrap admin
  - Optional: `ADMIN_FORCE_UPDATE=true` if you want the bootstrap credentials to overwrite an existing admin.
- Optional keys: Razorpay, AI providers (OpenAI/Gemini/Deepseek), Deepgram, Google login, SMTP.

3) Seed the admin user (first deploy)

    npm run seed:admin

Use `npm run seed:admin -- --force` if you need to reset the existing admin to the credentials in `.env`.

4) Run locally

    npm run dev

You need a running Mongo instance reachable at `MONGO_URI`.

5) Deploy to Railway

- Start command: `npm start`
- Make sure the environment variables above are set (especially `FRONTEND_URL` and `CORS_ALLOWED_ORIGINS`).
- If you need persistent uploads, add a volume for the `uploads/` directory; otherwise uploads will be ephemeral across deploys.
