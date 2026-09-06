"use client"

import { use } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { DocfacilTopbar } from "@/components/docfacil/docfacil-topbar"
import { MANUAL_GUIDES } from "@/lib/manual-guides"

export default function ManualGuiaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const guia = MANUAL_GUIDES.find((g) => g.slug === slug);

  if (!guia) {
    return (
      <div className="min-h-screen bg-[#F5F2EA]">
        <DocfacilTopbar title="Manual de Uso" backHref="/ajuda" />
        <div className="max-w-2xl mx-auto w-full p-8 text-center text-sm text-[#6B6659]">
          Guia não encontrado.{" "}
          <Link href="/ajuda" className="text-[#0E4A44] underline">Voltar para a Central de Ajuda</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F2EA]">
      <DocfacilTopbar title={guia.label} subtitle="Manual de Uso" backHref="/ajuda" />

      <div className="max-w-3xl mx-auto w-full p-4 sm:p-8 space-y-8 pb-40">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${guia.color}1A`, color: guia.color }}>
            <guia.icon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-serif text-xl sm:text-2xl text-[#262420]">{guia.label}</h1>
            <p className="text-sm text-[#6B6659]">{guia.description}</p>
          </div>
        </div>

        <div className="space-y-10">
          {guia.steps.map((step, i) => (
            <div key={i} className="grid sm:grid-cols-[auto_1fr] gap-4 sm:gap-6 items-start">
              <div className="flex sm:flex-col items-center gap-3 sm:gap-2">
                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
                  style={{ backgroundColor: guia.color }}
                >
                  {i + 1}
                </div>
                {i < guia.steps.length - 1 && <div className="hidden sm:block w-px flex-1 bg-[#E4DFD1] min-h-[2rem]" />}
              </div>

              <div className="space-y-3 pb-2">
                <div>
                  <h2 className="font-serif text-lg text-[#262420]">{step.title}</h2>
                  <p className="text-sm text-[#6B6659] leading-relaxed mt-1">{step.text}</p>
                </div>
                <div className="pt-1">{step.scene}</div>
              </div>
            </div>
          ))}
        </div>

        <Link
          href="/ajuda"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#0E4A44] hover:underline pt-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar para a Central de Ajuda
        </Link>
      </div>
    </div>
  );
}
