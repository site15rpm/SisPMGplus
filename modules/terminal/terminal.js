// Arquivo: modules/terminal/terminal.js
// Define a classe principal TerminalModule e anexa os métodos modularizados de outros arquivos.

import { initUI } from './terminal-ui.js';
import { initLogin } from './terminal-login.js';
import { initRotinas } from './terminal-rotinas.js';
import { initActions } from './terminal-actions.js';
import { initFileSystem } from './terminal-file-system.js';
import { UiBuilder } from './terminal-ui-builder.js';

// Definição da classe principal com suas propriedades de estado.
export class TerminalModule {
    constructor(term, config) {
        this.term = term;
        this.config = config;
        this.iconSVG = config.iconSVG; // Ícone recebido do loader
        this.rotinas = { public: {}, user: {} };
        this.messageCallbacks = new Map();
        
        // Estado de Comunicação Inter-Abas
        this.tabAlias = null;
        this.pendingCrossTabExecutions = new Map();
        this.executionReturnValue = undefined; // Valor a ser retornado bidirecionalmente
        this.autoLoginSystem = null; // Instrução de auto-login recebida do background
        this.isTerminalReadyForRoutines = false; // Flag crucial para roteamento seguro
        this.isRemoteExecution = false; // Indica se a rotina atual foi acionada remotamente
        this.closeRequestedDuringRemote = false; // Flag para adiar fechamento da aba

        this.userPM = null;
        this.isLoggedIn = false;
        this.loginFlowActive = false;
        this.isMonitoringPausedForManualLogin = false;
        this.showHiddenFiles = false;
        this.reloginInProgress = false;

        this.isSpying = false;
        this.spyListener = null;

        this.isRecording = false;
        this.isRecordingPaused = false;
        this.recordedActions = [];
        this.recordingListener = null;
        this.textBuffer = '';

        this.rotinaState = 'stopped'; // 'stopped', 'running', 'paused'
        this.currentRotinaProcessor = null;
        this.currentRotinaInfo = null; // Armazena info da rotina em execução
        this.testingModal = null;
        this.lastTestData = null;
        this.editAfterTest = false;
        
        this.rotinaStepDelay = 0.2;
        
        this.screenMonitorInterval = null;
        this.screenMonitorListener = null;

        this.sessionDisabledAutoRun = [];
        this.timedDisabledAutoRun = {};
        this.waitingForAutoRunTrigger = [];

        // --- SISTEMA DE KEEP-ALIVE ---
        this.inactivityTimer = null;
        this._keepAliveEventsAttached = false;
        
        this.notificationQueue = [];
        this.isNotificationVisible = false;

        this.keyMap = {
            'ENTER': '\r', 'TAB': '\t', 'ESCAPE': '\x1b', 'LIMPAR': '\x15',
            'BACKSPACE': '\x7f', 'DELETE': '\x1b[3~', 'INSERT': '\x1b[2~',
            'SUBIR': '\x1bOA', 'DESCER': '\x1bOB', 'DIREITA': '\x1bOC', 'ESQUERDA': '\x1bOD',
            'HOME': '\x1bOH', 'END': '\x1bOF', 'BACKTAB': '\x01\t',
            'PF1': '\x1bOP', 'PF2': '\x1bOQ', 'PF3': '\x1bOR', 'PF4': '\x1bOS',
            'PF5': '\x1b[15~', 'PF6': '\x1b[17~', 'PF7': '\x1b[18~', 'PF8': '\x1b[19~',
            'PF9': '\x1b[20~', 'PF10': '\x1b[21~', 'PF11': '\x1b[23~', 'PF12': '\x1b[24~',
            'PF13': '\x01\x1bOP', 'PF14': '\x01\x1bOQ', 'PF15': '\x01\x1bOR', 'PF16': '\x01\x1bOS',
            'PF17': '\x01\x1b[17~', 'PF18': '\x01\x1b[17~', 'PF19': '\x01\x1b[18~', 'PF20': '\x01\x1b[19~',
            'PF21': '\x01\x1b[20~', 'PF22': '\x01\x1b[21~', 'PF23': '\x01\x1b[23~', 'PF24': '\x01\x1b[24~',
            'PA1': '\x011', 'PA2': '\x012', 'PA3': '\x013', 'CLICK': null 
        };

        initUI(this);
        initLogin(this);
        initRotinas(this);
        initActions(this);
        initFileSystem(this);
        
        this.setupResponseListener();
    }

    async init() {
        // Solicita e inicializa o Alias desta aba para roteamento de comandos
        const response = await this.sendMessagePromise('requestAlias');
        if (response && response.success) {
            this.tabAlias = response.alias;
            // Se o background informou que esta aba nasceu para abrir um sistema específico
            if (response.autoLoginSystem) {
                this.autoLoginSystem = response.autoLoginSystem;
            }
            console.log(`SisPMG+ [Terminal]: Alias inter-abas registrado: [${this.tabAlias}]`);
            this.updateAliasBadge();
        }

        // Verifica se há dados vindos da Intranet para processamento automático
        await this.checkForIntranetData();

        this.createPreLoginUI();
        this.startGlobalScreenMonitor();
    }

    async checkForIntranetData() {
        try {
            const data = await this.getStorage([
                'sispmg_intranet_notas_data',
                'sispmg_terminal_routine',
                'sispmg_terminal_param'
            ]);

            if (data.sispmg_intranet_notas_data && data.sispmg_terminal_routine === 'public/SIEP_Notas') {
                console.log('SisPMG+: Dados de notas detectados no storage. Ativando auto-login SIEP.');
                this.autoLoginSystem = 'SIEP';
                
                // Aguarda o terminal estar logado e pronto
                this.waitForSystemReady().then(async () => {
                    const notas = data.sispmg_intranet_notas_data;
                    const routine = data.sispmg_terminal_routine;
                    const param = data.sispmg_terminal_param;
                    
                    this.exibirNotificacao("Iniciando processamento automático de notas...", true);
                    
                    try {
                        await this.executarRotina(routine, { 
                            parametros: { [param]: notas } 
                        });
                        this.exibirNotificacao("Processamento de notas concluído com sucesso!", true);
                    } catch (error) {
                        console.error("SisPMG+: Erro ao executar rotina de notas.", error);
                        this.exibirNotificacao(`Falha ao processar notas: ${error.message}`, false);
                    } finally {
                        // Limpa os dados do storage para evitar re-execução
                        await this.sendMessagePromise('removeStorage', { 
                            keys: ['sispmg_intranet_notas_data', 'sispmg_terminal_routine', 'sispmg_terminal_param'] 
                        });
                    }
                });
            }
        } catch (error) {
            console.error('SisPMG+: Erro ao verificar dados da Intranet.', error);
        }
    }

    updateAliasBadge() {
        const badges = document.querySelectorAll('.tab-alias-badge');
        badges.forEach(badge => badge.textContent = this.tabAlias || 'T?');
    }
    
    startGlobalScreenMonitor() {
        const initialRenderCheck = setInterval(() => {
            if (this.term && this.term.buffer.active.length > 1) {
                clearInterval(initialRenderCheck);
                
                this.screenMonitorListener = this.term.onWriteParsed(() => this.processScreenState());
                this.screenMonitorInterval = setInterval(() => this.processScreenState(), 300);
                this.term.onData(this.handleAutoRunTrigger.bind(this));
                this._setupCustomKeyHandlers();
                
                // Inicia o Keep-Alive globalmente assim que o emulador renderizar
                this._startKeepAlive();
                
                this.processScreenState();
            }
        }, 250);
    }
    
    _setupCustomKeyHandlers() {
        this.term.attachCustomKeyEventHandler((event) => {
            if (this.rotinaState !== 'stopped') {
                return true;
            }
    
            if (event.ctrlKey || event.altKey || event.metaKey) {
                return true;
            }

            if (event.type !== 'keydown') {
                return true;
            }
    
            if (event.key === '+' && event.location === 3) {
                this.term._core._onData.fire(this.keyMap['TAB']);
                event.preventDefault();
                return false;
            }
    
            if (event.key === '-' && event.location === 3) {
                this.term._core._onData.fire(this.keyMap['BACKTAB']);
                event.preventDefault();
                return false;
            }
    
            if (event.key === '/' && event.location === 3) {
                this.term._core._onData.fire(this.keyMap['PF7']);
                event.preventDefault();
                return false;
            }
    
            if (event.key === '*' && event.location === 3) {
                this.term._core._onData.fire(this.keyMap['PF8']);
                event.preventDefault();
                return false;
            }
            return true;
        });
    }

    handleAutoRunTrigger(data) {
        if (this.waitingForAutoRunTrigger.length === 0) return;

        setTimeout(() => {
            this.waitingForAutoRunTrigger = this.waitingForAutoRunTrigger.filter(item => {
                if (item.trigger === 'ANY_KEY') return false; 
                if (this.keyMap[item.trigger] === data) return false;
                return true;
            });
        }, 100);
    }

    async processScreenState() {
        if (this.rotinaState !== 'stopped' || this.isMonitoring) return;
        this.isMonitoring = true;

        try {
            if (this.isMonitoringPausedForManualLogin) {
                if (await this.localizarTexto("Logon executado com sucesso", { esperar: 0 })) {
                    if (this.passwordChangeFlowActive) {
                        this.passwordChangeFlowActive = false;
                        this.exibirNotificacao("Troca de senha detectada. Recarregando para novo login...", true);
                        setTimeout(() => this.reloadPage(), 2000);
                        return;
                    }

                    this.isLoggedIn = true;
                    this.reloginInProgress = false;
                    this.createFullMenu();
                    await this.loadRotinasFromCache();
                    this.isTerminalReadyForRoutines = true; // Libera execuções pendentes Inter-Abas
                    
                    if (!this.inactivityTimer) this._startKeepAlive();
                    
                    this.resumeScreenMonitoring();
                }
                return;
            }

            const fullScreenText = this.getFullScreenText(true);

            const senhaIncorretaPattern = /senha incorreta/i;
            if (senhaIncorretaPattern.test(fullScreenText)) {
                this._stopKeepAlive();
                await this.clearSavedPassword("incorreta");
                this.exibirNotificacao("Senha incorreta. A página será recarregada.", false);
                setTimeout(() => this.reloadPage(), 2000);
                return;
            }

            const reloadPatterns = [
                /conex.*com o mainframe encerrada/i,
                /press.*to reconnect/i
            ];
            
            for (const pattern of reloadPatterns) {
                if (pattern.test(fullScreenText)) {
                    this._stopKeepAlive();
                    this.exibirNotificacao("Conexão perdida. A página será recarregada.", false);
                    setTimeout(() => this.reloadPage(), 2000);
                    return;
                }
            }
            
            if (await this.localizarTexto(["Natural session terminated normally", "Session terminated. Please restart your session"], { esperar: 1, modo: 'qualquer'}) && !this.reloginInProgress) {
                if (this.selectedSystemName) {
                    this.reloginInProgress = true;
                    this.exibirNotificacao(`Sessão encerrada. Relogando em ${this.selectedSystemName}...`, true);
                    await this.digitar(this.selectedSystemName);
                    await this.teclar('ENTER');
                    await this.teclar('ENTER');
                    return;
                }
            }

            const isLoginState = await this.handleLoginScreen();

            // Garante que o Keep-Alive inicie/reinicie corretamente
            if (!this.inactivityTimer && this.rotinaState === 'stopped') {
                this._startKeepAlive();
            }

            if (!isLoginState && this.isLoggedIn) {
                await this.checkForAutoExecutarRotinas();
            }
        } finally {
            this.isMonitoring = false;
        }
    }

    // --- NOVA LÓGICA DE KEEP-ALIVE ---
    _startKeepAlive() {
        this._stopKeepAlive(); 

        const resetIdleTimer = () => {
            // Se uma rotina estiver rodando, paralisa o temporizador para não interferir
            if (this.rotinaState !== 'stopped') {
                if (this.inactivityTimer) {
                    clearTimeout(this.inactivityTimer);
                    this.inactivityTimer = null;
                }
                return;
            }
            
            if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
            
            // Define o intervalo para 15 segundos (15.000 ms) para evitar timeout do proxy/websocket
            this.inactivityTimer = setTimeout(() => {
                this._sendKeepAliveCommand();
            }, 240000); 
        };

        if (!this._keepAliveEventsAttached) {
            // O gatilho de inatividade agora é EXCLUSIVAMENTE vinculado ao evento de dados do Terminal
            if (this.term) {
                this.term.onData(() => resetIdleTimer());
            }
            this._keepAliveEventsAttached = true;
        }

        resetIdleTimer();
    }

    _sendKeepAliveCommand() {
        // Envia um ping incondicionalmente se houver ociosidade (e se não houver rotina rodando)
        if (this.rotinaState === 'stopped' && this.term && this.term._core) {
            console.log('SisPMG+ [KeepAlive]: Ociosidade no emulador detectada. Enviando Ping...');
            
            this.term._core._onData.fire(this.keyMap['PA1']);
            this.term._core._onData.fire('\x01r');
        }
        
        // Rearma o timer para o próximo ciclo de inatividade
        this._startKeepAlive();
    }

    _stopKeepAlive() {
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = null;
        }
    }
    // --- FIM DA LÓGICA DE KEEP-ALIVE ---

    openUiBuilder(textareaElement) {
        const builder = new UiBuilder(this, textareaElement);
        builder.open();
    }

    pauseAutomaticLoginMonitoring() {
        this.isMonitoringPausedForManualLogin = true;
    }

    resumeScreenMonitoring() {
        this.isMonitoringPausedForManualLogin = false;
        this.processScreenState();
    }

    async waitForSystemReady() {
        // Trava a execução Inter-Abas até o ambiente estar logado e rotinas carregadas
        let feedbackShown = false;
        let waitStartTime = Date.now();

        while (!this.isTerminalReadyForRoutines) {
            // Se demorar mais de 1 segundo e ainda não mostramos feedback, avisa o usuário
            if (!feedbackShown && (Date.now() - waitStartTime) > 1000) {
                this.showLoadingOverlay("Aguarde, carregando rotinas e ambiente...");
                feedbackShown = true;
            }
            await new Promise(resolve => setTimeout(resolve, 250));
        }

        if (feedbackShown) {
            this.hideLoadingOverlay();
        }
    }

    setupResponseListener() {
        window.addEventListener('message', (event) => {
            if (!event.data || typeof event.data !== 'object') return;

            // Responses geradas por requisições locais (getStorage, etc)
            if (event.data.type === 'SisPMG+:Response') {
                const { response, messageId } = event.data;
                if (this.messageCallbacks.has(messageId)) {
                    this.messageCallbacks.get(messageId)(response);
                    this.messageCallbacks.delete(messageId);
                }
            }

            // Comandos roteados do background (Inter-Abas)
            if (event.data.type === 'SisPMG+:FromBackground') {
                const { message } = event.data;

                if (message.type === 'EXECUTE_ROUTINE') {
                    console.log(`SisPMG+ [Terminal]: Recebida requisição da aba [${message.sourceAlias}] para rotina '${message.routineName}'. Aguardando terminal ficar pronto...`);
                    
                    // Impede falha por acionamento precoce em abas recém-criadas
                    this.waitForSystemReady().then(async () => {
                        console.log(`SisPMG+ [Terminal]: Sistema pronto. Executando rotina '${message.routineName}'.`);
                        this.executionReturnValue = undefined; // Reseta o valor de retorno
                        this.isRemoteExecution = true;
                        this.closeRequestedDuringRemote = false;

                        try {
                            // Executa a rotina internamente passando o customCode (se existir). 
                            // message.routineName é o nome ('Rotina_Dinamica_Remota' ou o caminho), message.customCode é o script literal puro.
                            const resultData = await this.executarRotina(message.routineName, { customCode: message.customCode, parametros: message.parametros });

                            // Notifica sucesso de volta para o Background rotear, incluindo dados caso o usuário tenha chamado retornar() ou return
                            await this.sendMessagePromise('relayExecutionResult', {
                                targetAlias: message.sourceAlias,
                                messageId: message.messageId,
                                result: { success: true, data: resultData }
                            });
                        } catch (error) {
                            // Notifica erro
                            const isCancellation = error.name === 'UserCancellationError';
                            await this.sendMessagePromise('relayExecutionResult', {
                                targetAlias: message.sourceAlias,
                                messageId: message.messageId,
                                result: { 
                                    success: false, 
                                    error: error.message,
                                    cancelled: isCancellation
                                }
                            });
                        } finally {
                            this.isRemoteExecution = false;
                            if (this.closeRequestedDuringRemote) {
                                this.closeRequestedDuringRemote = false;
                                this.sendMessage('closeTab', { targetAlias: null });
                            }
                        }
                    });

                } else if (message.type === 'EXECUTION_RESULT') {
                    // Resolve a Promise local do roteamento Inter-Abas
                    const resolver = this.pendingCrossTabExecutions.get(message.messageId);
                    if (resolver) {
                        resolver(message.result);
                        this.pendingCrossTabExecutions.delete(message.messageId);
                    }
                }
            }
        });
    }

    sendMessage(action, payload = {}, callback) {
        const messageId = Date.now() + Math.random();
        if (callback) this.messageCallbacks.set(messageId, callback);
        window.postMessage({ type: 'FROM_APP', action, payload, messageId }, '*');
    }

    sendMessagePromise(action, payload = {}) {
        return new Promise(resolve => this.sendMessage(action, payload, resolve));
    }

    getStorage(keys) {
        return this.sendMessagePromise('getStorage', { keys: keys }).then(r => r.success ? r.value : {});
    }
    
    setStorage(dataObject) {
        return this.sendMessagePromise('setStorage', dataObject).then(r => r.success);
    }
    
    /**
     * Recarrega a página de forma blindada, evitando o alerta nativo do navegador.
     * Utiliza o Background Worker para forçar o reload com permissão de extensão (Bypass de CORS/CSP).
     */
    reloadPage() {
        console.log("SisPMG+: Solicitando recarregamento forçado ao Background Worker...");
        
        // Dispara uma mensagem assíncrona para o background script contornar a caixa de diálogo
        window.postMessage({
            type: 'FROM_APP',
            action: 'forceBypassReload',
            payload: {}
        }, '*');
        
        setTimeout(() => {
            const script = document.createElement('script');
            script.textContent = "window.onbeforeunload = null; window.location.href = window.location.href;";
            (document.head || document.documentElement).appendChild(script);
            script.remove();
        }, 500);
    }

    escapeHtml(text) {
        if(typeof text !== 'string') return '';
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    startDebugSpy() {
        if (this.spyListener) return;
        this.exibirNotificacao("Modo Debug Ativado. Verifique o console.", true);
        this.spyListener = this.term.onData(data => {
            const asJSON = JSON.stringify(data);
            const asHex = Array.from(data).map(char => '0x' + char.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
            const specialKeyName = Object.keys(this.keyMap).find(key => this.keyMap[key] === data);
            console.groupCollapsed(`%c[DEBUG] Tecla: ${specialKeyName || 'N/A'} | Dados: %c${asJSON}`, "color: #e0e0e0;", "color: #98FB98; font-weight: bold;");
            console.log("String Bruta:", data, "\nCódigos Hex:", asHex);
            console.groupEnd();
        });
    }

    stopDebugSpy() {
        if (this.spyListener) {
            this.spyListener.dispose();
            this.spyListener = null;
            this.exibirNotificacao("Modo Debug Desativado.", true);
        }
    }
}