// Arquivo: modules/terminal/terminal-actions.js
// Contém as funções primitivas de interação com o terminal.
// NOTA: Funções assíncronas aqui definidas NÃO precisam da palavra-chave 'await'
// quando usadas no editor de rotinas, pois o processador de rotinas a insere automaticamente.

/**
 * Decodifica um token JWT para extrair seu payload.
 * @param {string} token O token JWT.
 * @returns {object|null} O payload do token ou null se a decodificação falhar.
 */
function decodeJwt(token) {
    if (!token || typeof token !== 'string') return null;
    try { 
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = payload.length % 4;
        if (pad) payload += '='.repeat(4 - pad);
        return JSON.parse(atob(payload)); 
    } catch (e) { 
        console.error("SisPMG+: Erro ao decodificar JWT:", e); 
        return null; 
    } 
}
/**
 * Obtém o valor de um cookie a partir do seu nome.
 * @param {string} name O nome do cookie.
 * @returns {string|undefined} O valor do cookie ou undefined se não for encontrado.
 */
function getCookie(name) { 
    const v = `; ${document.cookie}`; 
    const p = v.split(`; ${name}=`); 
    if (p.length === 2) return p.pop().split(';').shift(); 
    return undefined; 
}

class UserCancellationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UserCancellationError';
    }
}
window.UserCancellationError = UserCancellationError;
export { UserCancellationError };

/**
 * Normaliza o texto para comparação, removendo espaços, quebras de linha e caracteres especiais.
 * @param {string} text O texto a ser normalizado.
 * @returns {string} O texto normalizado.
 */
function normalizeTextForSearch(text) {
    return text.replace(/[\s\n_\/-]/g, '');
}

/**
 * Analisa o buffer do terminal para encontrar todos os campos de entrada de texto (desprotegidos).
 * @param {object} term O objeto global do terminal.
 * @returns {Array<object>|null} Um array de objetos, onde cada objeto representa um campo digitável.
 */
function getDigitableFields(term) {
    const INPUT_FIELD_COLOR_CODES = [10, 1];
    if (!term || !term.buffer || !term.buffer.active) {
        console.error("SisPMG+: Objeto 'term' ou seu buffer não foi encontrado.");
        return null;
    }
    const fields = [];
    const buffer = term.buffer.active;
    const { rows, cols } = term;
    const cell = buffer.getNullCell();
    for (let y = 0; y < rows; y++) {
        if (y === 25) continue; // Pula a linha 26 (índice 25)
        const line = buffer.getLine(y);
        if (!line) continue;
        for (let x = 0; x < cols; x++) {
            line.getCell(x, cell);
            if (INPUT_FIELD_COLOR_CODES.includes(cell.getFgColor())) {
                if (x > 0) {
                    const prevCell = buffer.getNullCell();
                    line.getCell(x - 1, prevCell);
                    if (INPUT_FIELD_COLOR_CODES.includes(prevCell.getFgColor())) {
                        continue;
                    }
                }
                const field = { linha: y + 1, coluna: x + 1, length: 0, texto: '' };
                let fieldText = '';
                let currentCellX = x;
                while (currentCellX < cols) {
                    const contentCell = buffer.getNullCell();
                    line.getCell(currentCellX, contentCell);
                    if (!INPUT_FIELD_COLOR_CODES.includes(contentCell.getFgColor())) {
                        break;
                    }
                    fieldText += contentCell.getChars() || ' ';
                    currentCellX++;
                }
                field.length = fieldText.length;
                field.texto = fieldText.trimEnd();
                fields.push(field);
                x = currentCellX - 1;
            }
        }
    }
    return fields;
}

export function initActions(prototype) {
    // Função interna para pausar a execução se a rotina estiver em estado 'paused'
    // e para lançar um erro se a rotina for interrompida ('stopped').
    prototype._checkRotinaState = async function() {
        if (!this.currentRotinaProcessor || this.isMonitoring) return;

        while (this.rotinaState === 'paused') {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (this.rotinaState === 'stopped') {
            throw new UserCancellationError("Execução cancelada pelo usuário.");
        }
    };

    // Flag para controlar a visibilidade do console de debug flutuante.
    // Por padrão, deve começar desativado.
    prototype.debugConsoleEnabled = false;

    prototype.startDebugConsole = function() {
        this.debugConsoleEnabled = true;
        this.exibirNotificacao("Console de depuração ativado.", true);
    };

    prototype.stopDebugConsole = function() {
        this.debugConsoleEnabled = false;
        document.getElementById('debug-console')?.remove();
        this.exibirNotificacao("Console de depuração desativado.");
    };

    /**
     * Registra uma função (hook) para ser executada automaticamente após cada tecla de ação.
     * @param {string|Array|RegExp} alvo O texto a ser monitorado.
     * @param {function} callback Função a ser executada se o alvo for achado.
     * @param {object} [options] Opções extras para o localizarTexto do hook.
     */
    prototype.verificarSempre = async function(alvo, callback, options = {}) {
        await this._checkRotinaState();
        if (typeof alvo === 'function') {
            this.verificacaoHook = { alvo: null, callback: alvo, options: callback || {} };
        } else {
            this.verificacaoHook = { alvo, callback, options };
        }
    };

    /**
     * Aguarda até que um texto ou padrão apareça na tela do terminal.
     * @param {string|Array<string>|RegExp} alvo Texto ou array de textos ou RegExp a procurar.
     * @param {object} [options] Opções de busca.
     * @param {number} [options.esperar=5] Tempo de espera. Use 0 para verificação instantânea.
     * @param {boolean} [options.lancarErro=false] Lança erro se não achar no tempo limite (padrão: false).
     * @param {string} [options.modo='todos'] Para Arrays: 'todos' exige achar tudo, 'qualquer' acha o 1º e retorna qual foi.
     * @param {boolean} [options.caseSensitive=false] Diferencia maiúsculas de minúsculas.
     * @returns {Promise<boolean|string|RegExp|null>} True/False, ou o item achado/Null se modo for 'qualquer'.
     */
    prototype.localizarTexto = async function(alvo, options = {}) {
        await this._checkRotinaState();
        
        const defaults = {
            esperar: 5,
            lancarErro: false,
            caseSensitive: false,
            area: null,
            dialogoFalha: false,
            modo: 'todos' // 'todos' ou 'qualquer'
        };
        const config = { ...defaults, ...options };
    
        const getSearchText = () => {
            let text = '';
            if (config.area) {
                if (config.area.apenasCamposDigitaveis) {
                    const fields = getDigitableFields(this.term);
                    return fields ? fields.map(f => f.texto).join('') : '';
                }
                if (config.area.linha) {
                    text = this.obterTextoLinha(config.area.linha);
                } else {
                    const y1 = (config.area.linhaInicial || 1) - 1;
                    const y2 = (config.area.linhaFinal || this.term.rows) - 1;
                    const x1 = (config.area.colunaInicial || 1) - 1;
                    const x2 = config.area.colunaFinal || this.term.cols;
                    text = this.getBlockText(y1, y2, x1, x2);
                }
            } else {
                text = this.getFullScreenText();
            }
            return text;
        };
    
        const checkCondition = () => {
            let sourceText = getSearchText();
            const originalSourceText = sourceText;
    
            if (!config.caseSensitive) {
                sourceText = sourceText.toUpperCase();
            }
    
            const targets = Array.isArray(alvo) ? alvo : [alvo];
    
            if (config.modo === 'qualquer') {
                for (let target of targets) {
                    if (target instanceof RegExp) {
                        const regexFlags = config.caseSensitive ? target.flags.replace('i', '') : target.flags.includes('i') ? target.flags : target.flags + 'i';
                        if (new RegExp(target.source, regexFlags).test(originalSourceText)) return target;
                    } else {
                        let targetString = String(target);
                        if (!config.caseSensitive) targetString = targetString.toUpperCase();
                        if (sourceText.includes(targetString)) return target;
                    }
                }
                return null;
            } else {
                return targets.every(target => {
                    if (target instanceof RegExp) {
                        const regexFlags = config.caseSensitive ? target.flags.replace('i', '') : target.flags.includes('i') ? target.flags : target.flags + 'i';
                        return new RegExp(target.source, regexFlags).test(originalSourceText);
                    }
                    let targetString = String(target);
                    if (!config.caseSensitive) targetString = targetString.toUpperCase();
                    return sourceText.includes(targetString);
                });
            }
        };
    
        if (config.esperar === 0) return checkCondition();
    
        return new Promise((resolve, reject) => {
            const initialCheck = checkCondition();
            if (initialCheck) { resolve(initialCheck); return; }
    
            let watcher;
            let poller;
            const startTime = Date.now();
            const timeoutMs = config.esperar * 1000;
    
            const cleanupAndFail = async () => {
                cleanup();
                
                if (config.modo === 'qualquer' && !config.lancarErro && !config.dialogoFalha) {
                    resolve(null);
                    return;
                }

                if (config.dialogoFalha) {
                    this.rotinaState = 'paused';
                    const message = typeof config.dialogoFalha === 'string' ? config.dialogoFalha : `A verificação do texto falhou. Deseja continuar a execução da rotina?`;
                    const userWantsToContinue = await this.createPromiseConfirmationModal('Verificação Falhou', message, { confirmText: 'Sim, continuar', cancelText: 'Não, parar' });
                    this.rotinaState = 'running';
                    if (userWantsToContinue) {
                        resolve(config.modo === 'qualquer' ? null : false);
                    } else {
                        reject(new UserCancellationError("Execução cancelada pelo usuário após falha na verificação."));
                    }
                } else if (config.lancarErro) {
                    reject(new Error(`Timeout aguardando elemento em tela.`));
                } else {
                    resolve(false);
                }
            };
            
            const cleanup = () => {
                clearTimeout(poller);
                watcher?.dispose();
            };
    
            watcher = this.term.onWriteParsed(() => {
                const match = checkCondition();
                if (match) { cleanup(); resolve(match); }
            });
    
            const pollForStateAndTimeout = async () => {
                try {
                    await this._checkRotinaState();
                    if (Date.now() - startTime > timeoutMs) {
                        await cleanupAndFail();
                        return;
                    }
                    poller = setTimeout(pollForStateAndTimeout, 100);
                } catch (e) {
                    cleanup();
                    reject(e);
                }
            };
    
            pollForStateAndTimeout();
        });
    };

    /**
     * Define a velocidade global de execução da rotina.
     */
    prototype.velocidade = function(segundos) { 
        this.rotinaStepDelay = parseFloat(segundos);
        if (isNaN(this.rotinaStepDelay) || this.rotinaStepDelay < 0) this.rotinaStepDelay = 0.25;
    };
    
    /**
     * Aguarda até que o terminal pare de processar dados (fique ocioso).
     */
    prototype.waitForTerminalReady = async function(timeout = 20000) {
        while (true) {
            await this._checkRotinaState();
    
            let activityDetected = false;
            let listener;
    
            const activityPromise = new Promise(resolve => {
                const resolveOnce = (value) => {
                    if (!activityDetected) {
                        activityDetected = true;
                        if(listener) listener.dispose();
                        clearTimeout(timer);
                        resolve(value);
                    }
                };
    
                listener = this.term.onWriteParsed(() => resolveOnce(true));
                
                const timer = setTimeout(() => {
                    if(listener) listener.dispose();
                    if (!activityDetected) resolve(false);
                }, timeout);
            });
    
            if (await activityPromise) {
                return;
            }
    
            const screenStateBeforeModal = this.getFullScreenText();
            let modalRef = null;
    
            const screenWatcher = this.term.onWriteParsed(() => {
                const currentScreenState = this.getFullScreenText();
                if (currentScreenState !== screenStateBeforeModal) {
                    screenWatcher.dispose();
                    if (modalRef) this.closeModalAndFocus(modalRef);
                }
            });
    
            this.rotinaState = 'paused';
    
            const userChoice = await new Promise(resolve => {
                const buttons = [
                    { text: 'Cancelar Rotina', className: 'rotina-modal-delete-btn', action: m => { this.closeModalAndFocus(m); resolve('cancel'); } },
                    { text: 'Continuar Esperando', className: 'rotina-modal-cancel-btn', action: m => { this.closeModalAndFocus(m); resolve('wait'); } },
                    { text: 'Continuar Executando', className: 'rotina-modal-save-btn', action: m => { this.closeModalAndFocus(m); resolve('continue'); } }
                ];
                modalRef = this.createModal('Terminal Não Responde', '<p>O terminal não respondeu a tempo. O que deseja fazer?</p>', null, buttons);
                modalRef.addEventListener('DOMNodeRemoved', () => resolve('closed'));
            });
    
            this.rotinaState = 'running';
            screenWatcher.dispose();
    
            if (modalRef && document.body.contains(modalRef)) {
                 this.closeModalAndFocus(modalRef);
            }
            
            switch(userChoice) {
                case 'cancel':
                    throw new UserCancellationError("Execução cancelada por timeout do terminal.");
                case 'continue':
                    return;
                case 'wait':
                    this.exibirNotificacao("Aguardando novamente...", true);
                    continue;
                default:
                    return;
            }
        }
    };
    
    /**
     * Cola o conteúdo da área de transferência na posição atual do cursor no terminal.
     */
    prototype.colar = async function() {
        await this._checkRotinaState();
        try {
            const texto = await navigator.clipboard.readText();
            if (texto) {
                await this.digitar(texto);
            }
        } catch (err) {
            this.exibirNotificacao('Falha ao colar da área de transferência.', false);
            console.error("Erro ao colar:", err);
        }
    };
    
    /**
     * Pressiona uma tecla especial do terminal, com suporte a repetições e ativação de HOOKS.
     */
    prototype.teclar = async function(nomeTecla, repeticoes = 'x1') {
        await this._checkRotinaState();
        const upperCaseKey = String(nomeTecla).toUpperCase();
        const sequence = this.keyMap[upperCaseKey];
        
        let qtd = 1;
        if (typeof repeticoes === 'string' && repeticoes.toLowerCase().startsWith('x')) {
            qtd = parseInt(repeticoes.substring(1), 10) || 1;
        } else if (typeof repeticoes === 'number') {
            qtd = repeticoes;
        }

        // Determina se a tecla gera envio para o Host (ENTER, PFs, PAs)
        const isActionKey = upperCaseKey === 'ENTER' || upperCaseKey.startsWith('PF') || upperCaseKey.startsWith('PA');

        if (sequence) {
            for (let i = 0; i < qtd; i++) {
                if (i > 0) await this.esperar(undefined); // Aguarda entre repetições
                this.term._core._onData.fire(sequence);
                await this.waitForTerminalReady();

                // --- GATILHO DA FUNÇÃO VERIFICARSEMPRE (HOOK AUTOMÁTICO INVISÍVEL) ---
                if (isActionKey && this.verificacaoHook && typeof this.verificacaoHook.callback === 'function' && !this.isExecutingHook) {
                    try {
                        // Flag para impedir Loop infinito caso a função do usuário contenha teclar()
                        this.isExecutingHook = true; 
                        
                        // Busca o alvo na tela instantaneamente sem gerar erros (background operation)
                        const checkOptions = { ...this.verificacaoHook.options, esperar: 0, lancarErro: false, dialogoFalha: false };
                        const match = await this.localizarTexto(this.verificacaoHook.alvo, checkOptions);
                        
                        if (match) {
                            await this.verificacaoHook.callback(match);
                        }
                    } catch (e) {
                        if (e instanceof UserCancellationError) throw e;
                        console.error("SisPMG+: Erro ao executar hook da função 'verificarSempre':", e);
                    } finally {
                        this.isExecutingHook = false;
                    }
                }
            }
        } else {
            console.warn(`[Rotina JS] Tecla especial desconhecida: ${nomeTecla}`);
        }
    };
    
     prototype.digitar = async function(texto, verify = true) {
        const textToType = String(texto);
        await this._checkRotinaState();
        if (textToType.length === 0) return;

        this.term._core._onData.fire(textToType);
        
        if (verify) {
            try {
                const foundInFields = await this.localizarTexto(textToType, { 
                    esperar: 2, 
                    lancarErro: false, 
                    area: { apenasCamposDigitaveis: true } 
                });
                
                if (!foundInFields) {
                    await this.localizarTexto(textToType, { esperar: 3, lancarErro: true });
                }
            } catch (e) {
                 if (e instanceof UserCancellationError) throw e; 
                 throw new Error(`Falha na verificação: O texto "${textToType}" não foi encontrado na tela após a digitação.`);
            }
        } else {
            await this.waitForTerminalReady();
        }
    };

    /**
     * Simula um clique de mouse em uma coordenada específica da tela.
     */
    prototype.clicar = async function(linha, coluna) {
        await this._checkRotinaState();
        if (typeof linha !== 'number' || typeof coluna !== 'number' || linha < 1 || coluna < 1) {
            throw new Error(`Coordenadas de clique inválidas: (${linha}, ${coluna})`);
        }
        await this.esperar(undefined);
        this.term._core._onData.fire(`\u001b[<0;${coluna};${linha}M`);
        this.term._core._onData.fire(`\u001b[<0;${coluna};${linha}m`);
        await this.waitForTerminalReady();
    };
    
    /**
     * Pausa a execução da rotina por um tempo determinado.
     */
    prototype.esperar = async function(segundos) {
        let delayInSeconds = (segundos === undefined) ? this.rotinaStepDelay : parseFloat(segundos);
        if (isNaN(delayInSeconds) || delayInSeconds < 0) {
            delayInSeconds = this.rotinaStepDelay;
        }

        const endTime = Date.now() + (delayInSeconds * 1000);
        while (Date.now() < endTime) {
            await this._checkRotinaState();
            await new Promise(resolve => setTimeout(resolve, Math.min(50, endTime - Date.now())));
        }
    };

    /**
     * Localiza um rótulo na tela e move o cursor para o campo de entrada associado.
     */
    prototype.posicionar = async function(rotulo, options = {}) {
        await this._checkRotinaState();
        const { offset = 0, direcao = 'depois', caseSensitive = false } = options;
    
        const findLabel = () => {
            const buffer = this.term.buffer?.active;
            if (!buffer) return null;
    
            const searchRotulo = caseSensitive ? rotulo : rotulo.toUpperCase();
    
            for (let y = 0; y < buffer.length; y++) {
                let lineText = buffer.getLine(y)?.translateToString();
                if (!lineText) continue;
    
                if (!caseSensitive) {
                    lineText = lineText.toUpperCase();
                }
                
                const col = lineText.indexOf(searchRotulo);
                if (col !== -1) return { y, col };
            }
            return null;
        };
    
        let foundPosition = findLabel();
    
        if (!foundPosition) {
            const endTime = Date.now() + 5000;
            while (Date.now() < endTime) {
                await new Promise(resolve => setTimeout(resolve, 100));
                foundPosition = findLabel();
                if (foundPosition) break;
            }
        }
    
        if (foundPosition) {
            const { y, col } = foundPosition;
            if (direcao === 'acima' || direcao === 'abaixo') {
                const targetLine = direcao === 'acima' ? y : y + 2;
                const fields = this.obterCamposDigitaveis();
                const fieldsOnTargetLine = fields.filter(f => f.linha === targetLine);
    
                if (fieldsOnTargetLine.length > 0) {
                    const targetField = fieldsOnTargetLine.reduce((prev, curr) => 
                        Math.abs(curr.coluna - col) < Math.abs(prev.coluna - col) ? curr : prev
                    );
                    await this.clicar(targetField.linha, targetField.coluna);
                    return true;
                }
            } else { 
                const clickCol = (direcao === 'antes') ? col : col + rotulo.length;
                await this.clicar(y + 1, clickCol);
                await this.teclar(direcao === 'antes' ? 'BACKTAB' : 'TAB');
                if (offset > 0) {
                    for (let i = 0; i < offset; i++) {
                        await this.teclar('TAB');
                    }
                }
                await this.esperar(0.5);
                return true;
            }
        }
    
        throw new Error(`Rótulo "${rotulo}" não foi encontrado na tela.`);
    };
    
    /**
     * Retorna o conteúdo textual de toda a tela do terminal.
     */
    prototype.getFullScreenText = function(toUpperCase = false) {
        const buffer = this.term.buffer.active;
        let fullScreenText = Array.from({ length: buffer.length }, (_, i) => buffer.getLine(i).translateToString(true)).join('\n');
        return toUpperCase ? fullScreenText.toUpperCase() : fullScreenText;
    };
    
    /**
     * Obtém o texto de uma área específica da tela.
     */
    prototype.obterTexto = function(linhaInicial, colunaInicial, linhaFinal, colunaFinal) {
        switch (arguments.length) {
            case 0:
                return this.getFullScreenText();
            case 1:
                return this.obterTextoLinha(linhaInicial);
            case 2:
                return this.getBlockText(linhaInicial - 1, linhaInicial - 1, colunaInicial - 1, this.term.cols);
            case 4:
                return this.getBlockText(linhaInicial - 1, linhaFinal - 1, colunaInicial - 1, colunaFinal);
            default:
                throw new Error("Número de argumentos inválido para obterTexto. Use 0, 1, 2 ou 4 argumentos.");
        }
    };

    /**
     * Obtém o texto de uma linha específica.
     */
    prototype.obterTextoLinha = function(lineNumber = -1) {
        const y = lineNumber === -1 ? this.term.buffer.active.cursorY : lineNumber - 1;
        if (y < 0 || y >= this.term.rows) {
            throw new Error(`Número da linha inválido: ${lineNumber}. Deve ser entre 1 e ${this.term.rows}.`);
        }
        return this.getBlockText(y, y, 0, this.term.cols);
    };

    /**
     * Retorna as coordenadas atuais do cursor (y, x).
     */
    prototype.obterPosicaoCursor = function() {
        return {
            y: this.term.buffer.active.cursorY + 1,
            x: this.term.buffer.active.cursorX + 1
        };
    };

    /**
     * Copia o texto de uma área da tela para a área de transferência do sistema.
     */
    prototype.copiar = async function(linhaInicial, colunaInicial, linhaFinal, colunaFinal) {
        await this._checkRotinaState();
        let textToCopy = '';
        let notificationMessage = '';
    
        switch (arguments.length) {
            case 0:
                textToCopy = this.getFullScreenText();
                notificationMessage = "Tela inteira copiada!";
                break;
            case 1:
                textToCopy = this.obterTextoLinha(linhaInicial);
                notificationMessage = `Linha ${linhaInicial} copiada!`;
                break;
            case 2:
                textToCopy = this.getBlockText(linhaInicial - 1, linhaInicial - 1, colunaInicial - 1, this.term.cols);
                notificationMessage = `Parte da linha ${linhaInicial} copiada!`;
                break;
            case 4:
                textToCopy = this.getBlockText(linhaInicial - 1, linhaFinal - 1, colunaInicial - 1, colunaFinal);
                notificationMessage = "Intervalo copiado!";
                break;
            default:
                this.exibirNotificacao("Argumentos de cópia inválidos.", false);
                return;
        }
    
        if (textToCopy) {
            await navigator.clipboard.writeText(textToCopy);
            this.exibirNotificacao(notificationMessage, true);
        }
    };

    /**
     * Aguarda por um clique de mouse no terminal e retorna as coordenadas.
     */
    prototype.waitForMouseClick = function(timeout = 15000) {
        return new Promise(resolve => {
            const listener = this.term.onData(data => {
                const match = data.match(/^\u001b\[<0;(\d+);(\d+)m$/);
                if (match) {
                    listener.dispose();
                    clearTimeout(timer);
                    resolve({ x: parseInt(match[1]), y: parseInt(match[2]) });
                }
            });
            const timer = setTimeout(() => { listener.dispose(); resolve(null); }, timeout);
        });
    };

    /**
     * Modo interativo para obter coordenadas de um clique do usuário.
     */
    prototype.getCoordsFromClick = async function() {
        this.saveCursorPosition();
        await this.createInstructionalModal("Obter Coordenadas", "Clique em qualquer ponto do terminal para obter as coordenadas.");
        try {
            const pos = await this.waitForMouseClick(10000);
            if (pos) {
                this.exibirNotificacao(`Posição: Linha ${pos.y}, Coluna ${pos.x}`, true, 8);
            } else {
                this.exibirNotificacao("Operação cancelada (tempo esgotado).", false);
            }
        } catch (e) {
            this.exibirNotificacao("Ocorreu um erro ao capturar o clique.", false);
        } finally {
            this.restoreCursorPosition();
        }
    };

    /**
     * Modo interativo que permite ao usuário selecionar uma área da tela com dois cliques.
     */
    prototype.lerTela = function(showModals = true) {
        return new Promise(async (resolve) => {
            await this._checkRotinaState();
            if (showModals) await this.createInstructionalModal("Copiar Área da Tela (Passo 1/2)", "Clique no ponto inicial da área que deseja copiar.");
            
            const startPos = await this.waitForMouseClick(10000);
            if (!startPos) {
                if(showModals) this.exibirNotificacao("Leitura de tela cancelada.", false);
                this.rotinaState = 'stopped';
                throw new UserCancellationError("Leitura de tela cancelada pelo usuário (timeout).");
            }

            if (showModals) await this.createInstructionalModal("Copiar Área da Tela (Passo 2/2)", "Agora clique no ponto final da área que deseja copiar.");
            const endPos = await this.waitForMouseClick(10000);
            if (!endPos) {
                if(showModals) this.exibirNotificacao("Cópia de tela cancelada.", false);
                this.rotinaState = 'stopped';
                throw new UserCancellationError("Leitura de tela cancelada pelo usuário (timeout).");
            }

            const y1 = Math.min(startPos.y, endPos.y) - 1;
            const y2 = Math.max(startPos.y, endPos.y) - 1;
            const x1 = Math.min(startPos.x, endPos.x) - 1;
            const x2 = Math.max(startPos.x, endPos.x);
            
            const text = this.getBlockText(y1, y2, x1, x2);
            if(showModals) this.exibirNotificacao("Área copiada com sucesso! Cole onde desejar.", true);
            resolve({ text, coords: { y1: y1 + 1, y2: y2 + 1, x1: x1 + 1, x2: x2 } });
        });
    };

    /**
     * Retorna o texto de um bloco retangular (coordenadas 0-base, internas).
     */
    prototype.getBlockText = function(startY, endY, startX, endX) {
        let text = '';
        const buffer = this.term.buffer.active;
        for (let i = startY; i <= endY; i++) {
            const line = buffer.getLine(i);
            if (line) {
                text += line.translateToString(true, startX, endX) + (i < endY ? '\n' : '');
            }
        }
        return text;
    };
    
    // --- FUNÇÕES AUXILIARES DE EXTRAÇÃO DE DADOS ---
    
    prototype.extrairCPF = function(texto) {
        const match = String(texto).match(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
        return match ? match[0] : null;
    };
    
    prototype.extrairData = function(texto) {
        const match = String(texto).match(/\d{2}\/\d{2}\/\d{4}/);
        return match ? match[0] : null;
    };

    prototype.extrairProtocolo = function(texto) {
        const match = String(texto).match(/Protocolo:\s*(\d+)/i);
        return match ? match[1] : null;
    };
    
    // --- PROCESSAMENTO DE ARQUIVOS E PLANILHAS ---

    prototype.processarLinhas = async function(nomeArquivo, callback) {
        await this._checkRotinaState();
        try {
            const conteudo = await this.lerArquivo(nomeArquivo);
            if (conteudo) {
                const linhas = conteudo.split('\n').filter(l => l.trim() !== '');
                for (const [index, linha] of linhas.entries()) {
                    await this._checkRotinaState();
                    await callback(linha.trim(), index, linhas);
                }
            }
        } catch (e) {
            throw new Error(`Erro ao processar arquivo "${nomeArquivo}": ${e.message}`);
        }
    };

    prototype.obterCamposDigitaveis = function() {
        return getDigitableFields(this.term);
    };
    
    prototype.enviarParaPlanilha = async function(scriptId, sheetName, data) {
        await this._checkRotinaState();
        if (!scriptId || !sheetName || !Array.isArray(data)) {
            throw new Error("Parâmetros inválidos para enviarParaPlanilha. Forneça ID do script, nome da aba e um array de dados.");
        }
        this.exibirNotificacao('Enviando dados para a planilha...', true);
        const response = await new Promise(resolve => this.sendMessage('sendToGoogleSheet', { scriptId, sheetName, data }, resolve));
        
        if (response && response.success) {
            this.exibirNotificacao('Dados enviados com sucesso!', true);
        } else {
            const errorMessage = response ? response.error : 'Erro desconhecido na comunicação com o background.';
            this.exibirNotificacao(`Falha ao enviar dados: ${errorMessage}`, false);
            throw new Error(errorMessage);
        }
    };

    prototype.lerPlanilha = async function(sheetId, sheetName = '', query = '') {
        await this._checkRotinaState();
        if (!sheetId) throw new Error("lerPlanilha: O ID da planilha (sheetId) é obrigatório.");

        const response = await new Promise(resolve => {
            this.sendMessage('fetchSheetData', { sheetId, sheetName, query }, resolve);
        });

        if (response && response.success) {
            return response.data;
        } else {
            const errorMsg = response?.error || 'Erro desconhecido ao ler planilha.';
            this.exibirNotificacao(errorMsg, false);
            throw new Error(`lerPlanilha: ${errorMsg}`);
        }
    };

    prototype.processarPlanilha = async function(data, callback, ignoreHeader = true) {
        await this._checkRotinaState();
        if (!Array.isArray(data) || data.length === 0) {
            console.warn("processarPlanilha: Dados inválidos ou vazios.");
            return;
        }

        const startIndex = ignoreHeader ? 1 : 0;
        for (let i = startIndex; i < data.length; i++) {
            await this._checkRotinaState();
            try {
                await callback(data[i], i);
            } catch (error) {
                if (error.name === 'UserCancellationError') throw error;
                console.error(`Erro ao processar linha ${i} da planilha:`, error);
                
                const userChoice = await this.showGenericErrorModal(`Processar Planilha (Linha ${i})`, error);
                if (userChoice === 'stop') throw new UserCancellationError('Execução interrompida pelo usuário.');
                if (userChoice === 'pause') {
                    i--;
                    continue;
                }
            }
        }
    };

    prototype.obterDadosUsuario = async function() {
        await this._checkRotinaState();
        const token = getCookie('tokiuz');
        if (!token) {
            this.exibirNotificacao("Token de usuário (tokiuz) não encontrado. Não é possível obter os dados.", false);
            return null;
        }

        const tokenData = decodeJwt(token);
        if (!tokenData) return null;

        return {
            numeroPM: tokenData.g,
            postoGraduacao: tokenData.t,
            nomeCompleto: tokenData.n,
            codigoRegiao: tokenData.e,
            fracaoSecao: tokenData.p,
            regiao: tokenData.r,
            codigoUnidadeContabil: tokenData.u,
            codigoFracaoSecao: tokenData.c,
            funcoes: tokenData.f,
            idSessao: tokenData.i
        };
    };
    
    // --- LÓGICA INTER-ABAS ---

    prototype.executarRotinaEm = function(rotinaOuCodigo, options = {}) {
        const { aliasDestino = null, sistemaDestino = null, parametros = null } = options;
        return new Promise(async (resolve, reject) => {
            await this._checkRotinaState();

            if (!this.tabAlias) {
                return reject(new Error("Alias de roteamento desta aba não está definido."));
            }

            let finalAliasDestino = aliasDestino;
            if (!finalAliasDestino) {
                const res = await this.sendMessagePromise('getNextAlias');
                if (res && res.success) {
                    finalAliasDestino = res.alias;
                } else {
                    finalAliasDestino = 'T' + Math.floor(1000 + Math.random() * 9000);
                }
            }

            const messageId = Date.now() + Math.random();

            const stateCheckInterval = setInterval(async () => {
                if (this.rotinaState === 'stopped') {
                    clearInterval(stateCheckInterval);
                    this.pendingCrossTabExecutions.delete(messageId);
                    reject(new UserCancellationError("Execução cancelada pelo usuário."));
                }
            }, 500);

            this.pendingCrossTabExecutions.set(messageId, (result) => {
                clearInterval(stateCheckInterval);
                if (result.success) {
                    resolve(result.data);
                } else if (result.cancelled) {
                    reject(new UserCancellationError("Execução remota cancelada pelo usuário."));
                } else {
                    reject(new Error(`Erro ao executar rotina na aba [${finalAliasDestino}]: ${result.error}`));
                }
            });

            let routineName = rotinaOuCodigo;
            let customCode = null;

            if (rotinaOuCodigo && (rotinaOuCodigo.includes('\n') || rotinaOuCodigo.includes(';') || rotinaOuCodigo.includes('()'))) {
                routineName = "Rotina_Dinamica_Remota";
                customCode = rotinaOuCodigo;
            }

            const systemTarget = sistemaDestino || this.selectedSystemName;

            this.sendMessage('executeInTab', {
                targetAlias: finalAliasDestino,
                sourceAlias: this.tabAlias,
                routineName: routineName,
                customCode: customCode,
                messageId: messageId,
                targetSystem: systemTarget,
                parametros: {
                    ...parametros,
                    debugRotinaActive: this.debugRotinaActive
                }
            });
        });
    };

    prototype.retornar = function(valor) {
        this.executionReturnValue = valor;
    };

    prototype.fechar = async function(aliasDestino = null) {
        await this._checkRotinaState();
        
        if (aliasDestino) {
            this.exibirNotificacao(`Solicitando fechamento da aba [${aliasDestino}]...`, true);
            const response = await new Promise(resolve => this.sendMessage('closeTab', { targetAlias: aliasDestino }, resolve));
            
            if (response && !response.success) {
                 this.exibirNotificacao(`Falha ao fechar aba: ${response.error}`, false);
                 throw new Error(`Falha ao fechar aba: ${response.error}`);
            }
        } else {
            if (this.isRemoteExecution) {
                this.exibirNotificacao(`Fechamento da aba agendado para o fim da execução remota...`, true);
                this.closeRequestedDuringRemote = true;
            } else {
                this.exibirNotificacao(`Fechando aba atual...`, true);
                const response = await new Promise(resolve => this.sendMessage('closeTab', { targetAlias: null }, resolve));
                
                if (response && !response.success) {
                     this.exibirNotificacao(`Falha ao fechar aba: ${response.error}`, false);
                     throw new Error(`Falha ao fechar aba: ${response.error}`);
                }
            }
        }
    };

    prototype.debug = function(...args) {
        console.log('[DEBUG ROTINA]', ...args);

        if (!this.debugConsoleEnabled) return;
    
        let consoleEl = document.getElementById('debug-console');
        if (!consoleEl) {
            consoleEl = document.createElement('div');
            consoleEl.id = 'debug-console';
            consoleEl.innerHTML = `
                <div id="debug-console-header">
                    <strong>Console de Debug</strong>
                    <div id="debug-console-controls">
                        <button id="debug-copy-btn">Copiar</button>
                        <button id="debug-save-btn">Salvar</button>
                        <button id="debug-close-btn">&times;</button>
                    </div>
                </div>
                <div id="debug-console-log"></div>
            `;
            document.body.appendChild(consoleEl);
    
            const header = consoleEl.querySelector('#debug-console-header');
            const logContainer = consoleEl.querySelector('#debug-console-log');
            let isDragging = false, initialMouseX, initialMouseY, initialModalLeft, initialModalTop;
    
            header.onmousedown = (e) => {
                isDragging = true;
                initialMouseX = e.clientX;
                initialMouseY = e.clientY;
                const rect = consoleEl.getBoundingClientRect();
                initialModalLeft = rect.left;
                initialModalTop = rect.top;
    
                document.onmousemove = (e_move) => {
                    if (isDragging) {
                        const dx = e_move.clientX - initialMouseX;
                        const dy = e_move.clientY - initialMouseY;
                        consoleEl.style.left = `${initialModalLeft + dx}px`;
                        consoleEl.style.top = `${initialModalTop + dy}px`;
                    }
                };
                document.onmouseup = () => {
                    isDragging = false;
                    document.onmousemove = null;
                    document.onmouseup = null;
                };
            };
            
            consoleEl.querySelector('#debug-close-btn').onclick = () => consoleEl.remove();
            consoleEl.querySelector('#debug-copy-btn').onclick = () => {
                const copyBtn = consoleEl.querySelector('#debug-copy-btn');
                const logContent = logContainer.innerText;
                navigator.clipboard.writeText(logContent).then(() => {
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = 'Copiado!';
                    setTimeout(() => copyBtn.textContent = originalText, 2000);
                });
            };
            consoleEl.querySelector('#debug-save-btn').onclick = () => {
                const logContent = logContainer.innerText;
                const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `debug_log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            };
        }
    
        const logContainer = consoleEl.querySelector('#debug-console-log');
        const entry = document.createElement('div');
        entry.className = 'debug-entry';
        entry.textContent = args.map(arg => {
            try {
                if (arg instanceof Error) return `Error: ${arg.name} - ${arg.message}\n${arg.stack}`;
                return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
            } catch {
                return '[Objeto circular]';
            }
        }).join(' ');
        logContainer.appendChild(entry);
        logContainer.scrollTop = logContainer.scrollHeight;
    };

    // ============================================================================
    // APRIMORAMENTOS DA BASE DE ROTINAS (LOW-CODE & DATA HANDLING GENÉRICO)
    // ============================================================================

    prototype.lerPlanilhaObjetos = async function(sheetId, sheetName = '', query = '') {
        const dadosArray = await this.lerPlanilha(sheetId, sheetName, query);
        if (!dadosArray || dadosArray.length < 2) return [];
        
        const cabecalho = dadosArray[0].map(c => String(c).trim()); 
        
        return dadosArray.slice(1).map(linha => {
            const obj = {};
            cabecalho.forEach((colNome, i) => {
                obj[colNome] = linha[i] !== undefined ? linha[i] : '';
            });
            return obj;
        });
    };

    prototype.selecionarEmTabela = function(titulo, descricao, colunas, dados, renderRowFn) {
        return new Promise(async (resolve, reject) => {
            await this._checkRotinaState();
            
            let html = `<p style="font-size: 14px; color: #555;">${descricao}</p>`;
            html += `<div style="max-height: 50vh; overflow-y: auto; margin-top: 15px; border: 1px solid #ddd; border-radius: 4px;">`;
            html += `<table style="width: 100%; border-collapse: collapse; font-size: 14px;">`;
            html += `<thead style="position: sticky; top: 0; background: #f4f6f8; box-shadow: 0 1px 2px rgba(0,0,0,0.1); z-index: 1;"><tr>`;
            
            colunas.forEach(col => html += `<th style="padding: 10px; border: 1px solid #ddd; text-align: left;">${col}</th>`);
            html += `</tr></thead><tbody>`;
            
            dados.forEach((item, index) => {
                html += `<tr class="sys-table-row-selectable" data-index="${index}" style="cursor: pointer; border-bottom: 1px solid #eee;">${renderRowFn(item)}</tr>`;
            });
            
            html += `</tbody></table></div>`;

            if (!document.getElementById('sys-table-modal-style')) {
                const style = document.createElement('style');
                style.id = 'sys-table-modal-style';
                style.innerHTML = `.sys-table-row-selectable:hover { background-color: #e2eef9 !important; }`;
                document.head.appendChild(style);
            }

            const buttons = [
                { text: 'Cancelar', className: 'rotina-modal-cancel-btn', action: m => { 
                    this.closeModalAndFocus(m); 
                    this.rotinaState = 'stopped';
                    reject(new UserCancellationError("Seleção cancelada pelo usuário."));
                } }
            ];

            const modalRef = this.createModal(titulo, html, null, buttons, { modalClass: 'sys-table-modal' });

            const actionsContainer = modalRef.querySelector('.rotina-modal-actions');
            if (actionsContainer) {
                actionsContainer.style.display = 'flex';
                actionsContainer.style.justifyContent = 'space-between';
                actionsContainer.style.alignItems = 'center';
                actionsContainer.style.width = '100%';

                const searchWrapper = document.createElement('div');
                searchWrapper.innerHTML = `<input type="text" id="sys-table-search-input" placeholder="🔍 Pesquisar..." style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; outline: none; width: 250px; font-size: 14px; background-color: #fff; color: #333;">`;
                
                actionsContainer.insertBefore(searchWrapper, actionsContainer.firstChild);

                const searchInput = searchWrapper.querySelector('#sys-table-search-input');
                
                searchInput.addEventListener('input', (e) => {
                    const term = e.target.value.toLowerCase();
                    const rows = modalRef.querySelectorAll('.sys-table-row-selectable');
                    
                    rows.forEach(row => {
                        const rowText = row.textContent.toLowerCase();
                        if (rowText.includes(term)) {
                            row.style.display = '';
                        } else {
                            row.style.display = 'none';
                        }
                    });
                });

                setTimeout(() => searchInput.focus(), 100);
            }

            modalRef.querySelectorAll('.sys-table-row-selectable').forEach(tr => {
                tr.onclick = () => {
                    const idx = tr.getAttribute('data-index');
                    this.closeModalAndFocus(modalRef);
                    resolve(dados[idx]);
                };
            });
        });
    };

    prototype.solicitarEntrada = function(titulo, mensagem, placeholder = '') {
        return new Promise(async (resolve, reject) => {
            await this._checkRotinaState();
            let html = `<p style="font-size: 14px; margin-bottom: 10px;">${mensagem}</p>`;
            html += `<input type="text" id="sys-prompt-input" class="modal-text-input" placeholder="${placeholder}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">`;

            let modalRef = null;
            const buttons = [
                { text: 'Cancelar', className: 'rotina-modal-cancel-btn', action: m => { 
                    this.closeModalAndFocus(m); 
                    this.rotinaState = 'stopped';
                    reject(new UserCancellationError("Entrada cancelada pelo usuário."));
                } },
                { text: 'Confirmar', className: 'rotina-modal-save-btn', action: m => {
                    const val = m.querySelector('#sys-prompt-input').value;
                    this.closeModalAndFocus(m);
                    resolve(val);
                }}
            ];

            modalRef = this.createModal(titulo, html, null, buttons);
            setTimeout(() => {
                const input = modalRef.querySelector('#sys-prompt-input');
                if (input) input.focus();
            }, 100);
        });
    };

    prototype.esperarTextoSumir = async function(alvo, options = {}) {
        await this._checkRotinaState();
        const config = { esperar: 15, caseSensitive: false, ...options };
        
        const isPresent = () => {
            let screenText = this.getFullScreenText();
            if (alvo instanceof RegExp) {
                const flags = config.caseSensitive ? alvo.flags.replace('i', '') : alvo.flags.includes('i') ? alvo.flags : alvo.flags + 'i';
                return new RegExp(alvo.source, flags).test(screenText);
            }
            if (!config.caseSensitive) {
                screenText = screenText.toUpperCase();
                return screenText.includes(String(alvo).toUpperCase());
            }
            return screenText.includes(String(alvo));
        };

        if (!isPresent()) return true;

        return new Promise(resolve => {
            let watcher, poller;
            const startTime = Date.now();
            const timeoutMs = config.esperar * 1000;

            const cleanup = () => {
                clearTimeout(poller);
                watcher?.dispose();
            };

            watcher = this.term.onWriteParsed(() => {
                if (!isPresent()) { cleanup(); resolve(true); }
            });

            const poll = async () => {
                try {
                    await this._checkRotinaState();
                    if (!isPresent()) { cleanup(); resolve(true); return; }
                    if (Date.now() - startTime > timeoutMs) { cleanup(); resolve(false); return; }
                    poller = setTimeout(poll, 250);
                } catch (e) { cleanup(); resolve(false); }
            };
            poll();
        });
    };

    prototype.limparCampo = async function(tamanhoMaximo = 60) {
        await this._checkRotinaState();
        await this.teclar('BACKSPACE', tamanhoMaximo);
    };

    prototype.agruparDados = function(arrayDeObjetos, chave) {
        if (!Array.isArray(arrayDeObjetos)) return {};
        return arrayDeObjetos.reduce((resultado, item) => {
            const valorDaChave = item[chave];
            if (valorDaChave === undefined) return resultado;
            if (!resultado[valorDaChave]) resultado[valorDaChave] = [];
            resultado[valorDaChave].push(item);
            return resultado;
        }, {});
    };

    prototype.formatarData = function(dataOriginal, formatoDestino = 'DDMMAAAA') {
        if (!dataOriginal) return '';
        let str = String(dataOriginal).trim();
        let dataObj;

        if (str.includes('/')) {
            const partes = str.split(' ')[0].split('/'); 
            dataObj = new Date(`${partes[2]}-${partes[1]}-${partes[0]}T12:00:00`);
        } else if (str.includes('-')) {
            dataObj = new Date(str.split(' ')[0] + "T12:00:00");
        } else if (dataOriginal instanceof Date) {
            dataObj = dataOriginal;
        } else {
            return str; 
        }

        if (isNaN(dataObj)) return '';

        const d = String(dataObj.getDate()).padStart(2, '0');
        const m = String(dataObj.getMonth() + 1).padStart(2, '0');
        const y = dataObj.getFullYear();

        switch (formatoDestino.toUpperCase()) {
            case 'DDMMAAAA': return `${d}${m}${y}`; 
            case 'DD/MM/AAAA': return `${d}/${m}/${y}`;
            case 'YYYY-MM-DD': return `${y}-${m}-${d}`;
            default: return `${d}${m}${y}`;
        }
    };

    prototype.extrairNumeros = function(texto) {
        if (!texto) return '';
        return String(texto).replace(/\D/g, '');
    };

    prototype.converterMoeda = function(texto) {
        if (!texto) return 0;
        return parseFloat(String(texto).replace(/[R$\s\.]/g, '').replace(',', '.')) || 0;
    };

    /**
     * Ativa o depurador de linhas da rotina.
     */
    prototype.startDebugRotina = function() {
        this.debugRotinaActive = true;
        this.exibirNotificacao("Depurador de rotina ativado (F12 para ver logs).", true);
    };

    /**
     * Desativa o depurador de linhas da rotina.
     */
    prototype.stopDebugRotina = function() {
        this.debugRotinaActive = false;
        this.exibirNotificacao("Depurador de rotina desativado.");
    };
}