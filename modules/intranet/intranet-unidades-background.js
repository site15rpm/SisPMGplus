// Arquivo: modules/intranet/intranet-unidades-background.js
// Lógica de background específica para o módulo de Extração de Unidades.

// --- Constantes ---
const UNIDADES_ALARM_SCHEDULER_CHECK = 'unidades-scheduler-check';
const STORAGE_SETTINGS_KEY = 'unidadesSettings';
const STORAGE_LOGS_KEY = 'unidadesLogs';
const UNIDADES_STORAGE_SCHEDULE_KEY = 'unidadesSchedule';
const STORAGE_LAST_RUN_KEY = 'unidadesLastSuccessfulRunDate';
const MAX_LOG_ENTRIES = 50;
const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';

// --- VARIÁVEIS DE ESTADO ---
let isProcessingData = false;
let isExtractionRunning = false;
let isUserLoggedIn = false;

// --- FUNÇÕES DE LOG ---
const addUnidadesLog = async (message, system = 'UNIDADES', type = 'info') => {
    try {
        const timestamp = new Date().toLocaleString('pt-BR');
        const logEntry = { timestamp, system, message, type };
        const { [STORAGE_LOGS_KEY]: logs = [] } = await chrome.storage.local.get(STORAGE_LOGS_KEY);
        logs.unshift(logEntry);
        const trimmedLogs = logs.slice(0, MAX_LOG_ENTRIES);
        await chrome.storage.local.set({ [STORAGE_LOGS_KEY]: trimmedLogs });

        // Envia logs atualizados para a UI
        chrome.runtime.sendMessage({ action: 'unidades-logs-updated', logs: trimmedLogs }).catch(() => {});

        try {
            const tabs = await chrome.tabs.query({ active: true, url: '*://*.policiamilitar.mg.gov.br/*' });
            if (tabs.length > 0 && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'unidades-logs-updated',
                    logs: trimmedLogs
                }).catch(() => {});
            }
        } catch(e){ 
            console.warn("SisPMG+ [Unidades Log]: Não foi possível consultar abas para enviar log.", e);
        }
    } catch (e) {
        console.error("SisPMG+ [Unidades]: Falha ao adicionar log.", e);
    }
};

// --- FUNÇÕES OFFSCREEN ---
async function setupOffscreenDocument(path) {
    try {
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [chrome.runtime.getURL(path)]
        });

        if (existingContexts.length > 0) return;

        const allContexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
        if (allContexts.length > 0) {
            console.warn("SisPMG+ [Offscreen]: Outro documento offscreen encontrado. Tentando fechar...");
            const currentOffscreenUrl = allContexts[0].documentUrl;
            const targetUrl = chrome.runtime.getURL(path);
            if (currentOffscreenUrl !== targetUrl) {
                await chrome.offscreen.closeDocument();
                console.log("SisPMG+ [Offscreen]: Documento offscreen anterior fechado.");
            } else {
                console.log("SisPMG+ [Offscreen]: Documento offscreen correto já existe.");
                return;
            }
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        await chrome.offscreen.createDocument({
            url: path,
            reasons: [chrome.offscreen.Reason.DOM_PARSER],
            justification: 'Parse HTML content',
        });
        console.log("SisPMG+ [Offscreen]: Documento offscreen criado:", path);
    } catch (e) {
        console.error("SisPMG+ [Offscreen]: Erro ao configurar documento offscreen.", path, e);
        throw new Error(`Falha ao configurar offscreen (${path}): ${e.message}`);
    }
}

async function sendMsgToOffscreen(action, data) {
    try {
        await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
        const response = await Promise.race([
            chrome.runtime.sendMessage({
                target: 'offscreen',
                action: action,
                ...data
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout esperando resposta do offscreen')), 10000))
        ]);
        return response;
    } catch (error) {
        console.error(`SisPMG+ [Offscreen]: Erro ao enviar/receber mensagem para offscreen (${action}):`, error);
        return { error: `Falha na comunicação com offscreen (${action}): ${error.message}` };
    }
}

async function closeOffscreenDocument() {
    try {
        const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
        if (contexts.length > 0) {
            await chrome.offscreen.closeDocument();
        }
    } catch (closeError) {
        if (closeError.message && !closeError.message.includes("No current offscreen document")) {
            console.warn("SisPMG+ [Offscreen]: Erro ao fechar o documento offscreen.", closeError);
        }
    }
}

// --- FUNÇÕES DE EXTRAÇÃO ---

/**
 * Busca e parseia os dados de unidades da Intranet
 */
async function fetchUnidadesData(settings) {
    const url = "https://intranet.policiamilitar.mg.gov.br/legado/operacoes/unidades/endereco.asp";
    
    // Monta o body da requisição baseado nas configurações
    const bodyParams = new URLSearchParams({
        acao: 'Consulta',
        cUEOp: settings.codigoUnidade || '6869'
    });

    if (settings.exibirCodigo) bodyParams.append('ExibeCodigo', '1');
    if (settings.verEndereco) bodyParams.append('cVerEnd', '1');
    if (settings.uniPrinc) bodyParams.append('UniPrinc', '1');

    const fetchOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        body: bodyParams.toString(),
        credentials: 'include'
    };

    const response = await fetch(url, fetchOptions);
    
    if (!response.ok) {
        throw new Error(`Erro na requisição: ${response.status} ${response.statusText}`);
    }

    // Decodifica ISO-8859-1 para UTF-8
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder("iso-8859-1");
    const htmlText = decoder.decode(buffer);

    return htmlText;
}

/**
 * Parseia o HTML e extrai os dados estruturados
 */
async function parseUnidadesHTML(htmlText) {
    const result = await sendMsgToOffscreen('parse-unidades-html', { html: htmlText });
    
    if (result.error) {
        throw new Error(result.error);
    }

    return result.data;
}

/**
 * Converte os dados em CSV
 */
function convertToCSV(data) {
    if (!data || data.length === 0) {
        throw new Error('Nenhum dado para converter.');
    }

    // Header do CSV
    const headers = ["Hierarquia Completa", "Unidade", "Código", "Localidade", "Endereço", "CEP"];
    
    // Escapa valores para CSV (aspas duplas e ponto-vírgula)
    const escapeCSV = (value) => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(';') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    // Monta as linhas
    const rows = [headers.map(escapeCSV).join(';')];
    
    data.forEach(item => {
        const row = [
            item.hierarchyPath || '',
            item.unitName || '',
            item.code || '',
            item.location || '',
            item.address || '',
            item.cep || ''
        ].map(escapeCSV);
        
        rows.push(row.join(';'));
    });

    // Adiciona BOM para Excel reconhecer acentos
    return '\uFEFF' + rows.join('\n');
}

/**
 * Envia dados para Google Apps Script
 */
async function sendToGoogleSheets(data, gasId) {
    if (!gasId || gasId.trim() === '') {
        throw new Error('ID do Google Apps Script não configurado.');
    }

    const url = `https://script.google.com/macros/s/${gasId}/exec`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            action: 'updateUnidades',
            data: data,
            timestamp: new Date().toISOString()
        })
    });

    if (!response.ok) {
        throw new Error(`Erro ao enviar para Google Sheets: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.error) {
        throw new Error(result.error);
    }

    return result;
}

/**
 * Função principal de extração
 */
async function executeExtraction() {
    if (isExtractionRunning) {
        console.log("SisPMG+ [Unidades]: Extração já em andamento. Ignorando nova solicitação.");
        return { success: false, error: 'Extração já em andamento' };
    }

    isExtractionRunning = true;
    
    try {
        await addUnidadesLog('Iniciando extração de unidades...', 'SISTEMA', 'info');
        
        // 1. Carregar configurações
        const { [STORAGE_SETTINGS_KEY]: settings } = await chrome.storage.local.get(STORAGE_SETTINGS_KEY);
        
        if (!settings || !settings.codigoUnidade) {
            throw new Error('Configurações não encontradas. Configure o módulo antes de extrair.');
        }

        await addUnidadesLog(`Código da unidade: ${settings.codigoUnidade}`, 'SISTEMA', 'info');

        // 2. Buscar dados da Intranet
        await addUnidadesLog('Consultando Intranet...', 'SISTEMA', 'info');
        const htmlData = await fetchUnidadesData(settings);
        
        // 3. Parsear HTML
        await addUnidadesLog('Processando dados HTML...', 'SISTEMA', 'info');
        const parsedData = await parseUnidadesHTML(htmlData);
        
        if (!parsedData || parsedData.length === 0) {
            throw new Error('Nenhum dado encontrado na resposta.');
        }

        await addUnidadesLog(`${parsedData.length} unidades extraídas.`, 'SISTEMA', 'success');

        // 4. Gerar CSV
        const csvContent = convertToCSV(parsedData);
        
        // 5. Salvar cópia local se configurado
        if (settings.manterCopiaCSV) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `unidades_pmmg_${timestamp}.csv`;
            
            await downloadFile(csvContent, filename, 'text/csv');
            await addUnidadesLog(`Cópia local salva: ${filename}`, 'SISTEMA', 'success');
        }

        // 6. Enviar para Google Sheets se configurado
        if (settings.gasId && settings.gasId.trim() !== '') {
            await addUnidadesLog('Enviando para Google Sheets...', 'SISTEMA', 'info');
            await sendToGoogleSheets(parsedData, settings.gasId);
            await addUnidadesLog('Dados sincronizados com Google Sheets.', 'SISTEMA', 'success');
        }

        // 7. Atualizar data da última execução
        const today = new Date().toISOString().split('T')[0];
        await chrome.storage.local.set({ [STORAGE_LAST_RUN_KEY]: today });

        await addUnidadesLog('Extração concluída com sucesso!', 'SISTEMA', 'success');
        
        return { success: true };

    } catch (error) {
        console.error("SisPMG+ [Unidades]: Erro durante extração:", error);
        await addUnidadesLog(`Erro: ${error.message}`, 'SISTEMA', 'error');
        return { success: false, error: error.message };
    } finally {
        isExtractionRunning = false;
        await closeOffscreenDocument();
    }
}

/**
 * Função auxiliar para download de arquivo
 */
async function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    // Envia mensagem para content script fazer o download
    const tabs = await chrome.tabs.query({ active: true, url: '*://*.policiamilitar.mg.gov.br/*' });
    
    if (tabs.length > 0 && tabs[0].id) {
        await chrome.tabs.sendMessage(tabs[0].id, {
            action: 'triggerDownload',
            url: url,
            filename: filename
        });
    } else {
        // Fallback: usa chrome.downloads API
        await chrome.downloads.download({
            url: url,
            filename: filename,
            saveAs: false
        });
    }
}

// --- AGENDAMENTO ---

/**
 * Calcula a próxima data de execução baseada na frequência
 */
function calculateNextRun(frequency) {
    const now = new Date();
    let nextRun;

    switch (frequency) {
        case 'daily':
            nextRun = new Date(now);
            nextRun.setDate(nextRun.getDate() + 1);
            nextRun.setHours(2, 0, 0, 0); // 02:00 AM
            break;
        case 'weekly':
            nextRun = new Date(now);
            nextRun.setDate(nextRun.getDate() + 7);
            nextRun.setHours(2, 0, 0, 0);
            break;
        case 'monthly':
            nextRun = new Date(now);
            nextRun.setMonth(nextRun.getMonth() + 1);
            nextRun.setDate(1); // Primeiro dia do mês
            nextRun.setHours(2, 0, 0, 0);
            break;
        default:
            return null;
    }

    return nextRun.getTime();
}

/**
 * Atualiza o agendamento do alarme
 */
async function updateSchedule() {
    try {
        const { [STORAGE_SETTINGS_KEY]: settings } = await chrome.storage.local.get(STORAGE_SETTINGS_KEY);
        
        // Remove alarme existente
        await chrome.alarms.clear(UNIDADES_ALARM_SCHEDULER_CHECK);

        if (!settings || settings.scheduleFrequency === 'none' || !settings.scheduleFrequency) {
            console.log("SisPMG+ [Unidades]: Agendamento desativado.");
            await chrome.storage.local.remove(UNIDADES_STORAGE_SCHEDULE_KEY);
            return;
        }

        const nextRunTimestamp = calculateNextRun(settings.scheduleFrequency);
        
        if (nextRunTimestamp) {
            await chrome.storage.local.set({ [UNIDADES_STORAGE_SCHEDULE_KEY]: nextRunTimestamp });
            
            // Cria alarme para verificar a cada 30 minutos
            await chrome.alarms.create(UNIDADES_ALARM_SCHEDULER_CHECK, { periodInMinutes: 30 });
            
            const nextRunDate = new Date(nextRunTimestamp).toLocaleString('pt-BR');
            console.log(`SisPMG+ [Unidades]: Próxima extração agendada para ${nextRunDate}`);
            await addUnidadesLog(`Próxima extração: ${nextRunDate}`, 'SISTEMA', 'info');
        }
    } catch (error) {
        console.error("SisPMG+ [Unidades]: Erro ao atualizar agendamento:", error);
    }
}

/**
 * Verifica se deve executar a extração agendada
 */
async function checkScheduledExtraction() {
    try {
        const { 
            [UNIDADES_STORAGE_SCHEDULE_KEY]: nextRunTimestamp,
            [STORAGE_LAST_RUN_KEY]: lastRunDate 
        } = await chrome.storage.local.get([UNIDADES_STORAGE_SCHEDULE_KEY, STORAGE_LAST_RUN_KEY]);

        if (!nextRunTimestamp) return;

        const now = Date.now();
        const today = new Date().toISOString().split('T')[0];

        // Verifica se é hora de executar e se não executou hoje
        if (now >= nextRunTimestamp && lastRunDate !== today && !isExtractionRunning) {
            console.log("SisPMG+ [Unidades]: Executando extração agendada...");
            await executeExtraction();
            await updateSchedule(); // Agenda próxima execução
        }
    } catch (error) {
        console.error("SisPMG+ [Unidades]: Erro ao verificar extração agendada:", error);
    }
}

// --- MANIPULADOR DE MENSAGENS ---
export function handleUnidadesMessages(request, sender, sendResponse) {
    const { action, payload } = request;

    switch (action) {
        case 'unidades-get-settings':
            (async () => {
                const { 
                    [STORAGE_SETTINGS_KEY]: settings, 
                    [STORAGE_LOGS_KEY]: logs 
                } = await chrome.storage.local.get([STORAGE_SETTINGS_KEY, STORAGE_LOGS_KEY]);
                sendResponse({ settings: settings || {}, logs: logs || [] });
            })();
            return true;

        case 'unidades-save-settings':
            (async () => {
                try {
                    await chrome.storage.local.set({ [STORAGE_SETTINGS_KEY]: payload.settings });
                    await updateSchedule(); // Atualiza o agendamento
                    await addUnidadesLog('Configurações salvas.', 'SISTEMA', 'success');
                    sendResponse({ success: true });
                } catch (error) {
                    console.error("SisPMG+ [Unidades]: Erro ao salvar configurações:", error);
                    sendResponse({ success: false, error: error.message });
                }
            })();
            return true;

        case 'unidades-extract-now':
            (async () => {
                const result = await executeExtraction();
                sendResponse(result);
            })();
            return true;

        case 'unidades-log-feedback':
            (async () => {
                await addUnidadesLog(payload.message, payload.system || 'FRONTEND', payload.type || 'info');
                sendResponse({ success: true });
            })();
            return true;

        case 'unidades-user-is-logged-in':
            isUserLoggedIn = true;
            sendResponse({ success: true });
            return true;

        default:
            return false;
    }
}

// --- INICIALIZAÇÃO ---
export function initializeUnidadesBackground() {
    console.log("SisPMG+ [Unidades Background]: Inicializando...");

    // Listener de alarmes
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === UNIDADES_ALARM_SCHEDULER_CHECK) {
            checkScheduledExtraction();
        }
    });

    // Configura o agendamento inicial
    updateSchedule();
}