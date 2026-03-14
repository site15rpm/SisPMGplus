// Arquivo: modules/terminal/terminal-ui.js
// Contém toda a lógica de manipulação do DOM (menus, modais, notificações).

export function initUI(prototype) {
    prototype.saveCursorPosition = function() { this.savedCursorPos = { x: this.term.buffer.active.cursorX, y: this.term.buffer.active.cursorY }; };
    prototype.restoreCursorPosition = function() { this.term.focus(); };
    prototype.closeModalAndFocus = function(modal) { if (modal) modal.remove(); this.restoreCursorPosition(); };

    prototype.createPreLoginUI = async function() {
        if (document.getElementById('top-right-ui-container')) return;
        const uiContainer = document.createElement('div');
        uiContainer.id = 'top-right-ui-container';
        
        uiContainer.innerHTML = `
            <div class="pre-login-wrapper">
                <div id="pre-login-alias-badge" class="tab-alias-badge">Aba: ${this.tabAlias || '?'}</div>
                <div id="rotina-menu-container">
                    <button id="rotina-menu-toggle">${this.iconSVG}</button>
                    <div id="rotina-menu-dropdown" class="hidden">
                        <div class="rotina-menu-item-static menu-title-static">Módulo Terminal</div>
                        <div class="rotina-menu-item-static menu-subtitle-static">Use o popup para configurar</div>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(uiContainer);
        
        const menuContainer = document.getElementById('rotina-menu-container');
        const dropdown = document.getElementById('rotina-menu-dropdown');
        let hideMenuTimeout;
        menuContainer.addEventListener('mouseenter', () => { clearTimeout(hideMenuTimeout); this.saveCursorPosition(); dropdown.classList.remove('hidden'); });
        menuContainer.addEventListener('mouseleave', () => { hideMenuTimeout = setTimeout(() => { dropdown.classList.add('hidden'); this.restoreCursorPosition(); }, 300); });
    };

    prototype.createFullMenu = function() {
        const uiContainer = document.getElementById('top-right-ui-container');
        if (!uiContainer) { console.error("Container da UI não encontrado."); return; }
        uiContainer.innerHTML = ''; // Limpa a UI antiga

        const horizontalContainer = document.createElement('div');
        horizontalContainer.className = 'horizontal-container';

        const taskbarContainer = document.createElement('div');
        taskbarContainer.id = 'taskbar-container';
        taskbarContainer.innerHTML = `
            <div id="full-menu-alias-badge" class="tab-alias-badge">Aba: ${this.tabAlias || '?'}</div>
            <button id="taskbar-copy-btn" class="taskbar-btn" title="Opções de Cópia">📋 Copiar</button>
            <button id="taskbar-paste-btn" class="taskbar-btn" title="Colar da Área de Transferência">📥 Colar</button>
            <button id="taskbar-backtab-btn" class="taskbar-btn" title="BackTab">↩️ BackTab</button>
            <button id="taskbar-clear-btn" class="taskbar-btn" title="Limpar Tela (Ctrl+U)">🧹 Limpar</button>
            <button id="taskbar-get-coords-btn" class="taskbar-btn" title="Obter Coordenadas por Clique">📍</button>
        `;

        const verticalBar = document.createElement('div');
        verticalBar.id = 'vertical-taskbar';
        verticalBar.className = 'hidden';
        
        const menuContainer = document.createElement('div');
        menuContainer.id = 'rotina-menu-container';
        
        const adminButton = this.userPM === '1453208' ? `<button class="rotina-menu-item" id="toggle-hidden-btn">👁️ Mostrar Ocultos</button>` : '';
        const adminDebug = this.userPM === '1453208' ? `<div class="rotina-menu-item-group">
                     <div class="rotina-menu-item-with-submenu"><span class="submenu-arrow">◀</span><span>Debug</span></div>
                     <div class="rotina-submenu hidden">
                        <button class="rotina-menu-item" id="toggle-spy-btn">🕵️‍♂️ Iniciar Monitor</button>
                     </div>
                </div>` : '';

        menuContainer.innerHTML = `
            <button id="rotina-menu-toggle">${this.iconSVG}</button>
            <div id="rotina-menu-dropdown" class="hidden">
                <div id="rotina-list-container"></div>
                <div class="rotina-menu-separator"></div>
                <button class="rotina-menu-item" id="refresh-rotinas-btn">🔄 Atualizar Rotinas</button>
                ${adminButton}
                <div class="rotina-menu-separator"></div>
                <button class="rotina-menu-item" id="create-rotina-btn">➕ Criar Nova Rotina</button>
                <button class="rotina-menu-item" id="record-rotina-btn">⏺️ Gravar Rotina</button>
                <div class="rotina-menu-separator"></div>
                <div class="rotina-menu-item-group">
                    <div class="rotina-menu-item-with-submenu"><span class="submenu-arrow">◀</span><span>Ações do Emulador</span></div>
                    <div class="rotina-submenu hidden">
                        <button class="rotina-menu-item" id="emulator-save-fields-btn">Salvar Campos de Entrada</button>
                        <button class="rotina-menu-item" id="emulator-restore-fields-btn">Restaurar Campos de Entrada</button>
                        <button class="rotina-menu-item" id="emulator-reenable-keyboard-btn">Reativar Teclado</button>
                        <div class="rotina-menu-separator"></div>
                        <button class="rotina-menu-item" id="emulator-monocase-btn">Alternar Monocase</button>
                        <button class="rotina-menu-item" id="emulator-blank-fill-btn">Alternar Preenchimento de Branco</button>
                        <button class="rotina-menu-item" id="emulator-show-timing-btn">Alternar Exibição de Tempo</button>
                        <button class="rotina-menu-item" id="emulator-crosshair-btn">Alternar Cursor em Cruz</button>
                        <button class="rotina-menu-item" id="emulator-underscore-btn">Alternar Cursor Sublinhado</button>
                        <button class="rotina-menu-item" id="emulator-visible-control-btn">Alternar Caracteres de Controle</button>
                        <button class="rotina-menu-item" id="emulator-typeahead-btn">Alternar Digitação Antecipada</button>
                        <button class="rotina-menu-item" id="emulator-insert-mode-btn">Alternar Modo de Inserção Padrão</button>
                    </div>
                </div>
                <div class="rotina-menu-separator"></div>
                <div class="rotina-menu-item-group">
                    <div class="rotina-menu-item-with-submenu"><span class="submenu-arrow">◀</span><span>Gerenciar Usuário</span></div>
                    <div class="rotina-submenu hidden">
                        <button class="rotina-menu-item" id="forget-password-btn">🔑 Esquecer Senha</button>
                        <button class="rotina-menu-item" id="forget-user-btn">👤 Esquecer Usuário</button>
                    </div>
                </div>
                ${adminDebug}
            </div>`;
        
        horizontalContainer.appendChild(taskbarContainer);
        horizontalContainer.appendChild(menuContainer);
        uiContainer.appendChild(horizontalContainer);
        uiContainer.appendChild(verticalBar);
        this.addFullMenuListeners();
    };

    prototype.addFullMenuListeners = function() {
        const addListener = (id, event, callback, commandToRecord = null) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(event, () => { 
                if (this.isRecording && !this.isRecordingPaused && commandToRecord) {
                    this._processTextBuffer();
                    this.recordedActions.push(commandToRecord);
                }
                callback(); 
                this.restoreCursorPosition(); 
            });
        };

        const hideDropdown = () => document.getElementById('rotina-menu-dropdown').classList.add('hidden');
        
        addListener('taskbar-copy-btn', 'click', () => this.showCopyOptionsModal());
        addListener('taskbar-paste-btn', 'click', () => this.colar(), 'colar();');
        addListener('taskbar-backtab-btn', 'click', () => this.teclar('BACKTAB'), `teclar('BACKTAB');`);
        addListener('taskbar-clear-btn', 'click', () => this.teclar('LIMPAR'), `teclar('LIMPAR');`);
        addListener('taskbar-get-coords-btn', 'click', () => this.getCoordsFromClick());
        
        // Listeners do menu principal
        addListener('forget-password-btn', 'click', () => { hideDropdown(); this.forgetPassword(); });
        addListener('forget-user-btn', 'click', () => { hideDropdown(); this.forgetUser(); });
        addListener('create-rotina-btn', 'click', () => { hideDropdown(); this.openEditor({}); });
        addListener('record-rotina-btn', 'click', async () => { hideDropdown(); await this.startRotinaRecording(); });
        addListener('refresh-rotinas-btn', 'click', () => { hideDropdown(); this.refreshRotinas(); });

        // Listeners do submenu "Ações do Emulador"
        addListener('emulator-save-fields-btn', 'click', async () => { hideDropdown(); await this.clicar(1, 3); await this.esperar(0.2); await this.clicar(8, 10); });
        addListener('emulator-restore-fields-btn', 'click', async () => { hideDropdown(); await this.clicar(1, 3); await this.esperar(0.2); await this.clicar(9, 10); });
        addListener('emulator-reenable-keyboard-btn', 'click', async () => { hideDropdown(); await this.clicar(1, 3); await this.esperar(0.2); await this.clicar(12, 10); });
        
        addListener('emulator-monocase-btn', 'click', async () => { hideDropdown(); await this.clicar(1, 11); await this.esperar(0.2); await this.clicar(3, 15); });
        addListener('emulator-blank-fill-btn', 'click', async () => { hideDropdown(); await this.clicar(1, 11); await this.esperar(0.2); await this.clicar(4, 15); });
        addListener('emulator-show-timing-btn', 'click', async () => { hideDropdown(); await this.clicar(1, 11); await this.esperar(0.2); await this.clicar(5, 15); });
        addListener('emulator-crosshair-btn', 'click', async () => { hideDropdown(); await this.clicar(1, 11); await this.esperar(0.2); await this.clicar(6, 15); });
        addListener('emulator-underscore-btn', 'click', async () => { hideDropdown(); await this.clicar(1, 11); await this.esperar(0.2); await this.clicar(7, 15); });
        addListener('emulator-visible-control-btn', 'click', async () => { hideDropdown(); await this.clicar(1, 11); await this.esperar(0.2); await this.clicar(8, 15); });
        addListener('emulator-typeahead-btn', 'click', async () => { hideDropdown(); await this.clicar(1, 11); await this.esperar(0.2); await this.clicar(9, 15); });
        addListener('emulator-insert-mode-btn', 'click', async () => { hideDropdown(); await this.clicar(1, 11); await this.esperar(0.2); await this.clicar(10, 15); });


        const dropdown = document.getElementById('rotina-menu-dropdown');
        let hideMenuTimeout;
        
        const menuContainer = document.getElementById('rotina-menu-container');
        menuContainer.addEventListener('mouseenter', () => { clearTimeout(hideMenuTimeout); this.saveCursorPosition(); dropdown.classList.remove('hidden'); });
        menuContainer.addEventListener('mouseleave', () => { hideMenuTimeout = setTimeout(() => { dropdown.classList.add('hidden'); this.restoreCursorPosition(); }, 300); });
        
        const spyBtn = document.getElementById('toggle-spy-btn');
        if(spyBtn) spyBtn.onclick = () => { hideDropdown(); this.isSpying = !this.isSpying; this.isSpying ? this.startDebugSpy() : this.stopDebugSpy(); spyBtn.innerHTML = this.isSpying ? "🛑 Parar Debug" : "🕵️‍♂️ Iniciar Debug"; this.restoreCursorPosition(); };
        
        const hiddenBtn = document.getElementById('toggle-hidden-btn');
        if(hiddenBtn) hiddenBtn.onclick = () => { hideDropdown(); this.showHiddenFiles = !this.showHiddenFiles; hiddenBtn.innerHTML = this.showHiddenFiles ? '🙈 Ocultar Arquivos' : '👁️ Mostrar Ocultos'; this.refreshRotinas(); };
        
        let submenuOpenTimeout;
        document.querySelectorAll('#rotina-menu-dropdown .rotina-menu-item-group').forEach(group => {
            let hideSubmenuTimeout;
            group.addEventListener('mouseenter', (e) => {
                clearTimeout(hideSubmenuTimeout);
                clearTimeout(submenuOpenTimeout);
                const targetGroup = e.currentTarget;
                submenuOpenTimeout = setTimeout(() => {
                    if (!targetGroup) return;
                    const parent = targetGroup.parentElement;
                    if (!parent) return;
                    const submenu = targetGroup.querySelector('.rotina-submenu');
                    if (submenu) {
                        parent.querySelectorAll('.rotina-submenu').forEach(s => {
                            if (s !== submenu) s.classList.add('hidden');
                        });
                        submenu.classList.remove('hidden');
                    }
                }, 150);
            });
            group.addEventListener('mouseleave', (e) => {
                clearTimeout(submenuOpenTimeout);
                const targetGroup = e.currentTarget;
                hideSubmenuTimeout = setTimeout(() => {
                    if (!targetGroup) return;
                    const submenu = targetGroup.querySelector('.rotina-submenu');
                    if (submenu) { submenu.classList.add('hidden'); }
                }, 300);
            });
        });
    };

    prototype.showCopyOptionsModal = function() {
        const contentHTML = `
            <p>Selecione o que deseja copiar:</p>
            <div class="copy-options-container">
                <button id="copy-screen-btn" class="system-select-btn">Tela Inteira</button>
                <button id="copy-current-line-btn" class="system-select-btn">Linha Atual</button>
                <button id="copy-range-btn" class="system-select-btn">Intervalo</button>
            </div>`;
        const modal = this.createModal('Opções de Cópia', contentHTML);

        const handleSimpleCopy = (command, actionFn) => {
            if (this.isRecording && !this.isRecordingPaused) {
                this._processTextBuffer();
                this.recordedActions.push(`${command};`);
                this.exibirNotificacao(`Ação '${command}' gravada.`, true);
            } else {
                actionFn();
            }
            this.closeModalAndFocus(modal);
        };

        modal.querySelector('#copy-screen-btn').onclick = () => handleSimpleCopy('copiar()', () => this.copiar());
        
        modal.querySelector('#copy-current-line-btn').onclick = () => {
            const currentLine = this.obterPosicaoCursor().y;
            handleSimpleCopy(`copiar(${currentLine})`, () => this.copiar(currentLine));
        };
        
        modal.querySelector('#copy-range-btn').onclick = async () => {
            this.closeModalAndFocus(modal);
            const selection = await this.lerTela(); 
            
            if (selection && selection.coords) {
                if (this.isRecording && !this.isRecordingPaused) {
                    this._processTextBuffer();
                    const { y1, y2, x1, x2 } = selection.coords;
                    this.recordedActions.push(`copiar(${y1}, ${x1}, ${y2}, ${x2});`);
                    this.exibirNotificacao(`Ação 'copiar' com intervalo gravada.`, true);
                } else {
                    await navigator.clipboard.writeText(selection.text);
                    this.exibirNotificacao("Intervalo copiado!", true);
                }
            } else {
                this.exibirNotificacao("Seleção cancelada.", false);
            }
        };
    };

    prototype.populateRotinaList = async function(rotinas) {
        const container = document.getElementById('rotina-list-container');
        if (!container) return;
        container.innerHTML = '';
        
        const result = await this.getStorage(['userProfiles']);
        const profiles = result.userProfiles || {};
        const userProfile = profiles[this.userPM] || {};
        const favorites = userProfile.favorites || [];

        const createMenuItem = (name, path, isPublic) => {
            const itemContainer = document.createElement('div');
            itemContainer.className = 'rotina-menu-item-container';
            const isFavorite = favorites.includes(path);
            
            let buttons = `<button class="rotina-menu-item rotina-exec-btn" data-rotina-name="${path}">▶️ ${name}</button>`;
            buttons += `<button class="rotina-menu-item-icon rotina-fav-btn" data-rotina-path="${path}" title="${isFavorite ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}">${isFavorite ? '⭐' : '✩'}</button>`;
            
            const isAdmin = this.userPM === '1453208';
            if (!isPublic || isAdmin) {
                buttons += `<button class="rotina-menu-item-icon rotina-edit-btn" data-rotina-name="${path}" data-is-public="${isPublic}" title="Editar">✏️</button>`;
            } else {
                buttons += `<button class="rotina-menu-item-icon rotina-view-btn" data-rotina-name="${path}" title="Visualizar">👁️</button>`;
            }
            itemContainer.innerHTML = buttons;
            return itemContainer;
        };

        const createSubMenu = (items, title, parentPath = '', isPublic = false) => {
            const group = document.createElement('div');
            group.className = 'rotina-menu-item-group';
            group.innerHTML = `<div class="rotina-menu-item-with-submenu"><span class="submenu-arrow">◀</span><span>${title}</span></div>`;
            const submenu = document.createElement('div');
            submenu.className = 'rotina-submenu hidden';
            
            const entries = Object.entries(items).sort(([keyA], [keyB]) => keyA.localeCompare(keyB));

            for (const [name, content] of entries) {
                const isHidden = /^\(.*\)$/.test(name);
                if (isHidden && !this.showHiddenFiles) {
                    continue;
                }

                const currentPath = parentPath ? `${parentPath}/${name}` : name;
                if (typeof content === 'object' && content !== null) {
                    const subMenuGroup = createSubMenu(content, `📁 ${name}`, currentPath, isPublic);
                    if (subMenuGroup) { 
                        submenu.appendChild(subMenuGroup);
                    }
                } else if (typeof content === 'string') {
                    submenu.appendChild(createMenuItem(name, currentPath, isPublic));
                }
            }
            
            if (submenu.children.length === 0) {
                return null;
            }

            group.appendChild(submenu);
            return group;
        };

        const publicSubMenu = createSubMenu(rotinas.public || {}, 'Rotinas Públicas', 'public', true);
        if (publicSubMenu) container.appendChild(publicSubMenu);

        const userSubMenu = createSubMenu(rotinas.user || {}, 'Minhas Rotinas', '', false);
        if (userSubMenu) container.appendChild(userSubMenu);
        
        const hideDropdown = () => document.getElementById('rotina-menu-dropdown').classList.add('hidden');
        
        container.querySelectorAll('.rotina-exec-btn').forEach(btn => btn.onclick = () => {
            hideDropdown();
            this.executarRotina(btn.dataset.rotinaName).catch(err => {
                if (err.message !== "Rotina interrompida pelo usuário.") {
                    console.error("Erro na execução da rotina:", err);
                }
            });
        });
        container.querySelectorAll('.rotina-edit-btn').forEach(btn => btn.onclick = () => { hideDropdown(); const name = btn.dataset.rotinaName; const isPublic = btn.dataset.isPublic === 'true'; this.openEditor({ name, content: this.getRotinaContent(name, isPublic), isUserRotina: !isPublic }); });
        container.querySelectorAll('.rotina-view-btn').forEach(btn => btn.onclick = () => { hideDropdown(); const name = btn.dataset.rotinaName; this.openEditor({ name, content: this.getRotinaContent(name, true), isUserRotina: false, readOnly: true }); });
        container.querySelectorAll('.rotina-fav-btn').forEach(btn => btn.onclick = (e) => { e.stopPropagation(); this.toggleFavorite(btn.dataset.rotinaPath); });
        
        let submenuOpenTimeout;
        container.querySelectorAll('.rotina-menu-item-group').forEach(group => {
            let hideSubmenuTimeout;
            group.addEventListener('mouseenter', (e) => {
                clearTimeout(hideSubmenuTimeout);
                clearTimeout(submenuOpenTimeout);
                const targetGroup = e.currentTarget;
                submenuOpenTimeout = setTimeout(() => {
                    if (!targetGroup) return;
                    const parent = targetGroup.parentElement;
                    if (!parent) return;
                    const submenu = targetGroup.querySelector('.rotina-submenu');
                    if (submenu) { 
                        parent.querySelectorAll('.rotina-submenu').forEach(s => {
                            if (s !== submenu) s.classList.add('hidden');
                        });
                        submenu.classList.remove('hidden'); 
                    }
                }, 150);
            });
             group.addEventListener('mouseleave', (e) => { 
                clearTimeout(submenuOpenTimeout);
                const targetGroup = e.currentTarget;
                hideSubmenuTimeout = setTimeout(() => {
                    if (!targetGroup) return;
                    const submenu = targetGroup.querySelector('.rotina-submenu'); 
                    if (submenu) { submenu.classList.add('hidden'); } 
                }, 300);
            });
        });
    };

    prototype.toggleFavorite = async function(rotinaPath) {
        if (!this.userPM) return;
        this.showLoadingOverlay('Salvando favorito...');
    
        try {
            const result = await this.getStorage(['userProfiles']);
            const profiles = result.userProfiles || {};
            const userProfile = profiles[this.userPM] || { favorites: [] };
            userProfile.favorites = userProfile.favorites || [];
    
            const favIndex = userProfile.favorites.indexOf(rotinaPath);
            if (favIndex > -1) {
                userProfile.favorites.splice(favIndex, 1);
            } else {
                userProfile.favorites.push(rotinaPath);
            }
            profiles[this.userPM] = userProfile;
    
            const success = await this.setStorage({ userProfiles: profiles });
    
            if (!success) {
                throw new Error("Falha ao salvar os favoritos no storage.");
            }
    
            const dropdown = document.getElementById('rotina-menu-dropdown');
            if (dropdown) dropdown.classList.add('hidden');
    
            setTimeout(() => {
                this.populateRotinaList(this.rotinas);
                this.populateFavoritesBar();
            }, 150);
        } catch (error) {
            console.error("Erro ao favoritar rotina:", error);
            this.exibirNotificacao("Não foi possível salvar o favorito.", false);
        } finally {
            this.hideLoadingOverlay();
        }
    };

    prototype.removeFavorite = async function(rotinaPath) {
        if (!this.userPM) return;
        
        try {
            const result = await this.getStorage(['userProfiles']);
            const profiles = result.userProfiles || {};
            const userProfile = profiles[this.userPM];
            
            if (!userProfile || !userProfile.favorites) {
                return;
            }
    
            const favIndex = userProfile.favorites.indexOf(rotinaPath);
            
            if (favIndex > -1) {
                userProfile.favorites.splice(favIndex, 1);
                profiles[this.userPM] = userProfile;
                await this.setStorage({ userProfiles: profiles });

                this.populateRotinaList(this.rotinas);
                this.populateFavoritesBar();
                this.exibirNotificacao(`Rotina "${rotinaPath}" removida dos favoritos.`, true);
            }
        } catch (error) {
            console.error("Erro ao remover rotina favorita:", error);
            this.exibirNotificacao("Não foi possível remover o favorito.", false);
        }
    };

    prototype.populateFavoritesBar = async function() {
        const bar = document.getElementById('vertical-taskbar');
        if (!bar) return;
        bar.innerHTML = '';
        const result = await this.getStorage(['userProfiles']);
        const profiles = result.userProfiles || {};
        const userProfile = profiles[this.userPM] || {};
        const favorites = userProfile.favorites || [];

        if(favorites.length > 0) {
            const title = document.createElement('div');
            title.className = 'vertical-bar-title';
            title.textContent = 'Favoritos';
            bar.appendChild(title);
        }

        favorites.forEach(path => {
            const btn = document.createElement('button');
            btn.className = 'vertical-bar-btn';
            btn.textContent = path.split('/').pop();
            btn.title = path;
            btn.onclick = () => this.executarRotina(path);
            bar.appendChild(btn);
        });
        bar.classList.toggle('hidden', bar.childElementCount === 0 && this.rotinaState === 'stopped');
    };

    prototype.exibirNotificacao = function(message, isSuccess = true, duration = 2) {
        this.notificationQueue.push({ message, isSuccess, duration });
        if (!this.isNotificationVisible) {
            this._processNotificationQueue();
        }
    };
    
    prototype._processNotificationQueue = function() {
        if (this.notificationQueue.length === 0) {
            this.isNotificationVisible = false;
            return;
        }
    
        this.isNotificationVisible = true;
        const { message, isSuccess, duration } = this.notificationQueue.shift();
    
        const el = document.createElement('div');
        el.className = 'rotina-notification';
        el.style.backgroundColor = isSuccess ? '#28a745' : '#dc3545';
        el.textContent = message;
        document.body.appendChild(el);
    
        setTimeout(() => {
            el.remove();
            this._processNotificationQueue();
        }, duration * 1000);
    };

    prototype.showRecordingControls = function() {
        const container = document.getElementById('vertical-taskbar');
        if (!container) return;
        container.innerHTML = `
            <div class="vertical-bar-title">🔴 Gravando</div>
            <button id="rec-stop-btn" class="vertical-bar-btn" title="Parar Gravação">⏹️ Parar</button>
            <button id="rec-pause-btn" class="vertical-bar-btn" title="Pausar Gravação">⏸️ Pausar</button>
            <button id="rec-edit-btn" class="vertical-bar-btn" title="Editar Passos">📝 Editar</button>
        `;
        container.classList.remove('hidden');
        document.getElementById('rec-stop-btn').onclick = () => this.stopRotinaRecording();
        document.getElementById('rec-pause-btn').onclick = () => this.togglePauseRecording();
        document.getElementById('rec-edit-btn').onclick = () => this.editCurrentRecording();
    };

    prototype.hideRecordingControls = function() {
        this.populateFavoritesBar();
        this.testingModal = null;
        this.lastTestData = null;
    };
    
    prototype.showRotinaExecutionControls = function(isTestRun = false) {
        const bar = document.getElementById('vertical-taskbar');
        if (!bar) {
            console.error("Barra de execução de rotina (#vertical-taskbar) não encontrada.");
            return;
        }
    
        const title = isTestRun ? 'Testando' : 'Executando';
        const editorButtonHTML = isTestRun ? `<button id="rotina-editor-btn" class="vertical-bar-btn" title="Parar Teste e Voltar ao Editor">📝 Editar</button>` : '';
        const pauseButtonText = this.rotinaState === 'paused' ? '▶️ Continuar' : '⏸️ Pausar';
    
        bar.innerHTML = `
            <div class="vertical-bar-title flashing-title">${title}</div>
            <button id="rotina-stop-btn" class="vertical-bar-btn" title="Parar Execução">⏹️ Parar</button>
            <button id="rotina-pause-resume-btn" class="vertical-bar-btn" title="Pausar/Continuar">${pauseButtonText}</button>
            ${editorButtonHTML}
        `;
    
        bar.classList.remove('hidden');
    
        const pauseBtn = document.getElementById('rotina-pause-resume-btn');
        if (pauseBtn) {
            pauseBtn.onclick = () => {
                if (this.rotinaState === 'running') {
                    this.rotinaState = 'paused';
                    pauseBtn.innerHTML = '▶️ Continuar';
                    this.exibirNotificacao("Rotina pausada.", true);
                } else if (this.rotinaState === 'paused') {
                    this.rotinaState = 'running';
                    pauseBtn.innerHTML = '⏸️ Pausar';
                    this.exibirNotificacao("Rotina retomada.", true);
                }
            };
        }
    
        const stopBtn = document.getElementById('rotina-stop-btn');
        if (stopBtn) {
            stopBtn.onclick = () => {
                this.exibirNotificacao("Rotina interrompida pelo usuário.", true);
                this.rotinaState = 'stopped';
                this.hideRotinaExecutionControls();
            };
        }
    
        const editorBtn = document.getElementById('rotina-editor-btn');
        if (editorBtn) {
            editorBtn.onclick = () => {
                if (this.testingModal) {
                    this.exibirNotificacao("Teste interrompido. Voltando ao editor.", true);
                    this.editAfterTest = true; 
                    this.rotinaState = 'stopped'; 
                }
            };
        }
    };

    prototype.updateTestControlsOnFinish = function() {
        const bar = document.getElementById('vertical-taskbar');
        if (!bar) return;

        bar.innerHTML = `
            <div class="vertical-bar-title">Testando</div>
            <button id="rotina-close-test-btn" class="vertical-bar-btn" title="Fechar controles de teste">❌ Fechar</button>
            <button id="rotina-retest-btn" class="vertical-bar-btn" title="Executar o teste novamente">🔄 Testar</button>
            <button id="rotina-edit-after-test-btn" class="vertical-bar-btn" title="Voltar ao editor de rotina">📝 Editar</button>
        `;

        bar.querySelector('#rotina-retest-btn').onclick = () => {
            if (this.lastTestData) {
                this.executarRotina(this.lastTestData.name, false, this.lastTestData.content, true);
            }
        };

        bar.querySelector('#rotina-edit-after-test-btn').onclick = () => {
            this.hideRotinaExecutionControls();
            if (this.lastTestData) {
                 this.openEditor({ 
                    name: this.lastTestData.name, 
                    content: this.lastTestData.content, 
                    isUserRotina: true 
                });
            }
        };
        
        bar.querySelector('#rotina-close-test-btn').onclick = () => {
            this.hideRotinaExecutionControls();
        };
    };

    prototype.hideRotinaExecutionControls = function() {
        this.populateFavoritesBar();
    };

    prototype.createConfirmationModal = function(title, message, onConfirm, onCancel = null) {
        this.createModal(title, `<p>${message}</p>`, null, [
            { text: 'Cancelar', className: 'rotina-modal-cancel-btn', action: (m) => { this.closeModalAndFocus(m); if (onCancel) onCancel(); } },
            { text: 'Confirmar', className: 'rotina-modal-save-btn', action: (m) => { this.closeModalAndFocus(m); if (onConfirm) onConfirm(); }}
        ]);
    };

    prototype.createInstructionalModal = function(title, message) {
        return new Promise(resolve => {
            this.createModal(title, `<p>${message}</p>`, null, [
                { text: 'OK', className: 'rotina-modal-save-btn', action: (m) => { this.closeModalAndFocus(m); resolve(true); } }
            ], { stack: true });
        });
    };

    prototype.createPromiseConfirmationModal = function(title, message, { confirmText = 'Confirmar', cancelText = 'Cancelar' } = {}) {
        return new Promise(resolve => {
            this.rotinaState = 'paused';
            this.createModal(title, `<p>${message}</p>`, null, [
                { text: cancelText, className: 'rotina-modal-cancel-btn', action: (m) => { this.closeModalAndFocus(m); this.rotinaState = 'running'; resolve(false); } },
                { text: confirmText, className: 'rotina-modal-save-btn', action: (m) => { this.closeModalAndFocus(m); this.rotinaState = 'running'; resolve(true); }}
            ], { stack: true });
        });
    };
    
    prototype.createModal = function(title, contentHTML, onSave = null, customButtons = [], options = {}) {
        const { showCloseButton = true, iconHTML = '', modalClass = '', stack = false, style = {} } = options;
        this.saveCursorPosition();
    
        if (!stack) {
            document.querySelector('.rotina-modal-backdrop')?.remove();
        }
    
        const modalBackdrop = document.createElement('div');
        modalBackdrop.className = 'rotina-modal-backdrop';
    
        let buttonsHTML = customButtons.map((btn, i) => `<button id="custom-btn-${i}" class="${btn.className || ''}">${btn.text}</button>`).join('');
        if (onSave) {
            buttonsHTML += `<button class="rotina-modal-cancel-btn">Cancelar</button><button class="rotina-modal-save-btn">Salvar</button>`;
        }
    
        modalBackdrop.innerHTML = `
            <div class="rotina-modal-content ${modalClass}">
                ${showCloseButton ? '<button class="rotina-modal-close-btn" title="Fechar">&times;</button>' : ''}
                <div class="rotina-modal-header">
                    ${iconHTML}
                    <h3>${title}</h3>
                </div>
                <div class="rotina-modal-body">${contentHTML}</div>
                <div class="rotina-modal-actions">${buttonsHTML}</div>
            </div>`;
    
        const modalContent = modalBackdrop.querySelector('.rotina-modal-content');
        Object.assign(modalContent.style, style);
    
        document.body.appendChild(modalBackdrop);
    
        if (showCloseButton) { modalBackdrop.querySelector('.rotina-modal-close-btn').onclick = () => this.closeModalAndFocus(modalBackdrop); }
    
        if (onSave) {
            modalBackdrop.querySelector('.rotina-modal-save-btn').onclick = () => onSave(modalBackdrop);
            modalBackdrop.querySelector('.rotina-modal-cancel-btn').onclick = () => this.closeModalAndFocus(modalBackdrop);
        }
        customButtons.forEach((btn, i) => {
            const buttonElement = modalBackdrop.querySelector(`#custom-btn-${i}`);
            if (buttonElement) {
                buttonElement.onclick = () => btn.action(modalBackdrop);
            }
        });
    
        const header = modalBackdrop.querySelector('.rotina-modal-header');
        if (header) {
            let isDragging = false;
            let initialMouseX, initialMouseY;
            let initialModalLeft, initialModalTop;

            header.onmousedown = (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
                
                isDragging = true;
                e.preventDefault();
                
                initialMouseX = e.clientX;
                initialMouseY = e.clientY;
                const rect = modalContent.getBoundingClientRect();
                initialModalLeft = rect.left;
                initialModalTop = rect.top;

                modalContent.style.position = 'fixed';
                modalContent.style.transform = 'none';
                modalContent.style.margin = '0';
                modalContent.style.left = `${initialModalLeft}px`;
                modalContent.style.top = `${initialModalTop}px`;

                document.onmousemove = (e_move) => {
                    if (isDragging) {
                        const dx = e_move.clientX - initialMouseX;
                        const dy = e_move.clientY - initialMouseY;
                        modalContent.style.left = `${initialModalLeft + dx}px`;
                        modalContent.style.top = `${initialModalTop + dy}px`;
                    }
                };
                document.onmouseup = () => {
                    isDragging = false;
                    document.onmousemove = null;
                    document.onmouseup = null;
                };
            };
        }
    
        return modalBackdrop;
    };
    
    prototype.showGenericErrorModal = function(name, error) {
        return new Promise(resolve => {
            const isTestRun = !!this.testingModal;
            const formattedMessage = error.message.replace(/\n/g, '<br>');
            const content = `<div class="rotina-error-message"><pre><code>${formattedMessage}</code></pre></div>`;
            
            const buttons = [
                { text: 'Parar', className: 'rotina-modal-delete-btn', action: (m) => { this.closeModalAndFocus(m); resolve('stop'); } },
                { 
                    text: 'Pausar', 
                    className: 'rotina-modal-cancel-btn', 
                    action: (m) => {
                        this.closeModalAndFocus(m);
                        this.rotinaState = 'paused';
                        this.showRotinaExecutionControls(isTestRun);
                        this.exibirNotificacao("Rotina pausada. Use a barra lateral para continuar/parar.", true, 5);
                        resolve('pause');
                    }
                },
                {
                    text: 'Continuar',
                    className: 'rotina-modal-save-btn',
                    action: (m) => { this.closeModalAndFocus(m); resolve('continue'); }
                },
                { text: '✏️ Editar', className: 'rotina-modal-test-btn', action: (m) => { this.closeModalAndFocus(m); resolve('edit'); } }
            ];
    
            this.createModal(`Erro na Rotina: ${name}`, content, null, buttons, { modalClass: 'error-modal', showCloseButton: false });
        });
    };
    
    prototype.showAutoRunErrorModal = function(name, error) {
        this.waitingForAutoRunTrigger = this.waitingForAutoRunTrigger.filter(item => item.path !== name);
        
        const formattedMessage = error.message.replace(/\n/g, '<br>');
        const contentHTML = `
            <p>A rotina de auto-execução <strong>"${name}"</strong> falhou com o seguinte erro:</p>
            <div class="rotina-error-message"><pre><code>${formattedMessage}</code></pre></div>
            <p>O que você gostaria de fazer?</p>
            <div class="auto-error-options">
                <div class="form-row-inline">
                    <input type="number" id="disable-minutes-input" value="5" min="1">
                    <button id="disable-timed-btn" class="system-select-btn">Desativar por Minutos</button>
                </div>
            </div>
        `;
    
        const buttons = [
            { text: 'Desativar Permanentemente', className: 'rotina-modal-delete-btn', action: async (m) => {
                let content = this.getRotinaContent(name);
                if (content) {
                    content = content.replace(/autoExecutar\s*\((.|\n)*?\)/g, `// autoExecutar() - Desativado por erro em ${new Date().toLocaleString()}`);
                    this.saveRotina(name, content);
                    this.exibirNotificacao(`Auto-execução da rotina "${name}" foi desativada permanentemente.`, true);
                }
                this.closeModalAndFocus(m);
            }},
            { text: 'Desativar nesta Sessão', className: 'rotina-modal-cancel-btn', action: (m) => {
                this.sessionDisabledAutoRun.push(name);
                this.exibirNotificacao(`Auto-execução de "${name}" desativada para esta sessão.`, true);
                this.closeModalAndFocus(m);
            }},
            { text: 'Pausar e Editar', className: 'rotina-modal-test-btn', action: (m) => {
                this.sessionDisabledAutoRun.push(name);
                this.closeModalAndFocus(m);
                const content = this.getRotinaContent(name);
                const isPublic = name.startsWith('public/');
                if (content !== null) {
                    this.openEditor({ name, content, isUserRotina: !isPublic });
                }
            }}
        ];
    
        const modal = this.createModal('Erro na Rotina de Auto-Execução', contentHTML, null, buttons, { modalClass: 'error-modal auto-error-modal' });
        
        modal.querySelector('#disable-timed-btn').onclick = () => {
            const minutes = parseInt(modal.querySelector('#disable-minutes-input').value, 10);
            if (minutes > 0) {
                this.timedDisabledAutoRun[name] = Date.now() + minutes * 60 * 1000;
                this.exibirNotificacao(`Auto-execução de "${name}" pausada por ${minutes} minuto(s).`, true);
                this.closeModalAndFocus(modal);
            }
        };
    };

    prototype.showLoadingOverlay = function(message = 'Processando...') {
        this.hideLoadingOverlay();
        const overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.className = 'loading-overlay-backdrop';
        overlay.innerHTML = `<div class="loading-overlay-content">${message}</div>`;
        document.body.appendChild(overlay);
    };
    prototype.hideLoadingOverlay = function() { document.getElementById('loading-overlay')?.remove(); };

}