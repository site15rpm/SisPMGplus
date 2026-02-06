// Arquivo: modules/terminal/terminal-rotinas.js
// Contém a lógica de gerenciamento e execução de rotinas.

// O RotinaProcessor é o motor que interpreta e executa o código da rotina.
class RotinaProcessor {
    constructor(rotinaCode, context) {
        this.context = context;
        this.code = rotinaCode;
    }

    // O método run é o coração do executor. Ele pega o código da rotina,
    // o processa para adicionar 'await' automaticamente e depois o executa.
    async run() {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        
        // Lista de todas as funções que são expostas ao ambiente de rotina.
        const specialFunctions = ['autoExecutar'];
        const commandNames = [];
        for (const key in this.context) {
            if (typeof this.context[key] === 'function' && key !== 'constructor' && !specialFunctions.includes(key)) {
                commandNames.push(key);
            }
        }
        
        // IMPORTANTE: Padronização de Funções Assíncronas
        // Para simplificar a escrita de rotinas, a extensão insere 'await'
        // automaticamente antes de chamar qualquer função listada em 'asyncCommandNames'.
        // Isso significa que o usuário NÃO PRECISA escrever 'await' em seu código.
        // Se novas funções assíncronas forem adicionadas ao escopo das rotinas,
        // elas DEVEM ser incluídas nesta lista para manter o comportamento.
        const asyncCommandNames = [
            'teclar', 'digitar', 'clicar', 'esperar', 'posicionar', 'localizarTexto',
            'colar', 'copiar', 'lerTela', 'criarModal', 'executarRotina', 'criarArquivo', 'lerArquivo',
            'excluirArquivo', 'anexarNoArquivo', 'processarLinhas', 'enviarParaPlanilha', 'obterDadosUsuario',
            'debug' 
        ];
        
        let processedCode = this.code;

        // Expressão regular que adiciona 'await' a chamadas de função assíncronas que ainda não o possuem.
        // (?<!await\\s+) é um "negative lookbehind" para não adicionar 'await' se ele já existir.
        // \\b garante que estamos pegando o nome exato da função, evitando substituições em nomes parciais.
        const regex = new RegExp(`(?<!await\\s+)(${asyncCommandNames.join('|')})\\b\\s*\\(`, 'g');
        processedCode = processedCode.replace(regex, 'await $1(');

        // Tratamento especial para o callback do processarLinhas
        processedCode = processedCode.replace(
            /processarLinhas\s*\(([^,]+),\s*\(([^)]*)\)\s*=>/g,
            'processarLinhas($1, async ($2) =>'
        );

        const fullCommandNames = [...commandNames, ...specialFunctions];
        
        let rotinaExecutor;
        try {
            // Cria uma nova função assíncrona com o código processado.
            rotinaExecutor = new AsyncFunction(...fullCommandNames, processedCode);
        } catch (e) {
            throw new Error(`Erro de sintaxe na rotina: ${e.message}`);
        }

        const boundCommands = commandNames.map(cmd => this.context[cmd].bind(this.context));
        
        specialFunctions.forEach(name => {
            if(this.context[name]) {
               boundCommands.push(this.context[name].bind(this.context));
            }
        });
        
        // Executa o código da rotina com as funções do contexto.
        await rotinaExecutor.apply(this.context, boundCommands);
    }
}


export function initRotinas(prototype) {

    // --- FUNÇÕES DE GERENCIAMENTO DE ROTINAS (CRUD) ---
    prototype.loadRotinasFromCache = async function() {
        const container = document.getElementById('rotina-list-container');
        if (container) {
            container.innerHTML = '<div class="rotina-menu-item-static">Carregando rotinas...</div>';
        }

        const response = await new Promise(resolve => this.sendMessage('getRotinas', { 
            showHidden: this.showHiddenFiles, 
            userPM: this.userPM,
            userName: this.userName
        }, resolve));

        if (response && response.success) {
            this.rotinas = response.data || { public: {}, user: {} };
            if (this.isLoggedIn) {
                await this.verifyAndCleanFavorites();
                this.populateRotinaList(this.rotinas);
                this.populateFavoritesBar(); 
            }
        } else {
            this.exibirNotificacao(response.error || 'Erro ao carregar rotinas.', false);
            if (container) {
                container.innerHTML = '<div class="rotina-menu-item-static" style="color: red;">Falha ao carregar</div>';
            }
        }
    };

    prototype.verifyAndCleanFavorites = async function() {
        if (!this.userPM || !this.rotinas) return;

        const result = await this.getStorage(['userProfiles']);
        const profiles = result.userProfiles || {};
        const userProfile = profiles[this.userPM];
        
        if (!userProfile || !userProfile.favorites || userProfile.favorites.length === 0) {
            return; 
        }

        const rotinaExists = (path) => this.getRotinaContent(path) !== null;

        const originalCount = userProfile.favorites.length;
        const cleanedFavorites = userProfile.favorites.filter(favPath => {
            const exists = rotinaExists(favPath);
            if (!exists) {
            }
            return exists;
        });

        if (cleanedFavorites.length < originalCount) {
            userProfile.favorites = cleanedFavorites;
            profiles[this.userPM] = userProfile;
            await this.setStorage({ userProfiles: profiles });
            this.exibirNotificacao("Lista de favoritos foi atualizada.", true);
        }
    };

    prototype.refreshRotinas = function() {
        const container = document.getElementById('rotina-list-container');
        if (container) container.innerHTML = '<div class="rotina-menu-item-static">Atualizando...</div>';
        this.showLoadingOverlay('Atualizando rotinas...');
        
        this.sendMessage('forceRefreshRotinas', { 
            showHidden: this.showHiddenFiles, 
            userPM: this.userPM,
            userName: this.userName
        }, (response) => {
            this.hideLoadingOverlay();
            if (response && response.success) {
                this.rotinas = response.data;
                this.populateRotinaList(this.rotinas);
                this.populateFavoritesBar();
                this.exibirNotificacao("Lista de rotinas atualizada.", true);
            } else {
                this.exibirNotificacao(response.error || 'Falha ao atualizar rotinas.', false);
                 if (container) container.innerHTML = '<div class="rotina-menu-item-static" style="color: red;">Falha ao carregar</div>';
            }
        });
    };

    prototype.loadTheme = function(themeName) {
        const existingLink = document.getElementById('codemirror-theme-link');
        if (existingLink) {
            existingLink.remove();
        }
        if (themeName !== 'default') {
            const link = document.createElement('link');
            link.id = 'codemirror-theme-link';
            link.rel = 'stylesheet';
            link.href = `https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/${themeName}.min.css`;
            document.head.appendChild(link);
        }
        
        if (this.cmInstance) {
            this.cmInstance.setOption('theme', themeName);
        }
    }

    prototype.openEditor = async function({ name = '', content = '', isUserRotina = true, readOnly = false, onSaveOverride = null } = {}) {
        this.saveCursorPosition();
        const isNew = !name;
        const isPublic = !isUserRotina;
        const isEditingRecording = !!onSaveOverride;
        let title = 'Editor de Rotina';
        if (isEditingRecording) title = 'Editando Passos da Gravação';
        else if (readOnly) title = `Visualizando: ${name}`;
        else if (isNew) title = 'Criar Nova Rotina';
        else title = `Editando: ${name}`;
    
        const contentHTML = `
            ${isEditingRecording ? '' : `
            <p>Nome da rotina (use / para criar pastas):</p>
            <input id="modal-rotina-name" type="text" value="${name}" ${readOnly ? 'disabled' : ''} placeholder="Ex: Pasta/Nome da Rotina" class="modal-text-input">`}
            
            <div class="editor-textarea-header">
                <p>Código da rotina:</p>
                <div class="editor-header-controls">
                    <select id="theme-selector" class="editor-control-btn" title="Selecionar Tema"></select>
                    <button id="find-btn" class="editor-control-btn" title="Localizar (Ctrl+F)">
                        <i class="fa-solid fa-magnifying-glass"></i>
                    </button>
                    <button id="replace-btn" class="editor-control-btn" title="Substituir (Ctrl+H)">
                        <i class="fa-solid fa-right-left"></i>
                    </button>
                    <button id="format-code-btn" class="editor-control-btn" title="Formatar Código">
                        <i class="fa-solid fa-wand-magic-sparkles"></i>
                    </button>
                    <button id="fullscreen-editor-btn" class="editor-control-btn" title="Tela Cheia">
                        <i class="fa-solid fa-expand"></i>
                    </button>
                </div>
            </div>
            <div id="codemirror-container"></div>`;
    
        let buttons = [];
        let footerRightHTML = '';
    
        if (!readOnly) {
            buttons.push({ text: '➕ Assistente', className: 'rotina-modal-builder-btn', action: (m) => this.openUiBuilder(this.cmInstance) });
            if (isUserRotina && !isNew && !isEditingRecording) {
                buttons.push({ text: 'Excluir', className: 'rotina-modal-delete-btn', action: (m) => { this.closeModalAndFocus(m); this.deleteRotina(name); } });
            }
            if (!isEditingRecording) {
                footerRightHTML += `<button id="test-rotina-btn" class="rotina-modal-test-btn">Testar</button>`;
            }
            footerRightHTML += `<button id="save-rotina-btn" class="rotina-modal-save-btn">Salvar</button>`;
        }
        
        buttons.push({ text: readOnly ? 'Fechar' : 'Cancelar', className: 'rotina-modal-cancel-btn', action: (m) => this.closeModalAndFocus(m) });
    
        const modal = this.createModal(title, contentHTML, null, buttons, { modalClass: 'rotina-editor-modal' });
        
        const themeSelector = modal.querySelector('#theme-selector');
        const availableThemes = [
            'default', '3024-day', '3024-night', 'abcdef', 'ambiance', 'ayu-dark', 'ayu-mirage', 'base16-dark', 
            'base16-light', 'bespin', 'blackboard', 'cobalt', 'colorforth', 'darcula', 'dracula', 'duotone-dark', 
            'duotone-light', 'eclipse', 'elegant', 'erlang-dark', 'gruvbox-dark', 'hopscotch', 'icecoder', 'idea', 
            'isotope', 'lesser-dark', 'liquibyte', 'lucario', 'material', 'material-darker', 'material-palenight', 
            'mbo', 'mdn-like', 'midnight', 'monokai', 'moxer', 'neat', 'neo', 'night', 'nord', 'oceanic-next', 
            'panda-syntax', 'paraiso-dark', 'paraiso-light', 'pastel-on-dark', 'railscasts', 'rubyblue', 'seti', 
            'shadowfox', 'solarized', 'ssms', 'the-matrix', 'tomorrow-night-bright', 'tomorrow-night-eighties', 
            'ttcn', 'twilight', 'vibrant-ink', 'xq-dark', 'xq-light', 'yeti', 'yonce', 'zenburn'
        ];
    
        availableThemes.forEach(theme => {
            const option = document.createElement('option');
            option.value = theme;
            option.textContent = theme.charAt(0).toUpperCase() + theme.slice(1).replace(/-/g, ' ');
            themeSelector.appendChild(option);
        });

        const savedData = await this.getStorage(['editorTheme']);
        let currentTheme = savedData.editorTheme || 'default';
        themeSelector.value = currentTheme;

        const editorContainer = modal.querySelector('#codemirror-container');

        this.cmInstance = CodeMirror(editorContainer, {
            value: content,
            mode: 'javascript',
            lineNumbers: true,
            theme: currentTheme,
            readOnly: readOnly,
            autoCloseBrackets: true,
            matchBrackets: true,
            extraKeys: {
                "Ctrl-F": "find",
                "Cmd-F": "find",
                "Ctrl-H": "replace",
                "Cmd-Option-F": "replace",
                 "Shift-Ctrl-H": "replaceAll",
                 "Shift-Cmd-Option-F": "replaceAll",
            }
        });

        this.loadTheme(currentTheme);

        themeSelector.onchange = () => {
            const newTheme = themeSelector.value;
            this.loadTheme(newTheme);
            this.setStorage({ editorTheme: newTheme });
        };
        
        const modalContent = modal.querySelector('.rotina-modal-content');
        const fullscreenBtn = modal.querySelector('#fullscreen-editor-btn');
        const formatBtn = modal.querySelector('#format-code-btn');
        const findBtn = modal.querySelector('#find-btn');
        const replaceBtn = modal.querySelector('#replace-btn');

        findBtn.onclick = () => this.cmInstance.execCommand("find");
        replaceBtn.onclick = () => this.cmInstance.execCommand("replace");

        const formatCode = () => {
            this.cmInstance.operation(() => {
                const totalLines = this.cmInstance.lineCount();
                for (let i = 0; i < totalLines; i++) {
                    this.cmInstance.indentLine(i);
                }
            });
            this.cmInstance.setCursor({ line: 0, ch: 0 });
            this.exibirNotificacao("Código formatado.", true);
        };
        formatBtn.onclick = formatCode;
        
        fullscreenBtn.onclick = () => {
            modalContent.classList.toggle('fullscreen');
            const icon = fullscreenBtn.querySelector('i');
            icon.classList.toggle('fa-expand');
            icon.classList.toggle('fa-compress');
            fullscreenBtn.title = modalContent.classList.contains('fullscreen') ? 'Sair da Tela Cheia' : 'Tela Cheia';
            setTimeout(() => this.cmInstance.refresh(), 10);
        };

        this.cmInstance.on('contextmenu', (cm, event) => {
            event.preventDefault();
            this.createContextMenu(event, this.cmInstance, formatCode);
        });

        const actionsContainer = modal.querySelector('.rotina-modal-actions');
        if (actionsContainer && footerRightHTML) {
            actionsContainer.classList.add('justify-between');
            actionsContainer.insertAdjacentHTML('beforeend', footerRightHTML);
        }
    
        const saveButton = modal.querySelector('#save-rotina-btn');
        if (saveButton) {
            saveButton.onclick = () => {
                const finalContent = this.cmInstance.getValue();
                if (onSaveOverride) {
                    onSaveOverride(finalContent);
                    this.closeModalAndFocus(modal);
                    return;
                }
    
                const finalName = modal.querySelector('#modal-rotina-name').value.trim();
                if (!finalName.match(/^[a-zA-Z0-9_()/\s-]+$/) || finalName.endsWith('/') || !finalName) {
                    this.exibirNotificacao('Nome inválido. Não pode ser vazio ou terminar com /.', false);
                    return;
                }
                this.saveRotina(finalName, finalContent, isPublic);
                this.closeModalAndFocus(modal);
            };
        }

        const testButton = modal.querySelector('#test-rotina-btn');
        if (testButton) {
            testButton.onclick = () => {
                const testName = modal.querySelector('#modal-rotina-name').value.trim() || 'Nova Rotina (Teste)';
                const testContent = this.cmInstance.getValue();
                
                this.testingModal = modal;
                this.lastTestData = { name: testName, content: testContent };
                modal.style.display = 'none';

                this.executarRotina(testName, false, testContent, true);
            };
        }
         setTimeout(() => this.cmInstance.refresh(), 10);
    };

    prototype.createContextMenu = function(event, cmInstance, formatFn) {
        this.removeContextMenu();
        event.preventDefault();

        const menu = document.createElement('div');
        menu.id = 'editor-context-menu';
        menu.className = 'editor-context-menu';
        
        const hasSelection = cmInstance.somethingSelected();

        menu.innerHTML = `
            <div class="context-menu-item" data-action="cut"${!hasSelection ? ' style="opacity:0.5;pointer-events:none;"' : ''}><i class="fa-fw fa-solid fa-scissors"></i> Recortar</div>
            <div class="context-menu-item" data-action="copy"${!hasSelection ? ' style="opacity:0.5;pointer-events:none;"' : ''}><i class="fa-fw fa-solid fa-copy"></i> Copiar</div>
            <div class="context-menu-item" data-action="paste"><i class="fa-fw fa-solid fa-paste"></i> Colar</div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" data-action="find"><i class="fa-fw fa-solid fa-magnifying-glass"></i> Localizar</div>
            <div class="context-menu-item" data-action="replace"><i class="fa-fw fa-solid fa-right-left"></i> Substituir</div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" data-action="comment"><i class="fa-fw fa-solid fa-comment-dots"></i> Comentar/Descomentar</div>
            <div class="context-menu-item" data-action="format"><i class="fa-fw fa-solid fa-align-left"></i> Formatar Código</div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" data-action="undo"><i class="fa-fw fa-solid fa-rotate-left"></i> Desfazer</div>
            <div class="context-menu-item" data-action="redo"><i class="fa-fw fa-solid fa-rotate-right"></i> Refazer</div>
        `;
        
        menu.style.top = `${event.clientY}px`;
        menu.style.left = `${event.clientX}px`;
        document.body.appendChild(menu);

        setTimeout(() => {
            document.addEventListener('click', this.removeContextMenu.bind(this), { once: true, capture: true });
        }, 0);

        menu.addEventListener('click', async (e) => {
            const target = e.target.closest('.context-menu-item');
            if (!target) return;
            const action = target.dataset.action;
            
            switch(action) {
                case 'cut': document.execCommand('cut'); break;
                case 'copy': document.execCommand('copy'); break;
                case 'paste': 
                    try {
                        const text = await navigator.clipboard.readText();
                        cmInstance.replaceSelection(text);
                    } catch (err) { console.error('Falha ao colar:', err); }
                    break;
                case 'find': cmInstance.execCommand("find"); break;
                case 'replace': cmInstance.execCommand("replace"); break;
                case 'comment':
                    cmInstance.toggleComment({ from: cmInstance.getCursor("start"), to: cmInstance.getCursor("end") });
                    break;
                case 'format': formatFn(); break;
                case 'undo': cmInstance.undo(); break;
                case 'redo': cmInstance.redo(); break;
            }
        });
    };
    
    prototype.removeContextMenu = function() {
        const menu = document.getElementById('editor-context-menu');
        if (menu) {
            menu.remove();
        }
        document.removeEventListener('click', this.removeContextMenu, { capture: true });
    };

    prototype.saveRotina = function(name, content, isPublic = false) {
        if (!this.userPM) { this.exibirNotificacao("Usuário não logado.", false); return; }
        
        let finalName = name;
        if (isPublic && name.toLowerCase().startsWith('public/')) {
            finalName = name.substring('public/'.length);
        }

        this.showLoadingOverlay('Salvando rotina...');
        this.sendMessage('saveRotina', { name: finalName, content, userPM: this.userPM, userName: this.userName, isPublic }, (response) => {
            this.hideLoadingOverlay();
            if (response && response.success) {
                this.exibirNotificacao(`Rotina "${finalName}" salva!`);
                this.refreshRotinas();
            } else { this.exibirNotificacao(response.error || 'Erro ao salvar.', false); }
        });
    };

    prototype.deleteRotina = function(name) {
        if (!this.userPM) { this.exibirNotificacao("Usuário não logado.", false); return; }
        
        this.createConfirmationModal('Confirmar Exclusão', `Excluir a rotina "${name}"?`, () => {
            this.showLoadingOverlay('Excluindo rotina...');
            this.sendMessage('deleteRotina', { name, userPM: this.userPM }, async (response) => {
                this.hideLoadingOverlay();
                if (response && response.success) {
                    this.exibirNotificacao(`Rotina "${name}" excluída.`);
                    
                    const result = await this.getStorage(['userProfiles']);
                    const profiles = result.userProfiles || {};
                    const userProfile = profiles[this.userPM];
                    if (userProfile && userProfile.favorites) {
                        const favIndex = userProfile.favorites.indexOf(name);
                        if (favIndex > -1) {
                            userProfile.favorites.splice(favIndex, 1);
                            await this.setStorage({ userProfiles: profiles });
                        }
                    }
                    this.refreshRotinas();
                } else { this.exibirNotificacao(response.error || 'Erro ao excluir.', false); }
            });
        });
    };
    
    // --- FUNÇÕES DE EXECUÇÃO E GRAVAÇÃO DE ROTINAS ---

    prototype.getRotinaContent = function(name, isPublic = false) {
        const pathParts = name.split('/');
        
        const findPath = (obj, path) => {
            let current = obj;
            for (let i = 0; i < path.length; i++) {
                if (current === undefined || current === null) return null;
                current = current[path[i]];
            }
            return current;
        };
    
        let content = null;

        // Se o caminho começa com 'public', busca apenas nas rotinas públicas.
        if (pathParts[0].toLowerCase() === 'public') {
            content = findPath(this.rotinas.public, pathParts.slice(1));
        } 
        // Se o contexto da chamada (ex: UI) já define como pública.
        else if (isPublic) {
            content = findPath(this.rotinas.public, pathParts);
        } 
        // Caso contrário, busca apenas nas rotinas do usuário.
        else {
            content = findPath(this.rotinas.user, pathParts);
        }
    
        return typeof content === 'string' ? content : null;
    };

    prototype.executarRotina = async function(name, isAutoRun = false, customCode = null, isTestRun = false) {
        if ((this.rotinaState === 'running' || this.rotinaState === 'paused') && !isTestRun && !isAutoRun) {
            const subRotinaText = customCode ?? this.getRotinaContent(name);
            if (subRotinaText === null) {
                this.exibirNotificacao(`Sub-rotina "${name}" não encontrada.`, false);
                throw new Error(`Sub-rotina "${name}" não encontrada.`);
            }

            this.exibirNotificacao(`Executando sub-rotina: "${name}"...`, true);
            const subProcessor = new RotinaProcessor(subRotinaText, this);
            try {
                await subProcessor.run();
                this.exibirNotificacao(`Sub-rotina "${name}" concluída.`, true);
            } catch (error) {
                throw error;
            }
            return;
        }

        if (this.rotinaState === 'running' || this.rotinaState === 'paused') {
            if (isAutoRun) return;
            this.exibirNotificacao("Aguarde a rotina atual terminar.", false);
            return;
        }
        
        const rotinaText = customCode ?? this.getRotinaContent(name);
        if (rotinaText === null) {
            this.exibirNotificacao(`Rotina "${name}" não encontrada.`, false);
            if (typeof this.removeFavorite === 'function') {
                this.removeFavorite(name);
            }
            return;
        }
        
        this.term.focus();
        this.exibirNotificacao(`Executando: "${name}"...`, true);
        this.rotinaState = 'running';
        this.editAfterTest = false; 
        this.currentRotinaProcessor = new RotinaProcessor(rotinaText, this);
        this.showRotinaExecutionControls(isTestRun);
        
        try {
            this.term.options.disableStdin = true;
            await this.currentRotinaProcessor.run();
            if (this.rotinaState !== 'stopped') {
                this.exibirNotificacao(`Rotina "${name}" concluída.`, true);
            }
        } catch (error) {
            if (error.name === 'UserCancellationError') {
                // Erro de cancelamento do usuário é tratado no finally, sem exibir modal de erro.
            } else {
                console.error(`Erro ao executar a rotina '${name}':`, error);

                if (isAutoRun) {
                    this.showAutoRunErrorModal(name, error);
                } else {
                    const userChoice = await this.showGenericErrorModal(name, error);
                    
                    switch(userChoice) {
                        case 'stop':
                            this.rotinaState = 'stopped';
                            break;
                        case 'pause':
                            // A lógica de pausar já foi tratada no modal
                            break;
                        case 'continue':
                            this.exibirNotificacao("Erro ignorado. Continuando a execução.", true, 3);
                            // Permite que o loop continue (se houver), engolindo o erro.
                            break;
                        case 'edit':
                            this.rotinaState = 'stopped';
                            const content = customCode ?? this.getRotinaContent(name);
                            if (content !== null) {
                                const isPublic = !isTestRun && name.startsWith('public/');
                                this.openEditor({ name, content, isUserRotina: isTestRun || !isPublic });
                            }
                            break;
                    }
                }
            }
        } finally {
            this.term.options.disableStdin = false;
            
            if (this.rotinaState !== 'paused') {
                this.rotinaState = 'stopped';
                this.currentRotinaProcessor = null;
                
                if (isTestRun) {
                    if (this.editAfterTest) {
                        if (this.testingModal) this.testingModal.style.display = 'flex';
                        this.hideRotinaExecutionControls();
                    } else {
                        this.updateTestControlsOnFinish();
                    }
                } else {
                    this.hideRotinaExecutionControls();
                }

                if (!this.editAfterTest) this.testingModal = null;
                this.editAfterTest = false;
            }
        }
    };
    
    prototype.startRotinaRecording = async function() {
        if (this.isRecording) return;
        document.getElementById('top-right-ui-container')?.classList.add('is-recording');
        this.isRecording = true;
        this.isRecordingPaused = false;
        this.recordedActions = [];
        this.textBuffer = '';

        this.recordedActions.push(`// Rotina gravada em: ${new Date().toLocaleString('pt-BR')}`);

        const startCursorY = this.term.buffer.active.cursorY;
        const startCursorX = this.term.buffer.active.cursorX;
        
        this.recordedActions.push(`clicar(${startCursorY + 1}, ${startCursorX + 1});`);

        this.showRecordingControls();
        this.exibirNotificacao("Gravação iniciada...", true);
        
        this.recordingListener = this.term.onData(data => {
            if (!this.isRecording || this.isRecordingPaused) return;
            const specialKeyName = Object.keys(this.keyMap).find(key => this.keyMap[key] === data);
            const mouseClickMatch = data.match(/^\u001b\[<0;(\d+);(\d+)([Mm])$/);

            if (specialKeyName || mouseClickMatch) {
                this._processTextBuffer(); 
                if (mouseClickMatch && mouseClickMatch[3] === 'M') {
                     this.recordedActions.push(`clicar(${parseInt(mouseClickMatch[2])}, ${parseInt(mouseClickMatch[1])});`);
                } else if (specialKeyName) {
                    this.recordedActions.push(`teclar('${specialKeyName}');`);
                }
            } else if (data.length >= 1 && data.charCodeAt(0) >= 32) {
                this.textBuffer += data;
            }
        });
        this.restoreCursorPosition();
    };

    prototype.stopRotinaRecording = function() {
        if (!this.isRecording) return;
        this._processTextBuffer(); 
        this.isRecording = false;
        if (this.recordingListener) this.recordingListener.dispose();
        
        document.getElementById('top-right-ui-container')?.classList.remove('is-recording');
        this.hideRecordingControls();
        this.exibirNotificacao("Gravação finalizada.", true);

        this.openEditor({ content: this.recordedActions.join('\n'), isUserRotina: true });
    };

    prototype.togglePauseRecording = function() {
        if (!this.isRecording) return;
        this.isRecordingPaused = !this.isRecordingPaused;
        const pauseButton = document.getElementById('rec-pause-btn');
        if (this.isRecordingPaused) {
            this._processTextBuffer();
            pauseButton.innerHTML = '▶️ Continuar';
            this.exibirNotificacao("Gravação pausada.", true);
        } else {
            pauseButton.innerHTML = '⏸️ Pausar';
            this.exibirNotificacao("Gravação retomada.", true);
        }
        this.restoreCursorPosition();
    };

    prototype.editCurrentRecording = function() {
        if (!this.isRecording) return;
        if (!this.isRecordingPaused) this.togglePauseRecording();
        const onSaveOverride = (newContent) => {
            this.exibirNotificacao("Passos da gravação atualizados.");
            this.recordedActions = newContent.split('\n');
        };
        this.openEditor({ content: this.recordedActions.join('\n'), onSaveOverride, isEditingRecording: true });
    };

    prototype.checkForAutoExecutarRotinas = async function() {
        if (this.rotinaState !== 'stopped') return;

        const fullScreenText = this.getFullScreenText(true);
        if (!fullScreenText) return;
    
        const now = Date.now();
        const timedDisabled = Object.keys(this.timedDisabledAutoRun).filter(key => this.timedDisabledAutoRun[key] > now);
        const waitingPaths = this.waitingForAutoRunTrigger.map(item => item.path);

        const findAndExec = async (obj, path) => {
            for (const key in obj) {
                const currentPath = path ? `${path}/${key}` : key;
    
                if (this.sessionDisabledAutoRun.includes(currentPath) || timedDisabled.includes(currentPath) || waitingPaths.includes(currentPath)) {
                    continue;
                }
    
                const content = obj[key];
                if (typeof content === 'object' && content !== null) {
                    await findAndExec(content, currentPath);
                } else if (typeof content === 'string') {
                    const lines = content.split('\n');
                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (trimmedLine.startsWith('//')) continue;

                        const autoRunRegex = /autoExecutar\s*\(\s*["'`](.*?)["'`](?:\s*,\s*\{\s*on:\s*["'`](.*?)["'`](?:\s*\})?)?\s*\)/;
                        const match = trimmedLine.match(autoRunRegex);
                        
                        if (match) {
                            const expectedText = match[1].trim().toUpperCase();
                            if (fullScreenText.includes(expectedText)) {
                                const trigger = (match[2] || 'ENTER').toUpperCase();
                                this.waitingForAutoRunTrigger.push({ path: currentPath, trigger: trigger });
                                await this.executarRotina(currentPath, true);
                                return;
                            }
                        }
                    }
                }
            }
        };
    
        if (this.rotinas.user) await findAndExec(this.rotinas.user, '');
        if (this.rotinaState === 'stopped' && this.rotinas.public) await findAndExec(this.rotinas.public, '');
    };
    
    prototype._processTextBuffer = function() {
        if (this.textBuffer) {
            this.recordedActions.push(`digitar('${this.textBuffer.replace(/'/g, "\\'")}');`);
            this.textBuffer = '';
        }
    };

    prototype.autoExecutar = function() {
        // Esta função serve como um marcador para a lógica em checkForAutoExecutarRotinas.
        // Ela não tem implementação aqui propositalmente.
    };
}
