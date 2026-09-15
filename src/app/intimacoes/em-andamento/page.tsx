import { AcervoDocumentos } from "@/components/acervo/acervo-documentos";

export default function AutuacoesEmAndamentoPage() {
  return (
    <AcervoDocumentos
      voltarPara="/intimacoes"
      titulo="Em Andamento"
      subtitulo="Documentos começados e ainda não finalizados — retome de onde parou."
      escopo="autuacoes"
      situacao="rascunho"
      novo={{ href: "/intimacoes/nova", label: "Nova autuação" }}
    />
  );
}
