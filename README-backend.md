Buuzzer.io Backend (Node + Express + MongoDB)
=============================================

1. Install dependencies

    cd backend
    npm install

2. Configure environment

Create a `.env` file in `backend/` with the following values (never commit `.env`):

    PORT=4000
    MONGO_URI=mongodb://127.0.0.1:27017/buuzzer_dev
    JWT_SECRET=change-me
    ADMIN_RESET_KEY=888777
    OPENAI_API_KEY=...
    GEMINI_API_KEY=...
    DEEPSEEK_API_KEY=...
    DEEPGRAM_API_KEY=...

For your local development you can point `MONGO_URI` at your own Mongo instance, e.g. `mongodb://127.0.0.1:27017/buuzzer_dev`. When handing the project to the client simply swap that value for their Atlas string (`mongodb+srv://USERNAME:PASSWORD@client-cluster.mongodb.net/buuzzer_prod`). No code changes are required because the backend always reads the URI from `process.env.MONGO_URI` and fails fast with a clear error if it is missing.

3. Seed the admin user

    npm run seed:admin

This will create a default admin account (`loginId: admin`, password `admin123`) if one does not already exist. Use the admin reset screen (triggered by the `0000000` backdoor) to replace the credentials from the UI — the backend stores the updated loginId/password securely and rejects the old ones.

The admin dashboard also exposes the support contact number (stored in `AdminSettings.supportPhone`). The landing page and contact support form read it from `/api/config/support-contact`, so any updates made via the dashboard appear immediately for end users.

4. Run

    npm run dev
