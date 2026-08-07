import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Plugin SÓ de desenvolvimento: serve /api/chat chamando a mesma função
// api/chat.js que roda na Vercel em produção. Sem isso, o `vite dev` não
// executa nada dentro de api/ e o chat responderia 404 no navegador.
// Em produção quem serve api/ é a Vercel — este plugin não afeta o build.
function apiChatDev(env) {
  return {
    name: "api-chat-dev",
    apply: "serve",
    configureServer(server) {
      if (env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
      server.middlewares.use("/api/chat", (req, res, next) => {
        if (req.method !== "POST") return next();
        let corpo = "";
        req.on("data", (c) => (corpo += c));
        req.on("end", async () => {
          try {
            const { default: handler } = await import(
              pathToFileURL(resolve(__dirname, "api/chat.js")).href
            );
            const reqFalso = { method: "POST", body: corpo ? JSON.parse(corpo) : {} };
            const resFalso = {
              status(c) { this._c = c; return this; },
              json(o) {
                res.statusCode = this._c || 200;
                res.setHeader("content-type", "application/json");
                res.end(JSON.stringify(o));
              },
            };
            await handler(reqFalso, resFalso);
          } catch (e) {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ erro: String(e?.message || e) }));
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // carrega TODAS as vars do .env.local (inclui ANTHROPIC_API_KEY, sem prefixo VITE_)
  const env = loadEnv(mode, __dirname, "");
  return {
    root: "frontend",
    envDir: __dirname, // .env.local fica na raiz do projeto, não em frontend/
    plugins: [react(), apiChatDev(env)],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, "frontend/index.html"),
          painel: resolve(__dirname, "frontend/painel.html"),
        },
      },
    },
  };
});
