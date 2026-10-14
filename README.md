# AI Trainer for Garmin

Chat with an AI coach, get a periodized training plan with the reasoning behind every session, and send the
workouts to your Garmin watch. Bring your own OpenAI, Claude or Gemini key.

## How it works

- **A single-page app (`frontend/`, React + Vite)** does the planning in your browser: the coach interview,
  the plan outline, week-by-week workout design, and reading your activity `.fit` files. Your API key and
  conversation live in `localStorage`; AI calls go straight from your browser to the provider you choose.
- **Two small stateless Python functions (`api/`, deployed on Vercel)**:
  - `POST /api/fit` turns workouts into Garmin `.fit` workout files (zip).
  - `POST /api/garmin` uploads and schedules workouts in Garmin Connect (**experimental**, unofficial).
  Neither stores anything. The Garmin login is used for that single request; only a session token is kept in
  your browser afterwards.

### Getting workouts onto the watch
1. **Download .fit** (safest): unzip and copy the files to `GARMIN/NewFiles` (or `GARMIN/Workouts`) over USB.
   Note: Garmin Connect's web "import" page only accepts finished activities, not workout files.
2. **Garmin Connect** (experimental): uploads, schedules and can push the next 7 days to your watch. Uses the
   unofficial [python-garminconnect](https://github.com/cyberjunky/python-garminconnect) library, so Garmin can
   break or block it at any time (cloud IPs are more likely to be blocked). Accounts with two-step verification
   aren't supported on the hosted site. Try a throwaway account first.

## Deploy on Vercel
Import the repo in Vercel; `vercel.json` does the rest (builds `frontend/`, serves `frontend/dist`, runs
`api/*.py` as Python functions using `requirements.txt`). No environment variables are needed.

## Local development
    uv sync                                     # Python deps (incl. dev server + tests)
    (cd frontend && npm install && npm run build)
    uv run ai-trainer-garmin                    # serves the SPA + the two endpoints on http://127.0.0.1:8765
    # or, for hot reload:  uv run ai-trainer-garmin  &  cd frontend && npm run dev

Tests: `uv run pytest` and `cd frontend && npm test`.

## Privacy notes
- API keys are stored unencrypted in this browser's `localStorage`. Don't use shared computers.
- The plan you approve is sent to the Python functions to build `.fit` files / upload to Garmin.
- Activity `.fit` files you upload for context are read in the browser and never uploaded; only a short
  weekly summary is sent to your chosen AI provider.

## Status
Not yet verified on a physical watch. The coach and plan quality depend on the model you use.

## License
MIT
