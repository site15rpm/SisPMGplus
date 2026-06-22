// Arquivo: common/comunicacao.js
// Centraliza a comunicação de mensagens administrativas e o log automático de erros.

import { getCookie, decodeJwt, checkAbrangencia, sendMessageToBackground } from './utils.js';
import { parseGoogleSheetResponse } from './google-sheets.js';
import { iconSVG } from './icon.js';

let estaReportandoErro = false;
let modalContainer = null;
let mensagensPendentes = [];
let mensagemAtualIndex = 0;

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
    } catch (e) {}

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
    } catch (e) {}

    return null;
}

/**
 * Inicializa o monitoramento de erros e a verificação de mensagens.
 * @param {string} sistema - O identificador do sistema ("INTRANET", "TERMINAL", etc.).
 */
export async function iniciarComunicacao(sistema) {
    console.log(`SisPMG+ [Comunicação]: Inicializando canal de comunicação e erros para ${sistema}...`);
    
    // 1. Configura a captura global de erros na aba
    setupGlobalErrorHandler(sistema);

    // 2. Busca e exibe mensagens da planilha
    try {
        const userData = obterUserData();
        if (userData && userData.g) {
            await verificarMensagens(userData);
        } else {
            console.log('SisPMG+ [Comunicação]: Usuário não identificado. Aguardando login para verificar mensagens.');
        }
    } catch (error) {
        console.error('SisPMG+ [Comunicação]: Erro na inicialização das mensagens:', error);
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
 * Reporta o erro para a planilha e exibe o modal informativo para o usuário.
 */
export async function reportarErro(error, sistema) {
    console.error(`SisPMG+ [Comunicação] Capturado erro no sistema ${sistema}:`, error);

    const timestamp = new Date().toISOString();
    const userAgent = navigator.userAgent;
    const userData = obterUserData();

    const erroMsg = error ? (error.stack || error.message || String(error)) : 'Erro indefinido';
    const pm = userData ? userData.g : 'Desconhecido';
    
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

    const infoSistema = JSON.stringify({
        url: window.location.href,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        windowSize: `${window.innerWidth}x${window.innerHeight}`,
        devicePixelRatio: window.devicePixelRatio
    });

    // Envia o log de erro para o background em segundo plano para registro na planilha
    sendMessageToBackground('registrarErroPlanilha', {
        erro: erroMsg,
        sistema: sistema,
        pm: pm,
        timestamp: timestamp,
        navegador: userAgent,
        infoUsuario: infoUsuario,
        infoSistema: infoSistema
    }).catch(err => {
        console.error('SisPMG+ [Comunicação]: Falha no envio do erro para o background:', err);
    });

    // Exibe o modal informativo de erro
    exibirModalErro(error?.message || String(error));
}

/**
 * Verifica as mensagens da planilha via API GViz e exibe as pertinentes ao usuário atual.
 */
async function verificarMensagens(userData) {
    try {
        const response = await sendMessageToBackground('obterMensagens');
        if (!response || !response.success || !response.text) {
            console.warn('SisPMG+ [Comunicação]: Não foi possível obter mensagens da planilha.');
            return;
        }

        const parsedData = parseGoogleSheetResponse(response.text);
        if (!parsedData || parsedData.length === 0) return;

        mensagensPendentes = [];
        mensagemAtualIndex = 0;

        // O GViz retorna os dados. O cabeçalho é a linha 1 física da planilha.
        // A primeira linha de dados no parsedData é rows[0], que corresponde à linha física 2.
        for (let i = 0; i < parsedData.length; i++) {
            const row = parsedData[i];
            if (!row || row.length < 2) continue;

            const abrangencia = String(row[0] || '').trim();
            const mensagem = String(row[1] || '').trim();
            const confirmacoes = String(row[2] || '').trim();
            const rowIndexFisico = i + 2; // Linha física correspondente (1-based + 1 cabeçalho)

            if (!mensagem) continue;

            // Verifica se o usuário atende à abrangência
            if (checkAbrangencia(abrangencia, userData)) {
                const listaConfirmados = confirmacoes.split('|').map(pm => pm.trim());
                // Se o usuário ainda não confirmou a leitura
                if (listaConfirmados.indexOf(userData.g) === -1) {
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
            exibirProximaMensagem();
        }
    } catch (e) {
        console.error('SisPMG+ [Comunicação]: Falha ao processar mensagens:', e);
    }
}

/**
 * Exibe a próxima mensagem pendente do vetor.
 */
function exibirProximaMensagem() {
    if (mensagemAtualIndex >= mensagensPendentes.length) {
        fecharModalGeral();
        return;
    }

    const msgObj = mensagensPendentes[mensagemAtualIndex];
    exibirModalMensagemElement(msgObj.mensagem, async () => {
        // Callback executado ao clicar no botão de confirmação
        try {
            const confirmBtn = document.getElementById('sispmg-modal-confirm-btn');
            if (confirmBtn) {
                confirmBtn.disabled = true;
                confirmBtn.innerText = 'Gravando...';
            }

            const response = await sendMessageToBackground('confirmarLeituraMensagem', {
                userPM: msgObj.userPM,
                rowIndex: msgObj.rowIndex,
                abrangencia: msgObj.abrangencia,
                mensagem: msgObj.mensagem
            });

            if (response && response.success) {
                console.log(`SisPMG+ [Comunicação]: Confirmação de leitura gravada para a linha ${msgObj.rowIndex}.`);
                mensagemAtualIndex++;
                exibirProximaMensagem();
            } else {
                throw new Error(response?.error || 'Erro na gravação.');
            }
        } catch (err) {
            console.error('SisPMG+ [Comunicação]: Erro ao gravar confirmação de leitura:', err);
            const errorBadge = document.getElementById('sispmg-modal-error-info');
            if (errorBadge) {
                errorBadge.innerText = 'Falha ao gravar confirmação. Tente novamente.';
                errorBadge.style.display = 'block';
            }
            const confirmBtn = document.getElementById('sispmg-modal-confirm-btn');
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerText = 'Confirmar Leitura';
            }
        }
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
            background: rgba(10, 10, 15, 0.75) !important;
            backdrop-filter: blur(8px) !important;
            -webkit-backdrop-filter: blur(8px) !important;
            z-index: 200000 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-family: system-ui, -apple-system, sans-serif !important;
            opacity: 0 !important;
            transition: opacity 0.3s ease !important;
        }
        #sispmg-comunicacao-modal-container.active {
            opacity: 1 !important;
        }
        #sispmg-comunicacao-modal-container .modal-box {
            background: #121214 !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            border-radius: 16px !important;
            width: 90% !important;
            max-width: 480px !important;
            padding: 30px !important;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6) !important;
            transform: scale(0.9) !important;
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
            color: #f1f1f7 !important;
            text-align: center !important;
            box-sizing: border-box !important;
        }
        #sispmg-comunicacao-modal-container.active .modal-box {
            transform: scale(1) !important;
        }
        #sispmg-comunicacao-modal-container .modal-icon {
            width: 64px !important;
            height: 64px !important;
            margin: 0 auto 20px auto !important;
            border-radius: 50% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3) !important;
            transition: all 0.3s ease !important;
        }
        #sispmg-comunicacao-modal-container .modal-icon.info {
            background: linear-gradient(135deg, #2563eb, #7c3aed) !important;
            box-shadow: 0 8px 16px rgba(124, 58, 237, 0.3) !important;
        }
        #sispmg-comunicacao-modal-container .modal-icon.error {
            background: linear-gradient(135deg, #ef4444, #b91c1c) !important;
            box-shadow: 0 8px 16px rgba(239, 68, 68, 0.3) !important;
        }
        #sispmg-comunicacao-modal-container .modal-icon svg {
            width: 32px !important;
            height: 32px !important;
            fill: #fff !important;
        }
        #sispmg-comunicacao-modal-container .modal-title {
            font-size: 20px !important;
            font-weight: 700 !important;
            margin: 0 0 12px 0 !important;
            color: #fff !important;
            letter-spacing: -0.5px !important;
            line-height: 1.3 !important;
        }
        #sispmg-comunicacao-modal-container .modal-text {
            font-size: 14px !important;
            line-height: 1.6 !important;
            color: #a0aec0 !important;
            margin: 0 0 24px 0 !important;
            text-align: left !important;
            background: rgba(255, 255, 255, 0.03) !important;
            padding: 15px !important;
            border-radius: 8px !important;
            border: 1px solid rgba(255, 255, 255, 0.05) !important;
            max-height: 200px !important;
            overflow-y: auto !important;
            word-break: break-word !important;
        }
        #sispmg-comunicacao-modal-container .modal-btn {
            color: #fff !important;
            border: none !important;
            padding: 12px 30px !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            border-radius: 8px !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
            outline: none !important;
            display: inline-block !important;
        }
        #sispmg-comunicacao-modal-container .modal-btn.info {
            background: linear-gradient(135deg, #2563eb, #7c3aed) !important;
            box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3) !important;
        }
        #sispmg-comunicacao-modal-container .modal-btn.info:hover {
            transform: translateY(-2px) !important;
            box-shadow: 0 6px 16px rgba(124, 58, 237, 0.4) !important;
            filter: brightness(1.1) !important;
        }
        #sispmg-comunicacao-modal-container .modal-btn.error {
            background: #ef4444 !important;
            box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3) !important;
        }
        #sispmg-comunicacao-modal-container .modal-btn.error:hover {
            transform: translateY(-2px) !important;
            box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4) !important;
            filter: brightness(1.1) !important;
        }
        #sispmg-comunicacao-modal-container .modal-btn:active {
            transform: translateY(0) !important;
        }
        #sispmg-comunicacao-modal-container .modal-error-badge {
            font-size: 12px !important;
            color: #ef4444 !important;
            background: rgba(239, 68, 68, 0.1) !important;
            padding: 6px 10px !important;
            border-radius: 6px !important;
            display: inline-block !important;
            margin-top: 15px !important;
            width: 100% !important;
            box-sizing: border-box !important;
            text-align: center !important;
            border: 1px solid rgba(239, 68, 68, 0.2) !important;
        }
      </style>
      <div class="modal-box">
        <div class="modal-icon" id="sispmg-modal-icon-container"></div>
        <h3 class="modal-title" id="sispmg-modal-title"></h3>
        <div class="modal-text" id="sispmg-modal-message-text"></div>
        <button class="modal-btn" id="sispmg-modal-confirm-btn"></button>
        <div id="sispmg-modal-error-info" class="modal-error-badge" style="display: none;"></div>
      </div>
    `;

    document.body.appendChild(modalContainer);
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

    // Configura o ícone e cores para mensagem
    iconContainer.className = 'modal-icon info';
    iconContainer.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
    `;

    titleEl.innerText = 'Comunicado Administrativo';
    messageEl.innerHTML = mensagem.replace(/\n/g, '<br>');
    confirmBtn.className = 'modal-btn info';
    confirmBtn.innerText = 'Confirmar Leitura';
    confirmBtn.disabled = false;
    errorInfo.style.display = 'none';

    confirmBtn.onclick = onConfirm;

    // Efeito de fade-in
    modalContainer.style.display = 'flex';
    // Pequeno timeout para disparar transição de CSS
    setTimeout(() => {
        modalContainer.classList.add('active');
    }, 10);
}

/**
 * Exibe o modal formatado para aviso de erros.
 */
function exibirModalErro(detalhesErro) {
    garantirModalContainer();

    const iconContainer = document.getElementById('sispmg-modal-icon-container');
    const titleEl = document.getElementById('sispmg-modal-title');
    const messageEl = document.getElementById('sispmg-modal-message-text');
    const confirmBtn = document.getElementById('sispmg-modal-confirm-btn');
    const errorInfo = document.getElementById('sispmg-modal-error-info');

    // Configura o ícone e cores para erro
    iconContainer.className = 'modal-icon error';
    iconContainer.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 12 10 10-4.48 10-12S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
    `;

    titleEl.innerText = 'Ocorreu um Erro Inesperado';
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
            exibirProximaMensagem();
        }
    };

    // Efeito de fade-in
    modalContainer.style.display = 'flex';
    setTimeout(() => {
        modalContainer.classList.add('active');
    }, 10);
}

/**
 * Fecha o modal com transição suave.
 */
function fecharModalGeral() {
    if (!modalContainer) return;
    modalContainer.classList.remove('active');
    setTimeout(() => {
        modalContainer.style.display = 'none';
    }, 300);
}
