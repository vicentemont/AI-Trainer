# AI Trainer for Garmin

Local-first, open-source app: feed it your Garmin `.fit` activity files, pick your own AI
(OpenAI, Claude or Gemini — bring your own API key), approve the generated plan, and send the
workouts to your watch. Everything stays on your machine.

## Run
    uv sync
    (cd frontend && npm install && npm run build)   # builds the React UI into the Python package
    uv run ai-trainer-garmin      # opens on http://127.0.0.1:8765

## Delivery
- **FIT folder**: writes `.fit` workouts; copy them to the watch's `GARMIN/NewFiles` over USB.
- **Garmin Connect** (unofficial, via python-garminconnect): uploads and schedules workouts so they
  sync wirelessly. Uses your own login locally; Garmin may change auth at any time. Test with a
  throwaway account first.

## Status
MVP in progress. Not yet verified on a physical watch.

## License
MIT

## Frontend dev
`cd frontend && npm run dev` (proxies /api to the Python server on :8765).
