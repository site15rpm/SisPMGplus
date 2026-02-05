import './common/browser-polyfill.js';
// Arquivo: background.js (Service Worker Principal) - VERSÃO ATUALIZADA
// Este script atua como o ponto de entrada principal e delega a lógica para os módulos.

import { handleTerminalMessages, initializeTerminalBackground } from './modules/terminal/terminal-background.js';
import { handleIntranetMessages } from './modules/intranet/intranet-background.js';
import { handleAbastecimentosMessages, initializeAbastecimentosBackground } from './modules/abastecimentos/abastecimentos-background.js';
import { handleSicorMessages, initializeSicorBackground } from './modules/intranet/intranet-sicor-background.js';
import { handleSirconvConveniosMessages, initializeSirconvConveniosBackground } from './modules/intranet/intranet-sirconv-convenios-background.js';
import { handleUnidadesMessages, initializeUnidadesBackground } from './modules/intranet/intranet-unidades-background.js'; // <-- NOVO

// Inicializa os listeners de cada módulo
initializeTerminalBackground();
initializeAbastecimentosBackground();
initializeSicorBackground();
initializeSirconvConveniosBackground();
initializeUnidadesBackground(); // <-- NOVO

// Listener de Mensagens Global
browser.runtime.onMessage.addListener((request, sender) => {
    const { action, payload } = request;

    // A função anônima async permite que usemos await e retornemos uma promessa,
    // que o sistema de mensagens da extensão tratará como a resposta.
    return (async () => {
        // --- NOVO: Tratamento baseado em promessa ---
        // Tenta primeiro os handlers modernizados que retornam uma promessa.
        const terminalResponse = await handleTerminalMessages(request, sender);
        if (terminalResponse !== undefined) return terminalResponse;

        const intranetResponse = await handleIntranetMessages(request, sender);
        if (intranetResponse !== undefined) return intranetResponse;

        const abastecimentosResponse = await handleAbastecimentosMessages(request, sender);
        if (abastecimentosResponse !== undefined) return abastecimentosResponse;

        const sirconvConveniosResponse = await handleSirconvConveniosMessages(request, sender);
        if (sirconvConveniosResponse !== undefined) return sirconvConveniosResponse;

        const unidadesResponse = await handleUnidadesMessages(request, sender);
        if (unidadesResponse !== undefined) return unidadesResponse;

        // --- ANTIGO: Camada de compatibilidade para handlers que usam sendResponse ---
        let sendResponse;
        const responsePromise = new Promise(resolve => {
            sendResponse = function(response) {
                resolve(response);
            };
        });

        if (handleSicorMessages(request, sender, sendResponse)) return responsePromise;

        // Manipula mensagens genéricas (usadas por todos os módulos) com async/await
        switch (action) {
            case 'getStorage':
                try {
                    const storageArea = payload?.storageType === 'local' ? browser.storage.local : browser.storage.sync;
                    const keys = payload.keys || null;
                    const items = await storageArea.get(keys);
                    return { success: true, value: items };
                } catch (error) {
                    return { success: false, error: error.message };
                }

            case 'setStorage':
                try {
                    const storageArea = payload?.storageType === 'local' ? browser.storage.local : browser.storage.sync;
                    const dataToSet = { ...payload };
                    if (dataToSet.storageType) delete dataToSet.storageType;
                    await storageArea.set(dataToSet);
                    return { success: true };
                } catch (error) {
                    return { success: false, error: error.message };
                }
                
            case 'removeStorage':
                try {
                    const storageArea = payload?.storageType === 'local' ? browser.storage.local : browser.storage.sync;
                    await storageArea.remove(payload.keys);
                    return { success: true };
                } catch (error) {
                    return { success: false, error: error.message };
                }

            case 'openSettingsPage':
                 const url = browser.runtime.getURL(payload.page);
                 await browser.tabs.create({ url });
                 return { success: true };

            default:
                // Se nenhum handler (nem promessa nem antigo) lidou com isso, retorna erro.
                // Isso só será alcançado se a ação não corresponder a nada nos handlers delegados ou no switch.
                return { success: false, error: 'Ação desconhecida no background principal.' };
        }
    })();
});

console.log("SisPMG+: Service worker principal iniciado.");
