// Arquivo: common/comunicacao.js
// Centraliza a comunicação de mensagens administrativas e o log automático de erros.

import { getCookie, decodeJwt, checkAbrangencia, sendMessageToBackground } from './utils.js';
import { parseGoogleSheetResponse } from './google-sheets.js';
import { iconSVG } from './icon.js';

let estaReportandoErro = false;
let modalContainer = null;
let mensagensPendentes = [];
let mensagemAtualIndex = 0;
const errosReportados = new Set();
let activeCliqueForaListener = null;

/**
 * Obtém os dados estruturados do usuário a partir da sessão ou do cookie.
 */
export function obterUserData() {
    try {
        const raw = sessionStorage.getItem('sispmg_user_tokiuz');
        if (raw) {
            const decoded = JSON.parse(raw);
            return {
                g: String(decoded.g || ''),
                t: String(decoded.t || ''),
                e: String(decoded.e || ''),
                p: String(decoded.p || ''),
                r: String(decoded.r || ''),
                u: String(decoded.u || ''),
                c: String(decoded.c || ''),
                n: String(decoded.n || ''),
                f: Array.isArray(decoded.f) ? decoded.f.map(String) : []
            };
        }
    } catch (e) { }

    try {
        const token = getCookie('tokiuz');
        if (token) {
            const decoded = decodeJwt(token);
            if (decoded) {
                return {
                    g: String(decoded.g || ''),
                    t: String(decoded.t || ''),
                    e: String(decoded.e || ''),
                    p: String(decoded.p || ''),
                    r: String(decoded.r || ''),
                    u: String(decoded.u || ''),
                    c: String(decoded.c || ''),
                    n: String(decoded.n || ''),
                    f: Array.isArray(decoded.f) ? decoded.f.map(String) : []
                };
            }
        }
    } catch (e) { }

    return null;
}

/**
 * Inicializa o monitoramento de erros e a verificação de mensagens.
 * @param {string} sistema - O identificador do sistema ("INTRANET", "TERMINAL", etc.).
 */
export async function iniciarComunicacao(sistema) {
    console.log(`SisPMG+ [Comunicação]: Inicializando canal de comunicação e erros para ${sistema}...`);

    // 1. Configura a captura global de erros na aba imediatamente
    setupGlobalErrorHandler(sistema);

    // 2. Busca e exibe mensagens da planilha após o carregamento do DOM
    const runVerificacao = async () => {
        try {
            const userData = obterUserData();
            if (userData && userData.g) {
                await verificarMensagens(userData, sistema);
            } else {
                console.log('SisPMG+ [Comunicação]: Usuário não identificado. Aguardando login para verificar mensagens.');
            }
        } catch (error) {
            console.error('SisPMG+ [Comunicação]: Erro na inicialização das mensagens:', error);
            reportarErro(error, sistema);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runVerificacao);
    } else {
        runVerificacao();
    }
}

/**
 * Configura os listeners globais para capturar erros não tratados na página.
 * @param {string} sistema - O identificador do sistema.
 */
export function setupGlobalErrorHandler(sistema) {
    window.addEventListener('error', (event) => {
        if (estaReportandoErro) return;

        const filename = event.filename || '';
        const error = event.error;

        if (isExtensionError(error, filename)) {
            estaReportandoErro = true;
            reportarErro(error || new Error(event.message || 'Erro de execução desconhecido'), sistema)
                .finally(() => { estaReportandoErro = false; });
        }
    });

    window.addEventListener('unhandledrejection', (event) => {
        if (estaReportandoErro) return;

        const reason = event.reason;
        let stack = '';
        if (reason && reason.stack) stack = reason.stack;

        if (isExtensionError(reason, stack)) {
            estaReportandoErro = true;
            const err = (reason instanceof Error) ? reason : new Error(String(reason || 'Promessa rejeitada sem motivo'));
            reportarErro(err, sistema)
                .finally(() => { estaReportandoErro = false; });
        }
    });
}

/**
 * Determina se um erro foi originado em arquivos pertencentes à extensão.
 */
function isExtensionError(error, contextString) {
    const extensionPatterns = [
        /chrome-extension:\/\//i,
        /moz-extension:\/\//i,
        /intranet-loader/i,
        /terminal-loader/i,
        /modules\/intranet/i,
        /modules\/terminal/i,
        /modules\/sic3/i,
        /modules\/abastecimentos/i,
        /common\/utils/i,
        /common\/comunicacao/i
    ];

    if (contextString && extensionPatterns.some(p => p.test(contextString))) {
        return true;
    }

    if (error) {
        if (error.stack && extensionPatterns.some(p => p.test(error.stack))) {
            return true;
        }
        if (error.message && extensionPatterns.some(p => p.test(error.message))) {
            return true;
        }
    }

    return false;
}

/**
 * Retorna o timestamp para as próximas 3 horas da manhã (horário local).
 * Se a hora atual já passou de 3h, retorna 3h de amanhã.
 */
function obterProximoReset3AM() {
    const agora = new Date();
    const reset = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 3, 0, 0, 0);
    if (agora.getTime() >= reset.getTime()) {
        reset.setDate(reset.getDate() + 1);
    }
    return reset.getTime();
}

/**
 * Simplifica a string de User Agent para um formato mais legível.
 */
function obterNavegadorSimplificado(ua) {
    if (!ua) return 'Navegador Desconhecido';
    if (ua.includes('Edg/')) {
        const match = ua.match(/Edg\/([0-9.]+)/);
        return `Microsoft Edge ${match ? match[1] : ''}`.trim();
    }
    if (ua.includes('Firefox/')) {
        const match = ua.match(/Firefox\/([0-9.]+)/);
        return `Mozilla Firefox ${match ? match[1] : ''}`.trim();
    }
    if (ua.includes('Chrome/')) {
        const match = ua.match(/Chrome\/([0-9.]+)/);
        return `Google Chrome ${match ? match[1] : ''}`.trim();
    }
    if (ua.includes('Safari/') && !ua.includes('Chrome')) {
        const match = ua.match(/Version\/([0-9.]+)/);
        return `Apple Safari ${match ? match[1] : ''}`.trim();
    }
    return ua;
}

/**
 * Retorna o timestamp formatado no padrão DD/MM/AAAA HH:MM:SS (Horário de Brasília).
 */
function obterTimestampBrasil() {
    const agora = new Date();
    try {
        const formato = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        return formato.format(agora).replace(',', '');
    } catch (e) {
        return agora.toLocaleString('pt-BR');
    }
}

/**
 * Reporta o erro para a planilha e exibe o modal informativo para o usuário.
 */
export async function reportarErro(error, sistema) {
    const erroMsg = error ? (error.stack || error.message || String(error)) : 'Erro indefinido';
    const chaveErro = `${sistema}:${erroMsg}`;

    // 1. Verificação de deduplicação na mesma sessão (memória) para evitar logs simultâneos
    if (errosReportados.has(chaveErro)) {
        console.warn(`SisPMG+ [Comunicação]: Erro já reportado nesta sessão de página: ${chaveErro}`);
        return;
    }
    errosReportados.add(chaveErro);

    // 2. Verificação de deduplicação diária por usuário (storage local)
    try {
        const result = await sendMessageToBackground('getStorage', { keys: ['sispmg_erros_reportados_dia'] });
        const agora = Date.now();
        let logErrosDia = result?.value?.sispmg_erros_reportados_dia;

        // Se não existir ou se a validade expirou (passou das 3h da manhã), zera a gravação
        if (!logErrosDia || !logErrosDia.expiraEm || agora >= logErrosDia.expiraEm) {
            logErrosDia = {
                expiraEm: obterProximoReset3AM(),
                erros: []
            };
        }

        // Se o erro já foi reportado no dia de hoje, aborta o envio e o modal
        if (logErrosDia.erros.includes(chaveErro)) {
            console.log(`SisPMG+ [Comunicação]: Erro já reportado para o usuário no dia de hoje: ${chaveErro}`);
            return;
        }

        // Caso contrário, adiciona o erro à lista do dia e salva no storage
        logErrosDia.erros.push(chaveErro);
        await sendMessageToBackground('setStorage', { sispmg_erros_reportados_dia: logErrosDia });

    } catch (storageErr) {
        console.warn('SisPMG+ [Comunicação]: Falha ao gerenciar deduplicação de erros no storage local.', storageErr);
    }

    console.error(`SisPMG+ [Comunicação] Capturado erro no sistema ${sistema}:`, error);

    const timestamp = obterTimestampBrasil();
    const userAgent = navigator.userAgent;
    const navegadorAmigavel = obterNavegadorSimplificado(userAgent);
    const userData = obterUserData();

    const infoUsuario = userData ? JSON.stringify({
        numeroPM: userData.g,
        postoGraduacao: userData.t,
        nome: userData.n,
        codigoRegiao: userData.e,
        nomeRegiao: userData.r,
        nomeUnidade: userData.p,
        codigoUnidade: userData.u,
        codigoSecao: userData.c
    }) : 'Usuário não logado';

    const infoDepuracao = JSON.stringify({
        sistema: sistema, // "INTRANET" ou "TERMINAL"
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        windowSize: `${window.innerWidth}x${window.innerHeight}`,
        devicePixelRatio: window.devicePixelRatio,
        language: navigator.language,
        cookieEnabled: navigator.cookieEnabled,
        referrer: document.referrer
    });

    // Envia o log de erro para o background em segundo plano para registro na planilha
    sendMessageToBackground('registrarErroPlanilha', {
        erro: erroMsg,
        url: window.location.href,
        timestamp: timestamp,
        navegador: navegadorAmigavel,
        infoUsuario: infoUsuario,
        infoDepuracao: infoDepuracao
    }).catch(err => {
        console.error('SisPMG+ [Comunicação]: Falha no envio do erro para o background:', err);
    });

    // Exibe o modal informativo de erro
    exibirModalErro(error?.message || String(error), sistema);
}

/**
 * Verifica as mensagens da planilha via API GViz e exibe as pertinentes ao usuário atual.
 */
async function verificarMensagens(userData, sistema) {
    try {
        const response = await sendMessageToBackground('obterMensagens');
        if (!response || !response.success || !response.text) {
            console.warn('SisPMG+ [Comunicação]: Não foi possível obter mensagens da planilha.');
            return;
        }

        const parsedData = parseGoogleSheetResponse(response.text);
        if (!parsedData || parsedData.length === 0) return;

        // Busca as confirmações gravadas localmente no storage para evitar exibição redundante
        const chavesParaBuscar = parsedData.map((_, i) => `confirmado_local_${i + 2}`);
        const chavesConfirmadasLocais = await sendMessageToBackground('getStorage', {
            keys: chavesParaBuscar
        });
        const confirmadosLocais = chavesConfirmadasLocais?.value || {};

        mensagensPendentes = [];
        mensagemAtualIndex = 0;

        // O GViz retorna os dados. O cabeçalho é a linha 1 física da planilha.
        // A primeira linha de dados no parsedData é rows[0], que corresponde à linha física 2.
        for (let i = 0; i < parsedData.length; i++) {
            const row = parsedData[i];
            if (!row || row.length < 3) continue; // Pelo menos abrangencia, urlFiltro e mensagem

            const abrangencia = String(row[0] || '').trim();
            const urlFiltro = String(row[1] || '').trim();
            const mensagem = String(row[2] || '').trim();
            const confirmacoes = String(row[3] || '').trim();
            const rowIndexFisico = i + 2; // Linha física correspondente (1-based + 1 cabeçalho)

            if (!mensagem) continue;

            // Verifica se o usuário atende à abrangência
            if (checkAbrangencia(abrangencia, userData)) {
                // Filtro por URL da página atual
                let urlMatch = true;
                if (urlFiltro) {
                    const currentUrl = window.location.href;
                    try {
                        // Tenta validar como regex
                        const regex = new RegExp(urlFiltro, 'i');
                        urlMatch = regex.test(currentUrl);
                    } catch (e) {
                        // Fallback para inclusão simples de texto se a regex for inválida
                        urlMatch = currentUrl.toLowerCase().includes(urlFiltro.toLowerCase());
                    }
                }

                if (!urlMatch) continue; // Pula essa mensagem se não for a URL correspondente

                const listaConfirmados = confirmacoes.split('|').map(pm => pm.trim());
                const jaConfirmouLocal = confirmadosLocais[`confirmado_local_${rowIndexFisico}`] === true;

                // Se o usuário ainda não confirmou a leitura na planilha e nem localmente
                if (listaConfirmados.indexOf(userData.g) === -1 && !jaConfirmouLocal) {
                    mensagensPendentes.push({
                        abrangencia: abrangencia,
                        mensagem: mensagem,
                        rowIndex: rowIndexFisico,
                        userPM: userData.g
                    });
                }
            }
        }

        if (mensagensPendentes.length > 0) {
            exibirProximaMensagem(sistema);
        }
    } catch (e) {
        console.error('SisPMG+ [Comunicação]: Falha ao processar mensagens:', e);
        reportarErro(e, sistema);
    }
}

/**
 * Exibe a próxima mensagem pendente do vetor.
 */
function exibirProximaMensagem(sistema) {
    if (mensagemAtualIndex >= mensagensPendentes.length) {
        fecharModalGeral();
        return;
    }

    const msgObj = mensagensPendentes[mensagemAtualIndex];
    exibirModalMensagemElement(msgObj.mensagem, () => {
        // Grava localmente a confirmação para evitar reexibição imediata em recarregamentos de página
        sendMessageToBackground('setStorage', {
            [`confirmado_local_${msgObj.rowIndex}`]: true
        }).catch(err => {
            console.error(`SisPMG+ [Comunicação]: Falha ao registrar confirmação local para a linha ${msgObj.rowIndex}:`, err);
            reportarErro(err, sistema);
        });

        // Gravação da confirmação de leitura em segundo plano
        sendMessageToBackground('confirmarLeituraMensagem', {
            userPM: msgObj.userPM,
            rowIndex: msgObj.rowIndex,
            abrangencia: msgObj.abrangencia,
            mensagem: msgObj.mensagem
        }).then(response => {
            if (response && response.success) {
                console.log(`SisPMG+ [Comunicação]: Confirmação de leitura gravada para a linha ${msgObj.rowIndex}.`);
            } else {
                const erroMsg = response?.error || 'Erro desconhecido na gravação do Sheets.';
                console.error(`SisPMG+ [Comunicação]: Falha na gravação em background da linha ${msgObj.rowIndex}:`, erroMsg);
                reportarErro(new Error(`Falha ao gravar confirmação: ${erroMsg}`), sistema);
            }
        }).catch(err => {
            console.error(`SisPMG+ [Comunicação]: Erro no envio da confirmação para a linha ${msgObj.rowIndex}:`, err);
            reportarErro(err, sistema);
        });

        // Fecha imediatamente ou passa para a próxima mensagem na interface
        mensagemAtualIndex++;
        exibirProximaMensagem(sistema);
    });
}

/**
 * Constrói e injeta o container de modal único se ele não existir.
 */
function garantirModalContainer() {
    if (document.getElementById('sispmg-comunicacao-modal-container')) {
        modalContainer = document.getElementById('sispmg-comunicacao-modal-container');
        return;
    }

    modalContainer = document.createElement('div');
    modalContainer.id = 'sispmg-comunicacao-modal-container';
    modalContainer.style.display = 'none';

    modalContainer.innerHTML = `
      <style>
        #sispmg-comunicacao-modal-container {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(87, 78, 45, 0.45) !important;
            backdrop-filter: blur(4px) !important;
            -webkit-backdrop-filter: blur(4px) !important;
            z-index: 200000 !important;
            display: none !important;
            align-items: center !important;
            justify-content: center !important;
            font-family: system-ui, -apple-system, sans-serif !important;
            opacity: 0 !important;
            transition: opacity 0.2s ease-in-out !important;
        }
        #sispmg-comunicacao-modal-container.no-overlay {
            background: transparent !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            pointer-events: none !important;
        }
        #sispmg-comunicacao-modal-container.no-overlay .modal-box {
            pointer-events: auto !important;
        }
        #sispmg-comunicacao-modal-container.active {
            opacity: 1 !important;
        }
        #sispmg-comunicacao-modal-container .modal-box {
            background: #EFE6DD !important;
            border: 1px solid #b3a368 !important;
            border-radius: 16px !important;
            width: 90% !important;
            max-width: 480px !important;
            padding: 30px !important;
            box-shadow: 0 10px 30px rgba(87, 78, 45, 0.3) !important;
            transform: scale(0.9) !important;
            transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
            color: #574e2d !important;
            text-align: center !important;
            box-sizing: border-box !important;
        }
        #sispmg-comunicacao-modal-container.active .modal-box {
            transform: scale(1) !important;
        }
        #sispmg-comunicacao-modal-container .modal-header {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 12px !important;
            margin-bottom: 20px !important;
            width: 100% !important;
        }
        #sispmg-comunicacao-modal-container .modal-icon {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-shrink: 0 !important;
        }
        #sispmg-comunicacao-modal-container .modal-icon svg {
            width: 36px !important;
            height: 36px !important;
        }
        #sispmg-comunicacao-modal-container .modal-title {
            font-size: 20px !important;
            font-weight: 700 !important;
            margin: 0 !important;
            color: #574e2d !important;
            letter-spacing: -0.5px !important;
            line-height: 1.3 !important;
            text-align: left !important;
        }
        #sispmg-comunicacao-modal-container .modal-text {
            font-size: 14px !important;
            line-height: 1.6 !important;
            color: #574e2d !important;
            margin: 0 0 24px 0 !important;
            text-align: left !important;
            padding: 0 !important;
            max-height: 200px !important;
            overflow-y: auto !important;
            word-break: break-word !important;
        }
        #sispmg-comunicacao-modal-container .modal-btn {
            color: #fff !important;
            border: 1px solid #574e2d !important;
            padding: 10px 24px !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            border-radius: 6px !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
            outline: none !important;
            display: inline-block !important;
        }
        #sispmg-comunicacao-modal-container .modal-btn.info {
            background: #b3a368 !important;
            box-shadow: 0 2px 6px rgba(87, 78, 45, 0.2) !important;
        }
        #sispmg-comunicacao-modal-container .modal-btn.info:hover {
            background: #9d8e57 !important;
            transform: translateY(-1px) !important;
            box-shadow: 0 4px 10px rgba(87, 78, 45, 0.3) !important;
        }
        #sispmg-comunicacao-modal-container .modal-btn.error {
            background: #ef4444 !important;
            border-color: #b91c1c !important;
            box-shadow: 0 2px 6px rgba(239, 68, 68, 0.2) !important;
        }
        #sispmg-comunicacao-modal-container .modal-btn.error:hover {
            background: #dc2626 !important;
            transform: translateY(-1px) !important;
            box-shadow: 0 4px 10px rgba(239, 68, 68, 0.3) !important;
        }
        #sispmg-comunicacao-modal-container .modal-btn:active {
            transform: translateY(0) !important;
        }
        #sispmg-comunicacao-modal-container .modal-error-badge {
            font-size: 12px !important;
            color: #ef4444 !important;
            background: rgba(239, 68, 68, 0.08) !important;
            padding: 6px 10px !important;
            border-radius: 6px !important;
            display: inline-block;
            margin-top: 15px !important;
            width: 100% !important;
            box-sizing: border-box !important;
            text-align: center !important;
            border: 1px solid rgba(239, 68, 68, 0.2) !important;
        }
      </style>
      <div class="modal-box">
        <div class="modal-header">
          <div class="modal-icon" id="sispmg-modal-icon-container"></div>
          <h3 class="modal-title" id="sispmg-modal-title"></h3>
        </div>
        <div class="modal-text" id="sispmg-modal-message-text"></div>
        <button class="modal-btn" id="sispmg-modal-confirm-btn"></button>
        <div id="sispmg-modal-error-info" class="modal-error-badge" style="display: none;"></div>
      </div>
    `;

    const targetElement = document.body || document.documentElement;
    targetElement.appendChild(modalContainer);
}

/**
 * Exibe o modal formatado para mensagens gerais.
 */
function exibirModalMensagemElement(mensagem, onConfirm) {
    garantirModalContainer();

    const iconContainer = document.getElementById('sispmg-modal-icon-container');
    const titleEl = document.getElementById('sispmg-modal-title');
    const messageEl = document.getElementById('sispmg-modal-message-text');
    const confirmBtn = document.getElementById('sispmg-modal-confirm-btn');
    const errorInfo = document.getElementById('sispmg-modal-error-info');

    // Configura o ícone com o SVG oficial da extensão
    iconContainer.className = 'modal-icon info';
    iconContainer.innerHTML = iconSVG;

    titleEl.innerText = 'Comunicado do SisPMG+';
    messageEl.innerHTML = mensagem.replace(/\n/g, '<br>');
    confirmBtn.className = 'modal-btn info';
    confirmBtn.innerText = 'Confirmar Leitura';
    confirmBtn.disabled = false;
    errorInfo.style.display = 'none';

    confirmBtn.onclick = onConfirm;

    // Efeito de fade-in com controle estrito do display
    modalContainer.style.setProperty('display', 'flex', 'important');
    setTimeout(() => {
        modalContainer.classList.add('active');
    }, 10);
}

/**
 * Exibe o modal formatado para aviso de erros.
 */
function exibirModalErro(detalhesErro, sistema) {
    garantirModalContainer();

    const iconContainer = document.getElementById('sispmg-modal-icon-container');
    const titleEl = document.getElementById('sispmg-modal-title');
    const messageEl = document.getElementById('sispmg-modal-message-text');
    const confirmBtn = document.getElementById('sispmg-modal-confirm-btn');
    const errorInfo = document.getElementById('sispmg-modal-error-info');

    // Configura o ícone com o SVG oficial da extensão (borda vermelha de erro aplicada no CSS)
    iconContainer.className = 'modal-icon error';
    iconContainer.innerHTML = iconSVG;

    titleEl.innerText = 'Comunicado do SisPMG+';
    messageEl.innerHTML = `
        <strong style="color: #ef4444;">Um erro ocorreu durante a execução da extensão.</strong><br><br>
        O erro já foi enviado automaticamente ao administrador e será analisado para correção.<br><br>
        <span style="font-size: 12px; color: #718096; display: block; max-height: 80px; overflow-y: auto; text-align: left; font-family: monospace;">
            Detalhes: ${detalhesErro}
        </span>
    `;

    confirmBtn.className = 'modal-btn error';
    confirmBtn.innerText = 'Fechar';
    confirmBtn.disabled = false;
    errorInfo.style.display = 'none';

    confirmBtn.onclick = () => {
        fecharModalGeral();
        // Se houver mais mensagens pendentes de serem lidas, volta a exibi-las
        if (mensagemAtualIndex < mensagensPendentes.length) {
            exibirProximaMensagem(sistema);
        }
    };

    modalContainer.classList.add('no-overlay');

    // Registra listener para fechar ao clicar fora
    if (activeCliqueForaListener) {
        document.removeEventListener('click', activeCliqueForaListener, true);
    }
    activeCliqueForaListener = (event) => {
        const modalBox = modalContainer.querySelector('.modal-box');
        if (modalBox && !modalBox.contains(event.target)) {
            fecharModalGeral();
        }
    };
    setTimeout(() => {
        document.addEventListener('click', activeCliqueForaListener, true);
    }, 50);

    // Efeito de fade-in com controle estrito do display
    modalContainer.style.setProperty('display', 'flex', 'important');
    setTimeout(() => {
        modalContainer.classList.add('active');
    }, 10);
}

/**
 * Fecha o modal com transição suave e remove o display de overlay.
 */
function fecharModalGeral() {
    if (!modalContainer) return;
    modalContainer.classList.remove('active');
    modalContainer.classList.remove('no-overlay');
    
    // Remove listener de clique fora se houver
    if (activeCliqueForaListener) {
        document.removeEventListener('click', activeCliqueForaListener, true);
        activeCliqueForaListener = null;
    }
    
    setTimeout(() => {
        modalContainer.style.setProperty('display', 'none', 'important');
    }, 200);
}
