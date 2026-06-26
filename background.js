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
import { StorageManager } from './common/storage-manager.js';
import { STORAGE_KEYS } from './common/storage-keys.js';

const GAS_URL = 'https://script.google.com/macros/s/AKfycbw92pNeR6NSgGjsdh5nhtGLUxLPFqe2fCegu1MY4F10Q6uC6YEmKzqFdY5ee-dLu1cNqQ/exec';

// --- Inicialização do Token de Sessão do Navegador para Validação do SIC3 ---
async function initBrowserSessionToken() {
    let sessionStore = null;
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.session) {
        sessionStore = browser.storage.session;
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
        sessionStore = chrome.storage.session;
    }
    
    if (sessionStore) {
        try {
            const res = await sessionStore.get('browser_session_token');
            if (!res || !res.browser_session_token) {
                const newToken = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
                await sessionStore.set({ browser_session_token: newToken });
                console.log("[SisPMG+ Background] Novo browser_session_token gerado:", newToken);
            }
        } catch (e) {
            console.error("Erro ao gerenciar browser_session_token:", e);
        }
    }
}
initBrowserSessionToken();

// Inicializa os listeners de cada módulo que precisam de configuração inicial.
initBackgroundListeners();
initializeAbastecimentosBackground();
initializeSicorBackground();
// Sincronização do SIRCONV removida do background
initializeUnidadesBackground();
initializeAgendaBackground();

// Executa a varredura e migração do Garbage Collector no storage local
StorageManager.runGarbageCollector();

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
                    let requestedKeys = payload?.keys || payload?.key;
                    let keysToGet = requestedKeys;
                    if (keysToGet && !Array.isArray(keysToGet)) {
                        keysToGet = [keysToGet];
                    }

                    const items = await StorageManager.get(keysToGet || null, payload?.storageType || 'local');
                    return { success: true, value: typeof items === 'object' && items !== null ? items : { [requestedKeys]: items } };
                }
                case 'setStorage': {
                    const storageType = payload?.storageType || 'local';
                    const dataToSet = { ...payload };
                    delete dataToSet.storageType; // Remove a chave de controle
                    await StorageManager.set(dataToSet, storageType);
                    return { success: true };
                }
                case 'removeStorage': {
                    const storageType = payload?.storageType || 'local';
                    await StorageManager.remove(payload.keys, storageType);
                    return { success: true };
                }
                case 'openSettingsPage': {
                    if (payload.page && payload.page.includes('sic3.html')) {
                        // Grava autorização de acesso temporária para o SIC3
                        await StorageManager.set({
                            [STORAGE_KEYS.SIC3_ACCESS_AUTHORIZED]: {
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
                case 'obterPlanilhaGviz': {
                    try {
                        const { sheetId, sheetName, bypassCache } = payload;
                        if (!sheetId || !sheetName) {
                            throw new Error('Parâmetros sheetId ou sheetName inválidos.');
                        }
                        const cacheKey = 'sispmg_cache_gviz_' + sheetName;
                        const storageRes = await browser.storage.local.get(cacheKey);
                        const cachedText = storageRes[cacheKey];

                        if (cachedText && !bypassCache) {
                            // Se há cache, dispara a revalidação assíncrona em segundo plano e retorna o cache imediatamente
                            revalidarPlanilhaGviz(sheetId, sheetName, cachedText, sender?.tab?.id);
                            return { success: true, text: cachedText };
                        } else {
                            // Se não há cache (ex: instalação limpa) ou bypassCache é true, faz a busca de revalidação síncrona aguardando
                            const text = await revalidarPlanilhaGviz(sheetId, sheetName, null, sender?.tab?.id);
                            if (text) {
                                return { success: true, text };
                            } else {
                                return { success: false, error: 'Falha ao buscar planilha gviz (sem cache disponível).' };
                            }
                        }
                    } catch (err) {
                        console.error('SisPMG+ [Background]: Falha na ação obterPlanilhaGviz:', err);
                        return { success: false, error: err.message };
                    }
                }
                case 'confirmarLeituraMensagem': {
                    try {
                        const gasUrl = GAS_URL;

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
                        await enviarErroAoGAS(
                            payload.erro,
                            payload.url,
                            payload.infoUsuario,
                            payload.infoDepuracao
                        );
                        return { success: true };
                    } catch (err) {
                        console.error('SisPMG+ [Background]: Falha ao registrar erro na planilha via ação:', err);
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
            return { success: false, error: error.message || 'Comunicado do SisPMG+ no service worker.' };
        }
    })(); // A IIFE retorna a promessa, mantendo o canal de resposta aberto.
});

/**
 * Envia um erro formatado para a planilha de erros do Google Apps Script (GAS).
 */
async function enviarErroAoGAS(erroMsg, url, infoUsuario, infoDepuracao) {
    try {
        const gasUrl = GAS_URL;
        const versaoExtensao = browser.runtime.getManifest().version;
        
        let browserName = 'Chrome Background';
        if (typeof browser !== 'undefined' && typeof browser.runtime !== 'undefined' && browser.runtime.getURL('').startsWith('moz-extension')) {
            browserName = 'Firefox Background';
        }

        const response = await fetch(gasUrl, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify({
                action: 'registrarErro',
                erro: erroMsg,
                url: url || 'Background Service Worker',
                timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
                navegador: browserName,
                infoUsuario: infoUsuario || 'N/A no Background',
                versao: versaoExtensao,
                infoDepuracao: infoDepuracao || '{}'
            })
        });

        if (!response.ok) {
            console.error(`Erro HTTP ${response.status} ao enviar erro ao GAS.`);
        }
    } catch (e) {
        console.error('Falha ao enviar erro ao GAS:', e);
    }
}

/**
 * Busca a planilha na rede, atualiza o cache local se houver mudanças,
 * e gerencia logs de erros de rede persistentes (24h de falhas consecutivas espaçadas por 1h).
 */
async function revalidarPlanilhaGviz(sheetId, sheetName, cachedText, tabId) {
    const cacheKey = 'sispmg_cache_gviz_' + sheetName;
    const statusKey = 'sispmg_fetch_status_' + sheetName;
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${sheetName}&_=${Date.now()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Erro na resposta da planilha: HTTP ${response.status}`);
        }
        const text = await response.text();

        // 1. Se o conteúdo for diferente do cache, atualiza o cache e notifica o front-end
        if (text !== cachedText) {
            await StorageManager.set({ [cacheKey]: text });
            console.log(`SisPMG+ [Background]: Planilha '${sheetName}' atualizada no cache.`);
            
            // Se houver uma aba aberta que solicitou, notifica-a para atualizar
            if (tabId) {
                const action = sheetName === 'modulos' ? 'modulos-updated' : 'links-updated';
                browser.tabs.sendMessage(tabId, { action }).catch(() => {
                    // Ignora se a aba foi fechada nesse meio tempo
                });
            }
        }

        // 2. Limpa os registros de erro de fetch, pois o fetch foi bem-sucedido!
        await StorageManager.remove(statusKey);
        
        return text;

    } catch (err) {
        console.error(`SisPMG+ [Background]: Falha ao revalidar planilha '${sheetName}':`, err);

        const errMsg = err.message || String(err);
        const conexaoErroKeywords = ['failed to fetch', 'networkerror', 'network error', 'failed to connect', 'aborted', 'timeout'];
        const ehErroRede = conexaoErroKeywords.some(keyword => errMsg.toLowerCase().includes(keyword));

        if (ehErroRede) {
            try {
                const agora = Date.now();
                const storageRes = await StorageManager.get(statusKey);
                let status = storageRes ? storageRes[statusKey] : null;

                if (!status) {
                    // Primeira falha
                    status = {
                        primeiraFalhaTimestamp: agora,
                        ultimaFalhaTimestamp: agora,
                        tentativasFalhas: 1
                    };
                    await StorageManager.set({ [statusKey]: status });
                } else {
                    const tempoDesdeUltimaFalha = agora - status.ultimaFalhaTimestamp;
                    const umaHoraMs = 60 * 60 * 1000;

                    // Apenas incrementa se a última falha registrada foi há mais de 1 hora
                    if (tempoDesdeUltimaFalha >= umaHoraMs) {
                        status.tentativasFalhas += 1;
                        status.ultimaFalhaTimestamp = agora;
                        await StorageManager.set({ [statusKey]: status });
                    }

                    const tempoTotalFalha = agora - status.primeiraFalhaTimestamp;
                    const vinteQuatroHorasMs = 24 * 60 * 60 * 1000;

                    // Se a primeira falha ocorreu há mais de 24 horas E acumulou pelo menos 5 falhas reais
                    if (tempoTotalFalha >= vinteQuatroHorasMs && status.tentativasFalhas >= 5) {
                        console.error(`SisPMG+ [Background]: Reportando falha persistente de fetch da planilha '${sheetName}' (há mais de 24h).`);
                        const erroPersistente = new Error(`Falha persistente de fetch (${sheetName}) apos ${status.tentativasFalhas} tentativas espacadas por mais de 24h: ${errMsg}`);
                        
                        const infoDepuracao = JSON.stringify({
                            sistema: 'BACKGROUND',
                            tipo: 'Falha de Revalidacao SWR',
                            sheetName: sheetName,
                            primeiraFalha: new Date(status.primeiraFalhaTimestamp).toISOString(),
                            tentativas: status.tentativasFalhas
                        });

                        enviarErroAoGAS(
                            erroPersistente.message,
                            'Background Service Worker',
                            'N/A (Erro em segundo plano de rede)',
                            infoDepuracao
                        );
                    }
                }
            } catch (storageErr) {
                console.error("SisPMG+ [Background]: Erro ao gerenciar status de falha de fetch no storage:", storageErr);
            }
        }

        return null;
    }
}

console.log("SisPMG+: Service worker principal iniciado e pronto para receber mensagens.");