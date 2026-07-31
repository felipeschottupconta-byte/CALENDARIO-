# CLAUDE.md — Portal do Cliente · RN Contabilidade

Contexto do projeto para sessões no Claude Code. Leia antes de mexer em qualquer arquivo.

---

## O que é

App para os ~110 clientes do escritório (Nova Friburgo/RJ) acessarem guias,
documentos, calendário de obrigações e abrirem pedidos. Distribuição: PWA no
Vercel, empacotado como TWA na Play Store.

**O diferencial não são as guias** — o Gestta já entrega isso. É o calendário
de obrigações calculado por regra e a análise fiscal traduzida (Panorama
SITFIS). Ao decidir escopo, priorize o que o Gestta não faz.

---

## Stack

| Camada | Escolha |
|---|---|
| Front | React + Vite |
| Banco | Supabase (Postgres + RLS) |
| Storage | Supabase Storage, bucket privado |
| Auth | Supabase Auth (e-mail) |
| Hosting | Vercel |
| Watcher | Python, roda no servidor do escritório |
| LLM | Anthropic SDK — `claude-sonnet-5`, Batch API para lote mensal |
| E-mail | fila em `avisos_escritorio` + Edge Function |

---

## Invariantes — não quebrar

1. **Número que chega ao cliente vem de parser determinístico.** LLM escreve
   texto, nunca calcula nem transcreve valor. Toda saída do modelo passa por
   verificação: cada valor em reais no texto deve existir no JSON de origem.

2. **Isolamento por CNPJ é sigilo fiscal, não preferência de UX.** RLS em toda
   tabela. Guia em `processando` ou `revisao` é invisível para o cliente.

3. **Nada publica sem aprovação humana.** Não existe caminho automático da
   pasta até o app. O painel de revisão é obrigatório.

4. **CNPJ vem do conteúdo do PDF, não do nome da pasta.** Divergiu entre os
   dois, vai para revisão. Guia da empresa A no app da empresa B é o pior
   defeito possível deste sistema.

5. **Download passa por Edge Function** que registra o evento e devolve signed
   URL de 60s. Link direto do Storage perde a métrica de leitura.

6. **`guia_eventos` é append-only.** Os campos de data na tabela `guias` são
   espelho para consulta rápida; a verdade está no log.

---

## Arquivos existentes

```
schema-supabase.sql      schema completo, RLS, triggers, views
sitfis_parser.py         parser do Relatório de Situação Fiscal (v2, testado)
guia_parser.py           classificação e extração de guias (testado)
relatorio_cliente.py     minuta via Claude + verificação numérica
agenda-fiscal.js         motor de geração da agenda por regra
app-cliente-v2.jsx       protótipo do app do cliente (dados fixos)
painel-publicacao.jsx    protótipo do painel interno (dados fixos)
```

Os dois `.jsx` são protótipos de referência visual. A identidade (logo em SVG,
Bodoni Moda para números, Jost para rótulos, preto/papel) está definida neles.

---

## Estado dos parsers — testado com arquivos reais

**Acerto: 5 de 7 guias, 100% dos campos.**

| Layout | Órgão | Situação |
|---|---|---|
| DARF (Sicalc/SENDA) | RFB | OK |
| DAS Simples (SENDA) | RFB | OK, com composição por tributo |
| DARJ | SEFAZ-RJ | OK, com conferência ICMS+FECP vs total |
| DARM Rio (ISS) | PMRJ | **Falha: PDF sem camada de texto, exige OCR** |
| SITFIS | RFB/PGFN | OK, incluindo cadastro e sócios |

Aprendizados dos arquivos reais:
- SITFIS usa régua de underscores sob todo título de bloco — a detecção é
  estrutural, não lista de nomes. Bloco desconhecido é capturado e sinalizado.
- "Débito com Exigibilidade Suspensa (SIEF)" não impede CND. `impede_cnd` é
  calculado em Python, nunca pelo modelo.
- DARJ soma ICMS + FECP no total; o detalhe só existe no DIP da 2ª página.
- Arquivos duplicados na pasta são rotina. Dedup por SHA-256 do arquivo.

---

## Falta construir

1. **Watcher** (`watchdog`) — vigia pasta por empresa, chama `guia_parser`,
   grava em `guias` com status `processando`/`revisao`, sobe PDF no Storage.
2. **OCR** para o DARM do Rio (Tesseract, `--psm 6`). Antes, verificar se o
   emissor da prefeitura tem opção de baixar com camada de texto.
3. **Ligar os protótipos ao Supabase** — trocar dados fixos por queries.
4. **Edge Functions**: download com log, envio de e-mail da fila.
5. **Push agrupado** (FCM) — várias guias no mesmo dia geram uma notificação só.
6. **PWA + TWA**: manifest, service worker, assetlinks.json, Bubblewrap.

---

## Ordem sugerida

Watcher → painel ligado ao banco → app ligado ao banco → piloto com 5 clientes
no PWA (sem loja) → Play Store.

Em paralelo, sem dependência técnica: D-U-N-S e conta de organização no Play
Console. Leva semanas de calendário.

---

## Decisões de produto já tomadas

- Guia sem valor ainda aparece na agenda como "em apuração". Evita a ligação
  do dia 18.
- Cada tipo de pedido mostra o prazo antes do cliente abrir.
- Barra de publicação em lote mostra o total em reais selecionado — última
  rede de conferência antes do cliente.
- Catálogo de obrigações vive em tabela, não em código. Mudança de prazo
  municipal não pode exigir deploy.
- Vencimento antecipa para dia útil anterior; o evento carrega
  `antecipado: true` para o app explicar por quê.

---

## A conferir antes de produção

- Feriados municipais de Nova Friburgo (estão no código como suposição).
- Dia de vencimento do ICMS-RJ, que varia por atividade.
- Preços atuais de Supabase Pro e Vercel Pro.
