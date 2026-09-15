import { AcervoDocumentos } from "@/components/acervo/acervo-documentos";

export default function InspecoesEmAndamentoPage() {
  return (
    <AcervoDocumentos
      voltarPara="/roteiros"
      titulo="Inspeções em Andamento"
      subtitulo="Vistorias começadas e ainda não concluídas — retome de onde parou."
      escopo="relatorios"
      situacao="rascunho"
    />
  );
}
