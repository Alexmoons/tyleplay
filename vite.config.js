import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST || "127.0.0.1";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host,
    port: 1421,
    strictPort: true,
  },
  preview: {
    host,
    port: 1421,
    strictPort: true,
  },
});
