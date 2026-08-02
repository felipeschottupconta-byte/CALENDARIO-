# Portal do Cliente — como testar o ciclo completo

Este arquivo documenta os passos manuais obrigatórios pra rodar o app
ligado ao Supabase de verdade. Sem eles a RLS bloqueia tudo (o que é o
comportamento certo — só significa que falta configurar).

---

## 1. Rodar as migrations pendentes

O schema principal (`sql/01-schema.sql`) e o adendo do Simples
(`sql/02-addendum-apuracao-simples.sql`) já estão rodados.

Além deles, esta sessão de trabalho criou **três migrations novas** que
ainda **não foram rodadas** no projeto Supabase real. Rode as três, nessa
ordem, no SQL Editor:

```
sql/03-parcelamentos.sql
sql/04-carga-tributaria.sql
sql/05-limites-simples.sql
sql/06-rls-guia-eventos-staff.sql
```

Sem as três primeiras: o card de parcelamento, o de carga tributária e o
de sublimite do Simples simplesmente não aparecem no app (o código já
trata a ausência de dado com elegância — não quebra, só não mostra).

Sem a `06`: publicar uma guia pelo painel dá **403** ao tentar gravar o
evento de auditoria (`guia_eventos`), porque a política original só
previa o cliente registrando vista/baixada — nunca o escritório
registrando publicação. Descoberto testando o ciclo completo ao vivo.

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
| 4 | GFD cai em revisão com alerta de CNPJ raiz de 8 dígitos |
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

## Gaps conhecidos (não inventamos dado pra cobrir)

- **Agenda** (aba Agenda do app do cliente): ainda lê array vazio.
  Depende do motor de regra `agenda-fiscal.js`, que existe no repo mas
  não foi integrado ao banco nesta rodada.
- **Panorama fiscal (SITFIS)**: sem tabela própria no schema — a aba
  Relatórios do painel continua com dado de exemplo.
- **"Entenda seu imposto" com múltiplos anexos**: `apuracoes_simples`
  grava um anexo por linha; o parser novo (`extrato_simples_parser.py`)
  devolve uma lista de anexos. Uma empresa real (Puro Estilo) que apura
  em dois anexos ao mesmo tempo não tem como ser representada nesse
  formato ainda — precisaria de uma migration nova pra isso.
- **Órgão emissor da guia** (RFB/SEFAZ-RJ/PMRJ): o parser extrai, mas a
  tabela `guias` não tem coluna pra guardar — o app do cliente mostra
  esse campo em branco em dado real (o protótipo com dado fixo mostrava
  porque estava chumbado no mock).
- **Alertas do parser não são persistidos**: eles existem no momento do
  upload (aparecem no resumo) mas não ficam gravados na guia depois de
  inserida — reabrir a fila de revisão mais tarde não mostra o motivo
  original, só o status.
