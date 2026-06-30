// Arquivo: modules/intranet/intranet-unidades-background.js
// Lógica de background específica para o módulo de Extração de Unidades.
import { obterUnidades } from '../../common/busca-unidades.js';
import { fetchWithKeepAlive } from '../../common/keep-alive.js';
import { StorageManager } from '../../common/storage-manager.js';
import { STORAGE_KEYS } from '../../common/storage-keys.js';

// --- Constantes ---
const STORAGE_SETTINGS_KEY = STORAGE_KEYS.UNIDADES_SETTINGS;
const STORAGE_LOGS_KEY = STORAGE_KEYS.UNIDADES_LOGS;
const STORAGE_LAST_RUN_KEY = STORAGE_KEYS.UNIDADES_LAST_RUN;
const MAX_LOG_ENTRIES = 50;
const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';

// --- VARIÁVEIS DE ESTADO ---
let isExtractionRunning = false;

// --- FUNÇÕES DE LOG ---
const addUnidadesLog = async (message, system = 'UNIDADES', type = 'info') => {
    try {
        const timestamp = new Date().toLocaleString('pt-BR');
        const logEntry = { timestamp, system, message, type };
        const storageRes = await StorageManager.get(STORAGE_LOGS_KEY);
        const logs = storageRes || [];
        logs.unshift(logEntry);
        const trimmedLogs = logs.slice(0, MAX_LOG_ENTRIES);
        await StorageManager.set({ [STORAGE_LOGS_KEY]: trimmedLogs });

        // Envia logs atualizados para a UI
        browser.runtime.sendMessage({ action: 'unidades-logs-updated', logs: trimmedLogs }).catch(() => {});

        try {
            const tabs = await browser.tabs.query({ url: '*://*.policiamilitar.mg.gov.br/*' });
            for (const tab of tabs) {
                browser.tabs.sendMessage(tab.id, {
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

// --- FUNÇÕES DE EXTRAÇÃO REMOVIDAS (UTILIZANDO O UTILITÁRIO CENTRAL) ---

function convertToCSV(data) {
    if (!data || data.length === 0) throw new Error('Nenhum dado para converter.');
    const headers = ["Nível", "Hierarquia Completa", "Código", "Unidade", "Código Município", "Município"];
    const escapeCSV = (value) => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(';') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };
    const rows = [headers.join(';')];
    data.forEach(item => {
        const row = [
            item.nivel, item.hierarquia, item.codigoSecao, item.secao,
            item.codigoMunicipio, item.municipio
        ].map(escapeCSV);
        rows.push(row.join(';'));
    });
    return '\uFEFF' + rows.join('\n');
}

async function sendToGoogleSheets(data, gasId) {
    if (!gasId) throw new Error('ID do Google Apps Script não configurado.');
    const url = `https://script.google.com/macros/s/${gasId}/exec`;
    const response = await fetchWithKeepAlive(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'updateUnidades',
            data: data,
            timestamp: new Date().toISOString()
        })
    });
    if (!response.ok) throw new Error(`Erro ao enviar para Google Sheets: ${response.status}`);
    const result = await response.json();
    if (result.error) throw new Error(result.error);
    return result;
}

async function executeExtraction(userId, settingsOverride = null) {
    if (isExtractionRunning) {
        console.log("SisPMG+ [Unidades]: Extração já em andamento.");
        return { success: false, error: 'Extração já em andamento' };
    }

    isExtractionRunning = true;
    
    try {
        await addUnidadesLog('Iniciando extração de unidades...', 'SISTEMA', 'info');
        let settings = settingsOverride;
        if (!settings) {
            const storedSettings = await StorageManager.get(STORAGE_SETTINGS_KEY);
            settings = storedSettings;
        }

        if (!settings || !settings.codigoUnidade) {
            throw new Error('Configurações não encontradas. Configure o módulo antes de extrair.');
        }

        const parsedData = await obterUnidades(settings.codigoUnidade, settings.exibirCodigo ?? true, settings.uniPrinc ?? false);
        if (!parsedData || parsedData.length === 0) throw new Error('Nenhum dado encontrado na resposta.');

        await addUnidadesLog(`${parsedData.length} unidades extraídas.`, 'SISTEMA', 'success');

        if (settings.manterCopiaCSV) {
            const csvContent = convertToCSV(parsedData);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `unidades_pmmg_${timestamp}.csv`;
            await downloadFile(csvContent, filename, 'text/csv');
            await addUnidadesLog(`Cópia local salva: ${filename}`, 'SISTEMA', 'success');
        }

        if (settings.gasId) {
            await addUnidadesLog('Enviando para Google Sheets...', 'SISTEMA', 'info');
            await sendToGoogleSheets(parsedData, settings.gasId);
            await addUnidadesLog('Dados sincronizados com Google Sheets.', 'SISTEMA', 'success');
        }

        const today = new Date().toLocaleDateString('pt-BR');
        const currentLastRunData = (await StorageManager.get(STORAGE_LAST_RUN_KEY)) || {};
        await StorageManager.set({ [STORAGE_LAST_RUN_KEY]: { ...currentLastRunData, [userId]: today } });

        console.log("SisPMG+ [Unidades Extraídas]: Dados resultantes da extração:", parsedData);
        await addUnidadesLog('Extração concluída com sucesso!', 'SISTEMA', 'success');
        return { success: true, data: parsedData };
    } catch (error) {
        console.error("SisPMG+ [Unidades]: Erro durante extração:", error);
        await addUnidadesLog(`Erro: ${error.message}`, 'SISTEMA', 'error');
        return { success: false, error: error.message };
    } finally {
        isExtractionRunning = false;
    }
}

async function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const tabs = await browser.tabs.query({ active: true, url: '*://*.policiamilitar.mg.gov.br/*' });
    if (tabs.length > 0) {
        await browser.tabs.sendMessage(tabs[0].id, { action: 'triggerDownload', url, filename });
    } else {
        await browser.downloads.download({ url, filename, saveAs: false });
    }
}

// --- LÓGICA DE GATILHO AUTOMÁTICO ---

async function checkTrigger(userContext) {
    if (!userContext || !userContext.userPM) return;
    const userId = userContext.userPM;

    const storageRes = await StorageManager.get([STORAGE_SETTINGS_KEY, STORAGE_LAST_RUN_KEY]);
    const settings = storageRes[STORAGE_SETTINGS_KEY];
    const lastRunData = storageRes[STORAGE_LAST_RUN_KEY] || {};

    if (!settings || !settings.scheduleFrequency || settings.scheduleFrequency === 'none') {
        return; // Agendamento desativado
    }

    const lastRunDateStr = lastRunData[userId];
    if (!lastRunDateStr) {
        console.log(`SisPMG+ [Unidades]: Primeira execução para o usuário ${userId}. Acionando gatilho.`);
        await executeExtraction(userId);
        return;
    }

    const today = new Date();
    const [day, month, year] = lastRunDateStr.split('/');
    const lastRunDate = new Date(year, month - 1, day);

    let shouldRun = false;
    switch (settings.scheduleFrequency) {
        case 'daily':
            if (today.toLocaleDateString('pt-BR') !== lastRunDateStr) {
                shouldRun = true;
            }
            break;
        case 'weekly':
            const oneWeek = 7 * 24 * 60 * 60 * 1000;
            if ((today.getTime() - lastRunDate.getTime()) >= oneWeek) {
                shouldRun = true;
            }
            break;
        case 'monthly':
            if (today.getMonth() !== lastRunDate.getMonth() || today.getFullYear() !== lastRunDate.getFullYear()) {
                shouldRun = true;
            }
            break;
    }

    if (shouldRun) {
        console.log(`SisPMG+ [Unidades]: Gatilho acionado para usuário ${userId} pela frequência '${settings.scheduleFrequency}'.`);
        await executeExtraction(userId);
    }
}


// --- MANIPULADOR DE MENSAGENS ---
export async function handleUnidadesMessages(request, sender) {
    const { action, payload } = request;

    switch (action) {
        case 'unidades-get-settings': {
            const storageRes = await StorageManager.get([STORAGE_SETTINGS_KEY, STORAGE_LOGS_KEY]);
            const settings = storageRes[STORAGE_SETTINGS_KEY] || {};
            const logs = storageRes[STORAGE_LOGS_KEY] || [];
            return { settings, logs };
        }

        case 'unidades-save-settings':
            await StorageManager.set({ [STORAGE_SETTINGS_KEY]: payload.settings });
            await addUnidadesLog('Configurações salvas.', 'SISTEMA', 'success');
            return { success: true };

        case 'unidades-extract-now': {
            // Para execução manual, podemos pegar o usuário de um contexto recente se disponível
            const intranetUser = await StorageManager.get(STORAGE_KEYS.INTRANET_USER);
            const { userPM } = intranetUser || {};
            const result = await executeExtraction(userPM || 'manual', payload?.settings);
            return result;
        }

        case 'unidades-log-feedback':
            await addUnidadesLog(payload.message, payload.system || 'FRONTEND', payload.type || 'info');
            return { success: true };

        case 'unidades-clear-logs': {
            await StorageManager.set({ [STORAGE_LOGS_KEY]: [] });
            await addUnidadesLog('Histórico de execuções foi limpo.', 'SISTEMA', 'info');
            const logs = (await StorageManager.get(STORAGE_LOGS_KEY)) || [];
            return { success: true, logs };
        }

        case 'intranet-user-identified':
            // Aciona o gatilho da identificação do usuário
            await checkTrigger(payload);
            return { success: true };
            
        default:
            return;
    }
}

// --- INICIALIZAÇÃO ---
export function initializeUnidadesBackground() {
    console.log("SisPMG+ [Unidades Background]: Inicializando...");
    // A lógica de alarme foi removida. O módulo agora é reativo.
}
