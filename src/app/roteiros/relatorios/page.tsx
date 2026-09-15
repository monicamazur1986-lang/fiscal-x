import { AcervoDocumentos } from "@/components/acervo/acervo-documentos";

export default function RelatoriosPage() {
  return (
    <AcervoDocumentos
      voltarPara="/roteiros"
      titulo="Relatórios"
      subtitulo="Relatórios de vistoria concluídos e arquivados."
      escopo="relatorios"
      situacao="concluido"
      novo={{ href: "/roteiros/nova-inspecao", label: "Roteiros de inspeção" }}
    />
  );
}
