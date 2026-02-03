// Arquivo: terminal/terminal/terminal-background.js
// Lógica de background específica para o módulo TerminalPMG+

// Arquivo: Code.gs Rotinas SisPMG+ v2.3
const API_URL = "https://script.google.com/macros/s/AKfycbzB8NEKd8oDUpiluZOk2VNmcfbLzhUiHNBP9SgBfE1rhRvwRU3jVLvskYjDPjyvpiQe/exec";

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
        const response = await fetch(url, options);
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
            await chrome.storage.local.set({ 
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
 * Manipula mensagens do chrome.runtime que são específicas do módulo Terminal.
 * @param {object} request - O objeto da mensagem.
 * @param {object} sender - O remetente da mensagem.
 * @param {function} sendResponse - A função de callback para enviar uma resposta.
 * @returns {boolean} Retorna true se a mensagem foi manipulada de forma assíncrona.
 */
export function handleTerminalMessages(request, sender, sendResponse) {
    const { action, payload } = request;

    switch (action) {
        case 'getRotinas':
            chrome.storage.local.get(['cachedRotinas']).then(result => {
                if (result.cachedRotinas) {
                    sendResponse({ success: true, data: result.cachedRotinas });
                    fetchAndCacheRotinas(payload);
                } else {
                    fetchAndCacheRotinas(payload).then(sendResponse);
                }
            });
            return true;

        case 'forceRefreshRotinas':
            fetchAndCacheRotinas(payload).then(sendResponse);
            return true;

        case 'saveRotina':
        case 'deleteRotina':
            apiCall('POST', { action, ...payload }).then(response => {
                if (response.success) {
                    fetchAndCacheRotinas(payload).then(() => sendResponse(response));
                } else {
                    sendResponse(response);
                }
            });
            return true;
        
        case 'sendToGoogleSheet':
            (async () => {
                const { scriptId, sheetName, data } = payload;
                const GOOGLE_SCRIPT_URL = `https://script.google.com/macros/s/${scriptId}/exec`;
                
                try {
                    const response = await fetch(GOOGLE_SCRIPT_URL, {
                        method: 'POST',
                        mode: 'cors',
                        redirect: 'follow',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({ sheetName, data })
                    });
                    if (!response.ok) throw new Error(`Erro na API da Planilha: ${response.status} ${response.statusText}`);
                    
                    const result = await response.json();
                    if (result.status === 'success') {
                        sendResponse({ success: true, message: result.message });
                    } else {
                        throw new Error(result.message || 'O script do Google retornou um erro.');
                    }
                } catch (error) {
                    sendResponse({ success: false, error: error.message });
                }
            })();
            return true;
        
        default:
            return false; 
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

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'loading' && tab.url && tab.url.startsWith('https://terminal.policiamilitar.mg.gov.br')) {
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: neutralizeBeforeUnload,
                world: 'MAIN'
            }).catch(err => console.error('SisPMG+ [Background]: Falha ao injetar script neutralizador:', err));
        }
    });

    // --- LIMPEZA DE CACHE NA INSTALAÇÃO/ATUALIZAÇÃO ---
    chrome.runtime.onInstalled.addListener((details) => {
        if (details.reason === 'install' || details.reason === 'update') {
            chrome.storage.local.remove(['cachedRotinas'], () => {
                console.log('SisPMG+ [Background]: Cache de rotinas antigo foi limpo.');
            });
        }
    });
}
