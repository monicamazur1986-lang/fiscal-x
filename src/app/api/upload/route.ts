import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

// Inicialização do Firebase Admin
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

export async function POST(req: NextRequest) {
  try {
    // Use request.formData() para lidar com multipart/form-data no App Router
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ message: "Nenhum arquivo enviado" }, { status: 400 });
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