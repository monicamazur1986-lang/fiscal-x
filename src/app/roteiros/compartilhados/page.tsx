import { AcervoDocumentos } from "@/components/acervo/acervo-documentos";

// Recorte por ORIGEM, não por situação — mesmo raciocínio de
// intimacoes/compartilhadas/page.tsx: o que um colega dividiu com você, em
// qualquer estágio (rascunho ou já concluído). Essas vistorias também
// continuam aparecendo em "Em Andamento"/"Relatórios" junto com as suas.
export default function RoteirosCompartilhadosPage() {
  return (
    <AcervoDocumentos
      voltarPara="/roteiros"
      titulo="Compartilhados Comigo"
      subtitulo="Roteiros e relatórios que um colega dividiu com você — dá para editar e assinar, mas só o autor apaga."
      escopo="relatorios"
      situacao="compartilhadas"
    />
  );
}
