// Teste local do chat de IA — bate na API real via api/chat.js.
// Uso: node scripts/test-chat.mjs "sua pergunta aqui"
// Lê ANTHROPIC_API_KEY do .env.local (nunca hardcoded aqui).
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// carrega .env.local para process.env
for (const linha of readFileSync(resolve(raiz, ".env.local"), "utf8").split("\n")) {
  const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const { default: handler } = await import(pathToFileURL(resolve(raiz, "api/chat.js")).href);

// Contexto de exemplo no formato expandido do contextoEmpresa()
const contexto = {
  empresa: { fantasia: "Su Lingerie", razaoSocial: "Su Lingerie Ltda", cnpj: "12.345.678/0001-90", regime: "Simples Nacional" },
  competenciaReferencia: "06/2026",
  guias: [
    { tipo: "das", descricao: "DAS — Simples Nacional", competencia: "06/2026", vencimento: "2026-07-20", valor: 1840.55, status: "publicada", pagaEm: null, ehParcelamento: false },
    { tipo: "darf", descricao: "DARF — IRRF", competencia: "06/2026", vencimento: "2026-07-20", valor: 213.9, status: "publicada", pagaEm: null, ehParcelamento: false },
    { tipo: "iss", descricao: "ISS — Tomador", competencia: "06/2026", vencimento: "2026-07-10", valor: 45.0, status: "publicada", pagaEm: null, ehParcelamento: false },
  ],
  entendaSeuImposto: {
    anexo: "Anexo I - Comércio", rpa: 28000, rbt12: 310000,
    faixaDe: 180000.01, faixaAte: 360000, aliquotaNominal: 7.3, aliquotaEfetiva: 6.573, fatorR: null, folha12Meses: null,
    tributos: [
      { nome: "ICMS", aliquota: 2.3, valor: 644 },
      { nome: "PIS", aliquota: 0.28, valor: 78.4 },
      { nome: "COFINS", aliquota: 1.29, valor: 361.2 },
    ],
  },
  proximaApuracao: null,
  historicoReceita: [
    { comp: "01/2026", receita: 22000 }, { comp: "02/2026", receita: 24500 },
    { comp: "03/2026", receita: 31000 }, { comp: "04/2026", receita: 26800 },
    { comp: "05/2026", receita: 29900 }, { comp: "06/2026", receita: 28000 },
  ],
  cargaTributaria: {
    serie: [
      { comp: "03/2026", cargaPercentual: 6.1 }, { comp: "04/2026", cargaPercentual: 6.3 },
      { comp: "05/2026", cargaPercentual: 6.5 }, { comp: "06/2026", cargaPercentual: 6.573 },
    ],
    mediaPercentual: 6.37, maior: { comp: "06/2026", cargaPercentual: 6.573 }, menor: { comp: "03/2026", cargaPercentual: 6.1 },
  },
  limiteSimples: { rbt12Atual: 310000, faixaDe: 180000.01, faixaAte: 360000, sublimiteIcmsIss: 3600000, limiteGeral: 4800000, mesesAteSublimite: null },
  parcelamentos: [
    { guia: "Parcelamento DAS 2024", numeroProcesso: "10800.123456/2024-11", parcelaAtual: 7, totalParcelas: 24, parcelasPagas: 6, valorParcela: 512.3, dataQuitacaoPrevista: "2026-12-20" },
  ],
};

const pergunta = process.argv[2] || "Qual é a minha alíquota efetiva neste DAS e por que ela é diferente da nominal?";

// req/res falsos no formato Vercel
const req = { method: "POST", body: { mensagens: [{ role: "user", content: pergunta }], contexto } };
const res = {
  status(c) { this._c = c; return this; },
  json(o) { console.log(`\n[HTTP ${this._c}]`); console.log(o.resposta || o.erro || JSON.stringify(o)); },
};

console.log("Pergunta:", pergunta);
await handler(req, res);
