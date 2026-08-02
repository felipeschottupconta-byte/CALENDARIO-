# Portal do Cliente — como testar o ciclo completo

Este arquivo documenta os passos manuais obrigatórios pra rodar o app
ligado ao Supabase de verdade. Sem eles a RLS bloqueia tudo (o que é o
comportamento certo — só significa que falta configurar).

---

## 1. Rodar as migrations pendentes

O schema principal (`sql/01-schema.sql`) e o adendo do Simples
(`sql/02-addendum-apuracao-simples.sql`) já estão rodados.

Além deles, esta sessão de trabalho criou **seis migrations novas** que
ainda **não foram rodadas** no projeto Supabase real. Rode todas, nessa
ordem, no SQL Editor:

```
sql/03-parcelamentos.sql
sql/04-carga-tributaria.sql
sql/05-limites-simples.sql
sql/06-rls-guia-eventos-staff.sql
sql/07-apuracao-anexos.sql
sql/08-guias-parcelamento-campos.sql
sql/09-marcar-paga-cliente.sql
```

Sem as três primeiras: o card de parcelamento, o de carga tributária e o
de sublimite do Simples simplesmente não aparecem no app (o código já
trata a ausência de dado com elegância — não quebra, só não mostra).

Sem a `06`: publicar uma guia pelo painel dá **403** ao tentar gravar o
evento de auditoria (`guia_eventos`), porque a política original só
previa o cliente registrando vista/baixada — nunca o escritório
registrando publicação. Descoberto testando o ciclo completo ao vivo.

Sem a `07`: o upload de extrato falha ao gravar empresas apuradas em mais
de um anexo na mesma competência (caso real: Puro Estilo, que revende e
industrializa) — não existe onde persistir o segundo anexo.

Sem a `08`: o upload de guia de parcelamento (PARCSN, RELP...) falha ao
gravar — faltam as colunas `eh_parcelamento`, `parcelamento_sigla`,
`parcela_atual`/`parcela_total`, `valor_principal`/`valor_multa`/`valor_juros`.

Sem a `09`: o cliente consegue registrar o evento "marquei como paga" em
`guia_eventos`, mas a guia nunca sai da lista "a pagar" — o gatilho que
espelha esse evento em `guias.status` não tratava esse tipo de evento e
não rodava com privilégio suficiente pra gravar, mesmo quando tratava.
Essa migration também libera o cliente a subir o comprovante de
pagamento no Storage.

---

## 2. Instalar dependências e configurar `.env.local`

```
npm install
```

`.env.local` na raiz do projeto (já criado nesta sessão, já no
`.gitignore`):

```
VITE_SUPABASE_URL=https://kusnksdiuqlakmivqcko.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_yIQXjH1Ls3LJjAtoblrsww_vV1SvhtU
```

Rodar localmente:

```
npm run dev
```

- App do cliente: `http://localhost:5173/index.html`
- Painel de publicação: `http://localhost:5173/painel.html`

(a porta pode variar se 5173 estiver ocupada — o terminal do Vite mostra
a porta real)

---

## 3. Criar os usuários no Supabase Auth

No painel do Supabase: **Authentication → Users → Add user**. Crie dois:

1. Um seu, do escritório (papel admin/colaborador)
2. Um fictício, do cliente (papel cliente)

Anote o **UID** de cada um (aparece na lista de usuários depois de criado).

## 4. Inserir os perfis — passo obrigatório

Criar o usuário no Auth **não é suficiente**. Sem uma linha em `perfis`,
a RLS bloqueia qualquer leitura e o app mostra "acesso não liberado".
No SQL Editor:

```sql
-- usuário do escritório
insert into perfis (id, nome, email, papel)
values ('<uid>', 'Felipe', '<email>', 'admin');

-- usuário cliente
insert into perfis (id, nome, email, papel)
values ('<uid do cliente>', 'Nome do cliente', '<email>', 'cliente');

-- vincular o cliente às empresas dele
insert into usuario_empresa (usuario_id, empresa_id)
values ('<uid do cliente>', '<id da empresa>');
```

O `<id da empresa>` só existe depois do passo 5 (cadastro pelo painel).

---

## 5. Roteiro de teste

### Cadastro

Entre no painel (`painel.html`) com o usuário admin e cadastre **apenas
3** das 4 empresas:

| Empresa | CNPJ | Regime |
|---|---|---|
| D F Fernandes Confecções | 32599342000166 | presumido |
| Gata Serrana Lingerie | 52276638000153 | simples |
| Su Lingerie | 53492794000114 | simples |
| ~~Puro Estilo Moda Íntima~~ | ~~18294480000106~~ | **deixe de fora de propósito** |

Vincule o usuário cliente a **uma** dessas empresas (passo 4, tabela
`usuario_empresa`).

### Upload

Suba todos os PDFs de uma vez na aba Guias, misturados, incluindo os da
Puro Estilo (propositalmente não cadastrada).

### O que conferir

| # | Esperado |
|---|---|
| 1 | Cada guia foi para a empresa certa, pelo CNPJ do conteúdo do PDF — nunca pelo nome do arquivo |
| 2 | As guias da Puro Estilo **não foram inseridas** — aparecem no resumo do upload como "revisão — CNPJ não cadastrado no sistema", não silenciosamente descartadas (ver nota técnica abaixo sobre por que elas não viram linha na fila) |
| 3 | DAS de parcelamento (Puro Estilo) aparece com **R$ 2.405,22**, não R$ 1.519,87 — confira no resumo do upload, já que a guia em si não é inserida sem a empresa cadastrada |
| 4 | GFD (só tem a raiz do CNPJ, 8 dígitos) publica direto quando o nome da empresa no PDF bate com a cadastrada — é a identificação por raiz+nome (`identificador_empresa.py`) que decide, não mais um alerta fixo do parser |
| 5 | Subir o mesmo arquivo de novo é barrado por hash ("arquivo já processado") |
| 6 | Renomear um PDF pro nome de outra empresa **não** muda o destino |

### Ciclo completo

7. Publique as guias prontas no painel (aba Guias → filtro Prontas →
   selecionar → Publicar)
8. **Saia e entre com o usuário cliente**
9. Confira:
   - aparecem só as guias da empresa vinculada a ele
   - **não** aparece nenhuma guia das outras empresas
   - guias em revisão não aparecem
   - ao abrir a aba Guias, o evento `vista` é gravado por guia

**O passo 9 é o mais importante de todos.** Se o cliente enxergar guia de
outra empresa, o problema não é de interface — é quebra de sigilo
fiscal, e nada mais pode avançar até isso estar correto.

10. No SQL Editor, confirme o log:

```sql
select g.tipo, g.competencia, g.valor, e.tipo as evento, e.ocorrido_em
from guia_eventos e
join guias g on g.id = e.guia_id
order by e.ocorrido_em desc;
```

---

## Nota técnica: por que a Puro Estilo não vira uma linha em "revisão"

A tabela `guias` tem `empresa_id uuid not null` — sem empresa cadastrada,
não existe FK pra apontar, então o banco recusaria o insert de qualquer
jeito. Por isso a checagem "CNPJ não cadastrado" acontece **antes** do
insert, no painel: o arquivo aparece no **resumo do upload** (a lista de
progresso que aparece embaixo do botão "Subir PDFs") como revisão, com o
motivo explicado — mas não vira uma linha persistida na fila, porque não
tem onde gravar até a empresa existir. Depois de cadastrar a empresa, é
só subir o mesmo PDF de novo — o dedup por hash não bloqueia, porque
nunca foi inserido da primeira vez.

## Extrato do Simples (RBT12/alíquota) — aba Extratos do painel

O extrato não tem vencimento nem linha digitável — ele só explica o
cálculo do DAS (alíquota efetiva, RBT12, repartição por tributo). É
publicado separado da guia, numa aba própria:

1. Painel → aba **Extratos** → **Subir extrato do Simples**.
2. O upload já identifica a empresa (mesmo módulo da guia), grava em
   `apuracoes_simples` (+ `apuracao_anexos` quando há mais de um anexo
   na competência, + `apuracao_tributos`, + `apuracao_historico_receita`),
   sempre com `publicada = false`.
3. Cada extrato aparece na lista da aba com o botão **Publicar** — só
   depois disso ele fica visível no "Entenda seu imposto" do cliente.
   Nada publica sozinho no upload (mesma regra da guia).

## "Já paguei" — comprovante do cliente

No app do cliente, o botão **Já paguei** numa guia publicada abre um
painel pra informar a data (opcional) e subir o comprovante (opcional).
Ao confirmar: sobe o arquivo em `guias/comprovantes/{cnpj}/{guia_id}.*`,
grava o evento `marcada_paga` em `guia_eventos`, e o gatilho (`sql/09`)
espelha `status = 'paga'` em `guias`. A guia some da lista "a pagar" mas
continua visível ao navegar até o mês dela, com o selo "informado como
pago em DD/MM" — é uma declaração do cliente, não confirmação bancária.

## Gaps conhecidos (não inventamos dado pra cobrir)

- **Agenda por regra** (`agenda-fiscal.js`): a aba Agenda mostra os
  vencimentos reais das guias publicadas (derivado direto de
  `guias.vencimento`), mas obrigações que ainda não viraram guia — ex.:
  "DAS de julho, ainda em apuração" — não aparecem, porque isso viria do
  motor de regra `agenda-fiscal.js`, que existe no repo mas não foi
  integrado ao banco nesta rodada.
- **Panorama fiscal (SITFIS)**: sem tabela própria no schema — a aba
  Relatórios do painel continua com dado de exemplo.
- **Órgão emissor da guia** (RFB/SEFAZ-RJ/PMRJ): o parser extrai, mas a
  tabela `guias` não tem coluna pra guardar — o app do cliente mostra
  esse campo em branco em dado real (o protótipo com dado fixo mostrava
  porque estava chumbado no mock).
- **Alertas do parser não são persistidos**: eles existem no momento do
  upload (aparecem no resumo) mas não ficam gravados na guia depois de
  inserida — reabrir a fila de revisão mais tarde não mostra o motivo
  original, só o status.
- **Agrupamento de parcelamentos concorrentes**: se uma empresa tiver
  mais de um parcelamento em aberto no mesmo mês, cada guia aparece
  separada na lista (com "Parcela X de Y" própria) — ainda não há um
  agrupamento visual por "Número do Parcelamento" quando há mais de um
  simultâneo.
