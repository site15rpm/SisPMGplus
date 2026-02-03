/**
 * Módulo de Background: SIRCONV - Extração de Convênios
 * Gerencia a extração automática via JSON e envio para GAS.
 * 
 * CONFIGURAÇÃO: URL do GAS embutida no código para uso automático
 */

const LOGS_KEY = 'sirconvConveniosLogs';
const LAST_RUN_KEY = 'sirconvConveniosLastRun'; // Armazena { userId: date }
const MAX_LOG_ENTRIES = 50;

// URL do Google Apps Script (FIXO - configurado no código)
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwrgsnhG3ACcNFvCOOU-jjoQoTqnHvhxyhQLkYHBwGifkUMxBzSLn1-dJT8cxap1EJz0A/exec';

// URL JSON para buscar todos os convênios da unidade/usuário logado
const SIRCONV_JSON_URL = 'https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/convenio/meus-convenios?pesquisa=%7B%22preposto%22:%22%22,%22numeroConvenio%22:%22%22,%22numeroFace%22:%22%22,%22todasUnidades%22:%22%22,%22unidade%22:%22%22,%22status%22:%22%22,%22dtInicio1%22:null,%22dtInicio2%22:null,%22dtFim1%22:null,%22dtFim2%22:null%7D';

// --- LOGS ---
async function addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleString('pt-BR');
    const entry = { timestamp, message, type };
    
    const { [LOGS_KEY]: logs = [] } = await chrome.storage.local.get(LOGS_KEY);
    logs.unshift(entry);
    const trimmedLogs = logs.slice(0, MAX_LOG_ENTRIES);
    
    await chrome.storage.local.set({ [LOGS_KEY]: trimmedLogs });
    
    // Notifica todas as abas abertas sobre a atualização dos logs
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { 
                action: 'sirconv-convenios-logs-updated', 
                logs: trimmedLogs 
            }).catch(() => {});
        });
    });
}

// --- CONTROLE DE EXECUÇÃO POR USUÁRIO ---
async function checkIfAlreadyRanToday(userId) {
    const { [LAST_RUN_KEY]: lastRunData = {} } = await chrome.storage.local.get(LAST_RUN_KEY);
    const today = new Date().toLocaleDateString('pt-BR');
    
    return lastRunData[userId] === today;
}

async function markAsRunToday(userId) {
    const { [LAST_RUN_KEY]: lastRunData = {} } = await chrome.storage.local.get(LAST_RUN_KEY);
    const today = new Date().toLocaleDateString('pt-BR');
    
    lastRunData[userId] = today;
    
    // Limpa entradas antigas (mais de 7 dias)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    Object.keys(lastRunData).forEach(key => {
        const dateStr = lastRunData[key];
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const recordDate = new Date(parts[2], parts[1] - 1, parts[0]);
            
            if (recordDate < sevenDaysAgo) {
                delete lastRunData[key];
            }
        }
    });
    
    await chrome.storage.local.set({ [LAST_RUN_KEY]: lastRunData });
}

// --- EXTRAÇÃO (VIA JSON) ---
async function fetchAndParseData() {
    try {
        await addLog('Iniciando requisição JSON ao SIRCONV...', 'process');
        
        const response = await fetch(SIRCONV_JSON_URL, {
            method: 'GET',
            headers: { 
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'include' // Importante para enviar cookies de autenticação
        });

        if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
        
        const jsonData = await response.json();
        const convenios = jsonData.convenios || [];

        if (!Array.isArray(convenios)) {
            throw new Error("Formato de resposta inválido (array 'convenios' não encontrado).");
        }

        await addLog(`Dados obtidos com sucesso: ${convenios.length} convênios.`, 'success');
        return convenios;

    } catch (error) {
        await addLog(`Erro na extração de dados: ${error.message}`, 'error');
        throw error;
    }
}

// --- SINCRONIZAÇÃO COM GAS ---
async function syncToGas(data, userId) {
    if (!data || data.length === 0) throw new Error("Nenhum dado extraído para enviar.");

    // TODAS as colunas do JSON (ordem alfabética para consistência)
    const orderedKeys = [
        'ADITIVO', 'ATIVO', 'CANCELADO', 'CONCEDENTE', 'CONCEDENTE_ID',
        'CONCEDE_ATIVO', 'DTFINAL', 'DTINICIAL', 'EADT', 'EXISTE_ANEXO',
        'FINALIZADO', 'FINALIZADO2', 'ID', 'LIQUIDADO', 'MILITAR_EXCLUIDO',
        'NUMERO_FACE', 'PES_POSTOGRAD', 'PREPOSTO_ID', 'PREPOSTO_NOME',
        'SITUACAO_CONV', 'TIPO_OBJETO_CONVENIO', 'UNIDADE_RESPONSAVEL',
        'UNI_NOME_PRINCIPAL', 'VALOR_ESTIMADO', 'VENCIDO'
    ];

    const csvRows = [orderedKeys.join(',')];
    
    data.forEach(row => {
        const values = orderedKeys.map(key => {
            let val = row[key];
            if (val === null || val === undefined) val = '';
            val = String(val).replace(/"/g, '""'); 
            return `"${val}"`;
        });
        csvRows.push(values.join(','));
    });
    
    const csvContent = csvRows.join('\n');

    await addLog(`Enviando ${data.length} registros para o GAS...`, 'process');

    const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({
            content: csvContent,
            contentType: 'csv',
            module: 'SIRCONV_CONVENIOS',
            userId: userId, // Informação adicional para auditoria
            timestamp: new Date().toISOString()
        })
    });

    if (!response.ok && response.status !== 302) {
         throw new Error(`Erro no envio ao GAS: ${response.status} ${response.statusText}`);
    }
    
    try {
        const jsonResp = await response.json();
        if (!jsonResp.success) throw new Error(jsonResp.message || 'Erro desconhecido no GAS');
        await addLog('Sincronização com GAS concluída com sucesso.', 'success');
    } catch (e) {
        // Ignora erro de JSON se for redirect opaco (sucesso)
        console.warn('SisPMG+ [Sirconv Convenios]: Resposta não-JSON do GAS (pode ser redirect), assumindo sucesso se HTTP OK.', e);
        if (response.ok || response.status === 302) {
            await addLog('Sincronização com GAS concluída (redirect).', 'success');
        } else {
            throw e;
        }
    }
}

// --- LÓGICA DE GATILHO AUTOMÁTICO ---
async function checkTrigger(userContext) {
    // Verifica se há contexto de usuário
    if (!userContext || !userContext.userPM) {
        console.log('SisPMG+ [Sirconv Convenios]: Contexto de usuário inválido.');
        return;
    }

    const userId = userContext.userPM;

    // Verifica se já executou hoje para este usuário
    const alreadyRan = await checkIfAlreadyRanToday(userId);
    
    if (alreadyRan) {
        console.log(`SisPMG+ [Sirconv Convenios]: Já executado hoje para o usuário ${userId}. Ignorando.`);
        return;
    }

    // Executa a extração
    console.log(`SisPMG+ [Sirconv Convenios]: Gatilho acionado para usuário ${userId}.`);
    await runProcess(userId);
}

async function runProcess(userId = null) {
    try {
        await addLog('=== Processo de extração iniciado ===', 'start');
        
        const data = await fetchAndParseData();
        
        if (data.length === 0) {
            await addLog('Nenhum convênio encontrado para extração.', 'info');
            return;
        }
        
        await syncToGas(data, userId || 'manual');
        await addLog('=== Processo concluído com sucesso ===', 'success');

        // Marca como executado hoje para este usuário (apenas em execuções automáticas)
        if (userId) {
            await markAsRunToday(userId);
        }

    } catch (error) {
        console.error("SisPMG+ [Sirconv Convenios Error]:", error);
        await addLog(`❌ Erro no processo: ${error.message}`, 'error');
    }
}

// --- HANDLER DE MENSAGENS ---
export function handleSirconvConveniosMessages(request, sender, sendResponse) {
    const { action, payload } = request;

    switch (action) {
        case 'sirconv-convenios-get-logs':
            chrome.storage.local.get(LOGS_KEY).then(res => {
                sendResponse({ success: true, logs: res[LOGS_KEY] || [] });
            });
            return true;

        case 'sirconv-convenios-clear-logs':
            chrome.storage.local.set({ [LOGS_KEY]: [] })
                .then(() => {
                    sendResponse({ success: true });
                    // Notifica sobre a limpeza
                    chrome.tabs.query({}, (tabs) => {
                        tabs.forEach(tab => {
                            chrome.tabs.sendMessage(tab.id, { 
                                action: 'sirconv-convenios-logs-updated', 
                                logs: [] 
                            }).catch(() => {});
                        });
                    });
                })
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true;

        case 'sirconv-convenios-manual-run':
            (async () => {
                try {
                    await addLog('Execução manual iniciada pelo usuário.', 'start');
                    await runProcess(null); // null = não marca como executado automaticamente
                    sendResponse({ success: true });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;

        case 'intranet-user-identified':
            // Extração automática disparada quando usuário navega pela página
            if (payload?.system === 'SIRCONV') {
                checkTrigger(payload);
            }
            return false; // Continua a propagação para outros listeners se necessário

        default:
            return false;
    }
}

export function initializeSirconvConveniosBackground() {
    console.log("SisPMG+: Módulo Sirconv Convenios Background iniciado (Extração automática por usuário).");
}