// Arquivo: modules/intranet/intranet-agenda-unidades.js
// Lógica de background para buscar unidades para o módulo de Agenda.

import { sendMessageToOffscreen, closeOffscreenDocument } from './intranet-agenda-offscreen.js';
import { fetchWithKeepAlive } from '../../common/keep-alive.js';

/**
 * Busca os dados das unidades da intranet.
 * @param {string} codigoRegiao - O código da região do usuário para a busca.
 * @returns {Promise<string>} O HTML da resposta.
 */
async function fetchUnidadesData(codigoRegiao) {
    const url = "https://intranet.policiamilitar.mg.gov.br/legado/operacoes/unidades/default.asp";
    
    // Alinhado com o módulo 'intranet-unidades-background.js' que funciona corretamente.
    // Removido 'acao=Novo' e usando URLSearchParams.
    const bodyParams = new URLSearchParams({
        acao: 'Consulta',
        cUEOp: codigoRegiao,
        ExibeCodigo: '1' // Equivalente a 'ExibeCodigo=1'
    });

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
    const htmlText = decoder.decode(buffer);

    // Log solicitado para depuração
    console.log("SisPMG+ [Agenda/Unidades]: Resposta HTML recebida:", htmlText);

    return htmlText;
}

/**
 * Faz o parsing do HTML das unidades usando um documento offscreen.
 * @param {string} htmlText - O texto HTML a ser parseado.
 * @returns {Promise<Array>} Os dados das unidades parseados.
 */
async function parseUnidadesHTML(htmlText) {
    const result = await sendMessageToOffscreen('parse-unidades-html', { html: htmlText });
    if (result.error) {
        throw new Error(result.error);
    }
    return result.data;
}

/**
 * Função principal para buscar e processar as unidades para a agenda.
 * @param {string} userRegionCode - O código da região do usuário.
 * @returns {Promise<Array>} Uma lista de objetos de unidade.
 */
export async function fetchUnidadesForAgenda(userRegionCode) {
    if (!userRegionCode) {
        console.warn("SisPMG+ [Agenda/Unidades]: Código da região do usuário não fornecido.");
        return [];
    }

    try {
        const htmlData = await fetchUnidadesData(userRegionCode);
        const parsedData = await parseUnidadesHTML(htmlData);
        
        if (!parsedData || parsedData.length === 0) {
            console.log("SisPMG+ [Agenda/Unidades]: Nenhuma unidade encontrada para a região:", userRegionCode);
            return [];
        }
        
        // Formata os dados para o que a UI da agenda precisa
        const formattedUnits = parsedData.map(unit => ({
            value: unit.code,
            label: `${unit.code} - ${unit.unitName}`,
            hierarchyPath: unit.hierarchyPath || '' // Inclui o caminho da hierarquia
        }));

        return formattedUnits;

    } catch (error) {
        console.error("SisPMG+ [Agenda/Unidades]: Erro ao buscar unidades:", error);
        // Retorna um array vazio em caso de erro para não quebrar a UI
        return [];
    } finally {
        await closeOffscreenDocument();
    }
}
