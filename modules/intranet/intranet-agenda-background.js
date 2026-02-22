// Arquivo: modules/intranet/intranet-agenda-background.js
// Lógica de background específica para o módulo de Agenda da Intranet.

/**
 * Inicializa o background do módulo de agenda.
 * Atualmente, não há inicialização necessária, mas a função está aqui para consistência.
 */
export function initializeAgendaBackground() {
    // console.log('SisPMG+ [Agenda Background]: Módulo de agenda inicializado.');
}

/**
 * Converte a resposta do Google Sheets para um formato de array 2D mais simples.
 * @param {string} responseText O texto da resposta da API do Google Visualization.
 * @returns {Array<Array<string|number|null>>} Os dados da planilha como um array de linhas.
 */
function parseGoogleSheetResponse(responseText) {
    const jsonText = responseText.match(/google\.visualization\.Query\.setResponse\((.*)\);/s);
    if (!jsonText || !jsonText[1]) {
        console.error("SisPMG+ [Agenda Background]: Formato de resposta do banco de dados da agenda inesperado.");
        throw new Error('Formato de resposta do banco de dados da agenda inesperado.');
    }
    const data = JSON.parse(jsonText[1]);
    if (!data.table || !data.table.rows) return [];

    const parsedData = data.table.rows.map(row => row.c.map(cell => cell ? (cell.f || cell.v) : null));
    return parsedData;
}

/**
 * Manipula as mensagens em segundo plano para o módulo de agenda.
 * @param {object} request O objeto da mensagem da solicitação.
 * @param {object} sender O objeto do remetente.
 * @returns {Promise<object>} Uma promessa que resolve com a resposta.
 */
export async function handleAgendaMessages(request, sender) {
    const { action, payload } = request;

    switch (action) {
        case 'agenda-fetch-data': {
            const { sheetId, sheet, query } = payload || {};
            const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${sheet}&tq=${encodeURIComponent(query)}&_=${Date.now()}`;
            
            try {
                const res = await fetch(url, { credentials: 'omit' });
                if (!res.ok) throw new Error(`Falha na requisição: ${res.status} ${res.statusText}`);
                const text = await res.text();
                const parsedData = parseGoogleSheetResponse(text);
                return { success: true, data: parsedData };
            } catch (error) {
                console.error(`SisPMG+ [Agenda Background]: Falha no fetch para o Google Sheet.`, error);
                return { success: false, error: `Falha ao buscar dados da agenda: ${error.message}` };
            }
        }

        case 'agenda-add-event':
        case 'agenda-confirm-task': // Ambas as ações usam a mesma lógica de encaminhamento
        {
            const { gasUrl, eventData } = payload || {};

            if (!gasUrl) {
                return { success: false, error: 'A URL do script (gasUrl) não foi configurada.' };
            }

            try {
                const response = await fetch(gasUrl, {
                    method: 'POST',
                    mode: 'cors',
                    redirect: 'follow',
                    headers: { 'Content-Type': 'application/json' },
                    // Encapsula os dados com a ação para o GAS saber o que fazer
                    body: JSON.stringify({ action: action, eventData: eventData }),
                });
                
                const resultText = await response.text();
                const result = JSON.parse(resultText);

                if (result.success === false) { // O GAS pode retornar success:false
                    throw new Error(result.error || 'Erro desconhecido no GAS.');
                }
                
                return { success: true, data: result };
            } catch (error) {
                console.error(`SisPMG+ [Agenda Background]: Falha ao enviar dados para o GAS para a ação '${action}'.`, error);
                return { success: false, error: error.message };
            }
        }

        default:
            return; // Ação não pertence a este módulo
    }
}
