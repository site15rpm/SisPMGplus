// Arquivo: modules/intranet/intranet-background.js
// Lógica de background específica para o módulo IntranetPMG+

async function fetchApiData(url, token, options = {}) {
    const defaultOptions = {
        method: 'GET',
        headers: {
            'Authorization': token,
            'Accept': 'application/json, text/plain, */*'
        },
        mode: 'cors'
    };
    const finalOptions = { ...defaultOptions, ...options, headers: { ...defaultOptions.headers, ...options.headers } };

    try {
        const response = await fetch(url, finalOptions);
        const contentType = response.headers.get("content-type");
        let responseData;

        if (contentType && contentType.includes("application/json")) {
            responseData = await response.json();
        } else {
            responseData = await response.text();
        }

        if (!response.ok && response.status !== 302) {
            throw new Error(`Erro na API: ${response.status} ${response.statusText}`);
        }
        
        return { success: true, data: responseData };

    } catch (error) {
        console.error(`SisPMG+ [Background]: Falha ao buscar dados da API em ${url}.`, error);
        let userMessage = `Falha de rede ao tentar acessar: ${url}.`;
        if (error.message.includes('Failed to fetch')) {
            userMessage += ' Isso pode ser causado por um bloqueio de rede, firewall, antivírus ou outra extensão. Verifique a configuração da sua máquina.';
        } else {
            userMessage += ` Detalhe: ${error.message}`;
        }
        return { success: false, error: userMessage, originalError: error.message };
    }
}


function parseUserSectionHTML(html) {
    const tableRegex = /<table class="t1" id="tbLista">([\s\S]*?)<\/table>/;
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;

    const tableMatch = html.match(tableRegex);
    if (!tableMatch) return null;

    const rowMatch = tableMatch[1].match(rowRegex);
    if (!rowMatch || rowMatch.length < 2) return null; // Pula o cabeçalho

    const cellsMatch = rowMatch[1].match(cellRegex); // Pega a primeira linha de dados
    if (!cellsMatch || cellsMatch.length < 8) return null;

    const cleanContent = (str) => str.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

    return {
        sectionCode: cleanContent(cellsMatch[3]),
        sectionName: cleanContent(cellsMatch[4]),
        unitCode: cleanContent(cellsMatch[5]),
        unitName: cleanContent(cellsMatch[6]),
        regionCode: cleanContent(cellsMatch[7]),
        regionName: cleanContent(cellsMatch[8])
    };
}

// Converte a resposta do Google Sheets para um formato de array 2D mais simples.
function parseGoogleSheetResponse(responseText) {
    const jsonText = responseText.match(/google\.visualization\.Query\.setResponse\((.*)\);/s);
    if (!jsonText || !jsonText[1]) {
        console.error("SisPMG+ [Background]: Formato de resposta do banco de dados inesperado");
        throw new Error('Formato de resposta do banco de dados inesperado.<br><br>Atualize a página e tente novamente. Se o erro persistir, contate o administrador do sistema.');
    }
    const data = JSON.parse(jsonText[1]);
    if (!data.table || !data.table.rows) return [];

    const parsedData = data.table.rows.map(row => row.c.map(cell => cell ? (cell.f || cell.v) : null));
    return parsedData;
}

export function handleIntranetMessages(request, sender, sendResponse) {
    const { action, payload } = request;
    
    // O token agora é extraído do payload de cada mensagem para maior segurança e confiabilidade
    const { token, ...restOfPayload } = payload || {};

    switch (action) {
        case 'fetchBirthdays': {
            const { mes, unidade, incluirSubunidades } = restOfPayload;
            const url = `https://aniversariantes.policiamilitar.mg.gov.br/backend/aniversariantes/${mes}/${unidade}/${incluirSubunidades}`;
            fetchApiData(url, token).then(sendResponse);
            return true;
        }
        case 'fetchUnits': {
            const url = `https://aniversariantes.policiamilitar.mg.gov.br/backend/aniversariantes/unidades`;
            fetchApiData(url, token).then(sendResponse);
            return true;
        }
        case 'fetchUserSection': {
            const { nrPol } = restOfPayload;
            const url = 'https://intranet.policiamilitar.mg.gov.br/legado/Pessoal/pes_rel_locfunc.asp';
            const body = `Intpage=&acao=pesq&cCtrl=&txtNrPol=${nrPol}&sltUnid=0&cLoc=&cLocDesc=&cFunc=&cFuncDesc=&ord=NP&cNReg=40&Pesq=Pesquisar`;
            
            fetchApiData(url, token, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': token },
                body: body
            }).then(response => {
                if (response.success) {
                    const sectionData = parseUserSectionHTML(response.data);
                    sendResponse(sectionData ? { success: true, data: sectionData } : { success: false, error: 'Não foi possível extrair a seção do HTML.' });
                } else {
                    sendResponse(response);
                }
            });
            return true;
        }
        case 'fetchConvenioPlano': {
            const url = `https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/plano/get-plano?convenio=${restOfPayload.convenioId}`;
            fetchApiData(url, token).then(sendResponse);
            return true;
        }
        case 'fetchConvenioDetalhes': {
            const url = `https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/convenio/get-convenio-detalhes?id=${restOfPayload.convenioId}`;
            fetchApiData(url, token).then(sendResponse);
            return true;
        }
        case 'fetchSirconvData': {
            // ### INÍCIO DA MODIFICAÇÃO ###
            const { sheetId, sheet, query, bustCache } = restOfPayload;
            // Adiciona o bustCache (para evitar cache do navegador) e o tqx=out:json
            const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${sheet}&tq=${encodeURIComponent(query)}&_=${bustCache || Date.now()}`;
            
            // Adiciona { credentials: 'omit' } para não enviar cookies do Google
            fetch(url, { credentials: 'omit' }) 
                .then(res => {
                    if (!res.ok) throw new Error(`Falha na requisição: ${res.status} ${res.statusText}`);
                    return res.text();
                })
            // ### FIM DA MODIFICAÇÃO ###
                .then(text => {
                    try {
                        const parsedData = parseGoogleSheetResponse(text);
                        sendResponse({ success: true, data: parsedData });
                    } catch (e) {
                         console.error(`SisPMG+ [Background]: Erro ao processar dados.`, e);
                        sendResponse({ success: false, error: e.message });
                    }
                })
                .catch(error => {
                    // O erro "Failed to fetch" será capturado aqui
                    console.error(`SisPMG+ [Background]: Falha no fetch para o Google Sheet (fetchSirconvData).`, error);
                    sendResponse({ success: false, error: `Falha ao buscar dados (provavelmente CORS ou rede): ${error.message}` })
                });
            return true;
        }
        case 'fetchMapData': {
            // ### INÍCIO DA MODIFICAÇÃO ###
            const { sheetId, gid, query } = restOfPayload;
            const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}&tq=${encodeURIComponent(query)}&_=${Date.now()}`;
            
            // Adiciona { credentials: 'omit' }
            fetch(url, { credentials: 'omit' })
                .then(response => {
                    if (!response.ok) throw new Error(`Falha na requisição: ${response.status} ${response.statusText}`);
                    return response.text();
                })
            // ### FIM DA MODIFICAÇÃO ###
                .then(text => {
                    const jsonText = text.match(/google\.visualization\.Query\.setResponse\((.*)\);/s);
                    if (jsonText && jsonText[1]) {
                        const data = JSON.parse(jsonText[1]);
                        sendResponse({ success: true, data: data.table });
                    } else {
                        throw new Error('Formato de resposta do banco de dados inesperado.<br><br>Atualize a página e tente novamente. Se o erro persistir, contate o administrador do sistema.');
                    }
                })
                .catch(error => {
                    console.error(`SisPMG+ [Background]: Falha no fetch para o Google Sheet (fetchMapData).`, error);
                    sendResponse({ success: false, error: `Falha ao buscar dados (provavelmente CORS ou rede): ${error.message}` });
                });
            return true;
        }
        case 'deleteExecucaoItem': {
             const { url, csrfParam, csrfToken } = restOfPayload;
             fetchApiData(url, token, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                body: new URLSearchParams({ [csrfParam]: csrfToken }).toString()
             }).then(sendResponse);
             return true;
        }
        case 'sendSirconvData': {
             const url = 'https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/execucao/registrar';
             fetchApiData(url, token, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Authorization': token, 'X-Requested-With': 'XMLHttpRequest' },
                 body: new URLSearchParams(restOfPayload.payload).toString()
             }).then(sendResponse);
             return true;
        }
        default:
            return false;
    }
}
