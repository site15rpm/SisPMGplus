import './common/browser-polyfill.js';
// Arquivo: background.js (Service Worker Principal) - VERSÃO ATUALIZADA
// Este script atua como o ponto de entrada principal e delega a lógica para os módulos.

import { handleTerminalMessages, initializeTerminalBackground } from './modules/terminal/terminal-background.js';
import { handleIntranetMessages } from './modules/intranet/intranet-background.js';
import { handleAbastecimentosMessages, initializeAbastecimentosBackground } from './modules/abastecimentos/abastecimentos-background.js';
import { handleSicorMessages, initializeSicorBackground } from './modules/intranet/intranet-sicor-background.js';
import { handleSirconvConveniosMessages, initializeSirconvConveniosBackground } from './modules/intranet/intranet-sirconv-convenios-background.js';
import { handleUnidadesMessages, initializeUnidadesBackground } from './modules/intranet/intranet-unidades-background.js'; // <-- NOVO
import { handleAgendaMessages, initializeAgendaBackground } from './modules/intranet/intranet-agenda-background.js';

// Inicializa os listeners de cada módulo
initializeTerminalBackground();
initializeAbastecimentosBackground();
initializeSicorBackground();
initializeSirconvConveniosBackground();
initializeUnidadesBackground(); // <-- NOVO
initializeAgendaBackground();

// Listener de Mensagens Global
browser.runtime.onMessage.addListener((request, sender) => {
    const { action, payload } = request;

    return (async () => {
        let finalResponse = undefined; // Inicializa com undefined

        // Tenta primeiro os handlers modernizados que retornam uma promessa.
        const terminalResponse = await handleTerminalMessages(request, sender);
        if (terminalResponse != null) finalResponse = terminalResponse;

        if (finalResponse == undefined) { // Só continua se ainda não foi manipulado
            const intranetResponse = await handleIntranetMessages(request, sender);
            if (intranetResponse != null) finalResponse = intranetResponse;
        }

        if (finalResponse == undefined) {
            const agendaResponse = await handleAgendaMessages(request, sender);
            if (agendaResponse != null) finalResponse = agendaResponse;
        }

        if (finalResponse == undefined) {
            const abastecimentosResponse = await handleAbastecimentosMessages(request, sender);
            if (abastecimentosResponse != null) finalResponse = abastecimentosResponse;
        }

        if (finalResponse == undefined) {
            const sirconvConveniosResponse = await handleSirconvConveniosMessages(request, sender);
            if (sirconvConveniosResponse != null) finalResponse = sirconvConveniosResponse;
        }

        if (finalResponse == undefined) {
            const unidadesResponse = await handleUnidadesMessages(request, sender);
            if (unidadesResponse != null) finalResponse = unidadesResponse;
        }
        
        if (finalResponse == undefined) {
            const sicorResponse = await handleSicorMessages(request, sender);
            if (sicorResponse != null) finalResponse = sicorResponse;
        }

        if (finalResponse == undefined) { // Se ainda não foi manipulado por um handler de módulo
            switch (action) {
                case 'getStorage':
                    try {
                        const storageArea = payload?.storageType === 'local' ? browser.storage.local : browser.storage.sync;
                        const keys = payload.keys || null;
                        const items = await storageArea.get(keys);
                        finalResponse = { success: true, value: items };
                    } catch (error) {
                        finalResponse = { success: false, error: error.message };
                    }
                    break;

                case 'setStorage':
                    try {
                        const storageArea = payload?.storageType === 'local' ? browser.storage.local : browser.storage.sync;
                        const dataToSet = { ...payload };
                        if (dataToSet.storageType) delete dataToSet.storageType;
                        await storageArea.set(dataToSet); // Corrected typo here
                        finalResponse = { success: true };
                    } catch (error) {
                        finalResponse = { success: false, error: error.message };
                    }
                    break;
                    
                case 'removeStorage':
                    try {
                        const storageArea = payload?.storageType === 'local' ? browser.storage.local : browser.storage.sync;
                        await storageArea.remove(payload.keys);
                        finalResponse = { success: true };
                    } catch (error) {
                        finalResponse = { success: false, error: error.message };
                    }
                    break;

                case 'openSettingsPage':
                     const url = browser.runtime.getURL(payload.page);
                     await browser.tabs.create({ url });
                     finalResponse = { success: true };
                     break;

                default:
                    finalResponse = { success: false, error: 'Ação desconhecida no background principal.' };
                    break;
            }
        }
        
        console.log(`SisPMG+ [Background]: Finalizando ação '${action}'. Retornando:`, finalResponse); // Log crucial
        return finalResponse;
    })();
});

console.log("SisPMG+: Service worker principal iniciado.");