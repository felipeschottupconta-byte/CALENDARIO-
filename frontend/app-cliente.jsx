import React, { useState, useEffect } from "react";
import { useAuth } from "./src/lib/useAuth.js";
import {
  carregarEmpresasDoUsuario,
  carregarGuiasDaEmpresa,
  carregarCargaTributaria,
  carregarLimiteSimples,
  registrarEvento,
  marcarGuiaComoPaga,
  baixarPdfGuia,
} from "./src/lib/queries.js";

/* ============================================================
   PORTAL DO CLIENTE — RN Contabilidade · v3 (navegável completo)
   Login → troca de empresa → início → guias (com Entenda seu
   Imposto embutido) → agenda → pedidos → empresa.
   Todos os valores são reais, extraídos dos PDFs enviados.
   ============================================================ */

function Marca({ tamanho = 64 }) {
  return <img src="/logo-rn.png" alt="RN Contabilidade" style={{ height: tamanho, width: "auto", display: "block", borderRadius: tamanho * 0.09 }} />;
}

const HOJE = "2026-07-05";

/* ---------- dados de referência/demo — não usados pelo app ao vivo,
   que busca tudo do Supabase (ver src/lib/queries.js). Mantido pra
   quem quiser rodar localmente sem banco, ou como exemplo de forma. ---------- */
const EMPRESAS = {
  dff: {
    id: "dff", razao: "D F Fernandes Confecções Ltda", fantasia: "D F Fernandes",
    cnpj: "32.599.342/0001-66", ie: "80906544", regime: "Lucro Presumido", situacao: "Ativa", contato: "Daniel",
    guias: [
      { id: "a1", tipo: "DARJ", nome: "ICMS — Operações Próprias", orgao: "SEFAZ-RJ",
        comp: "06/2026", venc: "2026-07-10", valor: 8274.37, novo: true,
        linha: "85890000082 4 74370359120 5 26071001000 8 22333108826 8",
        composicao: [{ n: "ICMS", v: 3546.17 }, { n: "FECP", v: 4728.20 }] },
      { id: "a2", tipo: "DAM", nome: "ISS — Tomador de serviços", orgao: "Prefeitura de Nova Friburgo",
        comp: "06/2026", venc: "2026-07-20", valor: 5.69, novo: true,
        linha: "81670000000 2 05692905202 7 60720000000 0 00004873080 8",
        obs: "Agrupamento de ISS retido — várias notas fiscais vinculadas." },
      { id: "a3", tipo: "DARF", nome: "COFINS", orgao: "Receita Federal",
        comp: "06/2026", venc: "2026-07-24", valor: 4350.66, novo: true,
        linha: "85800000043 7 50660385262 0 05070126187 7 24123240245 0" },
      { id: "a4", tipo: "DARF", nome: "PIS", orgao: "Receita Federal",
        comp: "06/2026", venc: "2026-07-24", valor: 942.64, novo: true,
        linha: "85890000009 3 42640385262 4 05070126187 7 24026890103 3" },
      { id: "a5", tipo: "DARF", nome: "IRPJ", orgao: "Receita Federal",
        comp: "2º Trimestre/2026", venc: "2026-07-31", valor: 5528.53, novo: true,
        linha: "85810000055 2 28530385262 5 12071626210 0 67688928830 3" },
      { id: "a6", tipo: "DARF", nome: "CSLL", orgao: "Receita Federal",
        comp: "2º Trimestre/2026", venc: "2026-07-31", valor: 6457.28, novo: true,
        linha: "85850000064 9 57280385262 1 12071626210 0 67704257314 5" },
    ],
    agenda: [
      { data: "2026-07-10", titulo: "Honorários contábeis", nota: "boleto enviado por e-mail", tipo: "guia" },
      { data: "2026-07-10", titulo: "ICMS — Operações Próprias", nota: "R$ 8.274,37", tipo: "guia" },
      { data: "2026-07-15", titulo: "eSocial e DCTFWeb", nota: "transmissão pelo escritório", tipo: "obrigacao" },
      { data: "2026-07-20", titulo: "ISS — Tomador de serviços", nota: "R$ 5,69", tipo: "guia" },
      { data: "2026-07-24", titulo: "PIS e COFINS", nota: "R$ 5.293,30", tipo: "guia" },
      { data: "2026-07-31", titulo: "IRPJ e CSLL — 2º trimestre", nota: "R$ 11.985,81", tipo: "guia" },
    ],
    panorama: null,
  },
  nam: {
    id: "nam", razao: "Nova American Multimarcas Ltda", fantasia: "Nova American",
    cnpj: "28.885.515/0001-35", ie: "82692002", regime: "Lucro Presumido", situacao: "Ativa", contato: "Daniel",
    guias: [
      { id: "b1", tipo: "DARJ", nome: "ICMS — Diferencial de alíquota", orgao: "SEFAZ-RJ",
        comp: "05/2026", venc: "2026-06-10", valor: 81.95, novo: false,
        linha: "85800000000 3 81950359120 5 26061001000 6 21400058958 9",
        composicao: [{ n: "ICMS", v: 67.53 }, { n: "FECP", v: 14.42 }],
        obs: "DIFAL uso e consumo — frete 162980, NF-e 5900" },
    ],
    agenda: [
      { data: "2026-07-15", titulo: "eSocial e DCTFWeb", nota: "transmissão pelo escritório", tipo: "obrigacao" },
      { data: "2026-07-25", titulo: "PIS e COFINS", nota: "em apuração", tipo: "guia" },
    ],
    panorama: null,
  },
  cad: {
    id: "cad", razao: "Cervejaria Artesanal Angels and Devils Ltda", fantasia: "Angels and Devils",
    cnpj: "24.178.588/0001-36", regime: "Simples Nacional", situacao: "Ativa", contato: "Daniel",
    guias: [
      { id: "c1", tipo: "DAS", nome: "Simples Nacional", orgao: "Receita Federal",
        comp: "05/2026", venc: "2026-06-22", valor: 149.48, novo: false,
        linha: "85860000001 2 49480328261 7 73072026166 6 01275618475 8",
        composicao: [
          { n: "IRPJ", v: 9.84 }, { n: "CSLL", v: 6.26 }, { n: "COFINS", v: 20.59 },
          { n: "PIS", v: 4.45 }, { n: "INSS", v: 67.09 }, { n: "IPI", v: 13.42 }, { n: "ICMS", v: 27.83 },
        ] },
    ],
    agenda: [
      { data: "2026-07-19", titulo: "FGTS Digital", nota: "em apuração", tipo: "guia" },
      { data: "2026-07-22", titulo: "DAS — Simples Nacional", nota: "em apuração", tipo: "guia" },
    ],
    panorama: null,
  },
  lum: {
    id: "lum", razao: "Lumiarina Cervejaria Ltda", fantasia: "Lumiarina",
    cnpj: "27.774.562/0001-49", regime: "Simples Nacional", situacao: "Ativa", contato: "Daniel",
    guias: [],
    agenda: [{ data: "2026-07-22", titulo: "DAS — Simples Nacional", nota: "em apuração", tipo: "guia" }],
    panorama: {
      consultadoEm: "29/07/2026", total: 321.39, impeditivo: 0, pendencias: 2, podeCnd: true,
      itens: [
        { nome: "Contribuição previdenciária (1099-01)", comp: "07/2026", venc: "20/08/2026", valor: 178.31 },
        { nome: "Contribuição previdenciária (1082-01)", comp: "07/2026", venc: "20/08/2026", valor: 143.08 },
      ],
      texto: "Os dois valores estão registrados como exigibilidade suspensa: a Receita reconheceu o débito mas parou a cobrança enquanto faz a análise interna. Nada aqui impede, em princípio, a emissão de certidão. Na Procuradoria da Fazenda Nacional não há pendência alguma.",
      escopo: "Cobre apenas débitos federais na Receita Federal e na Procuradoria da Fazenda Nacional. Não inclui ICMS estadual, ISS municipal nem FGTS.",
      alerta: "Entre 10 e 15 de agosto a Receita processa as exclusões do Simples para 2027. Vamos conferir a situação da sua empresa e avisar.",
    },
  },
  gs: {
    id: "gs", razao: "Gata Serrana Lingerie Ltda", fantasia: "Gata Serrana",
    cnpj: "52.276.638/0001-53", regime: "Simples Nacional", situacao: "Ativa", contato: "Victor", grupo: "victor",
    guias: [
      {
        id: "g1", tipo: "DAS", nome: "Simples Nacional", orgao: "Receita Federal",
        comp: "06/2026", venc: "2026-07-20", valor: 17844.70, novo: true,
        linha: "85860000001 2 49480328261 7 73072026166 6 01275618475 8",
        entenda: {
          anexo: "Anexo I — Comércio", rpa: 177391.27, rbt12: 2113572.55,
          faixaDe: 1800000.01, faixaAte: 3600000.00,
          aliquotaNominal: 14.30, aliquotaEfetiva: 10.1695527153776,
          tributos: [
            { nome: "INSS/CPP", situacao: "Tributado", aliquota: 4.271212140, valor: 7576.76 },
            { nome: "COFINS",   situacao: "Tributado", aliquota: 1.295601016, valor: 2298.28 },
            { nome: "ICMS",     situacao: "Redução",   aliquota: 3.406800160, valor: 5848.17, reducao: 3.23 },
            { nome: "IRPJ",     situacao: "Tributado", aliquota: 0.559325399, valor: 992.19 },
            { nome: "CSLL",     situacao: "Tributado", aliquota: 0.355934345, valor: 631.40 },
            { nome: "PIS",      situacao: "Tributado", aliquota: 0.280679655, valor: 497.90 },
          ],
          historico: [
            { comp: "06/2025", receita: 25320.69 }, { comp: "07/2025", receita: 62246.98 },
            { comp: "08/2025", receita: 134346.45 }, { comp: "09/2025", receita: 206962.87 },
            { comp: "10/2025", receita: 160162.95 }, { comp: "11/2025", receita: 190049.67 },
            { comp: "12/2025", receita: 148236.18 }, { comp: "01/2026", receita: 186884.71 },
            { comp: "02/2026", receita: 230728.71 }, { comp: "03/2026", receita: 261458.94 },
            { comp: "04/2026", receita: 272062.59 }, { comp: "05/2026", receita: 235111.81 },
          ],
          proximo: { comp: "07/2026", aliquotaEfetiva: 10.4467895612492 },
        },
      },
      { id: "g2", tipo: "DARF", nome: "INSS — segurados descontados", orgao: "Receita Federal",
        comp: "06/2026", venc: "2026-07-20", valor: 707.51, novo: true,
        linha: "85820000007 4 07510385262 1 01071626182 8 79314290059 6",
        composicao: [{ n: "Empregados/avulso", v: 529.20 }, { n: "Contribuinte individual", v: 178.31 }],
        obs: "Contribuição descontada dos funcionários — separada do DAS, mesmo com INSS patronal incluso nele." },
      { id: "g3", tipo: "GFD", nome: "FGTS Digital", orgao: "FGTS Digital",
        comp: "06/2026", venc: "2026-07-20", valor: 542.37, novo: true,
        pix: true,
        obs: "4 trabalhadores · sem rescisório, indenização compensatória ou encargos neste mês." },
      { id: "g4", tipo: "PARC", nome: "Parcelamento Simples Nacional", orgao: "Receita Federal",
        comp: "07/2026", venc: "2026-07-31", valor: 1698.20, novo: true,
        linha: "85800000169 8 82004385262 3 07071626210 4 39518190034 6",
        parcelamento: {
          numeroProcesso: "10768.720123/2024-11", totalParcelas: 24, parcelaAtual: 9, valorParcela: 1698.20,
          dataQuitacaoPrevista: "2027-06-25",
          parcelas: [
            { numero: 6, vencimento: "2026-04-25", valor: 1698.20, paga: true, pagaEm: "2026-04-24" },
            { numero: 7, vencimento: "2026-05-25", valor: 1698.20, paga: true, pagaEm: "2026-05-25" },
            { numero: 8, vencimento: "2026-06-25", valor: 1698.20, paga: true, pagaEm: "2026-06-23" },
            { numero: 10, vencimento: "2026-08-31", valor: 1698.20, paga: false },
            { numero: 11, vencimento: "2026-09-30", valor: 1698.20, paga: false },
            { numero: 12, vencimento: "2026-10-30", valor: 1698.20, paga: false },
            { numero: 13, vencimento: "2026-11-30", valor: 1698.20, paga: false },
            { numero: 14, vencimento: "2026-12-30", valor: 1698.20, paga: false },
            { numero: 15, vencimento: "2027-01-29", valor: 1698.20, paga: false },
          ],
        },
        obs: "Débito do Simples Nacional parcelado em 24 vezes — adesão em agosto/2024." },
    ],
    agenda: [
      { data: "2026-07-08", titulo: "Enviar documentos de junho", nota: "notas e extratos", tipo: "voce" },
      { data: "2026-07-20", titulo: "DAS — Simples Nacional", nota: "R$ 17.844,70", tipo: "guia" },
      { data: "2026-07-20", titulo: "INSS descontado + FGTS", nota: "R$ 1.249,88", tipo: "guia" },
      { data: "2026-07-31", titulo: "Parcelamento Simples Nacional — parcela 9/24", nota: "R$ 1.698,20", tipo: "guia" },
    ],
    panorama: null,
    cargaTributaria: {
      serie: [
        { comp: "07/2025", cargaPercentual: 9.80 },
        { comp: "08/2025", cargaPercentual: 10.10 },
        { comp: "09/2025", cargaPercentual: 10.60 },
        { comp: "10/2025", cargaPercentual: 11.20 },
        { comp: "11/2025", cargaPercentual: 10.90 },
        { comp: "12/2025", cargaPercentual: 9.40 },
        { comp: "01/2026", cargaPercentual: 10.30 },
        { comp: "02/2026", cargaPercentual: 10.80 },
        { comp: "03/2026", cargaPercentual: 11.50 },
        { comp: "04/2026", cargaPercentual: 11.90 },
        { comp: "05/2026", cargaPercentual: 10.70 },
        { comp: "06/2026", cargaPercentual: 10.17 },
      ],
      mediaPercentual: 10.61,
      maior: { comp: "04/2026", cargaPercentual: 11.90 },
      menor: { comp: "12/2025", cargaPercentual: 9.40 },
    },
    limiteSimples: {
      rbt12Atual: 2113572.55, faixaDe: 1800000.01, faixaAte: 3600000.00,
      sublimiteIcmsIss: 3600000.00, limiteGeral: 4800000.00, mesesAteSublimite: 6,
    },
  },
  su: {
    id: "su", razao: "Su Lingerie Ltda", fantasia: "Su Lingerie",
    cnpj: "53.492.794/0001-14", regime: "Simples Nacional", situacao: "Ativa", contato: "Victor", grupo: "victor",
    guias: [
      {
        id: "s1", tipo: "DAS", nome: "Simples Nacional", orgao: "Receita Federal",
        comp: "06/2026", venc: "2026-07-20", valor: 3132.16, novo: true,
        linha: "85800000031 3 32160328262 0 01072026196 9 17979207892 7",
        entenda: {
          anexo: "Anexo I — Comércio", rpa: 64989.55, rbt12: 370494.16,
          faixaDe: 360000.01, faixaAte: 720000.00,
          aliquotaNominal: 9.50, aliquotaEfetiva: 5.7590503450851,
          tributos: [
            { nome: "INSS/CPP", situacao: "Tributado", aliquota: 2.418801145, valor: 1571.97 },
            { nome: "COFINS",   situacao: "Tributado", aliquota: 0.733703014, valor: 476.83 },
            { nome: "ICMS",     situacao: "Redução",   aliquota: 1.929281866, valor: 643.21, reducao: 48.70 },
            { nome: "IRPJ",     situacao: "Tributado", aliquota: 0.316747769, valor: 205.85 },
            { nome: "CSLL",     situacao: "Tributado", aliquota: 0.201566762, valor: 131.00 },
            { nome: "PIS",      situacao: "Tributado", aliquota: 0.158949790, valor: 103.30 },
          ],
          historico: [
            { comp: "06/2025", receita: 15084.06 }, { comp: "07/2025", receita: 7057.59 },
            { comp: "08/2025", receita: 7672.21 }, { comp: "09/2025", receita: 6449.24 },
            { comp: "10/2025", receita: 8426.51 }, { comp: "11/2025", receita: 19541.41 },
            { comp: "12/2025", receita: 23333.51 }, { comp: "01/2026", receita: 42913.63 },
            { comp: "02/2026", receita: 46237.61 }, { comp: "03/2026", receita: 62588.41 },
            { comp: "04/2026", receita: 60761.34 }, { comp: "05/2026", receita: 70428.64 },
          ],
          proximo: { comp: "07/2026", aliquotaEfetiva: 6.2031378950958 },
        },
      },
      { id: "s2", tipo: "DARF", nome: "INSS — contribuinte individual", orgao: "Receita Federal",
        comp: "06/2026", venc: "2026-07-20", valor: 178.31, novo: true,
        linha: "85830000001 7 78310385262 7 01071626183 6 29402953083 1",
        obs: "Contribuição descontada do sócio como contribuinte individual — 11% sobre o pró-labore." },
    ],
    agenda: [
      { data: "2026-07-20", titulo: "DAS — Simples Nacional", nota: "R$ 3.132,16", tipo: "guia" },
      { data: "2026-07-20", titulo: "INSS — contribuinte individual", nota: "R$ 178,31", tipo: "guia" },
    ],
    panorama: null,
  },
  pem: {
    id: "pem", razao: "Puro Estilo Moda Intima Ltda", fantasia: "Puro Estilo",
    cnpj: "18.294.480/0001-06", regime: "Simples Nacional", situacao: "Ativa", contato: "Victor", grupo: "victor",
    guias: [
      {
        id: "pe1", tipo: "DAS", nome: "Simples Nacional", orgao: "Receita Federal",
        comp: "06/2026", venc: "2026-07-20", valor: 12555.04, novo: true,
        linha: "85800000169 8 82004385262 3 07071626210 4 39518190034 6",
        entenda: {
          rpa: 137750.24, rbt12: 1250154.53,
          faixaDe: 720000.01, faixaAte: 1800000.00,
          anexos: [
            {
              nome: "Anexo I - Comércio", receitaTributada: 7609.32,
              aliquotaNominal: 10.70, aliquotaEfetiva: 8.9002224956942, subtotal: 659.72,
              tributos: [
                { nome: "IRPJ", situacao: "Tributado", aliquota: 0.489512237, valor: 37.25 },
                { nome: "CSLL", situacao: "Tributado", aliquota: 0.311507787, valor: 23.70 },
                { nome: "COFINS", situacao: "Tributado", aliquota: 1.133888346, valor: 86.28 },
                { nome: "PIS", situacao: "Tributado", aliquota: 0.245646141, valor: 18.69 },
                { nome: "INSS/CPP", situacao: "Tributado", aliquota: 3.738093448, valor: 284.44 },
                { nome: "ICMS", situacao: "Redução", aliquota: 2.981574536, valor: 209.36, reducao: 7.72 },
              ],
            },
            {
              nome: "Anexo II - Indústria", receitaTributada: 130140.92,
              aliquotaNominal: 11.20, aliquotaEfetiva: 9.4002224956942, subtotal: 11895.31,
              tributos: [
                { nome: "IRPJ", situacao: "Tributado", aliquota: 0.517012237, valor: 672.84 },
                { nome: "CSLL", situacao: "Tributado", aliquota: 0.329007787, valor: 428.17 },
                { nome: "COFINS", situacao: "Tributado", aliquota: 1.081965609, valor: 1408.08 },
                { nome: "PIS", situacao: "Tributado", aliquota: 0.234065540, valor: 304.62 },
                { nome: "INSS/CPP", situacao: "Tributado", aliquota: 3.525083436, valor: 4587.58 },
                { nome: "IPI", situacao: "Tributado", aliquota: 0.705016687, valor: 917.52 },
                { nome: "ICMS", situacao: "Redução", aliquota: 3.008071199, valor: 3576.50, reducao: 8.64 },
              ],
            },
          ],
          historico: [
            { comp: "06/2025", receita: 87531.31 }, { comp: "07/2025", receita: 85442.82 },
            { comp: "08/2025", receita: 176875.85 }, { comp: "09/2025", receita: 123097.46 },
            { comp: "10/2025", receita: 108547.56 }, { comp: "11/2025", receita: 96431.91 },
            { comp: "12/2025", receita: 82799.27 }, { comp: "01/2026", receita: 39118.75 },
            { comp: "02/2026", receita: 83899.45 }, { comp: "03/2026", receita: 94781.79 },
            { comp: "04/2026", receita: 114817.58 }, { comp: "05/2026", receita: 156810.78 },
          ],
        },
      },
    ],
    agenda: [
      { data: "2026-07-20", titulo: "DAS — Simples Nacional", nota: "R$ 12.555,04", tipo: "guia" },
    ],
    panorama: null,
  },
};

const EMAIL_ESCRITORIO = "felipeschottbraga@gmail.com";

const TIPOS_PEDIDO = [
  { id: "cert", label: "Certidão negativa", prazo: "até 2 dias úteis" },
  { id: "fat", label: "Declaração de faturamento", prazo: "até 2 dias úteis" },
  { id: "adm", label: "Admissão de funcionário", prazo: "até 3 dias úteis" },
  { id: "dem", label: "Demissão ou rescisão", prazo: "até 3 dias úteis" },
  { id: "alt", label: "Alteração contratual", prazo: "até 10 dias úteis" },
  { id: "doc", label: "Enviar documentos", prazo: "confirmação no mesmo dia" },
  { id: "out", label: "Outro assunto", prazo: "retorno em 1 dia útil" },
];

/* ---------- helpers ---------- */
const brl = (v) => v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v, casas = 2) => v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + "%";
const dataBR = (iso) => iso.split("-").reverse().join("/");
const dias = (iso) => Math.round((new Date(iso + "T00:00:00") - new Date(HOJE + "T00:00:00")) / 86400000);
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
  "agosto", "setembro", "outubro", "novembro", "dezembro"];
const valorAbrev = (v) => v >= 1000
  ? (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "k"
  : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
// "Anexo I - Comércio" -> "Comércio (Anexo I)" — usado quando a empresa
// é tributada em mais de um anexo do Simples na mesma competência.
const descricaoAnexo = (nome) => {
  const [num, ...resto] = nome.split(" - ");
  return resto.length ? `${resto.join(" - ")} (${num})` : nome;
};
// "Anexo I - Comércio" -> "Comércio" — rótulo curto pra aba/botão do
// seletor de anexo. Corta citação legal entre parênteses quando existe
// (ex.: "Locação de Bens Móveis (não relacionados no §5º-C...)").
const rotuloAnexo = (nome) => (nome.split(" - ")[1] || nome).split(" (")[0].trim();

// Duas "linhas" de apuração podem vir com o mesmo nome de anexo (mesma
// receita tributada em seções/tabelas diferentes, ex.: com e sem
// substituição tributária) — sem isso, os botões do seletor ficariam
// com rótulo repetido e indistinguível.
const rotulosAnexoDesambiguados = (anexos) => {
  const vistos = {};
  return anexos.map((a) => {
    const base = rotuloAnexo(a.nome);
    vistos[base] = (vistos[base] || 0) + 1;
    return vistos[base];
  }).map((n, i) => {
    const base = rotuloAnexo(anexos[i].nome);
    const total = anexos.filter((a) => rotuloAnexo(a.nome) === base).length;
    // número primeiro — texto trunca com reticências à direita numa aba
    // estreita, então é o número que precisa sobreviver ao corte
    return total > 1 ? `${n} · ${base}` : base;
  });
};
const juntarLista = (arr) => arr.length <= 1 ? (arr[0] || "") : arr.slice(0, -1).join(", ") + " e " + arr[arr.length - 1];

// As 6 faixas de RBT12 do Simples Nacional têm a mesma faixa em R$ nos
// Anexos I a V — o que muda por anexo é a alíquota/parcela a deduzir
// daquela faixa, não o intervalo em si. Por isso a posição na tabela
// (1ª a 6ª) é uma só pra empresa inteira, mesmo quando ela apura em
// mais de um anexo ao mesmo tempo.
const FAIXAS_SIMPLES = [
  { n: 1, de: 0 },
  { n: 2, de: 180000.01 },
  { n: 3, de: 360000.01 },
  { n: 4, de: 720000.01 },
  { n: 5, de: 1800000.01 },
  { n: 6, de: 3600000.01 },
];
const faixaNumero = (faixaDe) => {
  const f = FAIXAS_SIMPLES.find((f) => Math.abs(f.de - faixaDe) < 1);
  return f ? f.n : null;
};

function Barras({ seed }) {
  const bars = []; let h = 11;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 9973;
  for (let i = 0; i < 44; i++) { h = (h * 1103515245 + 12345) % 2147483648; bars.push(1 + h % 3); }
  return <div className="barcode" aria-hidden="true">
    {bars.map((w, i) => <span key={i} style={{ width: w + "px", opacity: i % 2 ? .13 : 1 }} />)}
  </div>;
}

/* ============================ APP ============================ */
export default function App() {
  const { carregando, sessao, perfil, semAcesso, entrar, sair } = useAuth();
  const [empresas, setEmpresas] = useState({});
  const [empId, setEmpId] = useState(null);
  const [carregandoDados, setCarregandoDados] = useState(false);
  const [trocando, setTrocando] = useState(false);
  const [aba, setAba] = useState("inicio");
  const [pedidos, setPedidos] = useState([]);
  const [pagas, setPagas] = useState([]);
  const [toast, setToast] = useState(null);
  const avisar = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  useEffect(() => {
    if (!sessao || !perfil || perfil.papel !== "cliente") return;
    let ativo = true;
    setCarregandoDados(true);
    carregarEmpresasDoUsuario(sessao.user.id)
      .then(async (mapa) => {
        const ids = Object.keys(mapa);
        await Promise.all(ids.map(async (id) => {
          const [guias, cargaTributaria, limiteSimples] = await Promise.all([
            carregarGuiasDaEmpresa(id),
            carregarCargaTributaria(id),
            carregarLimiteSimples(id),
          ]);
          mapa[id].guias = guias;
          mapa[id].contato = perfil.nome;
          // a agenda vem direto das guias publicadas — cada uma com
          // vencimento vira um ponto no calendário, igual o protótipo já fazia
          mapa[id].agenda = guias
            .filter((g) => g.venc)
            .map((g) => ({ data: g.venc, titulo: g.nome, nota: brl(g.valor), tipo: g.status === "paga" ? "paga" : "guia" }));
          if (cargaTributaria) mapa[id].cargaTributaria = cargaTributaria;
          if (limiteSimples) mapa[id].limiteSimples = limiteSimples;
        }));
        if (!ativo) return;
        setEmpresas(mapa);
        setEmpId((atual) => (atual && mapa[atual] ? atual : Object.keys(mapa)[0] || null));
      })
      .finally(() => { if (ativo) setCarregandoDados(false); });
    return () => { ativo = false; };
  }, [sessao, perfil]);

  const emp = empId ? empresas[empId] : null;

  // marcar como paga é uma declaração do cliente, não confirmação de
  // compensação bancária — por isso "informado como pago em DD/MM" em
  // vez de "pagamento confirmado" na tela da guia (ver CardGuia).
  const marcarPaga = async (g, arquivo, dataPagamento) => {
    try {
      await marcarGuiaComoPaga(g.id, emp.cnpj.replace(/\D/g, ""), arquivo, dataPagamento);
    } catch (e) {
      avisar("Não consegui registrar o pagamento: " + (e.message || e));
      return;
    }
    setPagas((p) => [...p, g.id]);
    avisar(arquivo ? "Guia marcada como paga, com comprovante" : "Guia marcada como paga");
    try {
      const guiasAtualizadas = await carregarGuiasDaEmpresa(emp.id);
      setEmpresas((mapa) => ({ ...mapa, [emp.id]: { ...mapa[emp.id], guias: guiasAtualizadas } }));
    } catch {
      // a marcação já foi salva no banco — só a lista não recarregou sozinha
    }
    try {
      await fetch("/api/notificar-pedido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "pagamento",
          empresaNome: emp.fantasia,
          empresaCnpj: emp.cnpj,
          contatoNome: emp.contato,
          guiaNome: g.nome,
          guiaCompetencia: g.comp,
          guiaValor: brl(g.valor),
          comComprovante: !!arquivo,
          nomeArquivo: arquivo?.name || null,
        }),
      });
    } catch {
      // registro já ficou salvo; o e-mail é best-effort aqui
    }
  };

  if (carregando) {
    return <div className="moldura"><div className="tela"><p style={{ color: "#fff", padding: 24 }}>Carregando…</p></div></div>;
  }

  if (!sessao) {
    return (
      <>
        <style>{CSS}</style>
        <div className="moldura"><div className="tela"><Login entrar={entrar} /></div></div>
      </>
    );
  }

  if (semAcesso || (perfil && perfil.papel !== "cliente")) {
    return (
      <>
        <style>{CSS}</style>
        <div className="moldura"><div className="tela">
          <div className="login">
            <div className="login-marca"><Marca tamanho={160} /></div>
            <p className="login-erro" style={{ padding: "0 26px" }}>
              Este login não tem acesso liberado ao Portal do Cliente. Se você é cliente da RN
              Contabilidade, avise o escritório pra liberarem seu acesso.
            </p>
            <button className="btn-texto" onClick={sair}>Sair</button>
          </div>
        </div></div>
      </>
    );
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="moldura">
        <div className="tela">
          {carregandoDados || !emp ? (
            <p style={{ color: "#fff", padding: 24 }}>
              {carregandoDados ? "Carregando suas guias…" : "Nenhuma empresa vinculada a este login ainda."}
            </p>
          ) : (
            <>
              <Topo aba={aba} emp={emp} onTrocar={() => setTrocando(true)} temIrmas={Object.keys(empresas).length > 1} />
              <main className="conteudo">
                {aba === "inicio" && <Inicio emp={emp} ir={setAba} avisar={avisar} pagas={pagas} />}
                {aba === "guias" && <Guias emp={emp} avisar={avisar} pagas={pagas} marcarPaga={marcarPaga} />}
                {aba === "agenda" && <Agenda emp={emp} />}
                {aba === "pedidos" && <Pedidos emp={emp} pedidos={pedidos} setPedidos={setPedidos} avisar={avisar} />}
                {aba === "empresa" && <Empresa emp={emp} onSair={sair} />}
              </main>
              <Abas aba={aba} setAba={setAba} />
            </>
          )}
          {trocando && (
            <Seletor atual={empId} empresas={empresas} onEscolher={(id) => { setEmpId(id); setTrocando(false); setAba("inicio"); }}
              onFechar={() => setTrocando(false)} />
          )}
          {toast && <div className="toast">{toast}</div>}
        </div>
      </div>
    </>
  );
}

function Login({ entrar }) {
  const [manter, setManter] = useState(true);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const tentar = async () => {
    if (!email || !senha) { setErro("Preencha e-mail e senha."); return; }
    setEnviando(true);
    const msg = await entrar(email, senha);
    setEnviando(false);
    setErro(msg ? "E-mail ou senha incorretos." : null);
  };

  return (
    <div className="login">
      <div className="login-marca"><Marca tamanho={160} /></div>
      <div className="login-form">
        <label className="campo"><span>E-mail</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tentar()} /></label>
        <label className="campo"><span>Senha</span>
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tentar()} /></label>
        <button className="switch" onClick={() => setManter(!manter)} aria-pressed={manter}>
          <span className={"trilho" + (manter ? " on" : "")}><i /></span>
          Continuar conectado neste aparelho
        </button>
        <button className="btn-primario" disabled={enviando} onClick={tentar}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
        {erro && <p className="login-erro">{erro}</p>}
        <button className="btn-texto">Esqueci minha senha</button>
      </div>
      <p className="rodape">Nova Friburgo · RJ</p>
    </div>
  );
}

function Topo({ aba, emp, onTrocar, temIrmas }) {
  const t = { guias: "Guias e documentos", agenda: "Agenda de julho", pedidos: "Pedidos", empresa: "Minha empresa" };
  return (
    <header className="topo">
      <div className="topo-marca"><Marca tamanho={26} /></div>
      {t[aba] ? <h2 className="topo-titulo">{t[aba]}</h2> : (
        <>
          <p className="topo-ola">Olá, {emp.contato}</p>
          {temIrmas
            ? <button className="troca" onClick={onTrocar}><h2>{emp.fantasia}</h2><span className="seta">▾</span></button>
            : <h2 className="troca-fixa">{emp.fantasia}</h2>}
          <p className="topo-cnpj">{emp.cnpj} · {emp.regime}</p>
        </>
      )}
    </header>
  );
}

function Seletor({ atual, empresas, onEscolher, onFechar }) {
  const minhas = Object.values(empresas);
  return (
    <div className="modal" onClick={onFechar}>
      <div className="folha" onClick={(e) => e.stopPropagation()}>
        <h3 className="folha-titulo">Suas empresas</h3>
        <div className="pilha-fina">
          {minhas.map((e) => {
            const aberto = e.guias.reduce((s, g) => s + g.valor, 0);
            return (
              <button key={e.id} className={"emp" + (e.id === atual ? " on" : "")} onClick={() => onEscolher(e.id)}>
                <div><strong>{e.fantasia}</strong><span className="mono">{e.cnpj}</span><span>{e.regime}</span></div>
                <div className="emp-num"><b>{aberto > 0 ? brl(aberto) : "—"}</b>
                  <span>{e.guias.length} {e.guias.length === 1 ? "guia" : "guias"}</span></div>
              </button>
            );
          })}
        </div>
        <button className="btn-texto largo" onClick={onFechar}>Fechar</button>
      </div>
    </div>
  );
}

// Última competência com "Entenda seu imposto" publicado — a alíquota
// que aparece abaixo do total na Início. Quando o mês teve mais de um
// anexo, devolve a média ponderada pela receita de cada um.
function ultimaAliquotaEfetiva(guias) {
  const comEntenda = [...guias]
    .filter((g) => g.entenda && g.comp)
    .sort((a, b) => b.comp.localeCompare(a.comp));
  const g = comEntenda[0];
  if (!g) return null;
  if (g.entenda.anexos) {
    const somaReceita = g.entenda.anexos.reduce((s, a) => s + a.receitaTributada, 0);
    if (!somaReceita) return null;
    const media = g.entenda.anexos.reduce((s, a) => s + a.aliquotaEfetiva * a.receitaTributada, 0) / somaReceita;
    return { valor: media, media: true, comp: g.comp };
  }
  return { valor: g.entenda.aliquotaEfetiva, media: false, comp: g.comp };
}

function Inicio({ emp, ir, avisar, pagas }) {
  const mesAtual = HOJE.slice(0, 7);
  const pendentes = emp.guias.filter((g) => !pagas.includes(g.id) && g.status !== "paga");
  const doMes = pendentes.filter((g) => g.venc && g.venc.slice(0, 7) === mesAtual);
  const total = doMes.reduce((s, g) => s + g.valor, 0);
  const prox = [...doMes].sort((a, b) => a.venc.localeCompare(b.venc))[0];

  const futuros = pendentes.filter((g) => g.venc && g.venc.slice(0, 7) > mesAtual);
  const porMesFuturo = {};
  futuros.forEach((g) => { porMesFuturo[g.venc.slice(0, 7)] = (porMesFuturo[g.venc.slice(0, 7)] || 0) + g.valor; });
  const mesesFuturos = Object.keys(porMesFuturo).sort();

  const aliquota = emp.regime === "Simples Nacional" ? ultimaAliquotaEfetiva(emp.guias) : null;

  return (
    <div className="pilha">
      {aliquota && (
        <section className="panorama">
          <div>
            <span className="etiqueta">Alíquota efetiva{aliquota.media ? " média" : ""} · {aliquota.comp}</span>
            <p className="carga-pct">{pct(aliquota.valor)}</p>
            <p className="fino">o que sua empresa pagou de fato sobre o faturamento do mês</p>
          </div>
        </section>
      )}

      <section className="destaque">
        <p className="rotulo">A pagar em {MESES_LONGOS[+mesAtual.slice(5, 7) - 1]}</p>
        <p className="numero">{total > 0 ? brl(total) : "Nada em aberto"}</p>
        <p className="nota">
          {total > 0 ? `${doMes.length} ${doMes.length === 1 ? "guia" : "guias"} · a primeira vence em ${dataBR(prox.venc)}`
                     : "Nenhuma guia publicada para este mês ainda"}
        </p>
        {mesesFuturos.map((chave) => (
          <p className="nota" key={chave}>
            + {brl(porMesFuturo[chave])} vencendo em {MESES_LONGOS[+chave.slice(5, 7) - 1]}
          </p>
        ))}
        {total > 0 && <button className="btn-claro" onClick={() => ir("guias")}>Ver guias</button>}
      </section>

      {emp.cargaTributaria && <CardCargaTributaria ct={emp.cargaTributaria} />}

      {emp.regime === "Simples Nacional" && emp.limiteSimples && <CardLimiteSimples ls={emp.limiteSimples} />}

      {emp.panorama && <Panorama p={emp.panorama} />}

      <section>
        <h3 className="secao">Próximos compromissos</h3>
        <div className="pilha-fina">
          {emp.agenda.filter((e) => dias(e.data) >= 0).slice(0, 4).map((e, i) => <Linha e={e} key={i} />)}
        </div>
        <button className="btn-texto largo" onClick={() => ir("agenda")}>Ver agenda completa</button>
      </section>

      <section className="atalhos">
        <button onClick={() => ir("pedidos")}><b>+</b><span>Fazer um pedido</span></button>
        <button onClick={() => avisar("Abrindo conversa com o escritório")}><b>✆</b><span>Falar com a RN</span></button>
        <button onClick={() => ir("empresa")}><b>◈</b><span>Dados da empresa</span></button>
      </section>
    </div>
  );
}

function Panorama({ p }) {
  const [aberto, setAberto] = useState(false);
  return (
    <section className="panorama">
      <div className="pan-topo">
        <div>
          <span className="etiqueta">Panorama fiscal federal</span>
          <h3>{p.podeCnd ? "Sem pendência impeditiva" : "Pendência impeditiva"}</h3>
          <p className="fino">Consulta feita em {p.consultadoEm}</p>
        </div>
        <span className={"farol " + (p.podeCnd ? "ok" : "risco")} />
      </div>
      <div className="pan-numeros">
        <div><b>{brl(p.total)}</b><span>em análise</span></div>
        <div><b>{brl(p.impeditivo)}</b><span>impeditivo</span></div>
      </div>
      <button className="btn-fantasma largo" onClick={() => setAberto(!aberto)}>
        {aberto ? "Ocultar detalhes" : "Entender o que é isso"}
      </button>
      {aberto && (
        <div className="pan-detalhe">
          <p>{p.texto}</p>
          <div className="pan-itens">
            {p.itens.map((it, i) => (
              <div key={i}><div><strong>{it.nome}</strong><span>competência {it.comp} · vence {it.venc}</span></div>
                <b>{brl(it.valor)}</b></div>
            ))}
          </div>
          <p className="pan-alerta">{p.alerta}</p>
          <p className="pan-escopo">{p.escopo}</p>
        </div>
      )}
    </section>
  );
}

function CardCargaTributaria({ ct }) {
  const [aberto, setAberto] = useState(false);
  const [selecionado, setSelecionado] = useState(null);
  const atual = ct.serie[ct.serie.length - 1].comp;
  const maxCarga = Math.max(...ct.serie.map((m) => m.cargaPercentual));

  return (
    <section className="panorama">
      <div>
        <span className="etiqueta">Carga tributária média</span>
        <p className="carga-pct">{pct(ct.mediaPercentual)}</p>
        <p className="fino">dos últimos 12 meses</p>
      </div>

      <button className="btn-fantasma largo" onClick={() => setAberto(!aberto)}>
        {aberto ? "Ocultar evolução mensal" : "Ver evolução mensal"}
      </button>

      {aberto && (
        <div className="pan-detalhe">
          <div className="historico">
            <div className="historico-grafico">
              {ct.serie.map((m, i) => (
                <button key={m.comp} type="button"
                  className={"historico-coluna" + (m.comp === atual ? " atual" : "")}
                  onClick={() => setSelecionado(selecionado === i ? null : i)}>
                  <div className="historico-barra" style={{ height: `${(m.cargaPercentual / maxCarga) * 100}%` }} />
                  <span>{MESES[+m.comp.slice(0, 2) - 1]}</span>
                </button>
              ))}
            </div>
            <p className="historico-legenda">
              {selecionado != null
                ? `${ct.serie[selecionado].comp}: ${pct(ct.serie[selecionado].cargaPercentual)}`
                : "Toque numa barra para ver o valor exato do mês"}
            </p>
          </div>

          <div className="pan-numeros">
            <div><b>{pct(ct.maior.cargaPercentual)}</b><span>maior · {ct.maior.comp}</span></div>
            <div><b>{pct(ct.menor.cargaPercentual)}</b><span>menor · {ct.menor.comp}</span></div>
            <div><b>{pct(ct.mediaPercentual)}</b><span>média</span></div>
          </div>

          <p className="fino">
            A carga varia mês a mês conforme a faixa de faturamento no Simples Nacional e o mix de
            tributos recolhidos naquele período.
          </p>
        </div>
      )}
    </section>
  );
}

function CardLimiteSimples({ ls }) {
  const ultrapassou = ls.rbt12Atual >= ls.sublimiteIcmsIss;
  const percentualSublimite = Math.min(100, (ls.rbt12Atual / ls.sublimiteIcmsIss) * 100);
  const estado = ultrapassou || percentualSublimite >= 90 ? "alerta" : percentualSublimite >= 70 ? "atencao" : "neutro";
  const marcadorPct = Math.min(100, (ls.faixaDe / ls.sublimiteIcmsIss) * 100);
  const nFaixa = faixaNumero(ls.faixaDe);

  return (
    <section className={"panorama limite " + estado}>
      <div>
        <span className="etiqueta">Limite de faturamento — ICMS e ISS</span>
        <p className="carga-pct">{brl(ls.rbt12Atual)}</p>
        <p className="fino">
          de {brl(ls.sublimiteIcmsIss)} — a receita acumulada nos últimos 12 meses que define se ICMS
          e ISS continuam saindo pelo DAS
        </p>
      </div>

      <div className="medidor-barra">
        <div className="medidor-preenchido" style={{ width: percentualSublimite + "%" }} />
        <div className="limite-marcador" style={{ left: marcadorPct + "%" }} title="Início da faixa atual" />
      </div>
      <p className="fino">
        {pct(percentualSublimite)} desse limite · faixa atual{nFaixa ? `: ${nFaixa}ª faixa` : ""} (de {brl(ls.faixaDe)} a {brl(ls.faixaAte)})
      </p>

      {ultrapassou && (
        <p className="pan-alerta alerta">
          Sua receita acumulada nos últimos 12 meses já passou do limite que mantém ICMS e ISS dentro
          do DAS. Sua empresa continua no Simples para os tributos federais, mas ICMS e ISS passam a
          ser recolhidos fora do DAS, pelas regras normais do estado e do município.
        </p>
      )}
      {!ultrapassou && estado !== "neutro" && (
        <p className={"pan-alerta" + (estado === "alerta" ? " alerta" : "")}>
          A receita acumulada nos últimos 12 meses já soma {pct(percentualSublimite)} desse limite.
        </p>
      )}

      {ls.mesesAteSublimite != null && (
        <p className="fino">
          No ritmo dos últimos 3 meses, esse limite seria atingido em aproximadamente{" "}
          {ls.mesesAteSublimite} {ls.mesesAteSublimite === 1 ? "mês" : "meses"}.
        </p>
      )}

      <p className="fino">
        Estimativa baseada na média recente de faturamento — não substitui a análise do escritório,
        que entra em contato caso algo exija atenção.
      </p>
    </section>
  );
}

// Card de guia de parcelamento (PARCSN, RELP...) direto do que o
// parser extraiu — diferente do DetalheParcelamento abaixo, que lê de
// um parcelamento estruturado (tabela parcelamentos, curada pelo
// escritório). Este é o caso simples: uma guia isolada já chega com
// os campos de parcela prontos.
function ResumoParcelamentoGuia({ g }) {
  const [aberto, setAberto] = useState(false);
  const percentual = g.parcelaTotal ? Math.round((100 * (g.parcelaAtual - 1)) / g.parcelaTotal) : 0;
  const restantes = g.parcelaTotal != null && g.parcelaAtual != null ? g.parcelaTotal - g.parcelaAtual : null;
  const quitacao = restantes != null && g.venc ? new Date(g.venc + "T00:00:00") : null;
  if (quitacao) quitacao.setMonth(quitacao.getMonth() + restantes);

  return (
    <div className="pilha-fina">
      <div className="medidor-barra"><div className="medidor-preenchido" style={{ width: percentual + "%" }} /></div>
      <div className="parc-legenda">
        <span>{percentual}% concluído</span>
        {quitacao && <span>quitação prevista {dataBR(quitacao.toISOString().slice(0, 10))}</span>}
      </div>
      <button className="guia-acao" onClick={() => setAberto(!aberto)}>
        {aberto ? "Ocultar composição da parcela" : "Ver composição da parcela"}
      </button>
      {aberto && (
        <div className="composicao">
          <div><span>Principal</span><b>{brl(g.valorPrincipal)}</b></div>
          <div><span>Multa</span><b>{brl(g.valorMulta)}</b></div>
          <div><span>Juros</span><b>{brl(g.valorJuros)}</b></div>
        </div>
      )}
    </div>
  );
}

function DetalheParcelamento({ pc }) {
  const [aberto, setAberto] = useState(false);
  const restantes = pc.totalParcelas - pc.parcelaAtual + 1;
  const saldo = pc.valorParcela * restantes;
  const concluido = Math.round((100 * (pc.parcelaAtual - 1)) / pc.totalParcelas);
  const proximas = [...pc.parcelas].filter((x) => !x.paga).sort((a, b) => a.vencimento.localeCompare(b.vencimento)).slice(0, 6);
  const quitadas = [...pc.parcelas].filter((x) => x.paga).sort((a, b) => b.pagaEm.localeCompare(a.pagaEm)).slice(0, 6);

  return (
    <div className="pilha-fina">
      <div className="medidor-barra"><div className="medidor-preenchido" style={{ width: concluido + "%" }} /></div>
      <div className="parc-legenda">
        <span>{concluido}% concluído · parcela {pc.parcelaAtual} de {pc.totalParcelas}</span>
        {pc.numeroProcesso && <span>processo {pc.numeroProcesso}</span>}
      </div>
      <div className="pan-numeros">
        <div><b>{brl(saldo)}</b><span>saldo restante</span></div>
        <div><b>{pc.dataQuitacaoPrevista ? dataBR(pc.dataQuitacaoPrevista) : "—"}</b><span>quitação prevista</span></div>
      </div>
      <button className="guia-acao" onClick={() => setAberto(!aberto)}>
        {aberto ? "Ocultar parcelas" : "Ver parcelas"}
      </button>
      {aberto && (
        <div className="pilha-fina">
          {proximas.length > 0 && (
            <div>
              <span className="etiqueta">Próximas parcelas</span>
              <div className="composicao">
                {proximas.map((x) => (
                  <div key={x.numero}><span>Parcela {x.numero} · {dataBR(x.vencimento)}</span><b>{brl(x.valor)}</b></div>
                ))}
              </div>
            </div>
          )}
          {quitadas.length > 0 && (
            <div>
              <span className="etiqueta">Últimas pagas</span>
              <div className="composicao">
                {quitadas.map((x) => (
                  <div key={x.numero}><span>Parcela {x.numero} · paga em {dataBR(x.pagaEm)}</span><b>{brl(x.valor)}</b></div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Linha({ e }) {
  return (
    <div className={"linha linha-" + e.tipo}>
      <div className="bloco-data"><span className="dia">{e.data.slice(8)}</span><span className="mes">{MESES[+e.data.slice(5, 7) - 1]}</span></div>
      <div className="linha-corpo"><strong>{e.titulo}</strong><span>{e.nota}</span></div>
      <span className={"pino " + e.tipo} />
    </div>
  );
}

function Guias({ emp, avisar, pagas, marcarPaga }) {
  const pendentes = emp.guias.filter((g) => !pagas.includes(g.id) && g.status !== "paga");
  return (
    <div className="pilha">
      {pendentes.length
        ? pendentes.map((g) => <CardGuia key={g.id} g={g} emp={emp} avisar={avisar} marcarPaga={marcarPaga} />)
        : <p className="vazio">Nenhuma guia em aberto. Avisamos assim que houver.</p>}
    </div>
  );
}

function CardGuia({ g, emp, avisar, marcarPaga }) {
  const [aberto, setAberto] = useState(false);
  const [entenda, setEntenda] = useState(false);
  const [tribAberto, setTribAberto] = useState(null);
  const [abaAnexo, setAbaAnexo] = useState(null);
  const [histAberto, setHistAberto] = useState(false);
  const [recalculo, setRecalculo] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [arquivo, setArquivo] = useState(null);
  const [dataPagamento, setDataPagamento] = useState(HOJE);
  const [enviandoPagamento, setEnviandoPagamento] = useState(false);
  const [baixandoPdf, setBaixandoPdf] = useState(false);

  const abrirPdf = async () => {
    if (!g.storagePath) { avisar("PDF original não disponível pra esta guia"); return; }
    setBaixandoPdf(true);
    try {
      const url = await baixarPdfGuia(g.storagePath);
      // URL assinada é de outro domínio (Storage do Supabase) — o atributo
      // "download" do <a> é ignorado em link cross-origin, só funciona com
      // blob: same-origin. Por isso baixa o conteúdo primeiro.
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("falha ao baixar o arquivo");
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${g.tipo || "guia"}-${g.venc || ""}.pdf`.replace(/\s+/g, "_");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      registrarEvento(g.id, "baixada");
    } catch (e) {
      avisar("Não consegui baixar o PDF agora — tenta de novo em instantes");
    } finally {
      setBaixandoPdf(false);
    }
  };
  const n = dias(g.venc);
  const cor = n < 0 ? "atraso" : n <= 5 ? "atencao" : "normal";
  const e = g.entenda;
  const maxHist = e ? Math.max(...e.historico.map((h) => h.receita)) : 0;
  const multiplo = e && e.anexos && e.anexos.length > 1;
  const somaReceitaAnexos = multiplo ? e.anexos.reduce((s, a) => s + a.receitaTributada, 0) : 0;
  const aliquotaNominalMedia = multiplo
    ? e.anexos.reduce((s, a) => s + a.aliquotaNominal * a.receitaTributada, 0) / somaReceitaAnexos : 0;
  const aliquotaEfetivaMedia = multiplo
    ? e.anexos.reduce((s, a) => s + a.aliquotaEfetiva * a.receitaTributada, 0) / somaReceitaAnexos : 0;
  const tributosConsolidados = multiplo ? (() => {
    const mapa = {};
    e.anexos.forEach((a) => a.tributos.forEach((t) => {
      if (!mapa[t.nome]) mapa[t.nome] = { nome: t.nome, situacao: t.situacao, valor: 0, porAnexo: [] };
      mapa[t.nome].valor += t.valor;
      mapa[t.nome].porAnexo.push({ anexo: a.nome, valor: t.valor, aliquota: t.aliquota, baseCalculo: t.baseCalculo });
    }));
    return Object.values(mapa);
  })() : [];

  useEffect(() => {
    if (g.id) registrarEvento(g.id, "vista");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.id]);

  return (
    <article className={"guia " + cor}>
      <div className="guia-topo">
        <div>
          <span className="selo">{g.tipo}</span>
          {g.novo && <span className="tag-novo solto">novo</span>}
          <h4>{g.nome}</h4>
          <p className="fino">
            {g.ehParcelamento
              ? `Parcela ${g.parcelaAtual} de ${g.parcelaTotal}`
              : `${g.orgao} · competência ${g.comp}`}
          </p>
        </div>
        <div className="guia-valor"><strong>{brl(g.valor)}</strong><span>{dataBR(g.venc)}</span></div>
      </div>
      <span className={"estado " + cor}>{cor === "atraso" ? "Venceu em " : "Vence em "}{dataBR(g.venc)}</span>
      {g.status === "paga" && g.pagaEm && (
        <p className="obs recalculo-ok">✓ Informado como pago em {dataBR(g.pagaEm)}</p>
      )}
      {g.obs && <p className="obs">{g.obs}</p>}
      {g.composicao && (
        <div className="composicao">
          {g.composicao.map((c, i) => <div key={i}><span>{c.n}</span><b>{brl(c.v)}</b></div>)}
        </div>
      )}
      {g.ehParcelamento && <ResumoParcelamentoGuia g={g} />}
      {g.parcelamento && <DetalheParcelamento pc={g.parcelamento} />}

      {g.pix ? (
        <button className="guia-acao" onClick={() => { avisar("Chave Pix copiada"); registrarEvento(g.id, "baixada"); }}>
          Copiar Pix copia e cola
        </button>
      ) : (
        <>
          <button className="guia-acao" onClick={() => setAberto(!aberto)}>
            {aberto ? "Ocultar código de barras" : "Mostrar código de barras"}
          </button>
          {aberto && (
            <div className="digitavel">
              <Barras seed={g.linha} />
              <code>{g.linha}</code>
              <div className="dupla">
                <button className="btn-primario pequeno" onClick={() => { avisar("Código copiado"); registrarEvento(g.id, "baixada"); }}>Copiar código</button>
                <button className="btn-secundario pequeno" disabled={baixandoPdf} onClick={abrirPdf}>
                  {baixandoPdf ? "Baixando…" : "Baixar PDF"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {pagando ? (
        <div className="pilha-fina">
          <label className="campo">
            <span>Data do pagamento</span>
            <input type="date" value={dataPagamento} onChange={(ev) => setDataPagamento(ev.target.value)} />
          </label>
          <label className="campo">
            <span>Comprovante (opcional)</span>
            <input type="file" accept="image/*,.pdf" onChange={(ev) => setArquivo(ev.target.files[0] || null)} />
          </label>
          {arquivo && <p className="fino">Anexado: {arquivo.name}</p>}
          <div className="dupla">
            <button className="btn-secundario pequeno" disabled={enviandoPagamento}
              onClick={() => { setPagando(false); setArquivo(null); }}>Cancelar</button>
            <button className="btn-primario pequeno" disabled={enviandoPagamento}
              onClick={async () => {
                setEnviandoPagamento(true);
                await marcarPaga(g, arquivo, dataPagamento);
                setEnviandoPagamento(false);
                setPagando(false);
              }}>
              {enviandoPagamento ? "Enviando…" : "Confirmar"}
            </button>
          </div>
        </div>
      ) : (
        <button className="guia-acao" onClick={() => setPagando(true)}>Já paguei</button>
      )}

      {recalculo ? (
        <p className="obs recalculo-ok">✓ Recálculo pedido — a RN vai revisar e te avisar quando a guia for atualizada.</p>
      ) : (
        <button className="guia-acao" onClick={async () => {
          setRecalculo(true);
          try {
            const r = await fetch("/api/notificar-pedido", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tipo: "recalculo",
                empresaNome: emp.fantasia,
                empresaCnpj: emp.cnpj,
                contatoNome: emp.contato,
                guiaNome: g.nome,
                guiaCompetencia: g.comp,
                guiaValor: brl(g.valor),
              }),
            });
            if (!r.ok) throw new Error();
            avisar("Recálculo de " + emp.fantasia + " enviado para " + EMAIL_ESCRITORIO);
          } catch {
            setRecalculo(false);
            avisar("Não consegui enviar agora — tenta de novo em instantes");
          }
        }}>Algo errado nesta guia? Pedir recálculo</button>
      )}

      {e && (
        <>
          <button className="guia-acao destaque-acao" onClick={() => setEntenda(!entenda)}>
            {entenda ? "Ocultar Entenda seu imposto" : "◈ Entenda seu imposto"}
          </button>

          {entenda && (
            <div className="entenda">
              {!multiplo ? (
                <>
                  <p className="explicacao">
                    Sua empresa está no <strong>{e.anexo}</strong>. Sobre o que você faturou nesta
                    competência ({brl(e.rpa)}), o Simples aplicou uma alíquota efetiva de{" "}
                    <strong>{pct(e.aliquotaEfetiva)}</strong> — não os {pct(e.aliquotaNominal, 2)} nominais
                    da sua faixa. A efetiva é sempre menor, porque a tabela tem uma parcela a deduzir
                    embutida no cálculo.
                  </p>

                  <div className="medidor">
                    <div className="medidor-linha"><span>Alíquota nominal da faixa</span><b className="apagado">{pct(e.aliquotaNominal, 2)}</b></div>
                    <div className="medidor-barra">
                      <div className="medidor-preenchido" style={{ width: `${(e.aliquotaEfetiva / e.aliquotaNominal) * 100}%` }} />
                    </div>
                    <div className="medidor-linha"><span>O que você paga de fato (efetiva)</span><b>{pct(e.aliquotaEfetiva)}</b></div>
                  </div>

                  <h5 className="sub">Para onde vai cada real</h5>
                  <div className="tributos">
                    {e.tributos.map((t, i) => {
                      const abertoTrib = tribAberto === i;
                      const largura = (t.valor / g.valor) * 100;
                      return (
                        <button key={i} className={"trib" + (abertoTrib ? " aberto" : "")}
                                onClick={() => setTribAberto(abertoTrib ? null : i)}>
                          <div className="trib-linha1">
                            <span className="trib-nome">{t.nome}</span>
                            {t.situacao === "Redução" && <span className="chip-reducao">redução</span>}
                            <span className="trib-pct">{largura.toFixed(1)}%</span>
                            <span className="trib-valor">{brl(t.valor)}</span>
                          </div>
                          <div className="trib-barra-fundo"><div className="trib-barra" style={{ width: `${largura}%` }} /></div>
                          {abertoTrib && (
                            <div className="trib-detalhe">
                              <div><span>Base de cálculo</span><b>{brl(t.baseCalculo)}</b></div>
                              <div><span>Alíquota deste tributo</span><b>{pct(t.aliquota, 4)}</b></div>
                              {t.reducao && <div><span>Redução aplicada na base do ICMS</span><b>{pct(t.reducao)}</b></div>}
                              <p className="trib-nota">
                                {t.nome === "INSS/CPP" && "A parte da Previdência — a maior fatia do Simples para quem tem funcionários."}
                                {t.nome === "COFINS" && "Contribuição federal sobre o faturamento, embutida na guia única."}
                                {t.nome === "ICMS" && "Imposto estadual sobre a venda de mercadorias, com redução de 3,23% aplicada pelo estado do RJ."}
                                {t.nome === "IRPJ" && "Imposto de Renda da empresa, já recolhido dentro do DAS."}
                                {t.nome === "CSLL" && "Contribuição sobre o lucro, recolhida junto com os demais tributos federais."}
                                {t.nome === "PIS" && "Contribuição federal sobre o faturamento, a menor fatia entre os tributos do DAS."}
                              </p>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {e.proximo && (
                    <div className="alerta-tendencia">
                      <span className="seta-tendencia">↗</span>
                      <div>
                        <strong>Sua alíquota deve subir no próximo mês</strong>
                        <p>
                          A receita dos últimos 12 meses está subindo — a alíquota efetiva projetada
                          para {e.proximo.comp} é de {pct(e.proximo.aliquotaEfetiva)}, um aumento de{" "}
                          {pct(e.proximo.aliquotaEfetiva - e.aliquotaEfetiva, 2)}. Isso acontece mesmo
                          com faturamento parecido, porque o que entra na conta é o acumulado de 12 meses.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="explicacao">
                    Sua empresa fatura em mais de uma frente — {juntarLista(e.anexos.map((a) => descricaoAnexo(a.nome)))} —
                    e cada uma tem uma alíquota própria dentro do Simples Nacional. Sobre o que você
                    faturou nesta competência ({brl(e.rpa)}), a alíquota efetiva média ficou em{" "}
                    <strong>{pct(aliquotaEfetivaMedia)}</strong>, e o DAS soma o valor calculado em
                    cada uma.
                  </p>

                  <div className="pan-itens">
                    {e.anexos.map((a, i) => (
                      <div key={i}>
                        <div><strong>{a.nome}</strong><span>receita {brl(a.receitaTributada)} · alíquota efetiva {pct(a.aliquotaEfetiva)}</span></div>
                        <b>{brl(a.subtotal)}</b>
                      </div>
                    ))}
                  </div>

                  <div className="medidor">
                    <div className="medidor-linha"><span>Alíquota nominal média (ponderada)</span><b className="apagado">{pct(aliquotaNominalMedia, 2)}</b></div>
                    <div className="medidor-barra">
                      <div className="medidor-preenchido" style={{ width: `${(aliquotaEfetivaMedia / aliquotaNominalMedia) * 100}%` }} />
                    </div>
                    <div className="medidor-linha"><span>O que você paga de fato (efetiva média)</span><b>{pct(aliquotaEfetivaMedia)}</b></div>
                  </div>

                  <h5 className="sub">Para onde vai cada real</h5>
                  <div className="tributos">
                    {tributosConsolidados.map((t, i) => {
                      const abertoTrib = tribAberto === i;
                      const largura = (t.valor / g.valor) * 100;
                      return (
                        <button key={i} className={"trib" + (abertoTrib ? " aberto" : "")}
                                onClick={() => setTribAberto(abertoTrib ? null : i)}>
                          <div className="trib-linha1">
                            <span className="trib-nome">{t.nome}</span>
                            {t.situacao === "Redução" && <span className="chip-reducao">redução</span>}
                            <span className="trib-pct">{largura.toFixed(1)}%</span>
                            <span className="trib-valor">{brl(t.valor)}</span>
                          </div>
                          <div className="trib-barra-fundo"><div className="trib-barra" style={{ width: `${largura}%` }} /></div>
                          {abertoTrib && (
                            <div className="trib-detalhe">
                              {t.porAnexo.map((p, j) => (
                                <React.Fragment key={j}>
                                  <div><span>{descricaoAnexo(p.anexo)} · base de cálculo</span><b>{brl(p.baseCalculo)}</b></div>
                                  <div><span>{descricaoAnexo(p.anexo)} · alíquota</span><b>{pct(p.aliquota, 4)}</b></div>
                                  <div><span>{descricaoAnexo(p.anexo)} · valor</span><b>{brl(p.valor)}</b></div>
                                </React.Fragment>
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <h5 className="sub">Ver por anexo</h5>
                  <div className="segmentado">
                    {rotulosAnexoDesambiguados(e.anexos).map((rotulo, i) => (
                      <button key={i} className={abaAnexo === i ? "on" : ""}
                              onClick={() => setAbaAnexo(abaAnexo === i ? null : i)}>
                        {rotulo}
                      </button>
                    ))}
                  </div>

                  {abaAnexo != null && e.anexos[abaAnexo] && (
                    <div className="anexo-detalhe">
                      <p className="anexo-nome-completo">{descricaoAnexo(e.anexos[abaAnexo].nome)}</p>
                      <p className="fino">
                        Receita tributada: <b>{brl(e.anexos[abaAnexo].receitaTributada)}</b> · Alíquota efetiva:{" "}
                        <b>{pct(e.anexos[abaAnexo].aliquotaEfetiva)}</b>
                      </p>
                      <div className="anexo-tributos">
                        {e.anexos[abaAnexo].tributos.map((t, i) => (
                          <div key={i} className="anexo-trib-card">
                            <div className="anexo-trib-titulo">
                              <span>{t.nome}</span>
                              {t.situacao === "Redução" && <span className="chip-reducao">redução</span>}
                            </div>
                            <div className="anexo-trib-linhas">
                              <div><span>Base de cálculo</span><b>{brl(t.baseCalculo)}</b></div>
                              <div><span>Alíquota</span><b>{pct(t.aliquota, 4)}</b></div>
                              <div><span>Valor</span><b>{brl(t.valor)}</b></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              <button className="btn-fantasma largo" onClick={() => setHistAberto(!histAberto)}>
                {histAberto ? "Ocultar histórico de receita" : "Ver histórico de receita (12 meses)"}
              </button>
              {histAberto && (
                <div className="historico">
                  <div className="historico-grafico">
                    {e.historico.map((h, i) => (
                      <div key={i} className="historico-coluna">
                        <div className="historico-barra" style={{ height: `${(h.receita / maxHist) * 100}%` }} title={brl(h.receita)} />
                        <span>{h.comp.slice(0, 2)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="historico-legenda">Acumulado de 12 meses: {brl(e.rbt12)}</p>
                  <p className="historico-faixa">Faixa de enquadramento: de {brl(e.faixaDe)} a {brl(e.faixaAte)}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </article>
  );
}

function Agenda({ emp }) {
  const [cursor, setCursor] = useState(HOJE.slice(0, 7)); // "AAAA-MM"
  const [selecionado, setSelecionado] = useState(null);
  const ano = +cursor.slice(0, 4), mes = +cursor.slice(5, 7) - 1;
  const inicio = new Date(ano, mes, 1).getDay();
  const qtd = new Date(ano, mes + 1, 0).getDate();
  const chave = (d) => `${ano}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const agendaDoMes = emp.agenda.filter((e) => e.data.slice(0, 7) === cursor);
  const totalMes = emp.guias
    .filter((g) => g.venc && g.venc.slice(0, 7) === cursor && g.status !== "paga")
    .reduce((s, g) => s + g.valor, 0);
  const proxima = [...agendaDoMes].filter((e) => dias(e.data) >= 0).sort((a, b) => a.data.localeCompare(b.data))[0];
  const eventos = selecionado ? agendaDoMes.filter((e) => e.data === selecionado) : agendaDoMes;

  const trocarMes = (delta) => {
    const d = new Date(ano, mes + delta, 1);
    setCursor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    setSelecionado(null);
  };

  return (
    <div className="pilha">
      <section className="destaque">
        <div className="agenda-nav">
          <button className="btn-claro pequeno" onClick={() => trocarMes(-1)}>‹</button>
          <p className="rotulo">{MESES_LONGOS[mes]} de {ano} · a pagar no mês</p>
          <button className="btn-claro pequeno" onClick={() => trocarMes(1)}>›</button>
        </div>
        <p className="numero">{totalMes > 0 ? brl(totalMes) : "Nada em aberto"}</p>
        <p className="nota">
          {proxima ? `Próximo: ${proxima.titulo} · ${dataBR(proxima.data)}` : "Nenhum compromisso neste mês"}
        </p>
      </section>

      <div className="calendario">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <span className="cab" key={i}>{d}</span>)}
        {Array.from({ length: inicio }).map((_, i) => <span key={"v" + i} />)}
        {Array.from({ length: qtd }).map((_, i) => {
          const d = i + 1;
          const chaveD = chave(d);
          const guiasDoDia = emp.guias.filter((g) => g.venc === chaveD);
          const evs = agendaDoMes.filter((e) => e.data === chaveD);
          const valorDia = guiasDoDia.filter((g) => g.status !== "paga").reduce((s, g) => s + g.valor, 0);
          const tipoPrincipal = guiasDoDia.length && guiasDoDia.every((g) => g.status === "paga") ? "paga" : "guia";
          return (
            <button key={d} type="button" disabled={!evs.length}
              className={"cel" + (evs.length ? " tem " + tipoPrincipal : "") + (chaveD === HOJE ? " hoje" : "")
                + (selecionado === chaveD ? " sel" : "")}
              onClick={() => setSelecionado(selecionado === chaveD ? null : chaveD)}>
              <span className="cel-dia">{d}</span>
              {valorDia > 0 && <span className="cel-valor">{valorAbrev(valorDia)}</span>}
              {evs.length > 0 && <i className="pontos">{evs.slice(0, 3).map((e, j) => <b key={j} className={tipoPrincipal} />)}</i>}
            </button>
          );
        })}
      </div>

      <div className="legenda">
        <span><b className="guia" /> Guia a pagar</span>
        <span><b className="paga" /> Guia paga</span>
        <span><b className="obrigacao" /> Escritório</span>
        <span><b className="voce" /> Ação sua</span>
      </div>

      {selecionado && (
        <button className="btn-texto" onClick={() => setSelecionado(null)}>‹ Ver agenda completa</button>
      )}
      <div className="pilha-fina">
        {eventos.length
          ? eventos.map((e, i) => <Linha e={e} key={i} />)
          : <p className="vazio">Nenhum compromisso neste dia.</p>}
      </div>
    </div>
  );
}

function Pedidos({ emp, pedidos, setPedidos, avisar }) {
  const [novo, setNovo] = useState(false);
  const [tipo, setTipo] = useState(null);
  const [texto, setTexto] = useState("");
  const meus = pedidos.filter((p) => p.emp === emp.id);

  if (novo) return (
    <div className="pilha">
      <button className="btn-texto" onClick={() => setNovo(false)}>‹ Voltar</button>
      <p className="fino">Pedido para <strong>{emp.fantasia}</strong></p>
      <p className="fino">Vira um e-mail de {emp.fantasia} para a RN Contabilidade ({EMAIL_ESCRITORIO}).</p>
      <h3 className="secao">Do que você precisa?</h3>
      <div className="pilha-fina">
        {TIPOS_PEDIDO.map((t) => (
          <button key={t.id} className={"opcao" + (tipo === t.id ? " on" : "")} onClick={() => setTipo(t.id)}>
            <strong>{t.label}</strong><span>{t.prazo}</span>
          </button>
        ))}
      </div>
      <label className="campo"><span>Detalhes (opcional)</span>
        <textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder="Conte o que precisa, prazos, nomes envolvidos…" /></label>
      <button className="btn-secundario largo" onClick={() => avisar("Seletor de arquivos")}>Anexar arquivo ou foto</button>
      <button className="btn-primario largo" disabled={!tipo} onClick={async () => {
        const tipoLabel = TIPOS_PEDIDO.find((t) => t.id === tipo).label;
        setPedidos([{ id: "p" + Date.now(), emp: emp.id, tipo: tipoLabel,
          texto: texto || "—", etapas: [["Recebido", "05/07"], ["Em andamento", null], ["Concluído", null]] }, ...pedidos]);
        setNovo(false); setTipo(null); setTexto("");
        try {
          const r = await fetch("/api/notificar-pedido", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tipo: "pedido",
              empresaNome: emp.fantasia,
              empresaCnpj: emp.cnpj,
              contatoNome: emp.contato,
              pedidoTipo: tipoLabel,
              detalhe: texto,
            }),
          });
          if (!r.ok) throw new Error();
          avisar("Pedido de " + emp.fantasia + " enviado para " + EMAIL_ESCRITORIO);
        } catch {
          avisar("Pedido salvo, mas não consegui enviar o e-mail agora");
        }
      }}>Enviar pedido</button>
    </div>
  );

  return (
    <div className="pilha">
      <button className="btn-primario largo" onClick={() => setNovo(true)}>Fazer um pedido</button>
      {meus.length === 0 && <p className="vazio">Nenhum pedido aberto para {emp.fantasia}.</p>}
      {meus.map((p) => (
        <article className="pedido" key={p.id}>
          <div className="pedido-topo"><strong>{p.tipo}</strong><span className="estado espera">Em andamento</span></div>
          <p className="fino">{p.texto}</p>
          <div className="trilha">
            {p.etapas.map(([n, d], i) => (
              <div key={i} className={"etapa" + (d ? " feita" : "")}><i /><span>{n}</span><em>{d || "—"}</em></div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function Empresa({ emp, onSair }) {
  return (
    <div className="pilha">
      <section className="ficha">
        <h3>{emp.razao}</h3>
        <dl>
          <div><dt>CNPJ</dt><dd className="mono">{emp.cnpj}</dd></div>
          {emp.ie && <div><dt>Inscrição estadual</dt><dd className="mono">{emp.ie}</dd></div>}
          <div><dt>Regime</dt><dd>{emp.regime}</dd></div>
          <div><dt>Situação</dt><dd><span className="estado ok">{emp.situacao}</span></dd></div>
        </dl>
      </section>
      <section className="ficha">
        <h3>Seu contato na RN</h3>
        <div className="socio"><strong>Felipe — Fiscal</strong><span>Guias, apurações e obrigações</span></div>
        <div className="socio"><strong>Ana Clara — Pessoal</strong><span>Folha, admissões e rescisões</span></div>
        <div className="socio"><strong>Danielle — Contábil</strong><span>Balancetes e demonstrações</span></div>
        <div className="socio"><strong>Maroilsson — Legalização</strong><span>Alterações e abertura de empresa</span></div>
        <div className="socio"><strong>Victor — Financeiro</strong><span>Honorários e cobranças</span></div>
      </section>
      <button className="btn-secundario largo" onClick={onSair}>Sair da conta</button>
      <div className="assina"><Marca tamanho={34} /><p>Portal do Cliente · versão 1.0</p></div>
    </div>
  );
}

function Abas({ aba, setAba }) {
  const itens = [["inicio", "Início", "⌂"], ["guias", "Guias", "▤"], ["agenda", "Agenda", "▦"],
    ["pedidos", "Pedidos", "✎"], ["empresa", "Empresa", "◈"]];
  return (
    <nav className="tabbar">
      {itens.map(([k, l, ic]) => (
        <button key={k} className={aba === k ? "on" : ""} onClick={() => setAba(k)}>
          <span className="ic">{ic}</span>{l}
        </button>
      ))}
    </nav>
  );
}

/* ============================ CSS ============================ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400;600;700&family=Jost:wght@300;400;500&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap');

*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
:root{--papel:#F4F3F1;--branco:#fff;--tinta:#0A0A0A;--suave:#6B6B68;--linha:#E2E1DE;
  --ambar:#B8791A;--rubro:#B02A1E;--verde:#1F6B4A}
.moldura{background:#141412;min-height:100vh;display:flex;align-items:center;justify-content:center;
  font-family:'Instrument Sans',system-ui,sans-serif;color:var(--tinta)}
.tela{width:100%;max-width:430px;min-height:100vh;max-height:100vh;background:var(--papel);
  display:flex;flex-direction:column;position:relative;overflow:hidden}
@media(min-width:520px){.tela{min-height:880px;max-height:880px;border-radius:26px;box-shadow:0 30px 80px rgba(0,0,0,.55)}}
.conteudo{flex:1;overflow-y:auto;padding:16px 16px 92px}
.pilha{display:flex;flex-direction:column;gap:16px}
.pilha-fina{display:flex;flex-direction:column;gap:8px}
.mono,code{font-family:'JetBrains Mono',monospace}
.fino{font-size:12.5px;color:var(--suave);line-height:1.5}
.vazio{font-size:13.5px;color:var(--suave);text-align:center;padding:34px 18px;line-height:1.6}

h2,h3,h4,h5{font-family:'Instrument Sans',sans-serif;letter-spacing:-.01em}
.numero,.guia-valor strong,.emp-num b,.pan-numeros b,.carga-pct{font-family:'Bodoni Moda',Georgia,serif;font-variant-numeric:tabular-nums;letter-spacing:0}
.carga-pct{font-size:28px;font-weight:600;line-height:1.05}
.etiqueta,.rotulo,.secao,.sub{font-family:'Jost',sans-serif;font-weight:400;letter-spacing:.2em;text-transform:lowercase;font-size:10.5px}

.login{flex:1;display:flex;flex-direction:column;justify-content:center;gap:34px;padding:32px 26px;
  background:#000;color:#F2F2F0;min-height:100vh}
.login-marca{text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px}
.login-form{display:flex;flex-direction:column;gap:14px}
.campo{display:flex;flex-direction:column;gap:6px}
.campo span{font-family:'Jost',sans-serif;font-size:11px;letter-spacing:.14em;text-transform:lowercase;opacity:.7}
.campo input,.campo textarea{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);
  border-radius:12px;padding:14px;color:inherit;font:inherit;font-size:16px}
.conteudo .campo input,.conteudo .campo textarea{background:#fff;border-color:var(--linha);color:var(--tinta)}
.conteudo .campo span{color:var(--suave);opacity:1}
.switch{display:flex;align-items:center;gap:10px;background:none;border:0;color:#B5B5B0;font:inherit;font-size:13px;cursor:pointer}
.trilho{width:38px;height:22px;border-radius:11px;background:rgba(255,255,255,.2);position:relative;flex:none;transition:.2s}
.trilho i{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.2s}
.trilho.on{background:#fff}.trilho.on i{left:19px;background:#000}
.login-erro{font-size:12.5px;color:#FF9A8C;line-height:1.5;margin-top:-6px}
.rodape{text-align:center;font-family:'Jost',sans-serif;font-size:11px;color:#7A7A76;letter-spacing:.2em}

.btn-primario{background:var(--tinta);color:#fff;border:0;border-radius:13px;padding:15px;font:inherit;
  font-weight:600;font-size:15px;cursor:pointer}
.btn-primario:disabled{opacity:.32}
.login .btn-primario{background:#fff;color:#000}
.btn-secundario{background:#fff;color:var(--tinta);border:1px solid var(--linha);border-radius:13px;
  padding:14px;font:inherit;font-weight:600;font-size:14px;cursor:pointer}
.btn-claro{background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:11px;
  padding:11px 18px;font:inherit;font-weight:600;font-size:14px;cursor:pointer;align-self:flex-start}
.btn-texto{background:none;border:0;color:var(--tinta);font:inherit;font-weight:600;font-size:14px;cursor:pointer;padding:6px}
.login .btn-texto{color:#B5B5B0}
.btn-fantasma{background:none;border:0;border-top:1px solid var(--linha);color:var(--suave);font:inherit;
  font-weight:600;font-size:13px;cursor:pointer;padding:11px 0 0;text-align:left}
.largo{width:100%}.pequeno{padding:10px 14px;font-size:13px;flex:1}
.dupla{display:flex;gap:8px}

.topo{background:#000;color:#F2F2F0;padding:18px 18px 22px}
.topo-marca{margin-bottom:16px;opacity:.85}
.topo-ola{font-size:13px;color:#9A9A96}
.troca{background:none;border:0;color:inherit;font:inherit;display:flex;align-items:center;gap:8px;padding:2px 0;cursor:pointer}
.troca h2{font-size:23px;font-weight:700}
.troca-fixa{font-size:23px;font-weight:700;padding:2px 0}
.seta{font-size:12px;color:#8A8A86}
.topo-cnpj{font-family:'JetBrains Mono';font-size:11px;color:#8A8A86;margin-top:4px}
.topo-titulo{font-size:22px;font-weight:700}

.destaque{background:var(--tinta);color:#fff;border-radius:18px;padding:20px;display:flex;flex-direction:column;gap:6px}
.rotulo{color:#B5B5B0}
.agenda-nav{display:flex;align-items:center;justify-content:space-between;gap:8px}
.agenda-nav .rotulo{flex:1;text-align:center;margin:0}
.agenda-nav .btn-claro.pequeno{flex:none;padding:6px 12px;align-self:center}
.numero{font-size:38px;font-weight:600;line-height:1.05}
.nota{font-size:13px;color:#C6C6C1;margin-bottom:10px}
.secao{color:var(--suave);margin-bottom:10px;display:block}

.panorama{background:#fff;border:1px solid var(--linha);border-radius:16px;padding:17px;display:flex;flex-direction:column;gap:13px}
.pan-topo{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.pan-topo h3{font-size:17px;font-weight:600;margin-top:6px}
.farol{width:11px;height:11px;border-radius:50%;flex:none;margin-top:5px}
.farol.ok{background:var(--verde);box-shadow:0 0 0 4px rgba(31,107,74,.13)}
.farol.risco{background:var(--rubro)}
.pan-numeros{display:flex;gap:10px}
.pan-numeros div{flex:1;background:#F7F6F4;border-radius:11px;padding:11px 13px}
.pan-numeros b{font-size:19px;display:block}
.pan-numeros span{font-size:11px;color:var(--suave)}
.pan-detalhe{display:flex;flex-direction:column;gap:12px}
.pan-detalhe>p{font-size:13.5px;line-height:1.62}
.pan-itens{display:flex;flex-direction:column;gap:7px}
.pan-itens>div{display:flex;justify-content:space-between;gap:12px;align-items:center;background:#F7F6F4;border-radius:10px;padding:11px 13px}
.pan-itens strong{font-size:13px;font-weight:600;display:block}
.pan-itens span{font-size:11.5px;color:var(--suave)}
.pan-itens b{font-variant-numeric:tabular-nums;font-size:14px;flex:none}
.pan-alerta{font-size:12.5px;color:#8A6516;background:#FBF4E6;border-radius:10px;padding:11px 13px;line-height:1.55}
.pan-alerta.alerta{color:var(--rubro);background:#FBE9E7}
.pan-escopo{font-size:11.5px;color:var(--suave);line-height:1.5}

.linha{background:#fff;border:1px solid var(--linha);border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:13px;
  border-left:3px solid var(--linha)}
.linha-guia{border-left-color:var(--tinta)}
.linha-dp{border-left-color:var(--ambar)}
.linha-obrigacao{border-left-color:#9A9A96}
.linha-voce{border-left-color:var(--rubro)}
.linha-paga{border-left-color:var(--verde)}
.bloco-data{display:flex;flex-direction:column;align-items:center;min-width:32px}
.bloco-data .dia{font-family:'Bodoni Moda',serif;font-size:20px;font-weight:600;line-height:1}
.bloco-data .mes{font-family:'Jost',sans-serif;font-size:9.5px;letter-spacing:.14em;color:var(--suave)}
.linha-corpo{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
.linha-corpo strong{font-size:14px;font-weight:600}
.linha-corpo span{font-size:12px;color:var(--suave)}
.pino{width:7px;height:7px;border-radius:50%;flex:none}
.pino.guia,b.guia{background:var(--tinta)}
.pino.dp,b.dp{background:var(--ambar)}
.pino.obrigacao,b.obrigacao{background:#9A9A96}
.pino.voce,b.voce{background:var(--rubro)}
.pino.paga,b.paga{background:var(--verde)}

.atalhos{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.atalhos button{background:#fff;border:1px solid var(--linha);border-radius:14px;padding:16px 12px;
  display:flex;flex-direction:column;gap:5px;align-items:flex-start;font:inherit;cursor:pointer;text-align:left}
.atalhos b{font-family:'Bodoni Moda',serif;font-size:22px;font-weight:600}
.atalhos span{font-size:12.5px;color:var(--suave)}

.segmentado{display:flex;background:#E6E5E2;border-radius:11px;padding:3px;gap:3px}
.segmentado button{flex:1;min-width:0;border:0;background:none;padding:9px 6px;border-radius:9px;font:inherit;font-size:13px;
  font-weight:600;color:var(--suave);cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.segmentado button.on{background:#fff;color:var(--tinta);box-shadow:0 1px 3px rgba(0,0,0,.09)}

article.guia{background:#fff;border:1px solid var(--linha);border-radius:14px;padding:15px;display:flex;flex-direction:column;
  gap:11px;border-left:4px solid var(--linha)}
.guia.normal{border-left-color:var(--tinta)}
.guia.atencao{border-left-color:var(--ambar)}
.guia.atraso{border-left-color:var(--rubro)}
.guia-topo{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.selo{display:inline-block;font-family:'JetBrains Mono';font-size:10px;font-weight:600;letter-spacing:.07em;
  background:#EAE9E5;color:var(--suave);padding:3px 7px;border-radius:5px;margin-bottom:7px}
.tag-novo{font-style:normal;font-size:9.5px;background:var(--tinta);color:#fff;padding:2px 6px;border-radius:4px;
  text-transform:uppercase;letter-spacing:.06em;vertical-align:middle}
.tag-novo.solto{margin-left:5px}
.guia h4{font-size:16px;font-weight:600}
.guia-valor{text-align:right;flex:none}
.guia-valor strong{font-size:19px;font-weight:600;display:block}
.guia-valor span{font-family:'JetBrains Mono';font-size:11px;color:var(--suave)}
.estado{font-size:12px;font-weight:600;padding:4px 9px;border-radius:6px;display:inline-block;align-self:flex-start}
.estado.normal{background:#ECEBE7;color:var(--tinta)}
.estado.atencao{background:#FBF4E6;color:#8A6516}
.estado.atraso{background:#FBE9E7;color:var(--rubro)}
.estado.ok{background:#E3EDE7;color:var(--verde)}
.estado.espera{background:#F2EFE6;color:#8A7440}
.obs{font-size:12px;color:var(--suave);background:#F7F6F4;border-radius:9px;padding:10px 12px;line-height:1.5}
.recalculo-ok{color:var(--verde);background:#E3EDE7;font-weight:600}
.composicao{background:#F7F6F4;border-radius:10px;padding:4px 12px}
.composicao div{display:flex;justify-content:space-between;padding:7px 0;font-size:12.5px;border-bottom:1px solid #EBEAE6}
.composicao div:last-child{border:0}
.composicao b{font-variant-numeric:tabular-nums}
.guia-acao{background:none;border:0;border-top:1px dashed var(--linha);padding-top:11px;font:inherit;font-size:13px;
  font-weight:600;color:var(--tinta);cursor:pointer;text-align:left}
.destaque-acao{color:var(--verde);border-top-style:solid}
.digitavel{display:flex;flex-direction:column;gap:9px}
.barcode{display:flex;align-items:flex-end;gap:2px;height:36px;overflow:hidden}
.barcode span{display:block;height:100%;background:var(--tinta)}
.digitavel code{font-size:11px;color:var(--suave);word-break:break-all}

.doc{background:#fff;border:1px solid var(--linha);border-radius:12px;padding:13px 14px;display:flex;
  align-items:center;justify-content:space-between;gap:12px;font:inherit;text-align:left;cursor:pointer;width:100%}
.doc strong{font-size:14px;font-weight:600;display:block;margin-bottom:3px}
.doc span{font-size:12px;color:var(--suave)}
.baixar{font-size:17px;flex:none}

.calendario{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px;background:#fff;border:1px solid var(--linha);
  border-radius:14px;padding:9px 6px}
.calendario .cab{text-align:center;font-family:'Jost',sans-serif;font-size:9px;letter-spacing:.1em;color:var(--suave);padding-bottom:3px}
.cel{aspect-ratio:1/0.8;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font-size:11px;
  border-radius:7px;font-variant-numeric:tabular-nums;border:0;background:none;font:inherit;color:inherit;
  cursor:default;padding:0;width:100%;min-width:0}
.cel:disabled{cursor:default}
.cel.tem{font-weight:600;cursor:pointer}
.cel.tem.guia{background:#ECEBE7}
.cel.tem.dp{background:#FBF4E6}
.cel.tem.obrigacao{background:#F0F0EE}
.cel.tem.voce{background:#FBE9E7}
.cel.tem.paga{background:#E3EDE7}
.cel-valor{font-family:'JetBrains Mono';font-size:7px;color:var(--suave)}
.cel.tem.guia .cel-valor{color:var(--tinta);font-weight:700}
.cel.tem.paga .cel-valor{color:var(--verde);font-weight:700}
.cel.hoje{background:var(--tinta)!important;color:#fff}
.cel.hoje .cel-valor{color:#D9D9D6}
.cel.sel{box-shadow:inset 0 0 0 2px var(--tinta)}
.pontos{display:flex;gap:1.5px;height:4px}
.pontos b{width:3px;height:3px;border-radius:50%}
.cel.hoje .pontos b{background:#fff}
.legenda{display:flex;gap:13px;flex-wrap:wrap;font-size:11.5px;color:var(--suave);padding:0 3px}
.legenda span{display:flex;align-items:center;gap:5px}
.legenda b{width:7px;height:7px;border-radius:50%}

.opcao{background:#fff;border:1px solid var(--linha);border-radius:12px;padding:13px 14px;display:flex;
  justify-content:space-between;align-items:center;gap:10px;font:inherit;cursor:pointer;text-align:left;width:100%}
.opcao.on{border-color:var(--tinta);background:#EFEEEB;box-shadow:inset 0 0 0 1px var(--tinta)}
.opcao strong{font-size:14px;font-weight:600}
.opcao span{font-size:11.5px;color:var(--suave);flex:none}
.pedido{background:#fff;border:1px solid var(--linha);border-radius:14px;padding:15px;display:flex;flex-direction:column;gap:11px}
.pedido-topo{display:flex;justify-content:space-between;align-items:center;gap:10px}
.pedido-topo strong{font-size:15.5px;font-weight:600}
.trilha{display:flex;gap:6px;border-top:1px dashed var(--linha);padding-top:11px}
.etapa{flex:1;display:flex;flex-direction:column;gap:4px}
.etapa i{height:3px;border-radius:2px;background:var(--linha);display:block}
.etapa.feita i{background:var(--tinta)}
.etapa span{font-size:11px;font-weight:600;color:var(--suave)}
.etapa.feita span{color:var(--tinta)}
.etapa em{font-family:'JetBrains Mono';font-size:10px;font-style:normal;color:var(--suave)}

.ficha{background:#fff;border:1px solid var(--linha);border-radius:14px;padding:16px}
.ficha h3{font-size:15.5px;font-weight:600;margin-bottom:12px}
.ficha dl div{display:flex;justify-content:space-between;gap:14px;padding:8px 0;border-bottom:1px solid #F1F0ED}
.ficha dl div:last-child{border:0}
.ficha dt{font-size:12.5px;color:var(--suave);flex:none}
.ficha dd{font-size:13px;text-align:right;font-weight:500}
.socio{padding:9px 0;border-bottom:1px solid #F1F0ED;display:flex;flex-direction:column;gap:2px}
.socio:last-child{border:0}
.socio strong{font-size:14px;font-weight:600}
.socio span{font-size:12px;color:var(--suave)}
.assina{display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 0 14px;opacity:.7}
.assina p{font-family:'Jost',sans-serif;font-size:10.5px;letter-spacing:.16em;color:var(--suave)}

.modal{position:absolute;inset:0;background:rgba(10,10,10,.55);z-index:40;display:flex;align-items:flex-end;
  justify-content:center;backdrop-filter:blur(3px)}
.folha{background:var(--papel);width:100%;max-height:88%;overflow-y:auto;border-radius:20px 20px 0 0;padding:20px}
.folha-titulo{font-size:18px;font-weight:600;margin-bottom:14px}
.emp{background:#fff;border:1px solid var(--linha);border-radius:13px;padding:14px;display:flex;justify-content:space-between;
  gap:12px;align-items:center;font:inherit;text-align:left;cursor:pointer;width:100%}
.emp.on{border-color:var(--tinta);box-shadow:inset 0 0 0 1px var(--tinta)}
.emp strong{font-size:14.5px;font-weight:600;display:block}
.emp span{font-size:11.5px;color:var(--suave);display:block;margin-top:2px}
.emp-num{text-align:right;flex:none}
.emp-num b{font-size:16px;font-weight:600;display:block}
.emp-num span{font-size:11px;color:var(--suave)}

.tabbar{position:absolute;bottom:0;left:0;right:0;background:rgba(255,255,255,.97);border-top:1px solid var(--linha);
  display:flex;padding:7px 4px 10px;backdrop-filter:blur(8px)}
.tabbar button{flex:1;background:none;border:0;display:flex;flex-direction:column;align-items:center;gap:3px;font:inherit;
  font-size:10px;font-weight:600;color:var(--suave);cursor:pointer;padding:4px 0}
.tabbar .ic{font-size:17px;line-height:1}
.tabbar button.on{color:var(--tinta)}

.toast{position:absolute;bottom:84px;left:16px;right:16px;background:var(--tinta);color:#fff;padding:13px 16px;
  border-radius:12px;font-size:13.5px;text-align:center;z-index:50;box-shadow:0 8px 24px rgba(0,0,0,.25);animation:sobe .24s ease}
@keyframes sobe{from{opacity:0;transform:translateY(10px)}}

/* entenda seu imposto — dentro do card da guia */
.entenda{display:flex;flex-direction:column;gap:14px;background:#FAFAF8;border:1px solid var(--linha);
  border-radius:12px;padding:15px;margin-top:-3px}
.explicacao{font-size:13px;line-height:1.62;color:#2A2A28}
.explicacao strong{color:var(--tinta)}
.medidor{display:flex;flex-direction:column;gap:6px;background:#fff;border-radius:11px;padding:13px}
.medidor-linha{display:flex;justify-content:space-between;font-size:11.5px;color:var(--suave)}
.medidor-linha b{font-size:13px;color:var(--tinta);font-weight:600}
.medidor-linha b.apagado{color:var(--suave);text-decoration:line-through;font-weight:500}
.medidor-barra{height:7px;background:#E4E3DF;border-radius:5px;overflow:hidden;margin:2px 0;position:relative}
.medidor-preenchido{height:100%;background:var(--tinta);border-radius:5px}
.limite-marcador{position:absolute;top:0;bottom:0;width:2px;background:#fff;box-shadow:0 0 0 1px var(--tinta);transform:translateX(-50%)}
.limite.atencao .medidor-preenchido{background:var(--ambar)}
.limite.alerta .medidor-preenchido{background:var(--rubro)}
.parc-legenda{display:flex;justify-content:space-between;font-size:11.5px;color:var(--suave)}
.tributos{display:flex;flex-direction:column;gap:6px}
.trib{background:#fff;border:1px solid transparent;border-radius:10px;padding:10px 12px;font:inherit;text-align:left;
  cursor:pointer;width:100%;display:flex;flex-direction:column;gap:6px}
.trib.aberto{border-color:var(--linha)}
.trib-linha1{display:flex;align-items:center;gap:8px}
.trib-nome{font-size:13px;font-weight:600;flex:1}
.chip-reducao{font-size:9px;background:#EAF3ED;color:var(--verde);padding:2px 7px;border-radius:20px;font-weight:600;text-transform:lowercase}
.trib-pct{font-size:11.5px;color:var(--suave);font-variant-numeric:tabular-nums;flex:none}
.trib-valor{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}
.trib-barra-fundo{height:4px;background:#E9E8E4;border-radius:3px;overflow:hidden}
.trib-barra{height:100%;background:var(--tinta);border-radius:3px}
.trib-detalhe{display:flex;flex-direction:column;gap:5px;padding-top:5px;border-top:1px dashed var(--linha)}
.trib-detalhe div{display:flex;justify-content:space-between;font-size:11.5px}
.trib-detalhe span{color:var(--suave)}
.trib-detalhe b{font-weight:600}
.trib-nota{font-size:11.5px;color:var(--suave);line-height:1.55;margin-top:2px}
.anexo-detalhe{display:flex;flex-direction:column;gap:10px;background:#fff;border-radius:11px;padding:12px 13px;border:1px solid var(--linha)}
.anexo-nome-completo{font-size:13px;font-weight:600;line-height:1.4;padding-bottom:8px;border-bottom:1px solid #F1F0ED}
.anexo-tributos{display:flex;flex-direction:column;gap:10px}
.anexo-trib-card{padding-top:10px;border-top:1px solid #F1F0ED}
.anexo-trib-card:first-child{padding-top:0;border-top:0}
.anexo-trib-titulo{display:flex;align-items:center;gap:6px;font-weight:600;font-size:13px;margin-bottom:5px}
.anexo-trib-linhas{display:flex;flex-direction:column;gap:3px}
.anexo-trib-linhas div{display:flex;justify-content:space-between;gap:8px;font-size:11.5px}
.anexo-trib-linhas span{color:var(--suave)}
.anexo-trib-linhas b{font-weight:600;font-variant-numeric:tabular-nums;text-align:right}
.alerta-tendencia{display:flex;gap:10px;background:#FBF4E6;border-radius:11px;padding:12px 13px}
.seta-tendencia{font-size:17px;color:var(--ambar);flex:none;font-weight:700}
.alerta-tendencia strong{font-size:13px;font-weight:700;display:block;color:#7A5510;margin-bottom:3px}
.alerta-tendencia p{font-size:12px;color:#8A6516;line-height:1.55}
.historico{display:flex;flex-direction:column;gap:8px}
.historico-grafico{display:flex;align-items:flex-end;gap:3px;height:70px;padding:0 2px}
.historico-coluna{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%;
  background:none;border:0;padding:0;font:inherit;cursor:pointer}
.historico-barra{width:100%;background:var(--tinta);border-radius:3px 3px 0 0;min-height:3px}
.historico-coluna.atual .historico-barra{background:var(--verde)}
.historico-coluna.atual span{color:var(--verde);font-weight:600}
.historico-coluna span{font-family:'Jost',sans-serif;font-size:8.5px;letter-spacing:.05em;color:var(--suave)}
.historico-legenda{font-size:11.5px;color:var(--suave)}
.historico-faixa{font-size:11.5px;color:var(--suave);padding-top:7px;border-top:1px dashed var(--linha)}
button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--tinta);outline-offset:2px}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
