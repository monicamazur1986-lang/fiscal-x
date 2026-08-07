
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export const dynamic = 'force-dynamic';

// Mesmo padrão de inicialização e autenticação já usado em
// src/app/api/municipio/tem-gestor/route.ts.
const serviceAccountKey = process.env.FIREBASE_ADMIN_SDK_PRIVATE_KEY_JSON;

if (!getApps().length) {
  if (!serviceAccountKey) {
    console.error("FIREBASE_ADMIN_SDK_PRIVATE_KEY_JSON environment variable is not set.");
    throw new Error("Firebase Admin SDK credentials not found.");
  }
  initializeApp({ credential: cert(JSON.parse(serviceAccountKey)), storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET });
}

const auth = getAuth();

/**
 * Rota de Proxy para Consulta de CNPJ via BrasilAPI
 * Retorna dados formatados e a lista bruta de CNAEs para seleção.
 *
 * Exige login: sem isso, qualquer um na internet (nem precisava estar
 * logado no sistema) conseguia usar esse endpoint como um serviço gratuito
 * de consulta de CNPJ às custas da nossa infraestrutura/limite na BrasilAPI.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cnpj: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization');
    const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 });
    }
    try {
      await auth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ message: 'Sessão inválida.' }, { status: 401 });
    }

    const { cnpj: rawCnpj } = await params;
    const cnpj = rawCnpj.replace(/\D/g, '');

    if (!cnpj || cnpj.length !== 14) {
      return NextResponse.json({ message: 'CNPJ deve conter 14 dígitos.' }, { status: 400 });
    }

    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      method: 'GET',
      headers: { 
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      cache: 'no-store'
    });

    if (response.status === 404) {
      return NextResponse.json({ message: 'CNPJ não encontrado na base de dados nacional.' }, { status: 404 });
    }

    if (!response.ok) {
      return NextResponse.json({ 
        message: 'O serviço nacional de consulta está temporariamente instável.' 
      }, { status: response.status });
    }

    const data = await response.json();
    
    // Extração de todos os CNAEs
    const cnaes: string[] = [];
    if (data.cnae_fiscal && data.cnae_fiscal_descricao) {
      cnaes.push(`${data.cnae_fiscal} - ${data.cnae_fiscal_descricao}`);
    }
    
    if (data.cnaes_secundarios && Array.isArray(data.cnaes_secundarios)) {
      data.cnaes_secundarios.forEach((c: any) => {
        if (c.codigo && c.descricao) {
          cnaes.push(`${c.codigo} - ${c.descricao}`);
        }
      });
    }

    let responsavelLegal = "";
    if (data.qsa && Array.isArray(data.qsa) && data.qsa.length > 0) {
      const adm = data.qsa.find((s: any) => 
        s.codigo_qualificacao_socio === 10 || 
        s.qualificacao_socio?.toLowerCase().includes('adm')
      );
      responsavelLegal = (adm ? adm.nome_socio : data.qsa[0].nome_socio) || "";
    }

    const mappedData = {
        razao_social: (data.razao_social || data.nome_fantasia || '').toUpperCase(),
        logradouro: (data.logradouro || '').toUpperCase(),
        numero: (data.numero || '').toUpperCase(),
        bairro: (data.bairro || '').toUpperCase(),
        municipio: (data.municipio || 'PRUDENTÓPOLIS').toUpperCase(),
        cnae: cnaes.join('; ').toUpperCase(), 
        cnaes_list: cnaes, // Retorna lista bruta para seleção na UI
        telefone: data.ddd_telefone_1 ? `(${data.ddd_telefone_1.substring(0,2)}) ${data.ddd_telefone_1.substring(2)}` : '',
        responsavel_legal: responsavelLegal.toUpperCase()
    };

    return NextResponse.json(mappedData);

  } catch (error: any) {
    return NextResponse.json({ message: 'Erro de conexão.', details: error.message || 'Detalhes do erro desconhecidos.' }, { status: 500 });
  }
}
