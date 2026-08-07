import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { normalizeId } from "@/lib/utils";

// Mesmo padrão de inicialização e autenticação já usado em
// src/app/api/upload/route.ts.
const serviceAccountKey = process.env.FIREBASE_ADMIN_SDK_PRIVATE_KEY_JSON;

if (!getApps().length) {
  if (!serviceAccountKey) {
    console.error("FIREBASE_ADMIN_SDK_PRIVATE_KEY_JSON environment variable is not set.");
    throw new Error("Firebase Admin SDK credentials not found.");
  }
  initializeApp({ credential: cert(JSON.parse(serviceAccountKey)), storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET });
}

const auth = getAuth();
const db = getFirestore();

/**
 * Salva a Identidade Municipal (municipios/{id}/config/brand) em nome de um
 * FISCAL sem gestor cadastrado no seu município.
 *
 * As regras do Firestore (firestore.rules: match /municipios/{id}/config/*)
 * só permitem escrita de isAdmin() — um fiscal comum não consegue gravar
 * direto do client mesmo depois de liberado pela UI. Esta rota existe só
 * pra esse caso: reconfirma (com o Admin SDK, ignorando as regras do
 * client) que não há gestor no município do chamador antes de gravar — se
 * um gestor for cadastrado depois da tela carregar, a gravação já passa a
 * ser recusada aqui. Admin/root continuam gravando direto do client
 * (src/hooks/use-app-config.ts), sem passar por esta rota.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ message: "Não autenticado" }, { status: 401 });
  }

  let uid: string;
  try {
    uid = (await auth.verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ message: "Token inválido" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.data !== 'object' || body.data === null) {
    return NextResponse.json({ message: "Corpo da requisição inválido" }, { status: 400 });
  }

  // Só os campos que o fiscal-sem-gestor de fato edita em
  // admin/configuracoes/page.tsx (ver MunicipalityConfig em
  // use-app-config.ts) — sem essa lista, body.data era gravado inteiro sem
  // checagem de formato, deixando escrever qualquer campo arbitrário no
  // mesmo doc que documento-oficial-body.tsx/roteiros renderizam depois.
  // appLogoUrl (logo global do sistema) e n8nWebhookUrl ficam de fora de
  // propósito — são exclusivos do root, nunca expostos a este fallback.
  const ALLOWED_FIELDS = new Set(['logoUrl', 'secretaria', 'departamento', 'municipioNome', 'headerRichText', 'footerRichText', 'defaultPrazoRichText', 'roteiroTextos']);
  const invalidField = Object.keys(body.data).find((k) => !ALLOWED_FIELDS.has(k));
  if (invalidField) {
    return NextResponse.json({ message: `Campo não permitido: ${invalidField}` }, { status: 400 });
  }

  try {
    const callerSnap = await db.collection('users').doc(uid).get();
    const caller = callerSnap.data();
    if (!caller?.municipioId) {
      return NextResponse.json({ message: "Usuário sem município vinculado" }, { status: 403 });
    }
    if (caller.role !== 'fiscal') {
      return NextResponse.json({ message: "Use a gravação padrão — esta rota é só para fiscais sem gestor" }, { status: 403 });
    }

    const municipioId = normalizeId(caller.municipioId);
    const adminSnap = await db.collection('users')
      .where('municipioId', '==', municipioId)
      .where('role', '==', 'admin')
      .limit(1)
      .get();
    if (!adminSnap.empty) {
      return NextResponse.json({ message: "Este município já tem um gestor cadastrado — peça a ele para ajustar" }, { status: 403 });
    }

    await db.collection('municipios').doc(municipioId).collection('config').doc('brand').set(body.data, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Erro ao salvar config municipal (fallback fiscal):", err);
    return NextResponse.json({ message: "Falha ao salvar", details: err?.message }, { status: 500 });
  }
}
