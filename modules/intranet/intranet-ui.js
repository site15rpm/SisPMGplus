// Arquivo: modules/intranet/intranet-ui.js
// Contém a lógica para o menu intranet da extensão.
import { sendMessageToBackground, getCookie, decodeJwt } from '../../common/utils.js';

/**
 * Verifica se o usuário atende aos critérios de abrangência.
 * A lógica é OR: o usuário precisa satisfazer pelo menos UM dos critérios definidos.
 * Dentro de um critério (ex: g:123|456), a lógica é OR (bater com 123 OU 456).
 * @param {string} abrangenciaString - A string de regras (ex: "g:123|456, t:SGT, f:29\..*").
 * @param {object} userData - O objeto com os dados do usuário do token.
 * @returns {boolean} - True se o usuário tiver acesso, false caso contrário.
 */
function checkAbrangencia(abrangenciaString, userData) {
    if (!abrangenciaString) return false; // Sem regra, sem acesso
    const upperString = abrangenciaString.toUpperCase();
    
    // "PMMG" ou "1" concede acesso universal
    if (upperString === "PMMG" || upperString === "1") return true;

    const allCriteria = abrangenciaString.split(',');
    if (allCriteria.length === 0) return false; // String vazia ou mal formatada

    // Lógica OR: O usuário precisa corresponder a pelo menos UM critério (g, t, p, etc.)
    for (const criterion of allCriteria) {
        const parts = criterion.split(':');
        if (parts.length < 2) continue; // Parte da regra mal formatada, ignora

        const key = parts[0].trim().toLowerCase(); // e.g., 'g', 't', 'p', 'f', 'fl', 'ff'
        const rules = parts.slice(1).join(':').trim(); // e.g., '123|456' or '.*RPM.*'
        const ruleList = rules.split('|').map(r => r.trim()).filter(r => r); // Alterado de ';' para '|'

        // Se a chave não for um critério válido ou não houver regras para ela, pula para o próximo critério
        if (!userData.hasOwnProperty(key) || ruleList.length === 0) {
            continue;
        }

        const userValue = userData[key];
        let criteriaMet = false;

        // Modificado para incluir 'f', 'fl', e 'ff' na lógica de array
        if ((key === 'f' || key === 'fl' || key === 'ff') && Array.isArray(userValue)) {
            // Para 'f', 'fl', 'ff', verifica se ALGUM item do usuário bate com ALGUMA regra
            for (const userItem of userValue) {
                for (const rule of ruleList) {
                    try {
                        // Compara usando Regex, case-insensitive
                        if (new RegExp('^' + rule + '$', 'i').test(userItem)) {
                            criteriaMet = true;
                            break;
                        }
                    } catch (e) {
                        // Fallback para correspondência exata se a regex for inválida
                        if (userItem === rule) criteriaMet = true;
                    }
                }
                if (criteriaMet) break; // Já achou um item que bate
            }
        } else if (typeof userValue === 'string') {
            // Para outros (g, t, p, r, u, c), verifica se O valor do usuário bate com ALGUMA regra
            for (const rule of ruleList) {
                try {
                    // Compara usando Regex, case-insensitive
                    if (new RegExp('^' + rule + '$', 'i').test(userValue)) {
                        criteriaMet = true;
                        break;
                    }
                } catch (e) {
                    // Fallback para correspondência exata se a regex for inválida
                    if (userValue === rule) criteriaMet = true;
                }
            }
        }

        // Se este critério foi satisfeito, a regra inteira (OR) é satisfeita.
        if (criteriaMet) {
            return true;
        }
    }

    // Se passou por todos os critérios e nenhum deu 'true', o acesso é negado.
    return false;
}


export class UIModule {
    constructor(config) {
        this.config = config;
        this.iconSVG = config.iconSVG_28;
        this.modules = {};
        this.menuVisible = false;
        this.iconContainer = null;
        this.menuCloseTimer = null; // Temporizador para o fechamento do menu
        this.intranetModuleEnabled = true;
    }

    async init() {
        window.SisPMG_UI = this; // Torna a instância da UI globalmente acessível
        await this.loadState();
        this.injectGlobalContainer();
        if (this.intranetModuleEnabled) {
            this.hideHelpIcon();
            this.injectHeaderIcon();
        }
    }
    
    injectGlobalContainer() {
        if (document.getElementById('sispmg-plus-container')) return;

        const createContainer = () => {
            if (document.getElementById('sispmg-plus-container') || !document.body) return;
            const container = document.createElement('div');
            container.id = 'sispmg-plus-container';
            document.body.appendChild(container);
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createContainer);
        } else {
            createContainer();
        }
    }
    
    async loadState() {
        const result = await sendMessageToBackground('getStorage', { key: 'intranetModuleEnabled' });
        if (result.success && typeof result.value.intranetModuleEnabled !== 'undefined') {
            this.intranetModuleEnabled = result.value.intranetModuleEnabled;
        } else {
            this.intranetModuleEnabled = true; // Padrão
        }
    }
    
    hideHelpIcon() {
        const headerAjuda = document.getElementById('headerAjuda');
        if (headerAjuda) {
            headerAjuda.style.display = 'none';
        }
    }

    registerModule(module) {
        this.modules[module.name] = module.instance;
        if(this.menuVisible) {
            this.updateMenu();
        }
    }
    
    unregisterModule(moduleName) {
        delete this.modules[moduleName];
        if(this.menuVisible) {
            this.updateMenu();
        }
    }

    injectHeaderIcon() {
        const headerCheckInterval = setInterval(() => {
            const avatarElement = document.getElementById('u1');
            const iconExists = document.getElementById('sispmg-plus-header-icon');

            if (avatarElement && !iconExists) {
                this.iconContainer = document.createElement('a');
                this.iconContainer.href = '#';
                this.iconContainer.id = 'sispmg-plus-header-icon';
                this.iconContainer.title = 'SisPMG+';
                this.iconContainer.innerHTML = this.iconSVG;

                // Modificado: Abrir com mouseenter
                this.iconContainer.addEventListener('mouseenter', () => {
                    if (this.menuCloseTimer) clearTimeout(this.menuCloseTimer);
                    this.menuCloseTimer = null;
                    if (!this.menuVisible) {
                        this.openHeaderMenu();
                    }
                });

                // Modificado: Iniciar timer para fechar com mouseleave
                this.iconContainer.addEventListener('mouseleave', () => {
                    this.menuCloseTimer = setTimeout(() => this.closeHeaderMenu(), 300);
                });
                
                avatarElement.insertAdjacentElement('beforebegin', this.iconContainer);
                
                clearInterval(headerCheckInterval);
            }
        }, 500);
    }
    
    toggleHeaderMenu() {
        this.menuVisible ? this.closeHeaderMenu() : this.openHeaderMenu();
    }
    
    async openHeaderMenu() {
        if (this.menuVisible) return;
        this.menuVisible = true;
        
        if (!this.iconContainer) return;
    
        const menu = document.createElement('div');
        menu.id = 'sispmg-plus-header-menu';
        menu.className = 'sispmg-plus-menu'; 
        // Adiciona um placeholder de carregamento
        menu.innerHTML = `<div><div class="sispmg-menu-header">Carregando...</div></div>`;
        document.getElementById('sispmg-plus-container').appendChild(menu);

        const iconRect = this.iconContainer.getBoundingClientRect();
        Object.assign(menu.style, {
            top: `${iconRect.bottom + 5}px`,
            left: 'auto',
            right: `${window.innerWidth - iconRect.right}px`
        });
        
        // Modificado: Listeners de mouse para o menu (para manter aberto)
        menu.addEventListener('mouseenter', () => {
            if (this.menuCloseTimer) clearTimeout(this.menuCloseTimer);
            this.menuCloseTimer = null;
        });

        menu.addEventListener('mouseleave', () => {
            this.menuCloseTimer = setTimeout(() => this.closeHeaderMenu(), 300);
        });

        // Busca o conteúdo real e atualiza o menu
        const content = await this.getHeaderMenuContent();
        menu.firstElementChild.innerHTML = content;
        this.attachMenuEventListeners(menu);
    }

    /**
     * Busca e processa os links dinâmicos da planilha Google.
     */
    async getDynamicLinksContent() {
        // Coleta todos os dados relevantes do usuário do token tokiuz
        let userData = { f: [], fl: [], ff: [] }; // Garante que 'f', 'fl', 'ff' sejam arrays
        try {
            const token = getCookie('tokiuz');
            if (token) {
                const decoded = decodeJwt(token);
                
                const userFunctions = Array.isArray(decoded.f) ? decoded.f.map(String) : [];
                const userFunctionsL = []; // para fl
                const userFunctionsF = []; // para ff

                userFunctions.forEach(func => {
                    const parts = func.split('.');
                    if (parts.length > 1) {
                        userFunctionsL.push(parts[0]);
                        userFunctionsF.push(parts.slice(1).join('.')); // Handle "29.1.1" -> ff: "1.1"
                    } else {
                        userFunctionsL.push(func); // Sem ponto, fl é a string inteira
                        userFunctionsF.push("");   // Sem ponto, ff é vazio
                    }
                });
                
                userData = {
                    g: String(decoded.g || ''), // PM Number
                    t: String(decoded.t || ''), // Rank
                    e: String(decoded.e || ''), // Entity
                    p: String(decoded.p || ''), // Fraction/Section
                    r: String(decoded.r || ''), // Region
                    u: String(decoded.u || ''), // Accounting Unit
                    c: String(decoded.c || ''), // Fraction/Section Code
                    f: userFunctions,           // Lista completa [f]
                    fl: userFunctionsL,         // Lista "antes do ponto" [fl]
                    ff: userFunctionsF          // Lista "depois do ponto" [ff]
                };
            }
        } catch (e) {
            console.error('SisPMG+ [UI]: Falha ao decodificar tokiuz', e);
        }

        try {
            const url = "https://docs.google.com/spreadsheets/d/1e93QrFOFFHRhuq1_5J6scH_JTAEWe4Rk-mIZ1SYaQ1s/gviz/tq?tqx=out:json&tq&sheet=links&_=" + new Date().getTime();
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Falha ao buscar links da planilha.');
            }
            
            let text = await response.text();
            
            // Aplicar a lógica de limpeza do usuário
            let jsonString = text.substring(47).slice(0, -2);
            jsonString = jsonString.replace(/\[null/g, "\[\{\"v\":\"NAO\"}"); // Mantido da lógica original
            jsonString = jsonString.replace(/\,null/g, "\,{\"v\":\"\"}");
            jsonString = jsonString.replace(/\:null/g, "\:\"\"");
            
            const json = JSON.parse(jsonString).table;
            let itemsHTML = '';
            
            // Estrutura esperada (baseado no screenshot e lógica anterior):
            // C[0]: Abrangência
            // C[1]: Texto
            // C[2]: Link
            
            if (json.rows && json.rows.length > 0) {
                for (const row of json.rows) {
                    if (row.c && row.c.length >= 1) {
                        const abrangencia = row.c[0]?.v || '';
                        const texto = row.c[1]?.v || '';
                        const link = row.c[2]?.v || '';

                        // 1. Verifica se o usuário tem acesso baseado na abrangência
                        const hasAccess = checkAbrangencia(abrangencia, userData);

                        if (hasAccess) {
                            // 2. Decide o que renderizar: Subtítulo, Separador ou Link
                            if (!link && texto) {
                                // Subtítulo (link vazio, texto preenchido)
                                itemsHTML += `<div class="sispmg-menu-subtitle">${texto}</div>`;
                            } else if (!link && !texto) {
                                // Separador (link vazio, texto vazio)
                                itemsHTML += `<div class="sispmg-menu-separator"></div>`;
                            } else if (link && texto) {
                                // Item de menu normal (link e texto preenchidos)
                                itemsHTML += `
                                    <a href="${link}" target="_blank" class="sispmg-menu-item">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6m4-3h6v6m-11 5L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                        <span>${texto}</span>
                                    </a>
                                `;
                            }
                            // Se tiver link mas não tiver texto, ou outras combinações não especificadas, não renderiza nada.
                        }
                    }
                }
            }
            
            if (itemsHTML) {
                return itemsHTML; // Retorna os links dinâmicos, subtítulos e separadores
            }
            return ''; // Retorna string vazia se não houver links

        } catch (e) {
            console.error("SisPMG+ [UI]: Erro ao carregar links dinâmicos.", e);
            return '<div class="sispmg-menu-item sispmg-menu-error">Erro ao carregar links.</div>';
        }
    }

    async getHeaderMenuContent() {
        let moduleItems = '';
        const isPrincipalPage = window.location.hostname === 'principal.policiamilitar.mg.gov.br';
        const isSicorPage = window.location.pathname.startsWith('/SICOR/');

        const settingsResult = await sendMessageToBackground('getStorage', { key: ['aniverModuleEnabled'] });
        const aniverModuleEnabled = settingsResult.success ? (settingsResult.value.aniverModuleEnabled !== false) : true;
        
        if (aniverModuleEnabled && isPrincipalPage) {
             moduleItems += `
                 <div id="config-birthdays-btn" class="sispmg-menu-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a5 5 0 0 0-5 5c0 1.84.97 3.47 2.43 4.39A8.002 8.002 0 0 0 4 20a1 1 0 1 0 2 0a6 6 0 0 1 12 0a1 1 0 1 0 2 0a8.002 8.002 0 0 0-5.43-6.61A4.992 4.992 0 0 0 17 7a5 5 0 0 0-5-5zm0 2a3 3 0 1 1 0 6a3 3 0 0 1 0-6z" fill="currentColor"/></svg>
                    <span>Configurar aniversariantes</span>
                </div>
            `;
        }

        if (isSicorPage && this.modules['SICOR']) {
             moduleItems += `
                <div id="config-sicor-btn" class="sispmg-menu-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 9.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5zm0 1.5a1 1 0 100 2 1 1 0 000-2z" /><path fill-rule="evenodd" clip-rule="evenodd" d="M11.294 2.05a1 1 0 011.412 0l.544.544a1 1 0 001.02.29l1.242-.43a1 1 0 011.173.743l.26 1.282a1 1 0 00.75.75l1.282.26a1 1 0 01.743 1.173l-.43 1.242a1 1 0 00.29 1.02l.544.544a1 1 0 010 1.412l-.544.544a1 1 0 00-.29 1.02l.43 1.242a1 1 0 01-.743 1.173l-1.282.26a1 1 0 00-.75.75l-.26 1.282a1 1 0 01-1.173.743l-1.242-.43a1 1 0 00-1.02.29l-.544.544a1 1 0 01-1.412 0l-.544-.544a1 1 0 00-1.02-.29l-1.242.43a1 1 0 01-1.173-.743l-.26-1.282a1 1 0 00-.75-.75l-1.282-.26a1 1 0 01-.743-1.173l.43-1.242a1 1 0 00-.29-1.02l-.544-.544a1 1 0 010-1.412l.544-.544a1 1 0 00.29-1.02l-.43-1.242a1 1 0 01.743-1.173l1.282-.26a1 1 0 00.75-.75l.26-1.282a1 1 0 011.173-.743l1.242.43a1 1 0 001.02.29l.544-.544zM12 7.75a4.25 4.25 0 100 8.5 4.25 4.25 0 000-8.5z" /></svg>
                    <span>Configurar Módulo SICOR</span>
                </div>
            `;
        }

        const dynamicLinksContent = await this.getDynamicLinksContent();

        let finalContent = `<div class="sispmg-menu-header">SisPMG+ Intranet</div>`;
        
        // Início da Modificação: Inverter a ordem
        if (moduleItems.trim() !== '') {
            finalContent += moduleItems;
        }

        // Adicionar separador se ambos existirem
        if (dynamicLinksContent && moduleItems.trim() !== '' && (dynamicLinksContent.includes('sispmg-menu-item') || dynamicLinksContent.includes('sispmg-menu-subtitle'))) {
            finalContent += '<div class="sispmg-menu-separator"></div>';
        }
        
        if (dynamicLinksContent) {
            finalContent += dynamicLinksContent;
        }
        
        // Se não houver absolutamente nada
        if (moduleItems.trim() === '' && !dynamicLinksContent.includes('sispmg-menu-item') && !dynamicLinksContent.includes('sispmg-menu-subtitle')) {
             finalContent += '<div class="sispmg-menu-item">Nenhuma ação disponível.</div>';
        }
        // Fim da Modificação
        
        return finalContent;
    }


    attachMenuEventListeners(menu) {
        const birthdaysButton = menu.querySelector('#config-birthdays-btn');
        if (birthdaysButton && this.modules['Aniversariantes']) {
            birthdaysButton.addEventListener('click', () => {
                this.modules['Aniversariantes']?.showConfigModal();
                this.closeHeaderMenu();
            });
        }

        const sicorButton = menu.querySelector('#config-sicor-btn');
        if (sicorButton && this.modules['SICOR']) {
             sicorButton.addEventListener('click', () => {
                this.modules['SICOR'].renderSicorModal();
                this.closeHeaderMenu();
            });
        }
        
        // Listeners para os botões estáticos removidos

        // Adiciona listener para fechar o menu ao clicar em um link
        menu.querySelectorAll('a.sispmg-menu-item').forEach(link => {
            link.addEventListener('click', () => this.closeHeaderMenu());
        });
    }

    async updateMenu() {
        const menu = document.getElementById('sispmg-plus-header-menu');
       if (menu) {
            menu.firstElementChild.innerHTML = await this.getHeaderMenuContent();
            this.attachMenuEventListeners(menu);
        }
    }
    
    openFullscreenIframe(url, id) {
        this.closeHeaderMenu(); // Garante que o menu feche ao abrir o iframe
        const containerId = `sispmg-fullscreen-iframe-container-${id}`;
        let iframeContainer = document.getElementById(containerId);

        // Oculta todos os outros iframes abertos para garantir que apenas um esteja visível
        document.querySelectorAll('[id^="sispmg-fullscreen-iframe-container-"]').forEach(container => {
            if (container.id !== containerId) {
                container.style.display = 'none';
            }
        });

        document.body.classList.add('sispmg-fullscreen-active');

        if (iframeContainer) {
            // Se o contêiner já existe, apenas o torna visível
            iframeContainer.style.display = 'block';
        } else {
            // Se não existe, cria um novo
            iframeContainer = document.createElement('div');
            iframeContainer.id = containerId;
            iframeContainer.style.display = 'block'; // Garante que seja visível ao ser criado
            
            iframeContainer.innerHTML = `
                <iframe src="${url}"></iframe>
                <button id="sispmg-iframe-back-button-${id}" class="btn-sair btn-dark" title="Voltar à Intranet">
                    <i class="fas fa-sign-out-alt"></i> SAIR
                </button>
            `;
            document.getElementById('sispmg-plus-container').appendChild(iframeContainer);

            document.getElementById(`sispmg-iframe-back-button-${id}`).onclick = () => this.restoreOriginalPage(id);
        }
    }
    
    restoreOriginalPage(id) {
        const containerId = `sispmg-fullscreen-iframe-container-${id}`;
        const iframeContainer = document.getElementById(containerId);

        if (iframeContainer) {
            // Em vez de remover, apenas oculta o contêiner do iframe
            iframeContainer.style.display = 'none';
        }
        
        // Sempre remove a classe do body para restaurar a visualização da página original
        document.body.classList.remove('sispmg-fullscreen-active');
    }
    
    createModal(title, contentHTML, onSave = null, customButtons = [], options = {}) {
        document.querySelector('.sispmg-plus-modal')?.remove();
        const modal = document.createElement('div');
        modal.className = 'sispmg-plus-menu sispmg-plus-modal';
        modal.id = `sispmg-modal-${Date.now()}`;
        
        let buttonsHTML = customButtons.map((btn, i) => `<button id="custom-btn-${i}" class="${btn.className || ''}">${btn.text}</button>`).join('');
        if (onSave) {
            buttonsHTML += `<button class="sispmg-modal-btn-secondary">Cancelar</button><button class="sispmg-modal-btn-primary">Salvar</button>`;
        }

        modal.innerHTML = `
            <div class="sispmg-menu-header">${title}<button class="sispmg-modal-close-btn">&times;</button></div>
            <div class="sispmg-modal-body-content">${contentHTML}</div>
            <div class="sispmg-modal-actions">${buttonsHTML}</div>
        `;

        document.getElementById('sispmg-plus-container').appendChild(modal);
        
        modal.querySelector('.sispmg-modal-close-btn').onclick = () => modal.remove();

        if (onSave) {
            modal.querySelector('.sispmg-modal-btn-primary').onclick = () => onSave(modal);
            modal.querySelector('.sispmg-modal-btn-secondary').onclick = () => modal.remove();
        }
        customButtons.forEach((btn, i) => { modal.querySelector(`#custom-btn-${i}`).onclick = () => btn.action(modal); });

        return modal;
    }

    showLoader() {
        this.hideLoader(); // Garante que não haja loaders duplicados
        const loader = document.createElement('div');
        loader.id = 'sispmg-loader-overlay';
        loader.innerHTML = '<div class="sispmg-spinner"></div>';
        document.getElementById('sispmg-plus-container').appendChild(loader);
    }

    hideLoader() {
        document.getElementById('sispmg-loader-overlay')?.remove();
    }

    closeHeaderMenu() {
        if (!this.menuVisible) return; // Evita múltiplas chamadas
        if (this.menuCloseTimer) clearTimeout(this.menuCloseTimer);
        this.menuCloseTimer = null;
        this.menuVisible = false;
        const menu = document.getElementById('sispmg-plus-header-menu');
        if (menu) {
            menu.remove();
        }
    }
}

