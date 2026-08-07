// api/chat.js
// ============================================================
// Chat de IA do Portal do Cliente. Responde dúvidas do cliente
// sobre a situação fiscal DELE: alíquota, por que dessa alíquota,
// extrato do Simples, tributos, faixas, sublimite.
//
// Invariante do projeto (CLAUDE.md): o modelo escreve TEXTO, nunca
// calcula nem inventa número. Todo valor que ele cita precisa já
// existir no `contexto` que o app manda — que por sua vez vem dos
// parsers determinísticos (via Supabase). O system prompt abaixo
// deixa isso explícito e o modelo é instruído a dizer "não tenho
// esse dado" em vez de estimar.
//
// Roda em Node.js (não edge) — o SDK da Anthropic usa APIs de Node.
//
// Configuração necessária (Vercel → Settings → Environment Variables):
//   ANTHROPIC_API_KEY   chave da API da Anthropic (fica só no servidor,
//                       nunca vai pro navegador)
//
// Requer: npm install @anthropic-ai/sdk
// ============================================================

import Anthropic from "@anthropic-ai/sdk";

export const config = { runtime: "nodejs" };

const MODELO = "claude-sonnet-5"; // stack do projeto (ver CLAUDE.md)
const MAX_MENSAGENS = 20; // corta históricos longos demais

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  const chave = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!chave) {
    return res.status(500).json({ erro: "Chat indisponível: ANTHROPIC_API_KEY não configurada no servidor." });
  }

  const { mensagens, contexto } = req.body || {};
  if (!Array.isArray(mensagens) || mensagens.length === 0) {
    return res.status(400).json({ erro: "Nenhuma mensagem recebida." });
  }

  // Só deixamos passar role user/assistant e content string — nada
  // de content blocks arbitrários vindos do cliente.
  const historico = mensagens
    .slice(-MAX_MENSAGENS)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  if (historico.length === 0 || historico[0].role !== "user") {
    return res.status(400).json({ erro: "Conversa inválida." });
  }

  const system = montarSystem(contexto);

  try {
    const client = new Anthropic({ apiKey: chave });
    const resposta = await client.messages.create({
      model: MODELO,
      max_tokens: 1200,
      thinking: { type: "disabled" }, // chat leve — sem latência de raciocínio
      system,
      messages: historico,
    });

    if (resposta.stop_reason === "refusal") {
      return res.status(200).json({
        resposta: "Não consigo responder isso por aqui. Se for uma dúvida fiscal específica, fale direto com o escritório.",
      });
    }

    const texto = (resposta.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return res.status(200).json({ resposta: texto || "Não consegui formular uma resposta agora." });
  } catch (e) {
    console.error("Erro no chat de IA:", e);
    return res.status(500).json({ erro: "Falha ao falar com a IA. Tente de novo em instantes." });
  }
}

function montarSystem(contexto) {
  const dados = contexto ? JSON.stringify(contexto, null, 2) : "(sem dados carregados)";
  return `Você é o assistente do Portal do Cliente da RN Contabilidade, um escritório de contabilidade em Nova Friburgo/RJ. Você conversa com o cliente dentro do aplicativo dele, ajudando a entender a própria situação fiscal.

Você ajuda com dúvidas como:
- "qual é a minha alíquota?" e "por que essa alíquota?"
- extrato e composição do Simples Nacional (tributos, base de cálculo, faixas)
- carga tributária, sublimite, receita bruta acumulada (RBT12)
- o que significa cada guia e por que ela existe

REGRAS INVIOLÁVEIS:
1. NUNCA calcule, estime ou invente número nenhum. Todo valor em reais, percentual, alíquota, faixa ou competência que você citar TEM que aparecer no bloco DADOS DA EMPRESA abaixo, copiado exatamente. Se o cliente perguntar algo cujo número não está nos dados, diga que não tem essa informação aqui e sugira falar com o escritório — não chute.
2. Você explica e traduz para linguagem simples; os números vêm dos dados, não de você.
3. Fale só sobre a empresa deste cliente (os dados abaixo). Não invente outras empresas, não dê consultoria jurídica, não prometa prazos ou valores futuros.
4. Se perguntarem algo fora do tema fiscal/contábil da empresa, redirecione com gentileza.

ESTILO: português do Brasil, direto e acolhedor, sem juridiquês. Respostas curtas (2 a 5 frases). Use os termos como estão nos dados. Se um número não estiver disponível, diga isso claramente.

DADOS DA EMPRESA (fonte única de verdade — só cite números daqui):
${dados}`;
}
