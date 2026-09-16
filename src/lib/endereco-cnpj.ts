/**
 * Monta o endereço a partir das partes que a consulta de CNPJ devolve.
 *
 * O endereço era montado direto no template `${logradouro}, ${numero}`. Quando
 * a Receita não tem uma das partes — acontece com frequência em MEI, endereço
 * rural e imóvel sem número —, a interpolação devolvia literalmente ", " e o
 * campo chegava ao documento com uma vírgula solta, sem endereço nenhum.
 *
 * Aqui cada parte só entra se existir, e o separador acompanha:
 *
 *   RUA SÃO JOSAFAT, 835 - SALA 2
 *   RUA SÃO JOSAFAT, S/N          (sem número informado)
 *   ESTRADA DA COLÔNIA            (sem número nem complemento)
 *   ""                            (sem logradouro — campo fica vazio para o
 *                                  fiscal digitar, em vez de uma vírgula)
 */
export function montarEnderecoCnpj(dados: {
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
}): string {
  const logradouro = (dados.logradouro || '').trim();
  if (!logradouro) return '';

  const numero = (dados.numero || '').trim();
  const complemento = (dados.complemento || '').trim();

  // Sem logradouro não há endereço a montar; com logradouro e sem número, "S/N"
  // é a notação usada no próprio cadastro da Receita e é o que o fiscal
  // esperaria ver no documento.
  let endereco = numero ? `${logradouro}, ${numero}` : `${logradouro}, S/N`;
  if (complemento) endereco += ` - ${complemento}`;
  return endereco;
}
