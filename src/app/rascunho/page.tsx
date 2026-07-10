"use client";

import { useState } from "react";
import { GerarRascunho } from "@/components/gerar-rascunho";

export default function RascunhoPage() {
    const [caseDescription, setCaseDescription] = useState("");

    return <GerarRascunho caseDescription={caseDescription} setCaseDescription={setCaseDescription} />;
}
