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
    const { token, ...restOfPayload } = payload || {};

    switch (action) {
        case 'agenda-fetch-data': {
            const { sheetId, sheet, query } = restOfPayload;
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

        case 'agenda-add-event': {
            const { gasUrl, eventData } = restOfPayload;

            // Aqui, podemos adicionar a extração de dados do usuário (tokiuz) se necessário.
            // Por enquanto, apenas enviamos os dados do evento.
            // Ex: const userData = await getUserData(token);
            // const fullEventData = { ...eventData, user: userData };

            if (!gasUrl) {
                return { success: false, error: 'A URL do script (gasUrl) para adicionar eventos não foi configurada.' };
            }

            try {
                const response = await fetch(gasUrl, {
                    method: 'POST',
                    mode: 'cors',
                    redirect: 'follow',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(eventData),
                });
                const result = await response.json();
                return { success: true, data: result };
            } catch (error) {
                console.error(`SisPMG+ [Agenda Background]: Falha ao enviar dados para o Google Apps Script.`, error);
                return { success: false, error: `Falha ao adicionar evento na agenda: ${error.message}` };
            }
        }

        default:
            // Se a ação não for para este manipulador, não fazemos nada.
            return;
    }
}
