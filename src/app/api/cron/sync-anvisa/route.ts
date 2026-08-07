import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { ANVISA_DATASETS } from "@/lib/anvisa-datasets";
import { syncDataset } from "@/lib/anvisa-sync";

// Mesmo padrão de inicialização do Admin SDK já usado em
// src/app/api/upload/route.ts e src/app/api/cron/verificar-alarmes/route.ts
const serviceAccountKey = process.env.FIREBASE_ADMIN_SDK_PRIVATE_KEY_JSON;

if (!getApps().length && serviceAccountKey) {
  initializeApp({
    credential: cert(JSON.parse(serviceAccountKey)),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

/**
 * Sincroniza UM dataset da ANVISA por chamada (nunca os 4 juntos numa só
 * requisição) — cada CSV pode passar de 300MB, e processar vários em
 * sequência arriscaria estourar o timeout da instância. A ativação real
 * (job do Cloud Scheduler chamando esta rota 1x/dia por dataset) ainda não
 * foi criada — ver plano "Preparar integração ANVISA".
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
  }

  const datasetKey = req.nextUrl.searchParams.get('dataset');
  const dataset = ANVISA_DATASETS.find((d) => d.key === datasetKey);
  if (!dataset) {
    return NextResponse.json({
      message: "Informe ?dataset=<chave> com uma chave válida.",
      datasetsDisponiveis: ANVISA_DATASETS.map((d) => d.key),
    }, { status: 400 });
  }

  // Permite ajustar o teto de gravações por chamada (ex.: ?maxWrites=5000 pra
  // testar com um corte menor) — sem o parâmetro, usa o padrão seguro dentro
  // da cota diária gratuita do Firestore (ver DEFAULT_MAX_WRITES_PER_RUN).
  const maxWritesParam = req.nextUrl.searchParams.get('maxWrites');
  const parsedMaxWrites = maxWritesParam ? parseInt(maxWritesParam, 10) : NaN;
  const maxWrites = Number.isFinite(parsedMaxWrites) && parsedMaxWrites > 0 ? parsedMaxWrites : undefined;

  try {
    const stats = await syncDataset(dataset, { maxWrites });
    return NextResponse.json(stats);
  } catch (err: any) {
    console.error(`Erro no sync ANVISA (${dataset.key}):`, err);
    return NextResponse.json({ message: "Falha no sync", details: err?.message }, { status: 500 });
  }
}
