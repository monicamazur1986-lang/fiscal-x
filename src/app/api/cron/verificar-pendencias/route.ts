import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

// Mesmo padrão de inicialização do Admin SDK já usado em src/app/api/cron/verificar-alarmes/route.ts
const serviceAccountKey = process.env.FIREBASE_ADMIN_SDK_PRIVATE_KEY_JSON;

if (!getApps().length) {
  if (!serviceAccountKey) {
    console.error("FIREBASE_ADMIN_SDK_PRIVATE_KEY_JSON environment variable is not set.");
    throw new Error("Firebase Admin SDK credentials not found.");
  }
  const serviceAccount = JSON.parse(serviceAccountKey);
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();
const messaging = getMessaging();

function isTokenInvalid(errorCode: string | undefined) {
  return errorCode === 'messaging/registration-token-not-registered' || errorCode === 'messaging/invalid-registration-token';
}

async function enviarParaUsuarios(userDocs: FirebaseFirestore.QueryDocumentSnapshot[], title: string, body: string, link: string) {
  let notified = 0;
  for (const userSnap of userDocs) {
    const tokens: string[] = userSnap.data()?.fcmTokens || [];
    if (tokens.length === 0) continue;

    const invalidTokens: string[] = [];
    for (const token of tokens) {
      try {
        await messaging.send({
          token,
          notification: { title, body },
          webpush: { fcmOptions: { link } },
        });
        notified++;
      } catch (err: any) {
        if (isTokenInvalid(err?.code)) invalidTokens.push(token);
      }
    }
    if (invalidTokens.length > 0) {
      await userSnap.ref.update({ fcmTokens: tokens.filter(t => !invalidTokens.includes(t)) });
    }
  }
  return notified;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
  }

  let notified = 0;

  // Root(s) — recebem alerta de qualquer cadastro/chamado pendente, de qualquer município.
  const rootSnap = await db.collection('users').where('role', '==', 'root').get();

  // 1. CADASTROS PENDENTES (fiscal ou gestor) — avisa quem pode aprovar.
  const pendingUsersSnap = await db.collection('users').where('status', '==', 'pending').get();

  for (const docSnap of pendingUsersSnap.docs) {
    const data = docSnap.data();
    if (data.alertaEnviadoEm) continue;

    const nome = data.displayName || data.email || 'Novo usuário';
    const cidade = data.municipioNome || data.municipioId || '';
    const title = 'Novo cadastro aguardando aprovação';
    const body = `${nome} (${data.role === 'admin' ? 'gestor' : 'fiscal'}) — ${cidade}`;

    let destinatarios = rootSnap.docs;
    if (data.role === 'fiscal' && data.municipioId) {
      const gestoresSnap = await db.collection('users')
        .where('role', '==', 'admin')
        .where('municipioId', '==', data.municipioId)
        .where('isAuthorized', '==', true)
        .get();
      destinatarios = [...gestoresSnap.docs, ...rootSnap.docs];
    }

    notified += await enviarParaUsuarios(destinatarios, title, body, '/admin/usuarios');
    await docSnap.ref.update({ alertaEnviadoEm: new Date().toISOString() });
  }

  // 2. CHAMADOS DE SUPORTE EM ABERTO — avisa gestor do município + root.
  const chamadosSnap = await db.collection('chamados').where('status', '!=', 'resolvido').get();

  for (const docSnap of chamadosSnap.docs) {
    const data = docSnap.data();
    if (data.alertaEnviadoEm) continue;

    const title = 'Novo chamado de suporte';
    const body = data.assunto || 'Um novo chamado foi aberto';

    let destinatarios = rootSnap.docs;
    if (data.municipioId) {
      const gestoresSnap = await db.collection('users')
        .where('role', '==', 'admin')
        .where('municipioId', '==', data.municipioId)
        .where('isAuthorized', '==', true)
        .get();
      destinatarios = [...gestoresSnap.docs, ...rootSnap.docs];
    }

    notified += await enviarParaUsuarios(destinatarios, title, body, '/admin/suporte');
    await docSnap.ref.update({ alertaEnviadoEm: new Date().toISOString() });
  }

  return NextResponse.json({
    pendingUsersChecked: pendingUsersSnap.size,
    chamadosChecked: chamadosSnap.size,
    notified,
  });
}
