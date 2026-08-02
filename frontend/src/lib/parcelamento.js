// src/lib/parcelamento.js
// A sigla do parcelamento nunca aparece crua pro cliente — sempre
// traduzida. Compartilhado entre o painel (ao gravar) e o app do
// cliente (ao exibir).

export const SIGLA_PARCELAMENTO = {
  PARCSN: "Parcelamento do Simples Nacional",
  "PARCSN-ESP": "Parcelamento especial do Simples Nacional",
  PARCMEI: "Parcelamento do MEI",
  "PARCMEI-ESP": "Parcelamento especial do MEI",
  RELP: "RELP — Simples Nacional",
};

export function nomeParcelamento(sigla) {
  return SIGLA_PARCELAMENTO[sigla] || (sigla ? `Parcelamento ${sigla}` : "Parcelamento");
}
