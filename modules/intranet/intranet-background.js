// Arquivo: modules/intranet/intranet-background.js
// Lógica de background específica para o módulo IntranetPMG+
import { fetchWithKeepAlive } from '../../common/keep-alive.js';
import { parseGoogleSheetResponse } from '../../common/google-sheets.js';
import { sendMessageToOffscreen, closeOffscreenDocument } from './intranet-agenda-offscreen.js';
import { fetchUnidadesHTML, parseUnidades } from '../../common/busca-unidades.js';

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
        const response = await fetchWithKeepAlive(url, finalOptions);
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

export async function handleIntranetMessages(request, sender) {
    const { action, payload } = request;
    
    // O token agora é extraído do payload de cada mensagem para maior segurança e confiabilidade
    const { token, ...restOfPayload } = payload || {};

    switch (action) {
        case 'intranet-user-identified': {
            // Este evento é um gatilho para múltiplos módulos.
            // Ele não deve retornar uma resposta para permitir que outros handlers na cadeia o processem.
            (async () => {
                try {
                    await browser.storage.local.set({ intranetUser: restOfPayload });
                    if (sender.tab?.id) {
                        // Sinaliza para a aba de origem que o background está pronto
                        browser.tabs.sendMessage(sender.tab.id, { action: 'sispmg-ready' });
                    }
                } catch (e) {
                    console.error('SisPMG+ [Intranet Background]: Falha ao processar intranet-user-identified.', e);
                }
            })();
            // Não retorna nada para que outros handlers possam processar a mensagem.
            break; 
        }
        case 'fetchBirthdays': {
            const { mes, unidade, incluirSubunidades } = restOfPayload;
            const url = `https://aniversariantes.policiamilitar.mg.gov.br/backend/aniversariantes/${mes}/${unidade}/${incluirSubunidades}`;
            return fetchApiData(url, token);
        }
        case 'fetchUnits': {
            const url = `https://aniversariantes.policiamilitar.mg.gov.br/backend/aniversariantes/unidades`;
            return fetchApiData(url, token);
        }
        case 'fetchUserSection': {
            const { nrPol } = restOfPayload;
            const url = 'https://intranet.policiamilitar.mg.gov.br/legado/Pessoal/pes_rel_locfunc.asp';
            const body = `Intpage=&acao=pesq&cCtrl=&txtNrPol=${nrPol}&sltUnid=0&cLoc=&cLocDesc=&cFunc=&cFuncDesc=&ord=NP&cNReg=40&Pesq=Pesquisar`;
            
            const response = await fetchApiData(url, token, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': token },
                body: body
            });

            if (response.success) {
                const sectionData = parseUserSectionHTML(response.data);
                return sectionData ? { success: true, data: sectionData } : { success: false, error: 'Não foi possível extrair a seção do HTML.' };
            } else {
                return response;
            }
        }
        case 'fetchConvenioPlano': {
            const url = `https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/plano/get-plano?convenio=${restOfPayload.convenioId}`;
            return fetchApiData(url, token);
        }
        case 'fetchConvenioDetalhes': {
            const url = `https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/convenio/get-convenio-detalhes?id=${restOfPayload.convenioId}`;
            return fetchApiData(url, token);
        }
        case 'fetchSirconvData': {
            const { sheetId, sheet, query, bustCache } = restOfPayload;
            const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${sheet}&tq=${encodeURIComponent(query)}&_=${bustCache || Date.now()}`;
            
            try {
                const res = await fetchWithKeepAlive(url, { credentials: 'omit' });
                if (!res.ok) throw new Error(`Falha na requisição: ${res.status} ${res.statusText}`);
                const text = await res.text();
                const parsedData = parseGoogleSheetResponse(text);
                return { success: true, data: parsedData };
            } catch (error) {
                console.error(`SisPMG+ [Background]: Falha no fetch para o Google Sheet (fetchSirconvData).`, error);
                return { success: false, error: `Falha ao buscar dados (provavelmente CORS ou rede): ${error.message}` };
            }
        }
        case 'fetchMapData': {
            const { sheetId, gid, query } = restOfPayload;
            const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}&tq=${encodeURIComponent(query)}&_=${Date.now()}`;
            
            try {
                const response = await fetchWithKeepAlive(url, { credentials: 'omit' });
                if (!response.ok) throw new Error(`Falha na requisição: ${response.status} ${response.statusText}`);
                const text = await response.text();
                const jsonText = text.match(/google\.visualization\.Query\.setResponse\((.*)\);/s);

                if (jsonText && jsonText[1]) {
                    const data = JSON.parse(jsonText[1]);
                    return { success: true, data: data.table };
                } else {
                    throw new Error('Formato de resposta do banco de dados inesperado.<br><br>Atualize a página e tente novamente. Se o erro persistir, contate o administrador do sistema.');
                }
            } catch (error) {
                console.error(`SisPMG+ [Background]: Falha no fetch para o Google Sheet (fetchMapData).`, error);
                return { success: false, error: `Falha ao buscar dados (provavelmente CORS ou rede): ${error.message}` };
            }
        }
        case 'deleteExecucaoItem': {
             const { url, csrfParam, csrfToken } = restOfPayload;
             return fetchApiData(url, token, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                body: new URLSearchParams({ [csrfParam]: csrfToken }).toString()
             });
        }
        case 'sendSirconvData': {
             const url = 'https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/execucao/registrar';
             return fetchApiData(url, token, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Authorization': token, 'X-Requested-With': 'XMLHttpRequest' },
                 body: new URLSearchParams(restOfPayload.payload).toString()
             });
        }
        case 'sic3-identify-user': {
            const { e, c } = restOfPayload;
            const bgLogs = [];
            const logBg = (msg) => {
                bgLogs.push(msg);
            };

            logBg(`[BG-Identificação] Iniciando identificação no background. Parâmetros recebidos -> e (Região): ${e}, c (Seção alvo): ${c}`);
            try {
                logBg(`[BG-Identificação] Efetuando requisição de árvore de unidades com parâmetro cUEOp=${e}`);
                const htmlText = await fetchUnidadesHTML(e, true, false);
                
                logBg(`[BG-Identificação] HTML recebido com sucesso. Tamanho: ${htmlText.length} caracteres. Enviando para parser...`);
                const parsedData = await parseUnidades(htmlText);
                
                logBg(`[BG-Identificação] Parser retornou ${parsedData.length} unidades listadas na árvore.`);
                
                // Procurar a unidade correspondente ao código 'c' do usuário
                logBg(`[BG-Identificação] Buscando unidade alvo pelo código c: "${c}"...`);
                const targetUnit = parsedData.find(unit => String(unit.code) === String(c));
                
                if (!targetUnit) {
                    logBg(`[BG-Identificação] Unidade/seção do usuário (${c}) não encontrada na árvore de subunidades da região/unidade (${e}).`);
                    return { success: false, error: `Unidade/seção do usuário (${c}) não encontrada na árvore da região/unidade (${e}).`, bgLogs };
                }
                
                logBg(`[BG-Identificação] Unidade correspondente encontrada na árvore: ${JSON.stringify(targetUnit)}`);
                
                // O nome da seção do usuário deve ser a hierarquia inversa sem a RPM.
                // Exemplo: se hierarchyPath for "15 RPM / 19 BPM / 232 CIA PM / 1 PEL / 2 GP / SGPM PM",
                // a seção será "SGPM PM / 2 GP / 1 PEL / 232 CIA PM / 19 BPM"
                let nomeSecao = targetUnit.unitName;
                if (targetUnit.hierarchyPath) {
                    const partes = targetUnit.hierarchyPath.split(/\s*\/\s*/).map(p => p.trim()).filter(Boolean);
                    if (partes.length > 1) {
                        // Remove o primeiro elemento (RPM)
                        const semRPM = partes.slice(1);
                        // Inverte a ordem e junta com "/"
                        nomeSecao = semRPM.reverse().join('/');
                        logBg(`[BG-Tratamento] Hierarquia inversa sem RPM construída para nomeSecao: "${nomeSecao}"`);
                    } else if (partes.length === 1) {
                        // Caso especial onde há apenas 1 nível (a própria RPM)
                        nomeSecao = partes[0];
                        logBg(`[BG-Tratamento] Apenas RPM identificada na hierarquia. nomeSecao: "${nomeSecao}"`);
                    }
                }
                
                const normalizarMunicipio = (str) => {
                    if (!str) return "";
                    return str
                        .toUpperCase()
                        .trim();
                };

                // O município e o código do município já vêm processados e herdados do offscreen parser.
                // Fallback para município utiliza a folha limpa da seção (unitName) para evitar usar a hierarquia inversa longa.
                let municipio = normalizarMunicipio(targetUnit.municipio || targetUnit.unitName);
                let codigoMunicipio = targetUnit.codigoMunicipio || targetUnit.code;
                
                logBg(`[BG-Tratamento] Município e código resolvidos diretamente do parser offscreen (com suporte a herança hierárquica): ${JSON.stringify({
                    municipioOriginalNoNode: targetUnit.municipio,
                    codigoMunicipioOriginalNoNode: targetUnit.codigoMunicipio,
                    municipioFinalResolvido: municipio,
                    codigoMunicipioFinalResolvido: codigoMunicipio
                })}`);
                
                const resData = {
                    success: true,
                    codigoSecao: targetUnit.code,
                    nomeSecao: nomeSecao,
                    municipio: municipio,
                    codigoMunicipio: codigoMunicipio,
                    hierarchyPath: targetUnit.hierarchyPath,
                    bgLogs: bgLogs
                };
                
                try {
                    await browser.storage.local.set({ sic3_unidades_rpm: parsedData });
                    logBg(`[BG-Identificação] Cache de unidades gravado com sucesso no storage local (chave 'sic3_unidades_rpm', ${parsedData.length} registros).`);
                } catch (storageErr) {
                    logBg(`[BG-Erro Storage] Falha ao salvar cache de unidades: ${storageErr.message}`);
                }
                
                logBg(`[BG-Identificação] Processo finalizado com sucesso no background. Detalhe das chaves obtidas:
                - codigoSecao: "${resData.codigoSecao}" (Chave 'c' do Tokiuz do usuário, correspondente ao ID na árvore)
                - nomeSecao: "${resData.nomeSecao}" (Nome limpo da seção funcional extraído da árvore)
                - municipio: "${resData.municipio}" (Nome do município extraído entre parênteses ou herdado do nível superior se ausente)
                - codigoMunicipio: "${resData.codigoMunicipio}" (Código numérico associado ao município ou herdado do nível superior se ausente)
                - hierarchyPath: "${resData.hierarchyPath}" (Caminho completo da estrutura de divisões até o nó atual)`);
                
                return resData;
                
            } catch (error) {
                logBg(`[BG-Erro] Falha ao identificar unidade e município do usuário no background: ${error.message}`);
                return { success: false, error: error.message, bgLogs };
            } finally {
                await closeOffscreenDocument();
            }
        }
    }
}
