import { AcervoDocumentos } from "@/components/acervo/acervo-documentos";

export default function AutuacoesFinalizadasPage() {
  return (
    <AcervoDocumentos
      voltarPara="/intimacoes"
      titulo="Finalizadas"
      subtitulo="Documentos já lavrados, com o prazo de defesa em contagem."
      escopo="autuacoes"
      situacao="finalizado"
      novo={{ href: "/intimacoes/nova", label: "Nova autuação" }}
    />
  );
}
