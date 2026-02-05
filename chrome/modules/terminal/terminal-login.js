// Arquivo: modules/terminal/terminal-login.js
// Contém a lógica de fluxo de login, captura de credenciais e automação.

function decodeJwt(token) { 
    try { 
        return JSON.parse(atob(token.split('.')[1])); 
    } catch (e) { 
        console.error("Erro ao decodificar JWT:", e); 
        return null; 
    } 
}
function getCookie(name) { 
    const v = `; ${document.cookie}`; 
    const p = v.split(`; ${name}=`); 
    if (p.length === 2) return p.pop().split(';').shift(); 
    return undefined; 
}


export function initLogin(prototype) {
    // --- PROPRIEDADES DE ESTADO DE LOGIN ---
    prototype.userPM = null;
    prototype.userName = null;
    prototype.isLoggedIn = false;
    prototype.loginFlowActive = false;
    prototype.isMonitoringPausedForManualLogin = false;
    prototype.selectedSystemName = '';
    prototype.passwordChangeFlowActive = false;

    // --- FUNÇÕES DE GERENCIAMENTO DE USUÁRIO ---
    
    /**
     * Remove a senha salva para o usuário atual.
     * @param {string} reason - O motivo (ex: "incorreta", "expirada") para o log.
     */
    prototype.clearSavedPassword = async function(reason) {
        if (!this.userPM) return;
        const result = await this.getStorage(['userProfiles']);
        const profiles = result.userProfiles || {};
        const userProfile = profiles[this.userPM];
        if (userProfile && userProfile.pass) {
            delete userProfile.pass;
            userProfile.autoLoginEnabled = false;
            await this.setStorage({ userProfiles: profiles });
            this.exibirNotificacao(`Senha ${reason}. Login automático desativado.`, false, 5);
        }
    };

    prototype.forgetPassword = async function() {
        if (!this.userPM) return;
        const result = await this.getStorage(['userProfiles']);
        const profiles = result.userProfiles || {};
        const userProfile = profiles[this.userPM];
        if (!userProfile || !userProfile.pass) {
            this.exibirNotificacao("Nenhuma senha salva para o usuário atual.", true);
            return;
        }
        const userName = userProfile.tokenData ? userProfile.tokenData.n : this.userPM;
        this.createConfirmationModal(`Esquecer Senha`, `Deseja remover a senha salva para ${userName}?`, async () => {
            delete userProfile.pass;
            userProfile.autoLoginEnabled = false;
            await this.setStorage({ userProfiles: profiles });
            this.exibirNotificacao(`Senha esquecida para ${userName}.`);
        });
    };

    prototype.forgetUser = async function() {
        if (!this.userPM) return;
        const result = await this.getStorage(['userProfiles']);
        const profiles = result.userProfiles || {};
        if (!profiles[this.userPM]) return;
        const userName = profiles[this.userPM].tokenData ? profiles[this.userPM].tokenData.n : this.userPM;
        this.createConfirmationModal(`Esquecer Usuário`, `Deseja remover TODOS os dados para ${userName}?`, async () => {
            delete profiles[this.userPM];
            await this.setStorage({ userProfiles: profiles });
            this.rotinas = { public: {}, user: {} };
            this.populateRotinaList(this.rotinas); 
            this.exibirNotificacao(`Dados esquecidos para ${userName}. Recarregando...`);
            setTimeout(() => this.reloadPage(), 1500);
        });
    };

    // --- LÓGICA DE CONTROLE DE MONITORAMENTO ---
    prototype.pauseAutomaticLoginMonitoring = function() {
        this.isMonitoringPausedForManualLogin = true;
    };

    prototype.resumeScreenMonitoring = function() {
        this.isMonitoringPausedForManualLogin = false;
        this.processScreenState();
    };

    // --- FUNÇÃO CENTRALIZADORA DE LÓGICA DE LOGIN ---
    prototype.handleLoginScreen = async function() {
        if (this.isMonitoringPausedForManualLogin) {
            if (await this.localizarTexto("Logon executado com sucesso", { esperar: 0 })) {
                this.isLoggedIn = true;
                this.reloginInProgress = false;
                this.createFullMenu();
                await this.loadRotinasFromCache();
                this.resumeScreenMonitoring();
            }
            return true;
        }
        
        if (await this.localizarTexto("Senha expirada", { esperar: 0 })) {
            if (!this.passwordChangeFlowActive) {
                this.passwordChangeFlowActive = true;
                // Esta função já limpa a senha salva e pausa o monitoramento
                this.handleExpiredPasswordAndStop();
            }
            return true;
        }

        const isLoginScreen = await this.localizarTexto(["Aplicacao", "Usuario"], { esperar: 0 });
        const isPasswordChangeScreen = await this.localizarTexto("Nova senha", { esperar: 0 });

        if (isLoginScreen && !isPasswordChangeScreen && !this.isLoggedIn && !this.loginFlowActive) {
            this.loginFlowActive = true; 
            this.startLoginFlow();
            return true;
        }

        return false;
    };

    prototype.handleExpiredPasswordAndStop = async function() {
        this.pauseAutomaticLoginMonitoring();
        this.exibirNotificacao("Senha expirada. Preenchendo dados para troca manual...", true);
        
        try {
            const result = await this.getStorage(['userProfiles']);
            const profiles = result.userProfiles || {};
            const userProfile = profiles[this.userPM];

            if (userProfile && userProfile.user && userProfile.pass) {
                const terminalUser = userProfile.user;
                const expiredPassword = userProfile.pass;

                if (!await this.posicionar('Usuario')) throw new Error("Campo 'Usuario' não encontrado.");
                await this.digitar(terminalUser);

                if (!await this.posicionar('Senha..')) throw new Error("Campo 'Senha..' não encontrado.");
                await this.digitar(expiredPassword, false);

                // Deleta a senha salva
                delete userProfile.pass;
                userProfile.autoLoginEnabled = false;
                await this.setStorage({ userProfiles: profiles });

                this.exibirNotificacao("Senha antiga removida. Por favor, cadastre a nova senha manualmente.", true, 5000);
                
                // Posiciona o cursor para o usuário
                await this.posicionar('Nova senha');
            } else {
                this.exibirNotificacao("Não foi possível encontrar dados salvos para preenchimento.", false);
            }
        } catch (error) {
            this.exibirNotificacao(`Erro ao preencher dados: ${error.message}`, false);
        }
        // Mantém o monitoramento pausado para o usuário finalizar o processo.
    };

    // --- LÓGICA DE LOGIN E TOKEN ---
    prototype.waitForToken = async function(retries = 10, interval = 500) {
        for (let i = 0; i < retries; i++) {
            const token = getCookie('tokiuz');
            if (token) return token;
            await new Promise(resolve => setTimeout(resolve, interval));
        }
        return null;
    };

    prototype.startLoginFlow = async function() {
        const token = await this.waitForToken();
        if (!token) {
            console.error("Sessão não encontrada. A extensão não continuará.");
            this.exibirNotificacao("Sessão não encontrada. A página será recarregada.", false);
            setTimeout(() => this.reloadPage(), 3000);
            return;
        }
        const tokenData = decodeJwt(token);
        if (!tokenData || !tokenData.g) {
            console.error("Token inválido. A extensão não continuará.");
            this.loginFlowActive = false;
            return;
        }
        
        this.userPM = tokenData.g;
        this.userName = tokenData.n;
        this.sendMessage('refreshRotinas', { userPM: this.userPM, showHidden: this.showHiddenFiles });

        this.showSystemSelectionModal(tokenData);
    };

    prototype.showSystemSelectionModal = async function(tokenData) {
        const result = await this.getStorage(['userProfiles']);
        const profiles = result.userProfiles || {};
        const userProfile = profiles[tokenData.g];
        const hasSavedPass = userProfile && userProfile.autoLoginEnabled && userProfile.pass;
        
        const contentHTML = `
            <div class="modal-header-container">
                <p class="modal-user-greeting">Usuário: <strong>${tokenData.n}</strong></p>
                <button id="change-user-btn" class="rotina-modal-delete-btn">Trocar Usuário</button>
            </div>
            <p>Clique no sistema desejado para iniciar:</p>
            <div class="system-selection-container">
                <button class="system-select-btn" data-system="SIRH">SIRH</button>
                <button class="system-select-btn" data-system="SICI">SICI</button>
                <button class="system-select-btn" data-system="SIEP">SIEP</button>
                <button class="system-select-btn" data-system="SIAF">SIAF</button>
                <button class="system-select-btn" data-system="SIAD">SIAD</button>
            </div>
        `;

        const modal = this.createModal('Seleção de Sistema', contentHTML, null, 
            [{ text: 'Acesso Manual', className: 'rotina-modal-cancel-btn', action: (m) => { 
                this.closeModalAndFocus(m); 
                this.loginFlowActive = false;
                this.pauseAutomaticLoginMonitoring();
            } }],
            { showCloseButton: false, iconHTML: this.iconSVG }
        );

        const actionsContainer = modal.querySelector('.rotina-modal-actions');
        actionsContainer.classList.add('justify-between'); // Garante a justificação

        // ### INÍCIO DA MODIFICAÇÃO: Adiciona toggle "Solicitar Senha" ###
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'solicitar-senha-container';
        toggleContainer.innerHTML = `
            <label class="switch" title="Pedir a senha, mesmo se estiver salva.">
                <input type="checkbox" id="sispmg-solicitar-senha-toggle">
                <span class="slider"></span>
            </label>
            <span>Solicitar senha</span>
        `;
        actionsContainer.append(toggleContainer); // Adiciona no início (lado esquerdo)
        // ### FIM DA MODIFICAÇÃO ###

        const otherContainer = document.createElement('div');
        otherContainer.className = 'other-system-container';
        otherContainer.innerHTML = `
            <input type="text" id="other-system-input" placeholder="OUTRO" maxlength="4">
            <button id="other-system-btn" class="system-select-btn">▶</button>
        `;
        actionsContainer.appendChild(otherContainer); // Adiciona "OUTRO" (lado direito)

        modal.querySelector('#change-user-btn').onclick = () => this.redirectToLogin();

        const handleSelection = async (systemName) => {
            // ### INÍCIO DA MODIFICAÇÃO: Lê o estado do toggle ###
            const solicitarSenha = modal.querySelector('#sispmg-solicitar-senha-toggle').checked;
            // ### FIM DA MODIFICAÇÃO ###

            if (systemName && systemName.trim()) {
                this.closeModalAndFocus(modal);
                // ### INÍCIO DA MODIFICAÇÃO: Verifica o toggle antes do login automático ###
                if (hasSavedPass && !solicitarSenha) {
                // ### FIM DA MODIFICAÇÃO ###
                    this.handleSystemSelection(systemName, tokenData, userProfile.pass, true);
                } else {
                    this.promptForPasswordAndLogin(systemName, tokenData);
                }
            }
        };

        modal.querySelectorAll('.system-select-btn[data-system]').forEach(btn => {
            btn.onclick = () => handleSelection(btn.dataset.system);
        });
        
        const otherInput = modal.querySelector('#other-system-input');
        const otherBtn = modal.querySelector('#other-system-btn');
        const handleOther = () => {
            const systemName = otherInput.value.trim();
            if (/^[a-zA-Z]{4}$/.test(systemName)) {
                handleSelection(systemName);
            } else {
                this.exibirNotificacao("O sistema 'OUTRO' deve conter exatamente 4 letras.", false);
            }
        };
        otherBtn.onclick = handleOther;
        otherInput.onkeydown = (e) => { if (e.key === 'Enter') handleOther(); };
    };

    prototype.promptForPasswordAndLogin = async function(systemName, tokenData) {
        const result = await this.getStorage(['userProfiles']);
        const profiles = result.userProfiles || {};
        const userProfile = profiles[tokenData.g] || {};
        const isAutoLoginPreferred = userProfile.autoLoginPreference !== false;

        const contentHTML = `
            <p>Digite a senha do terminal para o sistema <strong>${systemName.toUpperCase()}</strong>.</p>
            <input id="password-input" type="password" autocomplete="off">
            <div class="login-auto-toggle-container">
                <label class="switch" title="Salvar senha e ativar login automático para este usuário.">
                    <input type="checkbox" id="auto-login-checkbox" ${isAutoLoginPreferred ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
                <span>Ativar login automático</span>
            </div>
            <p class="privacy-notice">A senha só será salva no seu navegador se a opção acima estiver ativa.</p>
        `;

        const confirmAction = async (modal) => {
            const password = modal.querySelector('#password-input').value;
            const autoLoginChecked = modal.querySelector('#auto-login-checkbox').checked;

            const profilesResult = await this.getStorage(['userProfiles']);
            const currentProfiles = profilesResult.userProfiles || {};
            const userPM = tokenData.g;
            if (!currentProfiles[userPM]) {
                currentProfiles[userPM] = {};
            }
            currentProfiles[userPM].autoLoginPreference = autoLoginChecked;
            await this.setStorage({ userProfiles: currentProfiles });
            
            if (!password) {
                 this.exibirNotificacao("A senha não pode estar em branco.", false);
                 return;
            }

            this.closeModalAndFocus(modal);
            this.handleSystemSelection(systemName, tokenData, password, autoLoginChecked);
        };

        const modal = this.createModal('Confirmação de Acesso', contentHTML, null, [
            { text: 'Cancelar', className: 'rotina-modal-cancel-btn', action: (m) => { this.closeModalAndFocus(m); this.showSystemSelectionModal(tokenData); } },
            { text: 'Confirmar', className: 'rotina-modal-save-btn', action: confirmAction }
        ]);
        
        const passwordInput = modal.querySelector('#password-input');
        passwordInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmAction(modal); } };
        setTimeout(() => passwordInput.focus(), 100);
    };
    
    prototype.redirectToLogin = function() {
        window.location.href = 'https://intranet.policiamilitar.mg.gov.br/autenticacaosso/login.jsf?ref=https://terminal.policiamilitar.mg.gov.br';
    };

    prototype.executePostLoginActions = async function() {
        const system = this.selectedSystemName;
        if (!system) return;
        
        await this.digitar(system);
        await this.teclar('ENTER');
        await this.teclar('ENTER');
    };

    prototype.handleSystemSelection = async function(systemName, tokenData, password, autoLoginChecked) {
        const terminalUser = 's' + String(tokenData.g).substring(0, 6);
        this.selectedSystemName = systemName.toUpperCase();
        let initialApplication = this.selectedSystemName;
        if (this.selectedSystemName !== 'SIAD' && this.selectedSystemName !== 'SIAF') {
            initialApplication = 'PMMG';
        }
        try {
            this.exibirNotificacao(`Iniciando login para ${tokenData.n}...`, true);
            if (!await this.posicionar('Aplicacao')) throw new Error("Falha ao posicionar em 'Aplicacao'");
            await this.digitar(initialApplication);
            if (!await this.posicionar('Usuario')) throw new Error("Falha ao posicionar em 'Usuario'");
            await this.digitar(terminalUser);

            if (!await this.posicionar('Senha')) throw new Error("Falha ao posicionar em 'Senha'");
            await this.digitar(password, false);
            
            await this.teclar('ENTER');
            
            await this.localizarTexto("Logon executado com sucesso", { esperar: 10, lancarErro: true }); 
            
            this.isLoggedIn = true;
            this.resumeScreenMonitoring();
            this.createFullMenu(); 
            this.loadRotinasFromCache();
            
            await this.executePostLoginActions();
            this.exibirNotificacao("Login concluído com sucesso!", true);
            await this.processSuccessfulLogin(tokenData, password, terminalUser, autoLoginChecked);
        } catch (error) {
            // ### INÍCIO DA MODIFICAÇÃO: Verifica "Senha incorreta" ###
            if (await this.localizarTexto("Senha incorreta", { esperar: 0 })) {
                await this.clearSavedPassword("incorreta");
                this.loginFlowActive = false; // Permite que o processScreenState reative o modal
                this.processScreenState(); // Força a re-verificação (que mostrará o modal de seleção)
                return; // Sai da função
            }
            // ### FIM DA MODIFICAÇÃO ###

            if (!error.message.includes("Timeout esperando por texto")) {
                 this.exibirNotificacao(error.message || "Falha no login automático.", false);
            }
            this.loginFlowActive = false;
            this.resumeScreenMonitoring();
        }
    };

    prototype.processSuccessfulLogin = async function(tokenData, password, terminalUser, autoLoginChecked) {
        if (!autoLoginChecked) {
            // Se o usuário não marcou "login automático" no prompt de senha,
            // mas tinha uma senha salva anteriormente (que estava incorreta/expirada),
            // essa senha já foi limpa. Não fazemos nada aqui.
            return;
        }

        const userPM = tokenData.g;
        const result = await this.getStorage(['userProfiles']);
        const profiles = result.userProfiles || {};
        const userProfile = profiles[userPM] || {};

        // Salva/Sobrescreve a nova senha
        profiles[userPM] = { 
            ...userProfile, 
            user: terminalUser, 
            pass: password, 
            tokenData, 
            autoLoginEnabled: true 
        };
        
        await this.setStorage({ userProfiles: profiles });
        this.exibirNotificacao(`Login automático ativado para ${tokenData.n}!`);
    };
}
