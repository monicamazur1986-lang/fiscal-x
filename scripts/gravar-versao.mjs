/**
 * Carimbo da versão publicada.
 *
 * Roda antes do build e grava `public/versao.json` com a data/hora daquele
 * build. Dois consumidores leem esse mesmo arquivo:
 *
 *  1. `next.config.ts`, na hora do build, que injeta o valor dentro do bundle
 *     como NEXT_PUBLIC_BUILD_ID — é a versão que o aparelho está RODANDO;
 *  2. o navegador, em tempo de execução, buscando /versao.json sem cache — é a
 *     versão que está PUBLICADA no servidor.
 *
 * Quando as duas divergem, o app sabe que há atualização e avisa (ver
 * AvisoAtualizacao). Sem isso, um app aberto no celular podia ficar dias na
 * versão antiga, porque aplicativo instalado é retomado, não recarregado.
 *
 * O arquivo precisa ser escrito ANTES do next.config ser avaliado no build —
 * por isso ele é o primeiro passo do `prebuild`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const destino = path.join(__dirname, '..', 'public', 'versao.json');

// Em CI existe um identificador de commit; localmente, a hora do build serve.
const build = process.env.BUILD_ID || process.env.GITHUB_SHA || new Date().toISOString();

fs.writeFileSync(destino, JSON.stringify({ build }, null, 2) + '\n');
console.log(`versao.json -> ${build}`);
