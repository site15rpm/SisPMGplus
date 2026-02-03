// Arquivo: background.js (Service Worker Principal)
// Este script atua como o ponto de entrada principal e delega a lógica para os módulos.

import { handleTerminalMessages, initializeTerminalBackground } from './modules/terminal/terminal-background.js';
import { handleIntranetMessages } from './modules/intranet/intranet-background.js';
import { handleAbastecimentosMessages, initializeAbastecimentosBackground } from './modules/abastecimentos/abastecimentos-background.js';
import { handleSicorMessages, initializeSicorBackground } from './modules/intranet/intranet-sicor-background.js';

// Inicializa os listeners de cada módulo
initializeTerminalBackground();
initializeAbastecimentosBackground();
initializeSicorBackground(); // <-- ADICIONADO

// Listener de Mensagens Global
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const { action, payload } = request;

    // Delega para os handlers específicos de cada módulo.
    if (handleAbastecimentosMessages(request, sender, sendResponse)) return true;
    if (handleTerminalMessages(request, sender, sendResponse)) return true;
    if (handleIntranetMessages(request, sender, sendResponse)) return true;
    if (handleSicorMessages(request, sender, sendResponse)) return true;

    // Manipula mensagens genéricas (usadas por todos os módulos)
    switch (action) {
        case 'getStorage': {
            const storageArea = payload?.storageType === 'local' ? chrome.storage.local : chrome.storage.sync;
            storageArea.get(payload.key, (result) => {
                if (chrome.runtime.lastError) {
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                    return;
                }
                sendResponse({ success: true, value: result });
            });
            return true;
        }

        case 'setStorage': {
            const storageArea = payload?.storageType === 'local' ? chrome.storage.local : chrome.storage.sync;
            const dataToSet = { ...payload };
            if (dataToSet.storageType) delete dataToSet.storageType;
            storageArea.set(dataToSet, () => {
                if (chrome.runtime.lastError) {
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                    return;
                }
                sendResponse({ success: true });
            });
            return true;
        }
            
        case 'removeStorage': {
            const storageArea = payload?.storageType === 'local' ? chrome.storage.local : chrome.storage.sync;
            storageArea.remove(payload.keys, () => {
                if (chrome.runtime.lastError) {
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                    return;
                }
                sendResponse({ success: true });
            });
            return true;
        }

        case 'openSettingsPage': {
             const url = chrome.runtime.getURL(payload.page);
             chrome.tabs.create({ url });
             sendResponse({ success: true });
             return true;
        }

        default:
            sendResponse({ success: false, error: 'Ação desconhecida no background principal.' });
            return false;
    }
});

console.log("SisPMG+: Service worker principal iniciado.");
