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
    try { 
        return JSON.parse(atob(token.split('.')[1])); 
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
        // Se não houver processador de rotina ativo, não faz nada.
        // Isso previne que a verificação de tela (processScreenState) lance erros indevidos.
        if (!this.currentRotinaProcessor) return;

        while (this.rotinaState === 'paused') {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (this.rotinaState === 'stopped') {
            throw new UserCancellationError("Execução cancelada pelo usuário.");
        }
    };

    prototype.localizarTexto = async function(alvo, options = {}) {
        await this._checkRotinaState();
        
        const defaults = {
            esperar: 5,
            lancarErro: false,
            caseSensitive: false,
            area: null,
            dialogoFalha: false
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
    
            return targets.every(target => {
                if (target instanceof RegExp) {
                    const regexFlags = config.caseSensitive ? target.flags.replace('i', '') : target.flags.includes('i') ? target.flags : target.flags + 'i';
                    const newRegex = new RegExp(target.source, regexFlags);
                    return newRegex.test(originalSourceText);
                }
    
                let targetString = String(target);
                if (!config.caseSensitive) {
                    targetString = targetString.toUpperCase();
                }
                return sourceText.includes(targetString);
            });
        };
    
        // Verificação imediata se não houver tempo de espera.
        if (config.esperar === 0) {
            return checkCondition();
        }
    
        // Lógica de espera.
        return new Promise((resolve, reject) => {
            if (checkCondition()) {
                resolve(true);
                return;
            }
    
            let watcher;
            let poller;
            const startTime = Date.now();
            const timeoutMs = config.esperar * 1000;
    
            const cleanupAndFail = async () => {
                cleanup();
                if (config.dialogoFalha) {
                    this.rotinaState = 'paused';
                    const message = typeof config.dialogoFalha === 'string' ? config.dialogoFalha : `O texto/padrão "${alvo}" não foi encontrado. Deseja continuar a execução da rotina?`;
                    const userWantsToContinue = await this.createPromiseConfirmationModal('Verificação Falhou', message, { confirmText: 'Sim, continuar', cancelText: 'Não, parar' });
                    this.rotinaState = 'running';
                    if (userWantsToContinue) {
                        resolve(false);
                    } else {
                        reject(new UserCancellationError("Execução cancelada pelo usuário após falha na verificação."));
                    }
                } else if (config.lancarErro) {
                    reject(new Error(`Timeout esperando por: "${alvo}".`));
                } else {
                    resolve(false);
                }
            };
            
            const cleanup = () => {
                clearTimeout(poller);
                watcher?.dispose();
            };
    
            watcher = this.term.onWriteParsed(() => {
                if (checkCondition()) {
                    cleanup();
                    resolve(true);
                }
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

    prototype.velocidade = function(segundos) { 
        this.rotinaStepDelay = parseFloat(segundos);
        if (isNaN(this.rotinaStepDelay) || this.rotinaStepDelay < 0) this.rotinaStepDelay = 0.25;
    };
    
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
    
    prototype.teclar = async function(nomeTecla) {
        await this._checkRotinaState();
        const upperCaseKey = nomeTecla.toUpperCase();
        const sequence = this.keyMap[upperCaseKey];
        if (sequence) {
            await this.esperar(undefined);
            this.term._core._onData.fire(sequence);
            await this.waitForTerminalReady();
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
                await this.localizarTexto(textToType, { esperar: 5, lancarErro: true, area: { apenasCamposDigitaveis: true } });
            } catch (e) {
                 if (e instanceof UserCancellationError) {
                     throw e; 
                 }
                 throw new Error(`Falha na verificação: O texto "${textToType}" não foi encontrado na tela.`);
            }
        } else {
            await this.waitForTerminalReady();
        }
    };

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

    prototype.posicionar = async function(rotulo, options = {}) {
        await this._checkRotinaState();
        const { offset = 0, direcao = 'apos', caseSensitive = false } = options;
    
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
    
        // Tenta encontrar o rótulo por até 5 segundos.
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
                return true;
            }
        }
    
        throw new Error(`Rótulo "${rotulo}" não foi encontrado na tela.`);
    };
    
    prototype.getFullScreenText = function(toUpperCase = false) {
        const buffer = this.term.buffer.active;
        let fullScreenText = Array.from({ length: buffer.length }, (_, i) => buffer.getLine(i).translateToString(true)).join('\n');
        return toUpperCase ? fullScreenText.toUpperCase() : fullScreenText;
    };
    
    prototype.obterTexto = function(linhaInicial, colunaInicial, linhaFinal, colunaFinal) {
        // Overload based on the number of arguments provided.
        switch (arguments.length) {
            case 0:
                // obterTexto(): Retorna o texto da tela inteira.
                return this.getFullScreenText();
            case 1:
                // obterTexto(linha): Retorna o texto de uma linha específica.
                return this.obterTextoLinha(linhaInicial);
            case 2:
                // obterTexto(linha, coluna): Retorna o texto de uma linha a partir de uma coluna.
                return this.getBlockText(linhaInicial - 1, linhaInicial - 1, colunaInicial - 1, this.term.cols);
            case 4:
                // obterTexto(linhaInicial, colunaInicial, linhaFinal, colunaFinal): Retorna o texto de uma área.
                return this.getBlockText(linhaInicial - 1, linhaFinal - 1, colunaInicial - 1, colunaFinal);
            default:
                throw new Error("Número de argumentos inválido para obterTexto. Use 0, 1, 2 ou 4 argumentos.");
        }
    };

    prototype.obterTextoLinha = function(lineNumber = -1) {
        const y = lineNumber === -1 ? this.term.buffer.active.cursorY : lineNumber - 1;
        if (y < 0 || y >= this.term.rows) {
            throw new Error(`Número da linha inválido: ${lineNumber}. Deve ser entre 1 e ${this.term.rows}.`);
        }
        return this.getBlockText(y, y, 0, this.term.cols);
    };

    prototype.obterPosicaoCursor = function() {
        return {
            y: this.term.buffer.active.cursorY + 1,
            x: this.term.buffer.active.cursorX + 1
        };
    };

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

    prototype.lerTela = function(showModals = true) {
        return new Promise(async (resolve) => {
            await this._checkRotinaState();
            if (showModals) await this.createInstructionalModal("Copiar Área da Tela (Passo 1/2)", "Clique no ponto inicial da área que deseja copiar.");
            
            const startPos = await this.waitForMouseClick(10000);
            if (!startPos) {
                if(showModals) this.exibirNotificacao("Leitura de tela cancelada.", false);
                return resolve(null);
            }

            if (showModals) await this.createInstructionalModal("Copiar Área da Tela (Passo 2/2)", "Agora clique no ponto final da área que deseja copiar.");
            const endPos = await this.waitForMouseClick(10000);
            if (!endPos) {
                if(showModals) this.exibirNotificacao("Cópia de tela cancelada.", false);
                return resolve(null);
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
    
    // --- PROCESSAMENTO DE ARQUIVOS ---
    prototype.processarLinhas = async function(nomeArquivo, callback) {
        await this._checkRotinaState();
        try {
            const conteudo = await this.lerArquivo(nomeArquivo);
            if (conteudo) {
                const linhas = conteudo.split('\n').filter(l => l.trim() !== '');
                for (const [index, linha] of linhas.entries()) {
                    await this._checkRotinaState();
                    
                    // IMPORTANTE: O callback aqui é envolvido em um 'await' implícito pelo
                    // RotinaProcessor, permitindo que o usuário use funções como 'digitar'
                    // sem precisar escrever 'await' dentro do callback.
                    await callback(linha.trim(), index, linhas);
                }
            }
        } catch (e) {
            throw new Error(`Erro ao processar arquivo "${nomeArquivo}": ${e.message}`);
        }
    };

    // --- FUNCIONALIDADES AVANÇADAS ---
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

    /**
     * Obtém os dados do usuário logado a partir do cookie 'tokiuz'.
     * @returns {Promise<object|null>} Um objeto com as informações do usuário ou null se não for encontrado.
     */
    prototype.obterDadosUsuario = async function() {
        await this._checkRotinaState();
        const token = getCookie('tokiuz');
        if (!token) {
            this.exibirNotificacao("Token de usuário (tokiuz) não encontrado. Não é possível obter os dados.", false);
            return null;
        }

        const tokenData = decodeJwt(token);
        if (!tokenData) {
            this.exibirNotificacao("Falha ao decodificar os dados do usuário.", false);
            return null;
        }

        // Mapeia os campos para nomes mais descritivos
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
    
    prototype.debug = function(...args) {
        console.log('[DEBUG ROTINA]', ...args);
    
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
            
            // Controles
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
}
