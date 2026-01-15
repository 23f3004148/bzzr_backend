# Buuzzer

Buuzzer is a real‑time AI-powered interview assistant that lets mentors schedule, edit, and run live coaching sessions while learners follow the transcript with AI hints and transcript downloads.

## Highlights

- Mentor dashboard to create and manage meetings (with reschedule/edit support while pending approval).  
- Learner view that joins a session via a meeting key and reads live transcription.  
- Admin console for scheduling, approvals/rejections, viewing history, and API key management.  
- Deepgram-based WebRTC transcription plus PDF download/export capabilities.

## Tech stack

- **Frontend:** Vite + React + Tailwind CSS, single repo under `/components` for UI.  
- **Backend:** Express + MongoDB (Mongoose) under `/backend`.  
- **Realtime:** Socket.IO for transcript + meeting updates, Deepgram for speech-to-text, admin APIs for control.

## Requirements

- Node.js (>=18)  
- MongoDB – connection string configured via backend `.env`.  
- Deepgram API key (set via admin dashboard to enable live transcription).  
- Gemini/OpenAI/DeepSeek keys (optional) when using the Interview AI session flows.

## Getting started

1. **Install dependencies:**
   ```bash
   npm install
   cd backend
   npm install
   ```

2. **Configure environment:**
   - Root `.env.local` stores Vite client variables (API base URL, e.g. `VITE_API_BASE=http://localhost:4000`).  
   - `/backend/.env` must include MongoDB URI and admin credentials (see `backend/.env.example` if available).  
   - Use the Admin dashboard to paste Deepgram + AI provider keys before starting transcription/AI flows.

3. **Run backend:**
   ```bash
   cd backend
   npm run dev
   ```

4. **Run frontend:**
   ```bash
   npm run dev
   ```

   Open `http://localhost:5173` (or Vite’s printed URL).

## Folder structure

- `/components`: React UI for landing, dashboards, meeting transcript screens.  
- `/services`: shared API client for interviews, meetings, admin endpoints.  
- `/backend`: Express server with routes for auth, meetings, interviews, admin controls, Deepgram key proxy, etc.  
- `/backend/src/models`, `/routes`, `/middleware`: organized by domain for clarity.
- `/backend/src/controllers`: request/response adapters that call the service layer.  
- `/backend/src/services`: business logic shared across routes (auth, admin, config, etc.).  
- `/backend/src/repositories`: trusted Mongoose accessors so controllers/services stay focused on flow rather than queries.

## Common workflows

- **Mentor meeting lifecycle:** Mentor creates meeting → Admin approves/rejects via `/admin` dashboard → Mentor edits while pending (technology, student name, time) → Live transcription with Deepgram once the session starts → Mentor marks complete.  
- **Learner access:** Learner enters meeting key (uppercase) to join transcript/AI hints.  
- **Admin actions:** Approve/reject meetings, delete records, export logs, and configure API keys (OpenAI/Gemini/DeepSeek/Deepgram).

## Testing & validation

- No automated tests bundled yet.  
- Manual smoke tests:
  1. Start backend + frontend, create mentor meeting, approve it via admin, ensure mentor can launch session.  
  2. Join from learner to verify transcript streaming.  
  3. Download transcript, export PDFs/CSVs, and confirm status updates are broadcast.

## Troubleshooting

- “Deepgram key not available” – paste key from Admin Settings before launching transcription.  
- “Meeting pending admin approval” – mentors cannot start/completed until admin approves via dashboard.  
- Socket errors: confirm `VITE_API_BASE` points to backend running in the same origin or adjust CORS.

## Next steps

- Add backend unit/integration tests around meeting status transitions (approved vs pending).  
- Expand documentation for deployment (Docker, PM2, etc.).  
- Improve UX with notifications for status changes and transcript availability.
