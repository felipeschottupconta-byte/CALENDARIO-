import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Raiz do Vite é frontend/ — onde já vivem index.html, painel.html e os
// componentes app-cliente.jsx / painel-publicacao.jsx. O build sai em
// frontend/dist (padrão do Vite quando root != cwd), e o vercel.json
// aponta pra lá.
export default defineConfig({
  root: "frontend",
  envDir: __dirname, // .env.local fica na raiz do projeto, não em frontend/
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "frontend/index.html"),
        painel: resolve(__dirname, "frontend/painel.html"),
      },
    },
  },
});
