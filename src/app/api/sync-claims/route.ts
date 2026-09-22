import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { normalizeId } from "@/lib/utils";

// Mesmo padrão de inicialização de src/app/api/upload/route.ts — todo
// módulo que chama initializeApp() no projeto precisa incluir o mesmo
// storageBucket, senão quem carregar primeiro "vence" com uma config
// incompleta pras rotas que carregarem depois no mesmo processo.
const serviceAccountKey = process.env.FIREBASE_ADMIN_SDK_PRIVATE_KEY_JSON;

if (!getApps().length) {
  if (!serviceAccountKey) {
    console.error("FIREBASE_ADMIN_SDK_PRIVATE_KEY_JSON environment variable is not set.");
    throw new Error("Firebase Admin SDK credentials not found.");
  }
  const serviceAccount = JSON.parse(serviceAccountKey);
  initializeApp({
    credential: cert(serviceAccount),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

const auth = getAuth();
const db = getFirestore();

/**
 * Copia role/municipioId do documento em users/{uid} pro CUSTOM CLAIM do
 * token de autenticação do próprio usuário.
 *
 * Por quê: as regras do Storage deste projeto não conseguem ler o Firestore
 * (firestore.get() cross-service sempre nega — confirmado com uploads que
 * voltavam "storage/unauthorized" mesmo com dado e regra corretos) — então
 * "é gestor" e "é deste município" só podem ser checados ali através de
 * custom claims no token, nunca lendo o documento do usuário na hora.
 *
 * Sempre lê o valor de dentro do Firestore (fonte da verdade, protegida
 * pelas regras do Firestore de sempre) e NUNCA aceita role/município vindo
 * do corpo da requisição — só sincroniza o token do PRÓPRIO chamador com o
 * que já está gravado sobre ele. Por isso não existe como alguém pedir pra
 * si mesmo um papel ou município que não tem: o pior caso é reafirmar o
 * valor que as regras do Firestore já deixariam ele ter de qualquer jeito.
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

  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) {
    return NextResponse.json({ message: "Usuário não encontrado" }, { status: 404 });
  }

  const data = snap.data()!;
  // Normalizado — mesma função (normalizeId) que grava o municipioId dos
  // documentos em pas/{id} e municipios/{id} no Storage. Sem isto, um
  // município com acento/espaço no cadastro do usuário (raw) nunca bateria
  // com o caminho no Storage (sempre normalizado), e belongsToMyMunicipio
  // negaria mesmo sendo o município certo.
  const claims = { role: data.role ?? null, municipioId: data.municipioId ? normalizeId(data.municipioId) : null };
  await auth.setCustomUserClaims(uid, claims);

  return NextResponse.json({ ok: true, ...claims });
}
