// Arquivo: background.js (Service Worker Principal)
// Este script atua como o ponto de entrada principal e delega a lógica para os módulos.

import './common/browser-polyfill.js';
import { handleTerminalMessages, initBackgroundListeners } from './modules/terminal/terminal-background.js';
import { handleIntranetMessages } from './modules/intranet/intranet-background.js';
import { handleAbastecimentosMessages, initializeAbastecimentosBackground } from './modules/abastecimentos/abastecimentos-background.js';
import { handleSicorMessages, initializeSicorBackground } from './modules/intranet/intranet-sicor-background.js';
// Módulo sirconv-convenios-background removido (sincronização de convênios migrada para o SIC3)
import { handleUnidadesMessages, initializeUnidadesBackground } from './modules/intranet/intranet-unidades-background.js';
import { handleAgendaMessages, initializeAgendaBackground } from './modules/intranet/intranet-agenda-background.js';

// Inicializa os listeners de cada módulo que precisam de configuração inicial.
initBackgroundListeners();
initializeAbastecimentosBackground();
initializeSicorBackground();
// Sincronização do SIRCONV removida do background
initializeUnidadesBackground();
initializeAgendaBackground();

// Array com todos os handlers de mensagens dos módulos.
// A ordem importa: o primeiro a retornar uma resposta não nula encerra a busca.
const messageHandlers = [
    handleTerminalMessages,
    handleIntranetMessages,
    handleAgendaMessages,
    handleAbastecimentosMessages,
    handleUnidadesMessages,
    handleSicorMessages
];

// --- Listener de Mensagens Global ---
// Este listener central orquestra a passagem de mensagens para os módulos corretos.
// Ele retorna uma Promise, o que é essencial no Manifest V3 para lidar com respostas assíncronas.
browser.runtime.onMessage.addListener((request, sender) => {
    // IMPORTANTE: Se a mensagem for direcionada ao 'offscreen', ignoramos aqui
    // para permitir que o listener no offscreen.js (ou no iframe fallback) a processe.
    if (request.target === 'offscreen') {
        return false;
    }

    const { action, payload } = request;

    return (async () => {
        try {
            // 1. Itera sobre os handlers dos módulos.
            for (const handler of messageHandlers) {
                const response = await handler(request, sender);
                // Se um handler processou a mensagem e retornou uma resposta,
                // a retornamos imediatamente.
                if (response != null) {
                    return response;
                }
            }

            // 2. Se nenhum módulo tratou a mensagem, processa ações genéricas/centrais.
            switch (action) {
                case 'getSettings': // Adicionado alias para getStorage
                case 'getStorage': {
                    const storageArea = payload?.storageType === 'sync' ? browser.storage.sync : browser.storage.local;
                    
                    // Normaliza as chaves para um array, aceitando 'key' ou 'keys' (string ou array)
                    let requestedKeys = payload?.keys || payload?.key;
                    if (requestedKeys && !Array.isArray(requestedKeys)) {
                        requestedKeys = [requestedKeys];
                    }
                    
                    let items = await storageArea.get(requestedKeys || null);

                    // Migração automática de 'sync' para 'local' se necessário
                    if (storageArea === browser.storage.local && requestedKeys) {
                        const keysToMigrate = requestedKeys.filter(k => items[k] === undefined);
                        if (keysToMigrate.length > 0) {
                            const syncItems = await browser.storage.sync.get(keysToMigrate);
                            const foundOnSync = Object.keys(syncItems).filter(k => syncItems[k] !== undefined);
                            if (foundOnSync.length > 0) {
                                console.log(`SisPMG+: Migrando chaves [${foundOnSync.join(', ')}] do sync para local.`);
                                await browser.storage.local.set(syncItems);
                                items = { ...items, ...syncItems };
                            }
                        }
                    }

                    return { success: true, value: items };
                }
                case 'setStorage': {
                    const storageArea = payload?.storageType === 'sync' ? browser.storage.sync : browser.storage.local;
                    const dataToSet = { ...payload };
                    delete dataToSet.storageType; // Remove a chave de controle
                    await storageArea.set(dataToSet);
                    return { success: true };
                }
                case 'removeStorage': {
                    const storageArea = payload?.storageType === 'sync' ? browser.storage.sync : browser.storage.local;
                    await storageArea.remove(payload.keys);
                    return { success: true };
                }
                case 'openSettingsPage': {
                    if (payload.page && payload.page.includes('sic3.html')) {
                        // Grava autorização de acesso temporária para o SIC3
                        await browser.storage.local.set({
                            sic3_access_authorized: {
                                timestamp: Date.now(),
                                authorized: true
                            }
                        });
                    }
                    const url = browser.runtime.getURL(payload.page);
                    await browser.tabs.create({ url });
                    return { success: true };
                }
                case 'obterMensagens': {
                    try {
                        const url = `https://docs.google.com/spreadsheets/d/1UPHe_LHpFR6yyE5_o-3Vb22WT4eDA9YGmxujReDQqxg/gviz/tq?tqx=out:json&sheet=mensagens&_=${Date.now()}`;
                        const response = await fetch(url);
                        if (!response.ok) {
                            throw new Error(`Erro na resposta da planilha: HTTP ${response.status}`);
                        }
                        const text = await response.text();
                        return { success: true, text };
                    } catch (err) {
                        console.error('SisPMG+ [Background]: Falha ao buscar mensagens da planilha:', err);
                        return { success: false, error: err.message };
                    }
                }
                case 'confirmarLeituraMensagem': {
                    try {
                        const storageData = await browser.storage.local.get('comunicacaoGasUrl');
                        const gasUrl = storageData.comunicacaoGasUrl;
                        if (!gasUrl) {
                            console.warn('SisPMG+ [Background]: URL do Apps Script de Comunicação não configurada.');
                            return { success: false, error: 'URL do Apps Script de Comunicação não configurada.' };
                        }
                        
                        const response = await fetch(gasUrl, {
                            method: 'POST',
                            mode: 'cors',
                            headers: {
                                'Content-Type': 'text/plain;charset=utf-8'
                            },
                            body: JSON.stringify({
                                action: 'confirmarMensagem',
                                userPM: payload.userPM,
                                rowIndex: payload.rowIndex,
                                abrangencia: payload.abrangencia,
                                mensagem: payload.mensagem
                            })
                        });
                        
                        if (!response.ok) {
                            throw new Error(`Erro HTTP ${response.status} ao confirmar leitura.`);
                        }
                        
                        const text = await response.text();
                        let data;
                        try {
                            data = JSON.parse(text);
                        } catch (e) {
                            data = { success: true, responseRaw: text };
                        }
                        return { success: true, data };
                    } catch (err) {
                        console.error('SisPMG+ [Background]: Falha ao gravar confirmação de leitura:', err);
                        return { success: false, error: err.message };
                    }
                }
                case 'registrarErroPlanilha': {
                    try {
                        const storageData = await browser.storage.local.get('comunicacaoGasUrl');
                        const gasUrl = storageData.comunicacaoGasUrl;
                        if (!gasUrl) {
                            console.warn('SisPMG+ [Background]: URL do Apps Script de Comunicação não configurada.');
                            return { success: false, error: 'URL do Apps Script de Comunicação não configurada.' };
                        }
                        
                        const response = await fetch(gasUrl, {
                            method: 'POST',
                            mode: 'cors',
                            headers: {
                                'Content-Type': 'text/plain;charset=utf-8'
                            },
                            body: JSON.stringify({
                                action: 'registrarErro',
                                erro: payload.erro,
                                sistema: payload.sistema,
                                pm: payload.pm,
                                timestamp: payload.timestamp,
                                navegador: payload.navegador,
                                infoUsuario: payload.infoUsuario,
                                infoSistema: payload.infoSistema
                            })
                        });
                        
                        if (!response.ok) {
                            throw new Error(`Erro HTTP ${response.status} ao registrar erro.`);
                        }
                        
                        const text = await response.text();
                        let data;
                        try {
                            data = JSON.parse(text);
                        } catch (e) {
                            data = { success: true, responseRaw: text };
                        }
                        return { success: true, data };
                    } catch (err) {
                        console.error('SisPMG+ [Background]: Falha ao registrar erro na planilha:', err);
                        return { success: false, error: err.message };
                    }
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