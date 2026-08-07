import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

// Mesmo padrão de inicialização do Admin SDK já usado em src/app/api/upload/route.ts
const serviceAccountKey = process.env.FIREBASE_ADMIN_SDK_PRIVATE_KEY_JSON;

if (!getApps().length) {
  if (!serviceAccountKey) {
    console.error("FIREBASE_ADMIN_SDK_PRIVATE_KEY_JSON environment variable is not set.");
    throw new Error("Firebase Admin SDK credentials not found.");
  }
  const serviceAccount = JSON.parse(serviceAccountKey);
  initializeApp({ credential: cert(serviceAccount), storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET });
}

const db = getFirestore();
const messaging = getMessaging();

function isTokenInvalid(errorCode: string | undefined) {
  return errorCode === 'messaging/registration-token-not-registered' || errorCode === 'messaging/invalid-registration-token';
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
  }

  const now = new Date();
  // Busca ampla (24h pra trás até agora) e filtra a hora exata do alerta em
  // código — evita precisar de índice composto no Firestore para algo simples.
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const snapshot = await db.collection('inspecoes')
    .where('data', '>=', Timestamp.fromDate(windowStart))
    .where('data', '<=', Timestamp.fromDate(now))
    .get();

  let checked = 0;
  let notified = 0;

  for (const docSnap of snapshot.docs) {
    const insp = docSnap.data();
    checked++;

    if (insp.status === 'arquivado' || insp.alertaEnviadoEm) continue;

    const dataInsp: Date = insp.data instanceof Timestamp ? insp.data.toDate() : new Date(insp.data);
    const minutosAntes = insp.alertaMinutosAntes ?? 0;
    const horarioAlerta = new Date(dataInsp.getTime() - minutosAntes * 60000);
    if (horarioAlerta > now) continue;

    const fiscalId: string | undefined = insp.fiscalId;
    if (fiscalId) {
      const userSnap = await db.collection('users').doc(fiscalId).get();
      const tokens: string[] = userSnap.exists ? (userSnap.data()?.fcmTokens || []) : [];

      if (tokens.length > 0) {
        const invalidTokens: string[] = [];
        for (const token of tokens) {
          try {
            await messaging.send({
              token,
              notification: {
                title: 'Lembrete de Agendamento',
                body: `${insp.titulo} às ${dataInsp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}`,
              },
              webpush: { fcmOptions: { link: '/agenda' } },
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
    }

    await docSnap.ref.update({ alertaEnviadoEm: now.toISOString() });
  }

  return NextResponse.json({ checked, notified });
}
