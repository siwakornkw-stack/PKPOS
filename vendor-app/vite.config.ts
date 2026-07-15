import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" so built asset paths are relative — required when Capacitor serves from file://
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5180 },
});
