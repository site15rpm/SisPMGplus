// Arquivo: modules/intranet/intranet-sicor-background.js
// Lógica de background específica para o módulo SICOR.

import * as XLSX from '../../modules/lib/sheetjs/xlsx.mjs';

// --- Constantes ---
const SICOR_ALARM_SCHEDULER_CHECK = 'sicor-scheduler-check'; // Nome do alarme periódico
const STORAGE_SETTINGS_KEY = 'sicorSettings';
const STORAGE_LOGS_KEY = 'sicorLogs';
const SICOR_STORAGE_SCHEDULE_KEY = 'sicorSchedule'; // Chave para guardar a próxima execução
const STORAGE_LAST_RUN_KEY = 'sicorLastSuccessfulRunDate'; // Chave para evitar re-execução
const MAX_LOG_ENTRIES = 50;
const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html'; // Usando o offscreen global

// --- VARIÁVEIS DE ESTADO ---
let isProcessingData = false; // Flag para evitar processamento concorrente
let isExtractionRunning = false; // Flag para evitar execuções agendadas simultâneas
let isUserLoggedIn = false; // Flag para controlar o status de login

// --- FUNÇÕES DE LOG ---
const addSicorLog = async (message, system = 'SICOR', type = 'info') => {
    try {
        const timestamp = new Date().toLocaleString('pt-BR');
        const logEntry = { timestamp, system, message, type };
        const { [STORAGE_LOGS_KEY]: logs = [] } = await chrome.storage.local.get(STORAGE_LOGS_KEY);
        logs.unshift(logEntry);
        const trimmedLogs = logs.slice(0, MAX_LOG_ENTRIES);
        await chrome.storage.local.set({ [STORAGE_LOGS_KEY]: trimmedLogs });

        // Envia logs atualizados para a UI (se aberta)
        chrome.runtime.sendMessage({ action: 'sicor-logs-updated', logs: trimmedLogs }).catch(() => {});

        // Tenta enviar para aba ativa da intranet (melhor esforço)
         try {
             const tabs = await chrome.tabs.query({ active: true, url: '*://*.policiamilitar.mg.gov.br/*' });
             if (tabs.length > 0 && tabs[0].id) {
                 chrome.tabs.sendMessage(tabs[0].id, {
                     action: 'sicor-logs-updated',
                     logs: trimmedLogs
                 }).catch(() => {}); // Ignora erro se a aba não estiver ouvindo
             }
         } catch(e){ console.warn("SisPMG+ [SICOR Log]: Não foi possível consultar abbas para enviar log.", e); }

    } catch (e) {
        console.error("SisPMG+ [SICOR]: Falha ao adicionar log.", e);
    }
};

// --- FUNÇÕES DE DATA (Auxiliares) ---
const _formatDate = (date) => { // Retorna YYYY-MM-DD
    if (!(date instanceof Date) || isNaN(date.getTime())) {
         const today = new Date();
         return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/** Calcula o intervalo de datas para a extração agendada com base nas configurações */
function _getScheduledDateRange(settings) {
    const startDate = settings.dataIni || _formatDate(new Date(new Date().getFullYear(), 0, 1)); // Usa data inicial salva ou 1º Jan do ano
    let endDate;

    if (settings.isDateLocked) {
        // Travado: usa sempre o dia anterior
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        endDate = _formatDate(yesterday);
    } else {
        // Destravado: usa a data final salva (fixa), ou dia anterior como fallback
        endDate = settings.dataFim || _formatDate(new Date(new Date().setDate(new Date().getDate() - 1)));
    }

     // Validação adicional: garante que startDate não seja posterior a endDate
     if (new Date(startDate + 'T00:00:00Z') > new Date(endDate + 'T00:00:00Z')) {
         console.warn("SisPMG+ [SICOR Agendador]: Data inicial é posterior à data final. Ajustando data inicial para igualar a final.");
         return { startDate: endDate, endDate: endDate }; // Ajusta startDate para ser igual a endDate
     }


    return { startDate, endDate };
}

// --- REMOVIDA A FUNÇÃO checkSicorLoginStatus() ---


// --- FUNÇÕES OFFSCREEN ---
// (Mantidas como no código original - setupOffscreenDocument, sendMsgToOffscreen, blobToDataURL, closeOffscreenDocument)
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
         if (e.message && e.message.toLowerCase().includes('already has an active offscreen document')) {
              console.warn("SisPMG+ [Offscreen]: Erro 'already has...' recebido. Tentando fechar e recriar.");
              try {
                  await chrome.offscreen.closeDocument();
                  await new Promise(resolve => setTimeout(resolve, 150));
                  await chrome.offscreen.createDocument({
                      url: path,
                      reasons: [chrome.offscreen.Reason.DOM_PARSER],
                      justification: 'Parse HTML content (retry)',
                  });
                   console.log("SisPMG+ [Offscreen]: Documento offscreen recriado com sucesso:", path);
              } catch (retryError) {
                   console.error("SisPMG+ [Offscreen]: Falha ao recriar documento offscreen após erro:", retryError);
                   throw new Error(`Falha crítica ao configurar offscreen (${path}): ${retryError.message}`);
              }
         } else {
            throw new Error(`Falha ao configurar offscreen (${path}): ${e.message}`);
         }
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

        if (response && response.error && typeof response.error === 'string' && response.error.startsWith('Falha na comunicação com offscreen')) {
             console.warn(`SisPMG+ [Offscreen]: Erro de comunicação detectado (${action}). Detalhes: ${response.error}`);
        } else if (response && response.error) {
             console.error(`SisPMG+ [Offscreen]: Erro retornado pelo offscreen (${action}): ${response.error}`);
        }
        return response;
    } catch (error) {
        console.error(`SisPMG+ [Offscreen]: Erro ao enviar/receber mensagem para offscreen (${action}):`, error);
        return { error: `Falha na comunicação com offscreen (${action}): ${error.message}` };
    }
}
function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
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

// --- MANIPULADOR DE MENSAGENS ---
export function handleSicorMessages(request, sender, sendResponse) {
    const { action, payload } = request;

    switch (action) {
        case 'sicor-get-settings':
            (async () => {
                const { [STORAGE_SETTINGS_KEY]: settings, [STORAGE_LOGS_KEY]: logs } = await chrome.storage.local.get([STORAGE_SETTINGS_KEY, STORAGE_LOGS_KEY]);
                sendResponse({ settings: settings || {}, logs: logs || [] });
            })();
            return true;

        case 'sicor-save-settings':
            (async () => {
                try {
                    await chrome.storage.local.set({ [STORAGE_SETTINGS_KEY]: payload.settings });
                    await scheduleNextSicorExtraction(payload.settings); // Usa nova função de agendamento
                    await addSicorLog('Configurações salvas e agendamento atualizado.', 'SISTEMA', 'success');
                    sendResponse({ success: true });
                } catch (e) {
                    await addSicorLog(`Erro ao salvar configurações: ${e.message}`, 'SISTEMA', 'error');
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;

        case 'sicor-clear-logs':
            (async () => {
                 await chrome.storage.local.set({ [STORAGE_LOGS_KEY]: [] });
                 await addSicorLog('Histórico de execuções foi limpo.', 'SISTEMA', 'info');
                 const { [STORAGE_LOGS_KEY]: logs } = await chrome.storage.local.get(STORAGE_LOGS_KEY); // Re-lê para UI
                 sendResponse({ success: true, logs: logs || [] }); // Envia logs limpos para UI
            })();
            return true;

        // --- Início da Modificação: Novo handler para o gatilho de login ---
        case 'sicor-user-is-logged-in':
            (async () => {
                if (!isUserLoggedIn) {
                    await addSicorLog('Sinal de login detectado. Verificando agendamentos pendentes...', 'SISTEMA', 'info');
                }
                isUserLoggedIn = true;
                // Aciona a verificação imediatamente ao receber o sinal
                await runScheduledSicorExtractionIfNeeded(); 
                sendResponse({ success: true });
            })();
            return true;
        // --- Fim da Modificação ---

        case 'sicor-fetch-units':
             (async () => {
                if (isExtractionRunning) {
                     await addSicorLog('Busca de unidades bloqueada: Extração de dados em andamento.', 'SISTEMA', 'warn');
                     sendResponse({ success: false, error: 'Uma extração de dados já está em andamento. Tente novamente em alguns instantes.' });
                     return true;
                 }
                 const url = 'https://intranet.policiamilitar.mg.gov.br/SICOR/paginas/relatorios/relGerencial.jsf';
                 try {
                      await addSicorLog('Buscando lista de unidades do SICOR...', 'SISTEMA');
                     const response = await fetch(url, { credentials: 'include' });
                     if (!response.ok) throw new Error(`Status: ${response.status}`);
                     const htmlText = await response.text();
                     const selectRegex = /<select id="form:selUnidade"[^>]*>([\s\S]*?)<\/select>/;
                     const selectContentMatch = htmlText.match(selectRegex);
                     if (!selectContentMatch || !selectContentMatch[1]) throw new Error('Seletor #form:selUnidade não encontrado.');
                     const optionsHTML = selectContentMatch[1];
                     const cleanedOptionsHTML = optionsHTML.replace(/id="form:selUnidade"/, '')
                                                       .replace(/name="form:selUnidade"/, '')
                                                       .replace(/class="[^"]*"/, '')
                                                       .replace(/onchange="[^"]*"/, '')
                                                       .replace(/size="\d+"/, '')
                                                       .replace(/>\s+</g, '><')
                                                       .trim();
                     if (!cleanedOptionsHTML.includes('<option')) throw new Error('Nenhuma <option> encontrada.');
                     await addSicorLog('Lista de unidades carregada.', 'SISTEMA', 'success');
                     sendResponse({ success: true, selectOptionsHTML: cleanedOptionsHTML });
                 } catch (error) {
                     console.error('SisPMG+ [SICOR]: Falha ao buscar unidades.', error);
                     await addSicorLog(`Falha ao buscar unidades: ${error.message}`, 'SISTEMA', 'error');
                     sendResponse({ success: false, error: `Falha ao buscar unidades: ${error.message}` });
                 }
             })();
             return true;

         case 'sicor-log-feedback': // Recebe logs do frontend
             (async () => {
                 if (payload?.message) {
                     await addSicorLog(payload.message, payload.system || 'FRONTEND', payload.type || 'info');
                     sendResponse({ success: true });
                 } else { sendResponse({ success: false, error: "Mensagem inválida." }); }
             })();
             return true;


        case 'sicor-extract-now':
            (async () => {
                 // **Verificação de execução concorrente**
                 if (isExtractionRunning) {
                     await addSicorLog('Extração manual ignorada: Um processo já está em andamento.', 'MANUAL', 'warn');
                     sendResponse({ success: false, error: 'Uma extração já está em andamento.' });
                     return;
                 }
                 isExtractionRunning = true; // Bloqueia novas execuções
                 
                let downloadedBlobsForProcessing = [];
                if (!payload || !payload.settings) {
                    await addSicorLog('Erro: Configurações não recebidas para extração manual.', 'MANUAL', 'error');
                    isExtractionRunning = false; // Libera o bloqueio
                    sendResponse({ success: false, error: 'Configurações ausentes.' });
                    return;
                }
                const { settings } = payload;
                const { dataIni, dataFim, unidadeId, unitName, incluirSubordinadas, trazerEnvolvidos, periodoTipo, manterCopiaXls, manterCopiaCsv, gasId } = settings;

                 if (typeof unidadeId === 'undefined') {
                    await addSicorLog('Erro crítico: unidadeId não definido.', 'MANUAL', 'error');
                    isExtractionRunning = false; // Libera o bloqueio
                    sendResponse({ success: false, error: 'ID da unidade ausente.' });
                    return;
                }

                const startDate = dataIni.split('-').reverse().join('/');
                const endDate = dataFim.split('-').reverse().join('/');
                await addSicorLog(`Iniciando extração manual para ${startDate} a ${endDate}. Unidade: ${unitName} (${unidadeId})`, 'MANUAL');

                try {
                    const dateRanges = getDateRangesForMultiYear(dataIni, dataFim);
                    let allDownloadsSuccessful = true;

                    if (dateRanges.length > 0) {
                        await addSicorLog(`Período ${dateRanges.length > 1 ? 'multi-ano' : 'único'}. Iniciando downloads...`, 'MANUAL');
                        for (const range of dateRanges) {
                            const yearPayload = {
                                startDate: range.start, endDate: range.end, unitId: unidadeId, unitName: unitName,
                                includeSubunits: incluirSubordinadas, trazerEnvolvidos: trazerEnvolvidos,
                                periodoTipo: periodoTipo || 'DATA_FATO', isAuto: false, manterCopiaXls: manterCopiaXls,
                                year: range.year,
                                dataIni_YYYYMMDD: range.start.split('/').reverse().join(''),
                                dataFim_YYYYMMDD: range.end.split('/').reverse().join('')
                            };
                            await addSicorLog(`Iniciando download para ${range.start} a ${range.end}...`, 'MANUAL');
                            const result = await executeSicorDownload(yearPayload);

                            if (!result.success && !(result.error && result.error.includes("Nenhum registro foi encontrado"))) {
                                 allDownloadsSuccessful = false;
                                 await addSicorLog(`Falha no download para ${range.start}-${range.end}: ${result.error}`, 'MANUAL', 'error');
                            } else if(result.success && result.blobData) {
                                downloadedBlobsForProcessing.push(result.blobData);
                            } else if (result.success && !result.blobData) {
                                 await addSicorLog(`Nenhum dado para ${range.start}-${range.end}. Pulado.`, 'MANUAL', 'info');
                            }
                            await new Promise(resolve => setTimeout(resolve, 1500));
                        }
                        await addSicorLog(`Downloads concluídos (${downloadedBlobsForProcessing.length} arquivos${!allDownloadsSuccessful ? ' com falhas' : ''}).`, 'MANUAL', allDownloadsSuccessful ? 'success' : 'warn');
                    } else {
                         await addSicorLog('Intervalo de datas inválido.', 'MANUAL', 'error');
                         sendResponse({ success: false, error: 'Intervalo de datas inválido.' });
                         isExtractionRunning = false; // Libera o bloqueio
                         return;
                    }

                    // Processa e Sincroniza
                    if (downloadedBlobsForProcessing.length > 0) {
                         await addSicorLog('Iniciando processamento...', 'PROCESSAMENTO');
                         const processedResult = await _processDownloadedXlsData(downloadedBlobsForProcessing, settings);
                         if (processedResult && processedResult.csv) {
                            if (manterCopiaCsv) {
                                await _saveProcessedCsvLocal(processedResult.csv, { dataIni_YYYYMMDD: settings.dataIni.replace(/-/g, ''), dataFim_YYYYMMDD: settings.dataFim.replace(/-/g, '') }, 'MANUAL');
                            }
                            if (gasId) {
                                await addSicorLog('Enviando CSV para Google Apps Script...', 'GDRIVE');
                                await syncWithGoogleScript(gasId, processedResult.csv);
                            } else { await addSicorLog('Sinc. Drive pulada (ID não config.).', 'GDRIVE', 'info'); }
                         } else { await addSicorLog('Nenhum dado válido pós-processamento. Sinc. cancelada.', 'PROCESSAMENTO', 'info'); }
                    } else if (gasId) { await addSicorLog('Sinc. Drive pulada (sem dados ou ID).', 'GDRIVE', 'info'); }
                    else { await addSicorLog('Sinc. Drive desativada.', 'GDRIVE', 'info'); }

                    const finalMessage = `Extração manual concluída.${!allDownloadsSuccessful ? ' (com falhas)' : ''}${gasId && downloadedBlobsForProcessing.length > 0 ? ' Sinc. solicitada.' : ''}`;
                    sendResponse({ success: allDownloadsSuccessful, message: finalMessage });

                } catch (error) {
                     await addSicorLog(`Erro na extração manual: ${error.message}`, 'MANUAL', 'error');
                     sendResponse({ success: false, error: error.message });
                } finally {
                    await closeOffscreenDocument();
                    downloadedBlobsForProcessing = [];
                    isExtractionRunning = false; // Libera o bloqueio
                    chrome.runtime.sendMessage({ action: 'sicor-extraction-finished' }).catch(()=>{}); // Sinaliza fim para UI
                }
            })();
            return true;
    }
    return false;
}

// --- LÓGICA DE AGENDAMENTO (Estilo Abastecimentos) ---
async function scheduleNextSicorExtraction(config) {
    const frequency = config['scheduleFrequency']; // Usando nome da config do SICOR
    await chrome.alarms.clear(SICOR_ALARM_SCHEDULER_CHECK);

    if (frequency === 'none') {
        await chrome.storage.local.remove(SICOR_STORAGE_SCHEDULE_KEY);
        await addSicorLog('Agendamento automático desativado.', 'SISTEMA');
        return;
    }

    let nextRun = new Date();
    nextRun.setHours(0, 0, 0, 0); // Horário fixo para execução

    // Calcula a data base para o próximo ciclo
    const calculateNextBaseDate = (currentBase) => {
        const nextDate = new Date(currentBase);
        if (frequency === 'daily') {
            nextDate.setDate(nextDate.getDate() + 1);
        } else if (frequency === 'weekly') {
            nextDate.setDate(nextDate.getDate() + 7);
        } else if (frequency === 'monthly') {
            nextDate.setMonth(nextDate.getMonth() + 1);
            nextDate.setDate(1); // Sempre no primeiro dia do mês seguinte
        }
        nextRun.setHours(0, 0, 0, 0); // Garante a hora
        return nextDate;
    };

    // Ajusta nextRun para a próxima data válida futura
    while (nextRun <= new Date()) {
        nextRun = calculateNextBaseDate(nextRun);
    }

    // Ajuste específico para semanal, se necessário, para cair no dia certo
    if (frequency === 'weekly' && config['autoWeekday']) { // Verifica se autoWeekday existe
        const targetDay = parseInt(config['autoWeekday'], 10);
        while (nextRun.getDay() !== targetDay) {
            nextRun.setDate(nextRun.getDate() + 1);
            nextRun.setHours(0, 0, 0, 0); // Garante a hora ao avançar o dia
             // Se ao ajustar o dia, passamos para a semana seguinte, garante que não volte
            if (nextRun <= new Date()) {
                nextRun.setDate(nextRun.getDate() + 7); // Pula para a próxima semana
            }
        }
    }


    const schedule = { nextRun: nextRun.toISOString() };
    await chrome.storage.local.set({ [SICOR_STORAGE_SCHEDULE_KEY]: schedule });

    // Cria o alarme periódico que apenas verifica
    chrome.alarms.create(SICOR_ALARM_SCHEDULER_CHECK, { periodInMinutes: 60 });
    await addSicorLog(`Próxima extração agendada para: ${nextRun.toLocaleString('pt-BR')}`, 'SISTEMA');
}

async function runScheduledSicorExtractionIfNeeded() {
    if (isExtractionRunning) {
        console.log("SisPMG+ [SICOR Agendador]: Extração agendada ignorada, processo já em andamento.");
        return;
    }

    const { [STORAGE_SETTINGS_KEY]: settings, [SICOR_STORAGE_SCHEDULE_KEY]: schedule, [STORAGE_LAST_RUN_KEY]: lastRunDate } = await chrome.storage.local.get([STORAGE_SETTINGS_KEY, SICOR_STORAGE_SCHEDULE_KEY, STORAGE_LAST_RUN_KEY]);

    // Validação robusta das configurações e agendamento
    if (!settings || settings.scheduleFrequency === 'none' || !schedule?.nextRun || !settings.unidadeId || (!settings.manterCopiaXls && !settings.manterCopiaCsv && !settings.gasId) ) {
        if (!schedule?.nextRun && settings?.scheduleFrequency !== 'none') {
             console.log("SisPMG+ [SICOR Agendador]: Agendamento ativo, mas sem próxima data definida. Reagendando...");
             await scheduleNextSicorExtraction(settings); // Tenta reagendar
        } else if (settings && settings.scheduleFrequency !== 'none') {
             // Log apenas se o agendamento estiver ativo mas faltando outras configs
              console.log("SisPMG+ [SICOR Agendador]: Agendamento pulado - config. incompleta (unidade/destino).");
        }
        return; // Sai se não houver agendamento ativo, próxima data, unidade ou destino
    }


    const now = new Date();
    const nextRunTime = new Date(schedule.nextRun);

    if (now < nextRunTime) {
        return; // Ainda não é hora
    }
    const todayStr = new Date().toISOString().split('T')[0];
    if (lastRunDate === todayStr) {
        console.log("SisPMG+ [SICOR Agendador]: Extração agendada para hoje já foi concluída. Reagendando.");
        await scheduleNextSicorExtraction(settings); // Garante que o próximo dia/semana/mês seja agendado
        return; 
    }

    // --- Início da Modificação: Verifica flag de login ---
    if (!isUserLoggedIn) {
        console.log("SisPMG+ [SICOR Agendador]: Agendamento pulado (isUserLoggedIn = false). Aguardando sinal de login.");
        // Não loga, para não poluir. Apenas aguarda o próximo sinal.
        return; 
    }
    // --- Fim da Modificação ---


    // --- Início da Execução Agendada ---
    isExtractionRunning = true; // Bloqueia novas execuções
    // --- Início da Modificação: Lógica Multi-Ano ---
    let downloadedBlobsForProcessing = []; 
    let allDownloadsSuccessful = true;
    // --- Fim da Modificação ---

    try {
        await addSicorLog('Executando extração agendada...', 'SISTEMA');
        const dateRange = _getScheduledDateRange(settings); // Usa a função específica do SICOR
        
        // --- Início da Modificação: Adiciona loop Multi-Ano ---
        const dateRanges = getDateRangesForMultiYear(dateRange.startDate, dateRange.endDate);

        if (dateRanges.length > 0) {
            await addSicorLog(`Período ${dateRanges.length > 1 ? 'multi-ano' : 'único'} agendado. Iniciando downloads...`, 'SISTEMA');
            
            for (const range of dateRanges) {
                 // Prepara o payload para executeSicorDownload
                const payload = {
                    startDate: range.start, // Formato DD/MM/YYYY (do dateRanges)
                    endDate: range.end, // Formato DD/MM/YYYY (do dateRanges)
                    unitId: settings.unidadeId, unitName: settings.unitName,
                    includeSubunits: settings.incluirSubordinadas, trazerEnvolvidos: settings.trazerEnvolvidos,
                    periodoTipo: settings.periodoTipo || 'DATA_FATO', isAuto: true,
                    manterCopiaXls: settings.manterCopiaXls,
                    manterCopiaCsv: settings.manterCopiaCsv,
                    gasId: settings.gasId,
                    year: range.year, // Adiciona o ano para logs
                    // Adiciona datas YYYYMMDD para nomes de arquivos
                    dataIni_YYYYMMDD: range.start.split('/').reverse().join(''),
                    dataFim_YYYYMMDD: range.end.split('/').reverse().join('')
                };
                
                await addSicorLog(`Iniciando download agendado para ${range.start} a ${range.end}...`, 'SISTEMA');
                const result = await executeSicorDownload(payload);

                if (!result.success && !(result.error && result.error.includes("Nenhum registro foi encontrado"))) {
                     allDownloadsSuccessful = false;
                     await addSicorLog(`Falha no download agendado para ${range.start}-${range.end}: ${result.error}`, 'DOWNLOAD', 'error');
                } else if(result.success && result.blobData) {
                    downloadedBlobsForProcessing.push(result.blobData);
                } else if (result.success && !result.blobData) {
                     await addSicorLog(`Nenhum dado agendado para ${range.start}-${range.end}. Pulado.`, 'DOWNLOAD', 'info');
                }
                await new Promise(resolve => setTimeout(resolve, 1500)); // Pausa entre requisições
            }
             await addSicorLog(`Downloads agendados concluídos (${downloadedBlobsForProcessing.length} arquivos${!allDownloadsSuccessful ? ' com falhas' : ''}).`, 'SISTEMA', allDownloadsSuccessful ? 'success' : 'warn');
        }
        // --- Fim da Modificação: Loop Multi-Ano ---


        // Processamento e Sincronização (se houve download)
         if (downloadedBlobsForProcessing.length > 0) { // Modificado
              await addSicorLog('Iniciando processamento dos dados agendados...', 'PROCESSAMENTO');
              // Passa 'settings' para processamento, pois pode ter filtros
              const processedResult = await _processDownloadedXlsData(downloadedBlobsForProcessing, settings); // Modificado

              if (processedResult && processedResult.csv) {
                 // Salvar cópia local CSV tratado (se habilitado)
                 if (settings.manterCopiaCsv) {
                     // Usa o payload do último range para os nomes de arquivo (ou o range total)
                     const namePayload = {
                         dataIni_YYYYMMDD: dateRange.startDate.replace(/-/g, ''),
                         dataFim_YYYYMMDD: dateRange.endDate.replace(/-/g, '')
                     };
                     await _saveProcessedCsvLocal(processedResult.csv, namePayload, 'AGENDADO');
                 }
                  // Sincronização com Google Drive (se habilitado)
                  if (settings.gasId) {
                      await addSicorLog('Enviando CSV para Google Apps Script...', 'GDRIVE');
                      await syncWithGoogleScript(settings.gasId, processedResult.csv);
                  } else { await addSicorLog('Sinc. Drive desativada.', 'GDRIVE', 'info'); }
              } else { await addSicorLog('Nenhum dado válido pós-processamento. Sinc. cancelada.', 'PROCESSAMENTO', 'info'); }
         } else if (settings.gasId) { await addSicorLog('Sinc. Drive pulada (sem dados ou ID).', 'GDRIVE', 'info'); }
         else { await addSicorLog('Sinc. Drive desativada.', 'GDRIVE', 'info'); }

        // Reagenda para a próxima execução após sucesso ou falha controlada
        if (allDownloadsSuccessful) {
            // Salva se o download/processamento foi bem-sucedido ou se não encontrou dados
            await chrome.storage.local.set({ [STORAGE_LAST_RUN_KEY]: new Date().toISOString().split('T')[0] });
            await addSicorLog('Data da última execução salva (Sucesso ou Sem Dados).', 'SISTEMA', 'info');
        } else {
            await addSicorLog('Execução agendada falhou. A data da última execução não foi atualizada.', 'SISTEMA', 'warn');
        }
        await scheduleNextSicorExtraction(settings);

    } catch (error) {
        await addSicorLog(`Erro crítico na extração agendada: ${error.message}`, 'SISTEMA', 'error');
        // Considera reagendar mesmo em erro crítico para não parar o ciclo?
        // await scheduleNextSicorExtraction(settings);
    } finally {
        isExtractionRunning = false; // Libera o bloqueio
        await closeOffscreenDocument(); // Garante fechar o offscreen
        chrome.runtime.sendMessage({ action: 'sicor-extraction-finished' }).catch(()=>{}); // Sinaliza fim para UI
    }
}


// --- LÓGICA DE EXTRAÇÃO E PROCESSAMENTO (Funções mantidas) ---
// getDateRangesForMultiYear, executeSicorDownload, _processDownloadedXlsData, _convertToCsv, _saveProcessedCsvLocal, syncWithGoogleScript

function getDateRangesForMultiYear(startDateStr, endDateStr) {
    // Adiciona validação robusta das datas de entrada
    const start = new Date(startDateStr + 'T00:00:00Z');
    const end = new Date(endDateStr + 'T00:00:00Z');

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
         console.warn(`SisPMG+ [SICOR Datas]: Datas inválidas (${startDateStr}, ${endDateStr}). Usando ano único.`);
         const fallbackStart = startDateStr.split('-').reverse().join('/');
         const fallbackEnd = endDateStr.split('-').reverse().join('/');
         const fallbackYear = !isNaN(start.getTime()) ? start.getUTCFullYear() : new Date().getFullYear();
         return [{ start: fallbackStart, end: fallbackEnd, year: fallbackYear }];
    }

    const startYear = start.getUTCFullYear();
    const endYear = end.getUTCFullYear();
    const ranges = [];
    const formatDatePayload = (d) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

    if (startYear === endYear) {
        ranges.push({ start: formatDatePayload(start), end: formatDatePayload(end), year: startYear });
    } else {
        ranges.push({ start: formatDatePayload(start), end: formatDatePayload(new Date(Date.UTC(startYear, 11, 31))), year: startYear });
        for (let y = startYear + 1; y < endYear; y++) {
            ranges.push({ start: formatDatePayload(new Date(Date.UTC(y, 0, 1))), end: formatDatePayload(new Date(Date.UTC(y, 11, 31))), year: y });
        }
        ranges.push({ start: formatDatePayload(new Date(Date.UTC(endYear, 0, 1))), end: formatDatePayload(end), year: endYear });
    }
    return ranges;
}
async function executeSicorDownload(payload) {
    const url = 'https://intranet.policiamilitar.mg.gov.br/SICOR/paginas/relatorios/relGerencial.jsf';
    const logPrefix = payload.isAuto ? 'AGENDADO' : 'MANUAL';
    const yearSuffix = payload.year ? ` (${payload.year})` : '';
    let blobResult = null;
    let currentViewState = null;

    try {
        await addSicorLog(`[${logPrefix}${yearSuffix}] Obtendo ViewState...`, 'DOWNLOAD');
        const initialResponse = await fetch(url, { credentials: 'include' });
        if (!initialResponse.ok) throw new Error(`Status ${initialResponse.status}`);
        const htmlText = await initialResponse.text();
        const vsResponse = await sendMsgToOffscreen('parseDOM', { html: htmlText, selector: 'input[name="javax.faces.ViewState"]'});
        if (vsResponse?.error) throw new Error(`Parse VS inicial: ${vsResponse.error}`);
        currentViewState = vsResponse?.value;
        if (!currentViewState) throw new Error('VS inicial não encontrado.');
        await addSicorLog(`[${logPrefix}${yearSuffix}] ViewState OK.`, 'DOWNLOAD');

        const unidadeValueString = `[UNIDADE: id = ${payload.unitId} - nome sintese: ${payload.unitName}`;
        const baseParams = new URLSearchParams({
            'form:selUnidade': unidadeValueString, 'form:selUnidadeFiltro': 'Pesquisar unidade em todas registros',
            'form:selTipoFato': '0', 'form:selNatureza': '0', 'form:selTipoProcesso': '0', 'form:selTipoSolucao': '0',
            'form:selTipoSancao': '0', 'form:selTipoRecompensa': '0', 'form:selTipoEnvolvido': '0', 'form:selMotArq': '0',
            'form:selArtigo': '0', 'form:descricaoInciso': 'Inciso', 'form:dataIniInputDate': payload.startDate,
            'form:dataFimInputDate': payload.endDate, 'form:j_id185': payload.periodoTipo, 'form': 'form', 'autoScroll': '',
            'javax.faces.ViewState': currentViewState
        });
        if (payload.includeSubunits) baseParams.append('form:j_id49', 'on');
        if (payload.trazerEnvolvidos) baseParams.append('form:checkEnvolvido', 'on');

        await addSicorLog(`[${logPrefix}${yearSuffix}] Enviando pesquisa...`, 'DOWNLOAD');
        const searchParams = new URLSearchParams(baseParams);
        searchParams.append('AJAXREQUEST', '_viewRoot'); searchParams.append('form:btFiltrar', 'form:btFiltrar');
        searchParams.append('javax.faces.behavior.event', 'action'); searchParams.append('javax.faces.partial.event', 'click');
        searchParams.append('javax.faces.source', 'form:btFiltrar'); searchParams.append('javax.faces.partial.ajax', 'true');
        searchParams.append('javax.faces.partial.execute', '@form'); searchParams.append('javax.faces.partial.render', '@form');

        const searchResponse = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "Faces-Request": "partial/ajax" }, body: searchParams.toString(), credentials: 'include' });
        if (!searchResponse.ok) throw new Error(`Pesquisa AJAX: Status ${searchResponse.status}`);
        const searchResponseXml = await searchResponse.text();

        const infoMsgResponse = await sendMsgToOffscreen('parseDOMForInfoMessage', { html: searchResponseXml, parserType: 'application/xml' });
        if (infoMsgResponse?.infoMessage?.includes("Nenhum registro foi encontrado")) {
            await addSicorLog(`[${logPrefix}${yearSuffix}] Nenhum registro.`, 'DOWNLOAD', 'info');
            return { success: true, blobData: null };
        }

        const updatedVsResponse = await sendMsgToOffscreen('parseDOM', { html: searchResponseXml, selector: 'update[id="javax.faces.ViewState"]', parserType: 'application/xml' });
        const updatedViewStateCDATA = updatedVsResponse?.value;
        const viewStateMatch = updatedViewStateCDATA ? updatedViewStateCDATA.match(/<!\[CDATA\[(.*?)\]\]>/) : null;
        const updatedViewState = viewStateMatch ? viewStateMatch[1] : null;
        if (updatedViewState) { currentViewState = updatedViewState; await addSicorLog(`[${logPrefix}${yearSuffix}] VS atualizado via AJAX.`, 'DOWNLOAD'); }
        else {
             const formUpdateVsResponse = await sendMsgToOffscreen('parseDOM', { html: searchResponseXml, selector: 'update[id="form"] input[name="javax.faces.ViewState"]', parserType: 'application/xml' });
              if (formUpdateVsResponse?.value) { currentViewState = formUpdateVsResponse.value; await addSicorLog(`[${logPrefix}${yearSuffix}] VS atualizado via form update.`, 'DOWNLOAD'); }
              else { console.warn("SisPMG+ [SICOR]: Não foi possível obter VS atualizado. Usando anterior."); }
        }
        await addSicorLog(`[${logPrefix}${yearSuffix}] Pesquisa OK. Solicitando XLS...`, 'DOWNLOAD');

        const downloadParams = new URLSearchParams(baseParams);
        downloadParams.set('javax.faces.ViewState', currentViewState);
        downloadParams.append('form:j_id196', 'form:j_id196');
        downloadParams.delete('AJAXREQUEST'); downloadParams.delete('javax.faces.behavior.event'); downloadParams.delete('javax.faces.partial.event');
        downloadParams.delete('javax.faces.source'); downloadParams.delete('javax.faces.partial.ajax'); downloadParams.delete('javax.faces.partial.execute'); downloadParams.delete('javax.faces.partial.render');

        const downloadResponse = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: downloadParams.toString(), credentials: 'include' });
        if (!downloadResponse.ok) throw new Error(`Download: Status ${downloadResponse.status}`);
        const contentType = downloadResponse.headers.get("content-type");

        if (contentType?.includes('text/html')) {
             const errorHtml = await downloadResponse.text();
             const offscreenErrorResponse = await sendMsgToOffscreen('parseDOMErrorMessages', { html: errorHtml });
             if (offscreenErrorResponse?.errorMessage?.includes("Nenhum registro foi encontrado")) {
                 await addSicorLog(`[${logPrefix}${yearSuffix}] Nenhum registro (detectado no download).`, 'DOWNLOAD', 'info');
                 return { success: true, blobData: null };
             }
             throw new Error(`HTML inesperado: ${offscreenErrorResponse?.errorMessage || 'Verifique HTML.'}`);
        }

        blobResult = await downloadResponse.blob();
        const expectedTypes = ['excel', 'spreadsheet', 'octet-stream', 'application/vnd.ms-excel'];
        const isExpectedType = expectedTypes.some(type => blobResult.type.includes(type));
        if (!blobResult || blobResult.size === 0 || (!isExpectedType && blobResult.type !== 'application/octet-stream') ) {
             throw new Error(`Blob inválido: Tipo ${blobResult?.type}, Tamanho ${blobResult?.size}`);
        }
        await addSicorLog(`[${logPrefix}${yearSuffix}] Blob XLS recebido (${(blobResult.size / 1024).toFixed(1)} KB, ${blobResult.type}).`, 'DOWNLOAD', 'success');

        if (payload.manterCopiaXls) {
            const dataUrl = await blobToDataURL(blobResult);
            const startDate_YYYYMMDD = payload.dataIni_YYYYMMDD || payload.startDate.split('/').reverse().join('');
            const endDate_YYYYMMDD = payload.dataFim_YYYYMMDD || payload.endDate.split('/').reverse().join('');
            const filename = `relatorio_sicor_${startDate_YYYYMMDD}_a_${endDate_YYYYMMDD}.xls`;
            await addSicorLog(`[${logPrefix}${yearSuffix}] Solicitando cópia local XLS "${filename}"...`, 'DOWNLOAD', 'info');
            try {
                await chrome.downloads.download({ url: dataUrl, filename: filename, saveAs: false });
                 await addSicorLog(`[${logPrefix}${yearSuffix}] Cópia local XLS iniciada via API.`, 'DOWNLOAD', 'success');
            } catch (downloadError) {
                 await addSicorLog(`[${logPrefix}${yearSuffix}] Falha chrome.downloads (${downloadError.message}). Fallback desativado.`, 'DOWNLOAD', 'error');
                 // Fallback via content script removido para simplificar
            }
        } else { await addSicorLog(`[${logPrefix}${yearSuffix}] Cópia local XLS pulada.`, 'DOWNLOAD', 'info'); }

        return { success: true, blobData: blobResult };

    } catch (error) {
        if (error.message && !error.message.includes("Nenhum registro foi encontrado")) {
            console.error(`SisPMG+ [SICOR Download${yearSuffix}]:`, error);
            await addSicorLog(`[${logPrefix}${yearSuffix}] Falha Download: ${error.message}`, 'DOWNLOAD', 'error');
        } else if (!error.message) {
             console.error(`SisPMG+ [SICOR Download${yearSuffix}]: Erro desconhecido`, error);
             await addSicorLog(`[${logPrefix}${yearSuffix}] Falha Download: Erro desconhecido`, 'DOWNLOAD', 'error');
        }
        return { success: false, error: error.message || "Erro desconhecido", blobData: null };
    }
}
async function _processDownloadedXlsData(blobArray, settings = {}) {
    while (isProcessingData) {
        await addSicorLog('Processamento anterior em andamento, aguardando 1s...', 'PROCESSAMENTO', 'info');
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    isProcessingData = true;
    await addSicorLog(`Processando ${blobArray.length} arquivo(s) XLS...`, 'PROCESSAMENTO');
    const tiposEnvolvidoFiltro = settings?.tiposEnvolvidoSelecionados;
    try {
        if (typeof XLSX === 'undefined') throw new Error('Biblioteca SheetJS (XLSX) não encontrada.');
        let combinedData = [];
        const expectedHeader = "Protocolo";
        for (const [index, blob] of blobArray.entries()) {
            await addSicorLog(`Lendo arquivo ${index + 1}/${blobArray.length} (${(blob.size / 1024).toFixed(1)} KB)...`, 'PROCESSAMENTO');
            
            // --- Início da Modificação: Lógica de Nova Tentativa ---
            let workbook = null;
            const MAX_READ_ATTEMPTS = 2; // 1 inicial + 1 nova tentativa

            for (let attempt = 1; attempt <= MAX_READ_ATTEMPTS; attempt++) {
                try {
                    if (attempt > 1) {
                        await addSicorLog(`Tentando reler o arquivo ${index + 1} (Tentativa ${attempt})...`, 'PROCESSAMENTO', 'info');
                        await new Promise(resolve => setTimeout(resolve, 1000)); // 1s delay
                    }
                    const arrayBuffer = await blob.arrayBuffer();
                    workbook = XLSX.read(arrayBuffer);
                    break; // Sucesso, sai do loop de tentativa

                } catch (readError) {
                    await addSicorLog(`DEBUG: Arquivo ${index + 1} (Tentativa ${attempt}/${MAX_READ_ATTEMPTS}): Erro XLSX.read: ${readError.message}`, 'PROCESSAMENTO', 'error');
                    if (attempt === MAX_READ_ATTEMPTS) {
                        await addSicorLog(`Arquivo ${index + 1} falhou em todas as ${MAX_READ_ATTEMPTS} tentativas. Pulando.`, 'PROCESSAMENTO', 'error');
                    }
                }
            }

            // Se 'workbook' ainda é null, a leitura falhou 2x. Pula para o próximo blob.
            if (!workbook) {
                continue;
            }
            // --- Fim da Modificação: Lógica de Nova Tentativa ---

            try {
                if (!workbook?.SheetNames?.length) { 
                    await addSicorLog(`DEBUG: Arquivo ${index + 1}: Planilhas não encontradas (pós-leitura).`, 'PROCESSAMENTO', 'warn'); 
                    continue; 
                }
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, dateNF: 'dd/MM/yyyy HH:mm:ss', blankrows: false });
                let headerRowIndex = jsonData.findIndex(row => Array.isArray(row) && row.some(cell => String(cell || '').trim().toLowerCase() === expectedHeader.toLowerCase()));
                if (headerRowIndex === -1) {
                    await addSicorLog(`Cabeçalho "${expectedHeader}" não encontrado ${index + 1}. Verificando HTML...`, 'PROCESSAMENTO', 'warn');
                    const firstFewRowsString = jsonData.slice(0, 5).flat().join('').toLowerCase();
                    if (firstFewRowsString.includes('<html')) { await addSicorLog(`Arquivo ${index + 1} parece ser HTML. Pulando.`, 'PROCESSAMENTO', 'error'); }
                    continue;
                }
                const headers = jsonData[headerRowIndex].map(h => String(h || '').trim());
                const lowerCaseHeaders = headers.map(h => h.toLowerCase());
                const protocolColIndex = lowerCaseHeaders.indexOf(expectedHeader.toLowerCase());
                const tipoEnvolvidoColIndex = lowerCaseHeaders.indexOf("tipo envolvido");
                const nrPolColIndex = lowerCaseHeaders.indexOf("nrpol");
                if (protocolColIndex === -1 || nrPolColIndex === -1) { await addSicorLog(`Colunas essenciais não encontradas ${index + 1}. Pulando.`, 'PROCESSAMENTO', 'warn'); continue; }
                if (tipoEnvolvidoColIndex === -1) { await addSicorLog(`"Tipo Envolvido" não encontrado ${index + 1}. Filtro não aplicado.`, 'PROCESSAMENTO', 'warn'); }
                const dataRows = jsonData.slice(headerRowIndex + 1);
                const sheetData = dataRows.map(row => {
                    if (!row || !Array.isArray(row) || !row[protocolColIndex]) return null;
                    const protocoloValor = String(row[protocolColIndex] || '').trim().toLowerCase();
                    if (protocoloValor === expectedHeader.toLowerCase() || protocoloValor.includes('total') || protocoloValor === '') return null;
                    const tipoEnvolvido = (tipoEnvolvidoColIndex > -1) ? String(row[tipoEnvolvidoColIndex] || '').trim() : '';
                    if (tiposEnvolvidoFiltro && tipoEnvolvidoColIndex > -1 && tiposEnvolvidoFiltro.length > 0 && !tiposEnvolvidoFiltro.includes(tipoEnvolvido)) return null;
                    const rowData = {}; let hasMeaningfulData = false;
                    headers.forEach((header, colIndex) => { if (!header) return; let value = row[colIndex]; value = (value !== null && value !== undefined) ? String(value).trim() : ''; rowData[header] = value; if (value !== '' && colIndex !== protocolColIndex) hasMeaningfulData = true; });
                    return hasMeaningfulData ? rowData : null;
                }).filter(Boolean);
                combinedData.push(...sheetData);
                await addSicorLog(`Arquivo ${index + 1}: ${sheetData.length} registros válidos (pós-filtro).`, 'PROCESSAMENTO');
            } catch (processError) { 
                await addSicorLog(`Erro ao processar (pós-leitura) arquivo ${index + 1}: ${processError.message}. Pulando.`, 'PROCESSAMENTO', 'error'); 
                console.error(`Erro ${index + 1}:`, processError); 
            }
        }
        if (combinedData.length === 0) { await addSicorLog('Nenhum registro válido encontrado.', 'PROCESSAMENTO', 'info'); return null; }
        await addSicorLog(`Removendo duplicatas de ${combinedData.length} registros...`, 'PROCESSAMENTO');
        const uniqueDataMap = new Map();
        const firstValidData = combinedData.find(row => row); const finalHeaders = firstValidData ? Object.keys(firstValidData) : []; const lowerFinalHeaders = finalHeaders.map(h => h.toLowerCase());
        const headerProtocolo = finalHeaders[lowerFinalHeaders.indexOf(expectedHeader.toLowerCase())] || expectedHeader;
        const headerTipoEnvolvido = finalHeaders[lowerFinalHeaders.indexOf("tipo envolvido")] || "Tipo Envolvido";
        const headerNrPol = finalHeaders[lowerFinalHeaders.indexOf("nrpol")] || "NrPol";
        combinedData.forEach(row => { const protocolo = row[headerProtocolo]; const tipoEnvolvido = row[headerTipoEnvolvido] || 'N/A'; const nrPol = row[headerNrPol] || 'N/A'; const uniqueKey = `${protocolo}|${tipoEnvolvido}|${nrPol}`; if (!protocolo || !nrPol) return; if (!uniqueDataMap.has(uniqueKey)) uniqueDataMap.set(uniqueKey, row); });
        let finalData = Array.from(uniqueDataMap.values());
        await addSicorLog(`Processamento: ${finalData.length} registros únicos.`, 'PROCESSAMENTO', 'success');
        await addSicorLog(`Classificando ${finalData.length} registros...`, 'PROCESSAMENTO');
        finalData.sort((a, b) => (a[headerProtocolo] || '').localeCompare(b[headerProtocolo] || ''));
        const csvString = _convertToCsv(finalData);
        if (!csvString) { await addSicorLog('Falha ao converter para CSV.', 'PROCESSAMENTO', 'error'); return null; }
        return { csv: csvString };
    } catch (error) { await addSicorLog(`Erro Processamento XLS: ${error.message}`, 'PROCESSAMENTO', 'error'); console.error("SisPMG+ [XLS Error]:", error); return null; }
    finally { isProcessingData = false; }
}
function _convertToCsv(data) {
    if (!data || data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const escapeCsvCell = (cell) => { cell = (cell === null || cell === undefined) ? '' : String(cell); if (/[";\n]/.test(cell)) cell = `"${cell.replace(/"/g, '""')}"`; return cell; };
    const headerRow = headers.map(escapeCsvCell).join(';');
    const bodyRows = data.map(row => headers.map(h => escapeCsvCell(row[h])).join(';'));
    return [headerRow, ...bodyRows].join('\n');
}
async function _saveProcessedCsvLocal(csvData, payload, logPrefix = 'CSV') {
    try {
        const blob = new Blob(['\uFEFF' + csvData], { type: 'text/csv;charset=utf-8;' });
        const dataUrl = await blobToDataURL(blob);
        const startDate_YYYYMMDD = payload.dataIni_YYYYMMDD || (payload.startDate ? payload.startDate.split('/').reverse().join('') : 'data_ini');
        const endDate_YYYYMMDD = payload.dataFim_YYYYMMDD || (payload.endDate ? payload.endDate.split('/').reverse().join('') : 'data_fim');
        const filename = `relatorio_sicor_${startDate_YYYYMMDD}_a_${endDate_YYYYMMDD}.csv`;
        await addSicorLog(`[${logPrefix}] Solicitando cópia local CSV "${filename}"...`, 'DOWNLOAD', 'info');
        await chrome.downloads.download({ url: dataUrl, filename: filename, saveAs: false });
        await addSicorLog(`[${logPrefix}] Cópia local CSV iniciada.`, 'DOWNLOAD', 'success');
    } catch (downloadError) { console.error(`SisPMG+ [SICOR Save CSV]:`, downloadError); await addSicorLog(`[${logPrefix}] Falha salvar cópia CSV: ${downloadError.message}`, 'DOWNLOAD', 'error'); }
}
async function syncWithGoogleScript(gasId, csvData) {
    if (!gasId) { await addSicorLog("Sinc. Drive ignorada: ID ausente.", 'GDRIVE', 'info'); return; }
    if (!csvData || csvData.trim().split('\n').length < 2) { await addSicorLog("Sinc. Drive ignorada: Sem dados CSV.", 'GDRIVE', 'info'); return; }
    const recordCount = csvData.trim().split('\n').length - 1;
    await addSicorLog(`Sincronizando ${recordCount} registros com Drive...`, 'GDRIVE', 'info');
    try {
        const gasUrl = `https://script.google.com/macros/s/${gasId}/exec`;
        const response = await fetch(gasUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: csvData, mode: 'cors', redirect: 'follow' });
        let resultText = '';
        try { resultText = await response.text(); } catch (textError) { throw new Error(`Falha ao ler resposta GAS. Status: ${response.status}`); }
        if (!response.ok) throw new Error(`Erro resposta GAS. Status: ${response.status}. Resp: ${resultText.substring(0, 500)}`);
        let result = {}; const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
            try { result = JSON.parse(resultText); } catch (jsonError) { console.warn("SisPMG+ [GDRIVE]: Resposta GAS não JSON:", resultText); result = { success: true, message: `Resp GAS (não JSON): ${resultText.substring(0, 100)}...` }; }
        } else { result = { success: true, message: `Resp GAS (não JSON): ${resultText.substring(0, 100)}...` }; }
        if (result.success) { await addSicorLog(`Sinc. Drive: ${result.message || 'Sucesso.'}`, 'GDRIVE', 'success'); }
        else { throw new Error(result.message || 'Erro desconhecido retornado pelo GAS.'); }
    } catch (error) { await addSicorLog(`Falha Sinc. Drive: ${error.message}`, 'GDRIVE', 'error'); console.error("SisPMG+ [GDRIVE Error]:", error); }
}

// --- INICIALIZAÇÃO E LISTENERS DA EXTENSÃO ---
export function initializeSicorBackground() {
    chrome.runtime.onInstalled.addListener(async (details) => {
        await addSicorLog(`Evento onInstalled: ${details.reason}`, 'SISTEMA');
        const { [STORAGE_SETTINGS_KEY]: currentConfig } = await chrome.storage.local.get(STORAGE_SETTINGS_KEY);
        let config = currentConfig || {}; // Garante que config seja um objeto

         // Define padrões se não existirem (instalação ou atualização de config antiga)
         const defaults = {
             scheduleFrequency: 'none',
             manterCopiaXls: true,
             manterCopiaCsv: true,
             incluirSubordinadas: true,
             trazerEnvolvidos: true,
             periodoTipo: 'DATA_FATO',
             isDateLocked: true, // Padrão travado
             // Não define padrões para dataIni, dataFim, gasId, unidadeId, tiposEnvolvidoSelecionados
         };
         let needsUpdate = false;
         for (const key in defaults) {
             if (typeof config[key] === 'undefined') {
                 config[key] = defaults[key];
                 needsUpdate = true;
             }
         }
         // Limpa config antiga 'manterCopia' se existir
         if (typeof config.manterCopia !== 'undefined') {
            delete config.manterCopia;
            needsUpdate = true;
         }

         if (needsUpdate || details.reason === 'install') {
            await chrome.storage.local.set({ [STORAGE_SETTINGS_KEY]: config });
            await addSicorLog(`Configurações ${details.reason === 'install' ? 'padrão definidas' : 'atualizadas'}.`, 'SISTEMA');
         }

        // Reagenda em caso de instalação/atualização, usando a config atualizada/padrão
        await scheduleNextSicorExtraction(config);
        // Tenta executar imediatamente se alguma execução foi perdida
        await runScheduledSicorExtractionIfNeeded();
    });

    chrome.runtime.onStartup.addListener(async () => {
        await addSicorLog('Navegador iniciado. Verificando agendamentos...', 'SISTEMA');
        await runScheduledSicorExtractionIfNeeded(); // Verifica se perdeu alguma execução
    });

    chrome.alarms.onAlarm.addListener(async (alarm) => {
        if (alarm.name === SICOR_ALARM_SCHEDULER_CHECK) {
            await runScheduledSicorExtractionIfNeeded(); // Verifica se é hora de rodar
        }
    });

    console.log("SisPMG+ [SICOR Background]: Módulo de agendamento inicializado.");
}



