import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// Mesmo padrão de inicialização já usado em src/app/api/municipio/config/route.ts.
const serviceAccountKey = process.env.FIREBASE_ADMIN_SDK_PRIVATE_KEY_JSON;

if (!getApps().length) {
  if (!serviceAccountKey) {
    console.error("FIREBASE_ADMIN_SDK_PRIVATE_KEY_JSON environment variable is not set.");
    throw new Error("Firebase Admin SDK credentials not found.");
  }
  initializeApp({ credential: cert(JSON.parse(serviceAccountKey)) });
}

const auth = getAuth();
const db = getFirestore();

/**
 * Registra um erro de tela ("Application error") pra investigação — a causa
 * raiz de "acontece só pra fiscal, nunca pro root" vem sendo difícil de
 * reproduzir sem o console do navegador de quem está com o problema (Android,
 * app instalado). Esta rota deixa o próprio error.tsx da tela quebrada
 * gravar a mensagem/pilha assim que acontece, pra consulta direta via Admin
 * SDK sem depender de print/DevTools de quem está testando.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    let uid: string | null = null;
    let email: string | null = null;
    if (idToken) {
      try {
        const decoded = await auth.verifyIdToken(idToken);
        uid = decoded.uid;
        email = decoded.email || null;
      } catch {
        // Token inválido/expirado não deve impedir o registro do erro em si.
      }
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ message: "Corpo inválido" }, { status: 400 });
    }

    await db.collection('clientErrorLogs').add({
      message: String(body.message || '').slice(0, 2000),
      stack: String(body.stack || '').slice(0, 8000),
      digest: body.digest ? String(body.digest).slice(0, 200) : null,
      url: String(body.url || '').slice(0, 500),
      userAgent: String(body.userAgent || '').slice(0, 500),
      uid,
      email,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Erro ao registrar client error log:", err);
    return NextResponse.json({ message: "Falha ao registrar" }, { status: 500 });
  }
}
