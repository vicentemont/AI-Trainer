import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `dist` is what Vercel serves; the local dev server (src/ai_trainer_garmin/web/app.py) can serve it too.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:8765" } },
});
