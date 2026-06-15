// Arquivo: common/unidades-util.js
// Funções centrais e reutilizáveis para busca e parse de unidades da intranet.

import { fetchWithKeepAlive } from './keep-alive.js';
import { sendMessageToOffscreen, closeOffscreenDocument } from '../modules/intranet/intranet-agenda-offscreen.js';

/**
 * Busca o HTML bruto de unidades da intranet.
 * @param {string} codigoRegiao - Código da região/unidade raiz (cUEOp).
 * @param {boolean} exibirCodigo - Se deve exibir os códigos das unidades (ExibeCodigo=1).
 * @param {boolean} apenasPrincipal - Se deve filtrar apenas pela unidade principal (UniPrinc=1).
 * @returns {Promise<string>} O HTML da resposta decodificado em ISO-8859-1.
 */
export async function fetchUnidadesHTML(codigoRegiao, exibirCodigo = true, apenasPrincipal = false) {
    const url = "https://intranet.policiamilitar.mg.gov.br/legado/operacoes/unidades/default.asp";
    
    const bodyParams = new URLSearchParams({
        acao: 'Consulta',
        cUEOp: codigoRegiao
    });

    if (exibirCodigo) {
        bodyParams.append('ExibeCodigo', '1');
    }
    if (apenasPrincipal) {
        bodyParams.append('UniPrinc', '1');
    }

    const response = await fetchWithKeepAlive(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        body: bodyParams.toString(),
        credentials: 'include'
    });
    
    if (!response.ok) {
        throw new Error(`Erro na requisição de unidades: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder("iso-8859-1");
    return decoder.decode(buffer);
}

/**
 * Faz o parsing do HTML das unidades usando o documento offscreen.
 * @param {string} htmlText - O HTML bruto a ser analisado.
 * @returns {Promise<Array>} Lista de unidades parseadas.
 */
export async function parseUnidades(htmlText) {
    const result = await sendMessageToOffscreen('parse-unidades-html', { html: htmlText });
    if (result.error) {
        throw new Error(result.error);
    }
    return result.data;
}

/**
 * Função utilitária centralizada para buscar e analisar unidades.
 * @param {string} codigoRegiao - Código da UEOp.
 * @param {boolean} exibirCodigo - Se deve incluir o código.
 * @param {boolean} apenasPrincipal - Se deve filtrar apenas a principal.
 * @returns {Promise<Array>} Lista de unidades.
 */
export async function obterUnidades(codigoRegiao, exibirCodigo = true, apenasPrincipal = false) {
    try {
        const html = await fetchUnidadesHTML(codigoRegiao, exibirCodigo, apenasPrincipal);
        const data = await parseUnidades(html);
        return data;
    } finally {
        await closeOffscreenDocument();
    }
}
