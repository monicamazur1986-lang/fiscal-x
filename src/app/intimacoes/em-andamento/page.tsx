import { AcervoDocumentos } from "@/components/acervo/acervo-documentos";

// Sem o botao de criar: esta tela e para RETOMAR o que ficou pela metade.
// Comecar uma autuacao nova e o proposito do menu de Autuacoes, uma tela
// acima — oferecer isso aqui convida a abrir mais um rascunho justamente
// onde a pessoa veio resolver os que ja tem abertos.
export default function AutuacoesEmAndamentoPage() {
  return (
    <AcervoDocumentos
      voltarPara="/intimacoes"
      titulo="Em Andamento"
      subtitulo="Documentos começados e ainda não finalizados — retome de onde parou."
      escopo="autuacoes"
      situacao="rascunho"
    />
  );
}
