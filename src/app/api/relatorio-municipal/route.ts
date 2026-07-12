import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

// Mesmo padrão de inicialização do Admin SDK já usado em
// src/app/api/upload/route.ts e src/app/api/cron/verificar-alarmes/route.ts
const serviceAccountKey = process.env.FIREBASE_ADMIN_SDK_PRIVATE_KEY_JSON;

if (!getApps().length) {
  if (!serviceAccountKey) {
    console.error("FIREBASE_ADMIN_SDK_PRIVATE_KEY_JSON environment variable is not set.");
    throw new Error("Firebase Admin SDK credentials not found.");
  }
  initializeApp({ credential: cert(JSON.parse(serviceAccountKey)) });
}

const db = getFirestore();
const auth = getAuth();

// Extrai o número sequencial de um "numeroProcesso" no formato "0001/2026".
function parseSequencial(numeroProcesso: string): number | null {
  const match = /^(\d+)\//.exec(numeroProcesso || '');
  return match ? parseInt(match[1], 10) : null;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ message: "Não autenticado" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await auth.verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ message: "Token inválido" }, { status: 401 });
  }

  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) {
    return NextResponse.json({ message: "Usuário não encontrado" }, { status: 403 });
  }
  const userData = userSnap.data()!;
  const isRoot = userData.role === 'root';

  const url = new URL(req.url);
  const anoParam = url.searchParams.get('ano');
  const ano = anoParam ? parseInt(anoParam, 10) : new Date().getFullYear();

  const requestedMunicipioId = url.searchParams.get('municipioId');
  const municipioId = isRoot && requestedMunicipioId ? requestedMunicipioId : userData.municipioId;
  if (!municipioId) {
    return NextResponse.json({ message: "Município não definido para este usuário" }, { status: 400 });
  }

  // Filtra o ano em código (em vez de query composta com range no Firestore)
  // para não depender de criar um índice composto novo — o volume por
  // município é pequeno o bastante (limite de 100 documentos/fiscal) para
  // isso ser tranquilo.
  const snapshot = await db.collection('intimacoes')
    .where('municipioId', '==', municipioId)
    .get();

  const porStatus: Record<string, number> = {};
  const porTipo: Record<string, number> = {};
  const porFiscalMap = new Map<string, number>();
  const numeros: { numeroProcesso: string; sequencial: number | null }[] = [];
  let totalNoAno = 0;

  snapshot.forEach(doc => {
    const d = doc.data();
    if (d.deleted) return;

    const dataIntimacao: Date | null = d.dataIntimacao instanceof Timestamp ? d.dataIntimacao.toDate() : (d.dataIntimacao ? new Date(d.dataIntimacao) : null);
    if (!dataIntimacao || dataIntimacao.getFullYear() !== ano) return;

    totalNoAno++;

    const status = d.status || 'rascunho';
    porStatus[status] = (porStatus[status] || 0) + 1;

    const tipo = d.tipoTermo || 'SEM TIPO';
    porTipo[tipo] = (porTipo[tipo] || 0) + 1;

    const fiscalNome = d.createdByName || 'Não identificado';
    porFiscalMap.set(fiscalNome, (porFiscalMap.get(fiscalNome) || 0) + 1);

    if (d.numeroProcesso) {
      numeros.push({ numeroProcesso: d.numeroProcesso, sequencial: parseSequencial(d.numeroProcesso) });
    }
  });

  // Conferência de numeração: duplicados e lacunas internas na sequência do ano.
  const contagemPorNumero = new Map<string, number>();
  numeros.forEach(n => contagemPorNumero.set(n.numeroProcesso, (contagemPorNumero.get(n.numeroProcesso) || 0) + 1));
  const duplicados = Array.from(contagemPorNumero.entries()).filter(([, c]) => c > 1).map(([numero]) => numero);

  const sequenciais = numeros.map(n => n.sequencial).filter((n): n is number => n !== null).sort((a, b) => a - b);
  const gapsInternos: number[] = [];
  for (let i = 1; i < sequenciais.length; i++) {
    for (let s = sequenciais[i - 1] + 1; s < sequenciais[i]; s++) {
      gapsInternos.push(s);
    }
  }

  const maiorSequencialUsado = sequenciais.length ? sequenciais[sequenciais.length - 1] : 0;
  const counterSnap = await db.collection('municipios').doc(municipioId).collection('counters').doc(String(ano)).get();
  const valorContador = counterSnap.exists ? (counterSnap.data()?.seq || 0) : 0;
  const acimaDoContador = maiorSequencialUsado > valorContador;

  return NextResponse.json({
    ano,
    municipioId,
    totalNoAno,
    porStatus,
    porTipo,
    porFiscal: Array.from(porFiscalMap.entries()).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total),
    numeracao: {
      duplicados,
      gapsInternos,
      valorContador,
      maiorSequencialUsado,
      acimaDoContador,
    },
  });
}
