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

        // --- SISTEMA DE KEEP-ALIVE (ANTIOSCIOSIDADE) ---
        this.inactivityTimer = null;
        this._onDataKeepAliveListener = null;
        
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

        this.createPreLoginUI();
        this.startGlobalScreenMonitor();
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
                this.screenMonitorInterval = setInterval(() => this.processScreenState(), 1000);
                this.term.onData(this.handleAutoRunTrigger.bind(this));
                this._setupCustomKeyHandlers();
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
        if (this.rotinaState !== 'stopped') return;

        if (this.isMonitoringPausedForManualLogin) {
            if (await this.localizarTexto("Logon executado com sucesso", { esperar: 0 })) {
                this.isLoggedIn = true;
                this.reloginInProgress = false;
                this.createFullMenu();
                await this.loadRotinasFromCache();
                this.isTerminalReadyForRoutines = true; // Libera execuções pendentes Inter-Abas
                this._startKeepAlive();
                this.resumeScreenMonitoring();
            }
            return;
        }

        const fullScreenText = this.getFullScreenText(true);

        const senhaIncorretaPattern = /senha incorreta/i;
        if (senhaIncorretaPattern.test(fullScreenText)) {
            this._stopKeepAlive();
            this.exibirNotificacao("Senha incorreta. A página será recarregada.", false);
            setTimeout(() => this.reloadPage(), 3000);
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
                setTimeout(() => this.reloadPage(), 3000);
                return;
            }
        }
        
        if (await this.localizarTexto("Natural session terminated normally", { esperar: 0 }) && !this.reloginInProgress) {
            if (this.selectedSystemName) {
                this.reloginInProgress = true;
                this.exibirNotificacao(`Sessão encerrada. Relogando em ${this.selectedSystemName}...`, true);
                setTimeout(async () => {
                    await this.digitar(this.selectedSystemName);
                    await this.teclar('ENTER');
                    await this.teclar('ENTER');
                }, 500);
                return;
            }
        }

        const isLoginState = await this.handleLoginScreen();
        if (!isLoginState && this.isLoggedIn) {
            await this.checkForAutoExecutarRotinas();
        }
    }

    // --- NOVA LÓGICA DE KEEP-ALIVE (OCIOSIDADE) ---
    _startKeepAlive() {
        this._stopKeepAlive(); // Limpa timer antigo se existir

        const resetIdleTimer = () => {
            if (this.loginFlowActive || this.rotinaState === 'running') return;
            if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
            
            // Define o timer para 4 minutos
            this.inactivityTimer = setTimeout(() => {
                this._sendKeepAliveCommand();
            }, 3 * 60 * 1000); 
        };

        // Escuta interações naturais na página
        ['mousemove', 'keydown', 'click', 'wheel'].forEach(event => {
            document.addEventListener(event, resetIdleTimer, { passive: true });
        });

        // Escuta interação direta com o terminal
        if (this.term && !this._onDataKeepAliveListener) {
            this._onDataKeepAliveListener = this.term.onData(() => resetIdleTimer());
        }

        resetIdleTimer(); // Inicia a contagem
        console.log('SisPMG+ [KeepAlive]: Monitoramento inteligente de ociosidade ativado.');
    }

    _sendKeepAliveCommand() {
        if (this.rotinaState === 'stopped' && !this.loginFlowActive && this.isLoggedIn && this.term && this.term._core) {
            console.log('SisPMG+ [KeepAlive]: Ociosidade detectada. Enviando comando (DESCER/SUBIR) para manter sessão ativa.');
            
            // Envia um comando de tecla para mover o cursor abaixo
            this.term._core._onData.fire(this.keyMap['TAB']);
            
            // Retorna imediatamente o cursor para cima para não estragar a tela
            setTimeout(() => {
                if (this.term && this.term._core) {
                    this.term._core._onData.fire(this.keyMap['BACKTAB']);
                }
            }, 150);
        }
        
        // Garante que o timer reinicie após a ação
        if (this.isLoggedIn) {
            this._startKeepAlive();
        }
    }

    _stopKeepAlive() {
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = null;
            console.log('SisPMG+ [KeepAlive]: Monitoramento de ociosidade interrompido.');
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
        while (!this.isTerminalReadyForRoutines) {
            await new Promise(resolve => setTimeout(resolve, 250));
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
                            await this.executarRotina(message.routineName, false, message.customCode, false);
                            
                            // Notifica sucesso de volta para o Background rotear, incluindo dados caso o usuário tenha chamado retornar()
                            await this.sendMessagePromise('relayExecutionResult', {
                                targetAlias: message.sourceAlias,
                                messageId: message.messageId,
                                result: { success: true, data: this.executionReturnValue }
                            });
                        } catch (error) {
                            // Notifica erro
                            await this.sendMessagePromise('relayExecutionResult', {
                                targetAlias: message.sourceAlias,
                                messageId: message.messageId,
                                result: { success: false, error: error.message }
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
        return this.sendMessagePromise('getStorage', { key: keys }).then(r => r.success ? r.value : {});
    }
    
    setStorage(dataObject) {
        return this.sendMessagePromise('setStorage', dataObject).then(r => r.success);
    }
    
    reloadPage() {
        window.onbeforeunload = null;
        window.location.reload();
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