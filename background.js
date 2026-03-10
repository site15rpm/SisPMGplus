import './common/browser-polyfill.js';
// Arquivo: background.js (Service Worker Principal) - VERSÃO ATUALIZADA
// Este script atua como o ponto de entrada principal e delega a lógica para os módulos.

import './common/browser-polyfill.js';
import { handleTerminalMessages, initializeTerminalBackground } from './modules/terminal/terminal-background.js';
import { handleIntranetMessages } from './modules/intranet/intranet-background.js';
import { handleAbastecimentosMessages, initializeAbastecimentosBackground } from './modules/abastecimentos/abastecimentos-background.js';
import { handleSicorMessages, initializeSicorBackground } from './modules/intranet/intranet-sicor-background.js';
import { handleSirconvConveniosMessages, initializeSirconvConveniosBackground } from './modules/intranet/intranet-sirconv-convenios-background.js';
import { handleUnidadesMessages, initializeUnidadesBackground } from './modules/intranet/intranet-unidades-background.js';
import { handleAgendaMessages, initializeAgendaBackground } from './modules/intranet/intranet-agenda-background.js';

// Inicializa os listeners de cada módulo que precisam de configuração inicial.
initializeTerminalBackground();
initializeAbastecimentosBackground();
initializeSicorBackground();
initializeSirconvConveniosBackground();
initializeUnidadesBackground();
initializeAgendaBackground();

// Array com todos os handlers de mensagens dos módulos.
// A ordem importa: o primeiro a retornar uma resposta não nula encerra a busca.
const messageHandlers = [
    handleTerminalMessages,
    handleIntranetMessages,
    handleAgendaMessages,
    handleAbastecimentosMessages,
    handleSirconvConveniosMessages,
    handleUnidadesMessages,
    handleSicorMessages
];

// --- Listener de Mensagens Global ---
// Este listener central orquestra a passagem de mensagens para os módulos corretos.
// Ele retorna uma Promise, o que é essencial no Manifest V3 para lidar com respostas assíncronas.
browser.runtime.onMessage.addListener((request, sender) => {
    const { action, payload } = request;

    return (async () => {
        try {
            // 1. Itera sobre os handlers dos módulos.
            for (const handler of messageHandlers) {
                const response = await handler(request, sender);
                // Se um handler processou a mensagem e retornou uma resposta,
                // a retornamos imediatamente.
                if (response != null) {
                    console.log(`SisPMG+ [Background]: Ação '${action}' tratada por um módulo. Retornando:`, response);
                    return response;
                }
            }

            // 2. Se nenhum módulo tratou a mensagem, processa ações genéricas/centrais.
            switch (action) {
                case 'getStorage': {
                    const storageArea = payload?.storageType === 'local' ? browser.storage.local : browser.storage.sync;
                    const items = await storageArea.get(payload.keys || null);
                    return { success: true, value: items };
                }
                case 'setStorage': {
                    const storageArea = payload?.storageType === 'local' ? browser.storage.local : browser.storage.sync;
                    const dataToSet = { ...payload };
                    delete dataToSet.storageType; // Remove a chave de controle
                    await storageArea.set(dataToSet);
                    return { success: true };
                }
                case 'removeStorage': {
                    const storageArea = payload?.storageType === 'local' ? browser.storage.local : browser.storage.sync;
                    await storageArea.remove(payload.keys);
                    return { success: true };
                }
                case 'openSettingsPage': {
                    const url = browser.runtime.getURL(payload.page);
                    await browser.tabs.create({ url });
                    return { success: true };
                }
                default:
                    // Se a ação não for conhecida por nenhum módulo nem pelo handler central.
                    console.warn(`SisPMG+ [Background]: Ação desconhecida '${action}'.`);
                    return { success: false, error: 'Ação desconhecida no background principal.' };
            }
        } catch (error) {
            // 3. Captura global de erros.
            // Se qualquer parte do código acima (incluindo os handlers dos módulos) lançar um erro,
            // ele será capturado aqui. Isso garante que sempre enviaremos uma resposta estruturada.
            console.error(`SisPMG+ [Background]: Erro não tratado ao processar a ação '${action}'.`, { error, request });
            return { success: false, error: error.message || 'Ocorreu um erro inesperado no service worker.' };
        }
    })(); // A IIFE retorna a promessa, mantendo o canal de resposta aberto.
});

console.log("SisPMG+: Service worker principal iniciado e pronto para receber mensagens.");