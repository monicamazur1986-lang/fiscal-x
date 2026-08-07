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
 * Responde se existe algum usuário com role 'admin' (gestor) no MESMO
 * município de quem chama — usado pra liberar o fiscal a ajustar a
 * Identidade Municipal só quando não há gestor cadastrado.
 *
 * As regras do Firestore (firestore.rules) só deixam um fiscal ler o
 * próprio doc em `users`, não listar os demais — por isso essa checagem
 * precisa ser feita aqui, com o Admin SDK, em vez de uma query direta do
 * client. O município nunca vem do client (só do próprio doc do chamador),
 * pra impedir que alguém sonde se outros municípios têm gestor.
 */
export async function GET(req: NextRequest) {
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

  try {
    const callerSnap = await db.collection('users').doc(uid).get();
    const rawMunicipioId = callerSnap.data()?.municipioId;
    if (!rawMunicipioId) {
      return NextResponse.json({ temGestor: true });
    }
    const municipioId = normalizeId(rawMunicipioId);

    const adminSnap = await db.collection('users')
      .where('municipioId', '==', municipioId)
      .where('role', '==', 'admin')
      .limit(1)
      .get();

    return NextResponse.json({ temGestor: !adminSnap.empty });
  } catch (err: any) {
    console.error("Erro ao checar gestor do município:", err);
    return NextResponse.json({ message: "Falha ao checar gestor", details: err?.message }, { status: 500 });
  }
}
