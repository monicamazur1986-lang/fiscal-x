import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import formidable from "formidable";

export const config = {
  api: {
    bodyParser: false, // necessário para usar formidable
  },
};

export async function POST(req: NextRequest) {
  return new Promise((resolve) => {
    const form = formidable({ multiples: false });

    form.parse(req as any, (err, fields, files) => {
      if (err) {
        resolve(NextResponse.json({ message: "Erro ao processar upload" }, { status: 500 }));
        return;
      }

      const file = files.file as formidable.File;
      const savePath = path.join("C:/Users/mazur/Downloads", file.originalFilename || "upload.png");

      fs.copyFile(file.filepath, savePath, (copyErr) => {
        if (copyErr) {
          resolve(NextResponse.json({ message: "Erro ao salvar arquivo" }, { status: 500 }));
          return;
        }
        resolve(NextResponse.json({ message: "Upload concluído", path: savePath }, { status: 200 }));
      });
    });
  });
}