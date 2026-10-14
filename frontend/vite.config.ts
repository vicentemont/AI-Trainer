import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Production build goes straight into the Python package so FastAPI can serve it.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "../src/ai_trainer_garmin/web/static", emptyOutDir: true },
  server: { proxy: { "/api": "http://127.0.0.1:8765" } },
});
