import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";

// Inicialização do Firebase Admin
//
// initializeApp() é global por processo — `getApps().length` só é 0 na
// PRIMEIRA vez que qualquer rota chama isso no processo (build do Next ou
// instância "quente" servindo várias rotas). Se algum outro módulo (ex.:
// src/ai/usage-limit.ts, src/app/api/cron/*) rodar seu próprio initializeApp()
// ANTES deste, sem passar storageBucket, esta rota herda esse app já
// inicializado sem bucket — e o getStorage().bucket() abaixo falha com
// "Bucket name not specified or invalid" mesmo com a env var certa aqui.
// Foi exatamente isso que quebrou o build de produção (detectado rodando
// `next build` do zero). Por isso TODO módulo que chama initializeApp() no
// projeto precisa incluir o mesmo storageBucket, mesmo quando não usa
// Storage — só assim, não importa qual carregue primeiro, o app fica com a
// config completa.
const serviceAccountKey = process.env.FIREBASE_ADMIN_SDK_PRIVATE_KEY_JSON;

if (!getApps().length) {
  if (!serviceAccountKey) {
    console.error("FIREBASE_ADMIN_SDK_PRIVATE_KEY_JSON environment variable is not set.");
    throw new Error("Firebase Admin SDK credentials not found.");
  }
  const serviceAccount = JSON.parse(serviceAccountKey);

  initializeApp({
    credential: cert(serviceAccount),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, // Use o storageBucket do seu firebaseConfig
  });
}

const bucket = getStorage().bucket();
const auth = getAuth();

// Único uso hoje é foto de perfil (profile-edit-dialog.tsx) — sem limite de
// tamanho nem tipo, qualquer conta autenticada (mesmo pendente de aprovação)
// podia publicar arquivo de qualquer tamanho/tipo num caminho público do
// Storage, virando hospedagem gratuita de conteúdo arbitrário (custo de
// armazenamento e abuso de reputação do domínio do projeto).
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function POST(req: NextRequest) {
  // Mesmo padrão de verificação já usado em relatorio-municipal/route.ts —
  // sem isso, qualquer pessoa na internet (sem estar logada) conseguia
  // gravar arquivos públicos direto no Storage do projeto.
  const authHeader = req.headers.get('authorization');
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ message: "Não autenticado" }, { status: 401 });
  }
  try {
    await auth.verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ message: "Token inválido" }, { status: 401 });
  }

  try {
    // Use request.formData() para lidar com multipart/form-data no App Router
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ message: "Nenhum arquivo enviado" }, { status: 400 });
    }
    if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
      return NextResponse.json({ message: "Formato não permitido. Envie uma imagem (JPEG, PNG, WEBP ou GIF)." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ message: "Arquivo muito grande. O limite é 5MB." }, { status: 400 });
    }

    // Converte o File para Buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `${Date.now()}-${file.name?.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const filePath = `user-uploads/${filename}`;
    const fileUpload = bucket.file(filePath);

    // Faz upload para Firebase Storage
    await fileUpload.save(buffer, {
      metadata: {
        contentType: file.type,
      },
      public: true, // Torna o arquivo publicamente acessível
    });

    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`;

    return NextResponse.json({ url: publicUrl, message: "Upload realizado com sucesso." }, { status: 200 });
  } catch (uploadErr) {
    console.error("Erro no upload para Firebase Storage:", uploadErr);
    return NextResponse.json({ message: "Erro ao salvar no Firebase", details: (uploadErr as Error).message }, { status: 500 });
  }
}