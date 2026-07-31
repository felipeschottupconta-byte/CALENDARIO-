/* ============================================================
   AGENDA FISCAL — motor de geração de obrigações
   RN Contabilidade · Portal do Cliente

   Gera a agenda de uma empresa a partir do perfil dela.
   Não depende de Domínio, Gestta ou de arquivo nenhum.

   Uso:
     const eventos = gerarAgenda(empresa, 2026, 8);
   ============================================================ */

/* ---------------------------------------------------------------
   1. FERIADOS
   Nacionais + estaduais RJ + municipais Nova Friburgo.
   ATENÇÃO: os municipais precisam ser conferidos na lei municipal
   antes de ir pra produção — errar aqui antecipa guia sem motivo.
   --------------------------------------------------------------- */

// Páscoa (algoritmo de Meeus/Butcher) — base dos feriados móveis
function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

const somarDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function feriados(ano, municipio = "nova_friburgo") {
  const p = pascoa(ano);
  const fixos = [
    [1, 1, "Confraternização Universal"],
    [4, 21, "Tiradentes"],
    [5, 1, "Dia do Trabalho"],
    [9, 7, "Independência"],
    [10, 12, "Nossa Senhora Aparecida"],
    [11, 2, "Finados"],
    [11, 15, "Proclamação da República"],
    [11, 20, "Consciência Negra"],
    [12, 25, "Natal"],
  ];
  const estaduais = [[4, 23, "São Jorge (RJ)"]];
  // CONFERIR na lei municipal de Nova Friburgo antes de produção:
  const municipais = municipio === "nova_friburgo"
    ? [[5, 16, "Aniversário de Nova Friburgo"], [6, 24, "São João Batista — padroeiro"]]
    : [];

  const lista = [...fixos, ...estaduais, ...municipais].map(([m, d, nome]) => ({
    data: iso(new Date(ano, m - 1, d)), nome,
  }));

  // móveis
  lista.push(
    { data: iso(somarDias(p, -48)), nome: "Carnaval (segunda)" },
    { data: iso(somarDias(p, -47)), nome: "Carnaval (terça)" },
    { data: iso(somarDias(p, -46)), nome: "Quarta-feira de Cinzas (até 12h)" },
    { data: iso(somarDias(p, -2)), nome: "Sexta-feira Santa" },
    { data: iso(somarDias(p, 60)), nome: "Corpus Christi" },
  );
  return new Set(lista.map((f) => f.data));
}

/* ---------------------------------------------------------------
   2. DIA ÚTIL
   --------------------------------------------------------------- */

const ehUtil = (d, fer) => d.getDay() !== 0 && d.getDay() !== 6 && !fer.has(iso(d));

/** Antecipa para o dia útil anterior (padrão de quase toda guia). */
function anteciparUtil(d, fer) {
  let x = new Date(d);
  while (!ehUtil(x, fer)) x = somarDias(x, -1);
  return x;
}

/** Posterga para o próximo dia útil (usado por algumas obrigações municipais). */
function postergarUtil(d, fer) {
  let x = new Date(d);
  while (!ehUtil(x, fer)) x = somarDias(x, 1);
  return x;
}

/** N-ésimo dia útil do mês (folha de pagamento = 5º dia útil). */
function nEsimoUtil(ano, mes, n, fer) {
  let d = new Date(ano, mes - 1, 1), c = 0;
  while (true) {
    if (ehUtil(d, fer)) { c++; if (c === n) return d; }
    d = somarDias(d, 1);
  }
}

/** Último dia útil do mês. */
function ultimoUtil(ano, mes, fer) {
  return anteciparUtil(new Date(ano, mes, 0), fer);
}

/* ---------------------------------------------------------------
   3. CATÁLOGO DE OBRIGAÇÕES
   Fica em coleção do Firestore na versão final — aqui como
   referência do formato. Editar prazo não deve exigir deploy.

   regra:
     { tipo: "diaFixo", dia: 20 }          -> dia 20, antecipando
     { tipo: "diaUtil", n: 5 }             -> 5º dia útil
     { tipo: "ultimoUtil" }                -> último dia útil do mês
     { tipo: "diaFixoPosterga", dia: 10 }  -> dia 10, postergando
   quando: em quais meses ocorre (null = todo mês)
   --------------------------------------------------------------- */

const CATALOGO = [
  // ---------- Simples Nacional ----------
  { id: "das", nome: "DAS — Simples Nacional", grupo: "guia", regra: { tipo: "diaFixo", dia: 20 },
    regimes: ["simples"], competencia: -1 },
  { id: "defis", nome: "DEFIS — declaração anual", grupo: "obrigacao", regra: { tipo: "diaFixo", dia: 31 },
    regimes: ["simples"], meses: [3] },

  // ---------- Lucro Presumido / Real ----------
  { id: "pis_cofins", nome: "PIS/COFINS", grupo: "guia", regra: { tipo: "diaFixo", dia: 25 },
    regimes: ["presumido", "real"], competencia: -1 },
  { id: "irpj_csll_trim", nome: "IRPJ/CSLL — trimestral", grupo: "guia", regra: { tipo: "ultimoUtil" },
    regimes: ["presumido"], meses: [1, 4, 7, 10] },
  { id: "ecf", nome: "ECF — escrituração fiscal", grupo: "obrigacao", regra: { tipo: "ultimoUtil" },
    regimes: ["presumido", "real"], meses: [7] },
  { id: "ecd", nome: "ECD — escrituração contábil", grupo: "obrigacao", regra: { tipo: "ultimoUtil" },
    regimes: ["presumido", "real"], meses: [5] },
  { id: "sped_fiscal", nome: "SPED Fiscal (EFD ICMS/IPI)", grupo: "obrigacao", regra: { tipo: "diaFixo", dia: 20 },
    regimes: ["presumido", "real"], exigeICMS: true, competencia: -1 },
  { id: "icms_rj", nome: "ICMS — RJ", grupo: "guia", regra: { tipo: "diaFixo", dia: 10 },
    regimes: ["presumido", "real"], exigeICMS: true, competencia: -1 },

  // ---------- Folha / Departamento Pessoal ----------
  { id: "folha", nome: "Pagamento da folha", grupo: "dp", regra: { tipo: "diaUtil", n: 5 },
    exigeFuncionarios: true, competencia: -1 },
  { id: "fgts", nome: "FGTS Digital", grupo: "guia", regra: { tipo: "diaFixo", dia: 20 },
    exigeFuncionarios: true, competencia: -1 },
  { id: "dctfweb", nome: "DCTFWeb — transmissão", grupo: "obrigacao", regra: { tipo: "diaFixo", dia: 15 },
    exigeFolhaOuProlabore: true, competencia: -1 },
  { id: "darf_inss", nome: "DARF INSS — DCTFWeb", grupo: "guia", regra: { tipo: "diaFixo", dia: 20 },
    exigeFolhaOuProlabore: true, competencia: -1 },
  { id: "irrf", nome: "DARF IRRF", grupo: "guia", regra: { tipo: "diaFixo", dia: 20 },
    exigeFolhaOuProlabore: true, competencia: -1 },
  { id: "esocial", nome: "eSocial — fechamento", grupo: "obrigacao", regra: { tipo: "diaFixo", dia: 15 },
    exigeFolhaOuProlabore: true, competencia: -1 },
  { id: "decimo_1", nome: "13º salário — 1ª parcela", grupo: "dp", regra: { tipo: "diaFixo", dia: 30 },
    exigeFuncionarios: true, meses: [11] },
  { id: "decimo_2", nome: "13º salário — 2ª parcela", grupo: "dp", regra: { tipo: "diaFixo", dia: 20 },
    exigeFuncionarios: true, meses: [12] },

  // ---------- Município ----------
  { id: "iss", nome: "ISSQN", grupo: "guia", regra: { tipo: "diaFixo", dia: 10 },
    exigeISS: true, competencia: -1 },

  // ---------- Escritório / cliente ----------
  { id: "honorarios", nome: "Honorários contábeis", grupo: "guia", regra: { tipo: "diaFixo", dia: 10 } },
  { id: "envio_docs", nome: "Enviar documentos do mês", grupo: "voce", regra: { tipo: "diaUtil", n: 5 },
    aviso: "Prazo para nos enviar notas, extratos e documentos" },
];

/* ---------------------------------------------------------------
   4. GERADOR
   --------------------------------------------------------------- */

function competenciaDe(ano, mes, deslocamento) {
  const d = new Date(ano, mes - 1 + deslocamento, 1);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function resolverData(regra, ano, mes, fer) {
  switch (regra.tipo) {
    case "diaFixo": {
      const ultimo = new Date(ano, mes, 0).getDate();
      return anteciparUtil(new Date(ano, mes - 1, Math.min(regra.dia, ultimo)), fer);
    }
    case "diaFixoPosterga": {
      const ultimo = new Date(ano, mes, 0).getDate();
      return postergarUtil(new Date(ano, mes - 1, Math.min(regra.dia, ultimo)), fer);
    }
    case "diaUtil":   return nEsimoUtil(ano, mes, regra.n, fer);
    case "ultimoUtil": return ultimoUtil(ano, mes, fer);
    default: throw new Error("Regra desconhecida: " + regra.tipo);
  }
}

function seAplica(item, empresa) {
  if (item.regimes && !item.regimes.includes(empresa.regime)) return false;
  if (item.exigeFuncionarios && !empresa.temFuncionarios) return false;
  if (item.exigeICMS && !empresa.contribuinteICMS) return false;
  if (item.exigeISS && !empresa.contribuinteISS) return false;
  if (item.exigeFolhaOuProlabore && !empresa.temFuncionarios && !empresa.temProlabore) return false;
  if (empresa.obrigacoesDesativadas?.includes(item.id)) return false;
  return true;
}

/**
 * Gera a agenda de um mês.
 * @param {object} empresa - { regime: 'simples'|'presumido'|'real',
 *                             temFuncionarios, temProlabore,
 *                             contribuinteICMS, contribuinteISS,
 *                             municipio, obrigacoesDesativadas: [] }
 */
export function gerarAgenda(empresa, ano, mes) {
  const fer = feriados(ano, empresa.municipio || "nova_friburgo");
  const catalogo = [...CATALOGO, ...(empresa.obrigacoesExtras || [])];

  return catalogo
    .filter((item) => seAplica(item, empresa))
    .filter((item) => !item.meses || item.meses.includes(mes))
    .map((item) => {
      const data = resolverData(item.regra, ano, mes, fer);
      const original = item.regra.tipo === "diaFixo"
        ? new Date(ano, mes - 1, Math.min(item.regra.dia, new Date(ano, mes, 0).getDate()))
        : data;
      return {
        obrigacaoId: item.id,
        titulo: item.nome,
        grupo: item.grupo,               // guia | dp | obrigacao | voce
        vencimento: iso(data),
        antecipado: iso(data) !== iso(original),
        competencia: item.competencia != null
          ? competenciaDe(ano, mes, item.competencia) : null,
        aviso: item.aviso || null,
      };
    })
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

/** Agenda de um intervalo de meses (para o calendário rolar). */
export function gerarPeriodo(empresa, ano, mesInicio, qtdMeses) {
  const out = [];
  for (let i = 0; i < qtdMeses; i++) {
    const d = new Date(ano, mesInicio - 1 + i, 1);
    out.push(...gerarAgenda(empresa, d.getFullYear(), d.getMonth() + 1));
  }
  return out;
}

/* ---------------------------------------------------------------
   5. EXEMPLO
   --------------------------------------------------------------- */
// gerarAgenda({
//   regime: "simples", temFuncionarios: true, temProlabore: true,
//   contribuinteICMS: true, contribuinteISS: false, municipio: "nova_friburgo",
// }, 2026, 8);
