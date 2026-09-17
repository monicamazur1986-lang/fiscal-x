import { AcervoDocumentos } from "@/components/acervo/acervo-documentos";

// Recorte por ORIGEM, não por situação: o que um colega dividiu com você, em
// qualquer estágio. Estas autuações também continuam aparecendo em "Em
// Andamento" e "Finalizadas" junto com as suas — esta tela existe para
// responder "o que me passaram?" sem garimpar a lista inteira.
export default function AutuacoesCompartilhadasPage() {
  return (
    <AcervoDocumentos
      voltarPara="/intimacoes"
      titulo="Compartilhadas Comigo"
      subtitulo="Autuações que um colega dividiu com você — dá para editar e finalizar, mas só o autor apaga."
      escopo="autuacoes"
      situacao="compartilhadas"
    />
  );
}
