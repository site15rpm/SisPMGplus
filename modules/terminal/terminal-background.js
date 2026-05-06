// Arquivo: terminal/terminal/terminal-background.js
// Lógica de background específica para o módulo TerminalPMG+
import { fetchWithKeepAlive } from '../../common/keep-alive.js';
import { parseGoogleSheetResponse } from '../../common/google-sheets.js';

// Arquivo: Code.gs Rotinas SisPMG+ v2.3
const API_URL = "https://script.google.com/macros/s/AKfycbzB8NEKd8oDUpiluZOk2VNmcfbLzhUiHNBP9SgBfE1rhRvwRU3jVLvskYjDPjyvpiQe/exec";

// Helper para gerenciar o estado da sessão de forma segura
const getStorageEngine = () => browser.storage.session || browser.storage.local;

async function getSessionState() {
    const storage = getStorageEngine();
    const result = await storage.get(['aliasMap', 'reverseAliasMap', 'nextAliasIndex', 'pendingExecutions', 'autoLoginSystems']);
    return {
        aliasMap: result.aliasMap || {},
        reverseAliasMap: result.reverseAliasMap || {},
        nextAliasIndex: result.nextAliasIndex || 1, // Contador numérico para T1, T2, T3...
        pendingExecutions: result.pendingExecutions || {},
        autoLoginSystems: result.autoLoginSystems || {}
    };
}

async function saveSessionState(state) {
    const storage = getStorageEngine();
    await storage.set(state);
}

async function apiCall(method, params) {
    let url = new URL(API_URL);
    let options = {
        method: method,
        mode: 'cors',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    };

    if (method === 'GET') {
        Object.keys(params).forEach(key => params[key] !== undefined && url.searchParams.append(key, params[key]));
    } else if (method === 'POST') {
        options.body = JSON.stringify(params);
    }

    try {
        const response = await fetchWithKeepAlive(url, options);
        if (!response.ok) throw new Error(`Erro na API: ${response.status} ${response.statusText}`);
        return await response.json();
    } catch (error) {
        console.error(`Background: Falha na chamada API (${method})`, error);
        return { success: false, error: error.message };
    }
}

async function fetchAndCacheRotinas(payload = {}) {
    try {
        const response = await apiCall('GET', { action: 'listRotinasWithContent', ...payload });
        if (response && response.success) {
            await browser.storage.local.set({ 
                cachedRotinas: response.data
            });
            return { success: true, data: response.data };
        } else {
            console.error("Background: Falha ao buscar rotinas para o cache.", response.error);
            return { success: false, error: response.error || "Erro desconhecido" };
        }
    } catch (error) {
        console.error("Background: Erro crítico ao atualizar o cache de rotinas.", error);
        return { success: false, error: error.message };
    }
}

/**
 * Manipula mensagens do browser.runtime que são específicas do módulo Terminal.
 * @param {object} request - O objeto da mensagem.
 * @param {object} sender - O remetente da mensagem.
 * @param {function} sendResponse - A função de callback para enviar uma resposta.
 * @returns {boolean} Retorna true se a mensagem foi manipulada de forma assíncrona.
 */
export async function handleTerminalMessages(request, sender) {
    const { action, payload } = request;

    switch (action) {
        case 'getRotinas': {
            const result = await browser.storage.local.get(['cachedRotinas']);
            if (result.cachedRotinas) {
                // Não aguarde, apenas dispare a atualização em segundo plano.
                fetchAndCacheRotinas(payload);
                return { success: true, data: result.cachedRotinas };
            } else {
                // Aguarde a busca inicial e a retorne.
                return fetchAndCacheRotinas(payload);
            }
        }

        case 'forceRefreshRotinas':
            return fetchAndCacheRotinas(payload);

        case 'saveRotina':
        case 'deleteRotina': {
            const response = await apiCall('POST', { action, ...payload });
            if (response.success) {
                // Aguarde o cache ser atualizado antes de retornar.
                await fetchAndCacheRotinas(payload);
            }
            return response;
        }
        
        case 'sendToGoogleSheet': {
            const { scriptId, sheetName, data } = payload;
            const GOOGLE_SCRIPT_URL = `https://script.google.com/macros/s/${scriptId}/exec`;
            
            try {
                const response = await fetchWithKeepAlive(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    mode: 'cors',
                    redirect: 'follow',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ sheetName, data })
                });
                if (!response.ok) throw new Error(`Erro na API da Planilha: ${response.status} ${response.statusText}`);
                
                const result = await response.json();
                if (result.status === 'success') {
                    return { success: true, message: result.message };
                } else {
                    throw new Error(result.message || 'O script do Google retornou um erro.');
                }
            } catch (error) {
                return { success: false, error: error.message };
            }
        }

        case 'requestAlias': {
            const state = await getSessionState();
            const tabId = sender.tab.id;
            let alias = state.aliasMap[tabId];

            if (!alias) {
                alias = 'T' + (state.nextAliasIndex++);
                while (state.reverseAliasMap[alias]) {
                    alias = 'T' + (state.nextAliasIndex++);
                }
                state.aliasMap[tabId] = alias;
                state.reverseAliasMap[alias] = tabId;
            }

            // Verifica se há instrução de auto-login vinculada a esta aba/alias
            const autoLoginSystem = state.autoLoginSystems[alias] || null;
            if (autoLoginSystem) {
                delete state.autoLoginSystems[alias]; // Consome a instrução
            }
            
            await saveSessionState(state);

            console.log(`SisPMG+ [Background]: Alias ${alias} atribuído à aba ${tabId}`);

            if (state.pendingExecutions[alias] && state.pendingExecutions[alias].length > 0) {
                const msgs = state.pendingExecutions[alias];
                delete state.pendingExecutions[alias];
                await saveSessionState(state);
                
                setTimeout(() => {
                    msgs.forEach(msg => {
                        console.log(`SisPMG+ [Background]: Entregando mensagem pendente para a aba ${alias}`);
                        browser.tabs.sendMessage(tabId, msg).catch(e => console.error(e));
                    });
                }, 1500);
            }

            // Envia o autoLoginSystem junto com o alias
            return { success: true, alias, autoLoginSystem };
        }

        case 'executeInTab': {
            const { targetAlias, sourceAlias, routineName, customCode, messageId, targetSystem } = payload;
            const state = await getSessionState();
            let targetTabId = state.reverseAliasMap[targetAlias];

            // Payload que será injetado na aba de destino agora contém customCode se fornecido.
            const executeMsg = { type: 'EXECUTE_ROUTINE', routineName, customCode, sourceAlias, messageId, targetAlias };

            if (targetTabId) {
                try {
                    await browser.tabs.get(targetTabId);
                    browser.tabs.sendMessage(targetTabId, executeMsg).catch(e => console.error(e));
                    console.log(`SisPMG+ [Background]: Encaminhando execução '${routineName}' para aba existente [${targetAlias}]`);
                    return { success: true, status: 'sent' };
                } catch(e) {
                    delete state.aliasMap[targetTabId];
                    delete state.reverseAliasMap[targetAlias];
                    targetTabId = null;
                }
            }

            if (!targetTabId) {
                console.log(`SisPMG+ [Background]: Aba de destino [${targetAlias}] não existe. Criando nova aba...`);
                
                // Registra instrução de auto-login para quando a aba nascer
                if (targetSystem) {
                    state.autoLoginSystems[targetAlias] = targetSystem;
                }

                const newTab = await browser.tabs.create({ url: 'https://terminal.policiamilitar.mg.gov.br' });
                
                state.aliasMap[newTab.id] = targetAlias;
                state.reverseAliasMap[targetAlias] = newTab.id;

                if (!state.pendingExecutions[targetAlias]) {
                    state.pendingExecutions[targetAlias] = [];
                }
                state.pendingExecutions[targetAlias].push(executeMsg);

                await saveSessionState(state);
                return { success: true, status: 'queued_and_tab_created' };
            }
            break;
        }

        case 'relayExecutionResult': {
            const { targetAlias, messageId, result } = payload;
            const state = await getSessionState();
            const targetTabId = state.reverseAliasMap[targetAlias];
            
            if (targetTabId) {
                console.log(`SisPMG+ [Background]: Retornando resultado da execução para a aba [${targetAlias}]`);
                browser.tabs.sendMessage(targetTabId, { type: 'EXECUTION_RESULT', messageId, result }).catch(e => console.error(e));
                return { success: true };
            } else {
                return { success: false, error: `Aba de origem [${targetAlias}] não encontrada ou foi fechada.` };
            }
        }

        case 'closeTab': {
            const { targetAlias } = payload;
            const state = await getSessionState();
            let tabIdToClose;

            if (targetAlias) {
                tabIdToClose = state.reverseAliasMap[targetAlias];
            } else {
                tabIdToClose = sender.tab.id;
            }

            if (tabIdToClose) {
                try {
                    await browser.tabs.remove(tabIdToClose);
                    return { success: true };
                } catch (error) {
                    console.error(`SisPMG+ [Background]: Erro ao fechar aba ${tabIdToClose}`, error);
                    return { success: false, error: error.message };
                }
            } else {
                return { success: false, error: `Aba [${targetAlias || 'Atual'}] não encontrada ou já foi fechada.` };
            }
        }

        case 'fetchSheetData': {
            const { sheetId, sheetName, query } = payload;
            const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json${sheetName ? `&sheet=${encodeURIComponent(sheetName)}` : ''}${query ? `&tq=${encodeURIComponent(query)}` : ''}&_=${Date.now()}`;
            
            try {
                const response = await fetchWithKeepAlive(url, { credentials: 'omit' });
                if (!response.ok) throw new Error(`Falha na requisição: ${response.status} ${response.statusText}`);
                const text = await response.text();
                const parsedData = parseGoogleSheetResponse(text);
                return { success: true, data: parsedData };
            } catch (error) {
                console.error(`SisPMG+ [Background]: Falha ao buscar dados do Google Sheets.`, error);
                return { success: false, error: error.message };
            }
        }
    }
}

/**
 * Inicializa os listeners de eventos de background específicos do módulo Terminal.
 */
export function initializeTerminalBackground() {
    // --- INJETOR DE SCRIPT NEUTRALIZADOR ---
    function neutralizeBeforeUnload() {
        Object.defineProperty(window, 'onbeforeunload', {
            get: () => null,
            set: () => { console.log('SisPMG+ [Background]: Tentativa de definir onbeforeunload foi bloqueada.'); }
        });
        window.addEventListener('beforeunload', (event) => {
            event.stopImmediatePropagation();
        }, true);
    }

    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'loading' && tab.url && tab.url.startsWith('https://terminal.policiamilitar.mg.gov.br')) {
            browser.scripting.executeScript({
                target: { tabId: tabId },
                func: neutralizeBeforeUnload,
                world: 'MAIN'
            }).catch(err => console.error('SisPMG+ [Background]: Falha ao injetar script neutralizador:', err));
        }
    });

    // --- LIMPEZA DE CACHE NA INSTALAÇÃO/ATUALIZAÇÃO ---
    browser.runtime.onInstalled.addListener((details) => {
        if (details.reason === 'install' || details.reason === 'update') {
            browser.storage.local.remove(['cachedRotinas'])
            .then(() => {
                console.log('SisPMG+ [Background]: Cache de rotinas antigo foi limpo.');
            })
            .catch((error) => {
                console.error('SisPMG+ [Background]: Erro ao limpar o cache de rotinas.', error);
            });
        }
    });

    // --- LIMPEZA DE ALIAS AO FECHAR ABA ---
    browser.tabs.onRemoved.addListener(async (tabId) => {
        try {
            const storage = getStorageEngine();
            const result = await storage.get(['aliasMap', 'reverseAliasMap', 'autoLoginSystems']);
            const aliasMap = result.aliasMap || {};
            const reverseAliasMap = result.reverseAliasMap || {};
            const autoLoginSystems = result.autoLoginSystems || {};

            if (aliasMap[tabId]) {
                const alias = aliasMap[tabId];
                console.log(`SisPMG+ [Background]: Aba fechada. Removendo alias [${alias}]`);
                delete reverseAliasMap[alias];
                delete aliasMap[tabId];
                if (autoLoginSystems[alias]) delete autoLoginSystems[alias];
                await storage.set({ aliasMap, reverseAliasMap, autoLoginSystems });
            }
        } catch (error) {
            console.error('SisPMG+ [Background]: Erro ao limpar alias da aba fechada.', error);
        }
    });
}