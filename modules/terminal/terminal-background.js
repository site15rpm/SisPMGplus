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
 * @returns {Promise<object>} Retorna a Promise com a resposta para o content script.
 */
export async function handleTerminalMessages(request, sender) {
    const { action, payload } = request;

    switch (action) {
        // --- INSERÇÃO PONTUAL: FORÇAR RECARREGAMENTO BLINDADO DE ABA ---
        case 'forceBypassReload': {
            const tabId = sender.tab.id;
            console.log(`SisPMG+ [Background]: Recarregando aba [ID: ${tabId}] à força (Bypass OnBeforeUnload).`);
            
            const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
            if (browserAPI && browserAPI.tabs) {
                browserAPI.tabs.reload(tabId, { bypassCache: true })
                    .catch(err => console.error("Falha ao forçar o reload da aba:", err));
            }
            return { success: true };
        }

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

        case 'getNextAlias': {
            const state = await getSessionState();
            let alias = 'T' + (state.nextAliasIndex++);
            while (state.reverseAliasMap[alias]) {
                alias = 'T' + (state.nextAliasIndex++);
            }
            await saveSessionState(state);
            return { success: true, alias };
        }

        case 'requestAlias': {
            const state = await getSessionState();
            const currentTabId = sender.tab.id;
            
            // --- VALIDAÇÃO PROATIVA DE ABAS ---
            // Verifica quais abas registradas no aliasMap ainda existem de fato
            let hasOtherTerminalTabs = false;
            const tabIdsToCheck = Object.keys(state.aliasMap);
            
            for (const tabIdStr of tabIdsToCheck) {
                const tabId = parseInt(tabIdStr, 10);
                let tabExists = false;
                
                try {
                    // Tenta obter a aba. Se lançar erro, a aba não existe mais.
                    await browser.tabs.get(tabId);
                    tabExists = true;
                } catch (e) {
                    // Aba não existe
                    tabExists = false;
                }
                
                if (!tabExists) {
                    const alias = state.aliasMap[tabId];
                    delete state.reverseAliasMap[alias];
                    delete state.aliasMap[tabId];
                    if (state.autoLoginSystems[alias]) delete state.autoLoginSystems[alias];
                } else if (tabId !== currentTabId) {
                    hasOtherTerminalTabs = true;
                }
            }

            // Se esta for a única aba de terminal ativa, reiniciamos o contador
            if (!hasOtherTerminalTabs) {
                console.log(`SisPMG+ [Background]: Única aba de terminal ativa detectada. Reiniciando contador para T1.`);
                state.nextAliasIndex = 1;
                // Limpa mapas para garantir que a aba atual pegue o T1
                state.aliasMap = {};
                state.reverseAliasMap = {};
            }

            let alias = state.aliasMap[currentTabId];

            if (!alias) {
                alias = 'T' + (state.nextAliasIndex++);
                while (state.reverseAliasMap[alias]) {
                    alias = 'T' + (state.nextAliasIndex++);
                }
                state.aliasMap[currentTabId] = alias;
                state.reverseAliasMap[alias] = currentTabId;
            }

            // Verifica se há instrução de auto-login vinculada a esta aba/alias
            const autoLoginSystem = state.autoLoginSystems[alias] || null;
            if (autoLoginSystem) {
                delete state.autoLoginSystems[alias]; // Consome a instrução
            }
            
            await saveSessionState(state);

            console.log(`SisPMG+ [Background]: Alias ${alias} atribuído à aba ${currentTabId}`);

            if (state.pendingExecutions[alias] && state.pendingExecutions[alias].length > 0) {
                const msgs = state.pendingExecutions[alias];
                delete state.pendingExecutions[alias];
                await saveSessionState(state);
                
                setTimeout(() => {
                    msgs.forEach(msg => {
                        console.log(`SisPMG+ [Background]: Entregando mensagem pendente para a aba ${alias}`);
                        browser.tabs.sendMessage(currentTabId, msg).catch(e => console.error(e));
                    });
                }, 1500);
            }

            // Envia o autoLoginSystem junto com o alias
            return { success: true, alias, autoLoginSystem };
        }

        case 'refreshRotinas':
            return fetchAndCacheRotinas(payload);

        case 'executeInTab': {
            const { targetAlias, sourceAlias, routineName, customCode, messageId, targetSystem, parametros } = payload;
            const state = await getSessionState();
            let targetTabId = state.reverseAliasMap[targetAlias];

            // Payload que será injetado na aba de destino agora contém customCode se fornecido.
            const executeMsg = { type: 'EXECUTE_ROUTINE', routineName, customCode, sourceAlias, messageId, targetAlias, parametros };

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

export function initBackgroundListeners() {
    // --- LIMPEZA DE CACHE NA ATUALIZAÇÃO ---
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

                // --- REINICIALIZAÇÃO DO CONTADOR ---
                // Se não houver mais abas de terminal abertas, reinicia o contador para T1
                let nextAliasIndex = undefined;
                if (Object.keys(aliasMap).length === 0) {
                    console.log(`SisPMG+ [Background]: Nenhuma aba de terminal ativa. Reiniciando contador para T1.`);
                    nextAliasIndex = 1;
                }

                const newState = { aliasMap, reverseAliasMap, autoLoginSystems };
                if (nextAliasIndex !== undefined) newState.nextAliasIndex = nextAliasIndex;

                await storage.set(newState);
            }
        } catch (error) {
            console.error('SisPMG+ [Background]: Erro ao limpar alias da aba fechada.', error);
        }
    });
}