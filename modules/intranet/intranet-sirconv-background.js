/**
 * Módulo de Background: SIRCONV - Extração de Convênios
 * Gerencia a extração automática via JSON e envio para GAS.
 */

const SETTINGS_KEY = 'sirconvConveniosSettings';
const LOGS_KEY = 'sirconvConveniosLogs';
const LAST_RUN_KEY = 'sirconvConveniosLastRun';
const MAX_LOG_ENTRIES = 50;

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

// --- CONFIGURAÇÕES ---
async function getSettings() {
    const { [SETTINGS_KEY]: settings } = await chrome.storage.local.get(SETTINGS_KEY);
    return settings || { autoExport: false, gasUrl: '', triggerUnits: '' };
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
async function syncToGas(data, gasUrl) {
    if (!data || data.length === 0) throw new Error("Nenhum dado extraído para enviar.");
    if (!gasUrl) throw new Error("URL do Google Script não configurada.");

    // Mapeamento de colunas do JSON para o CSV
    const orderedKeys = [
        'ID', 'NUMERO_FACE', 'CONCEDENTE', 'CONCEDENTE_ID', 'PREPOSTO_ID', 
        'VALOR_ESTIMADO', 'ATIVO', 'SITUACAO_CONV', 'UNI_NOME_PRINCIPAL', 
        'UNIDADE_RESPONSAVEL', 'PREPOSTO_NOME', 'TIPO_OBJETO_CONVENIO', 
        'DTINICIAL', 'DTFINAL', 'LIQUIDADO', 'VENCIDO'
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

    const response = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({
            content: csvContent,
            contentType: 'csv',
            module: 'SIRCONV_CONVENIOS'
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

// --- LÓGICA DE GATILHO ---
async function checkTrigger(userContext) {
    const settings = await getSettings();
    
    if (!settings.autoExport) {
        console.log('SisPMG+ [Sirconv Convenios]: Extração automática desativada.');
        return;
    }
    
    if (!settings.gasUrl) {
        console.log('SisPMG+ [Sirconv Convenios]: URL do GAS não configurada.');
        return;
    }
    
    if (!userContext || !userContext.unitCode) {
        console.log('SisPMG+ [Sirconv Convenios]: Contexto de usuário inválido.');
        return;
    }

    // 1. Verificação Diária
    const today = new Date().toLocaleDateString('pt-BR');
    const { [LAST_RUN_KEY]: lastRun } = await chrome.storage.local.get(LAST_RUN_KEY);
    
    if (lastRun === today) {
        console.log(`SisPMG+ [Sirconv Convenios]: Já executado hoje (${today}). Ignorando.`);
        return;
    }

    // 2. Verificação de Unidade
    const allowedUnits = (settings.triggerUnits || '').toUpperCase().split(',').map(u => u.trim()).filter(u => u);
    
    if (allowedUnits.length === 0) {
        console.log('SisPMG+ [Sirconv Convenios]: Nenhuma unidade gatilho configurada.');
        return;
    }
    
    const userUnit = userContext.unitCode.toString().toUpperCase();

    // Match pode ser por código ou nome parcial
    const isMatch = allowedUnits.some(allowed => {
        return userUnit.includes(allowed) || allowed.includes(userUnit);
    });

    if (isMatch) {
        console.log(`SisPMG+ [Sirconv Convenios]: Gatilho acionado para unidade ${userUnit}.`);
        runProcess(settings.gasUrl, today);
    } else {
        console.log(`SisPMG+ [Sirconv Convenios]: Unidade ${userUnit} não está na lista de gatilho.`);
    }
}

async function runProcess(gasUrl, todayDateStr) {
    try {
        await addLog('=== Processo de extração iniciado ===', 'start');
        
        const data = await fetchAndParseData();
        
        if (data.length === 0) {
            await addLog('Nenhum convênio encontrado para extração.', 'info');
            return;
        }
        
        await syncToGas(data, gasUrl);
        await addLog('=== Processo concluído com sucesso ===', 'success');

        if (todayDateStr) {
            await chrome.storage.local.set({ [LAST_RUN_KEY]: todayDateStr });
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
        case 'sirconv-convenios-get-settings':
            getSettings().then(settings => sendResponse({ success: true, settings }));
            return true;

        case 'sirconv-convenios-save-settings':
            chrome.storage.local.set({ [SETTINGS_KEY]: payload })
                .then(() => {
                    addLog('Configurações atualizadas pelo usuário.', 'info');
                    sendResponse({ success: true });
                })
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true;
        
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
                    const settings = await getSettings();
                    if(!settings.gasUrl) throw new Error("URL do GAS não configurada.");
                    
                    await addLog('Execução manual iniciada pelo usuário.', 'start');
                    await runProcess(settings.gasUrl, null); // Null para não travar a execução diária
                    sendResponse({ success: true });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;

        case 'intranet-user-identified':
            if (payload?.system === 'SIRCONV') {
                checkTrigger(payload);
            }
            return false; // Continua a propagação para outros listeners se necessário

        default:
            return false;
    }
}

export function initializeSirconvConveniosBackground() {
    console.log("SisPMG+: Módulo Sirconv Convenios Background iniciado.");
}