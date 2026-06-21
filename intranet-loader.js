// Arquivo: intranet-loader.js
// Ponto de entrada para os módulos da Intranet, com monitoramento contínuo de navegação.

let padmModuleInstance = null;
let uiModuleInstance = null;
let aniverModuleInstance = null;
let agendaModuleInstance = null;
let sirconvModuleInstance = null;
let sirconvDashboardModuleInstance = null;
let sicorModuleInstance = null;
let praticasModuleInstance = null;
let unidadesModuleInstance = null;
let notasModuleInstance = null;
let moduleCheckInterval = null; // Controle do intervalo de verificação de módulos
let userTokiuzE = null; // Armazena a chave 'e' do token tokiuz
let globalConfig = null;
let moduleSettings = {};

// --- INICIALIZAÇÃO ---

// Função de inicialização auto-executável que lê a configuração do DOM.
(function() {
    const configElement = document.getElementById('sispmg-config-data');
    if (configElement && configElement.textContent) {
        try {
            const config = JSON.parse(configElement.textContent);
            main(config);
        } catch (e) {
            console.error('SisPMG+: Falha ao parsear a configuração injetada.', e);
        }
    } else {
        console.error('SisPMG+: Elemento de configuração não encontrado. Os módulos não serão carregados.');
    }
})();

/**
 * Função principal que carrega os módulos base e inicia o monitoramento.
 * @param {object} config - Objeto de configuração da extensão.
 */
async function main(config) {
    console.log('SisPMG+: Módulo de carregamento da Intranet iniciado.');
    globalConfig = config;

    // 1. Obter configurações essenciais.
    try {
        moduleSettings = (await getSettingsFromStorage(['intranetModuleEnabled'])) || {};
        if (moduleSettings.intranetModuleEnabled === false) {
            console.log('SisPMG+: Módulo da Intranet desabilitado nas configurações.');
            return;
        }
    } catch (e) {
        console.error("SisPMG+: Falha crítica ao obter configurações iniciais. Interrompendo.", e);
        return;
    }

    // 2. Carrega o Módulo de UI, que é a base para os outros.
    try {
        const iconModule = await import(globalConfig.iconUrl);
        loadCSS(globalConfig.uiCssUrl);
        const { UIModule } = await import(globalConfig.uiModuleUrl);
        uiModuleInstance = new UIModule({ ...globalConfig, iconSVG_28: iconModule.iconSVG_28 });
        uiModuleInstance.init();
    } catch (error) {
        console.error("SisPMG+: Falha ao carregar o módulo de UI principal.", error);
        return; // Interrompe se o módulo base falhar.
    }

    // 3. Lógica de inicialização em fases para aguardar o background.
    let modulesInitialized = false;
    const initializeDependentModules = async () => {
        if (modulesInitialized) return;
        modulesInitialized = true;
        
        console.log('SisPMG+ [Loader]: Inicializando módulos dependentes...');

        // Carrega o restante das configurações dos módulos.
        const otherSettings = (await getSettingsFromStorage([
            'padmModuleEnabled', 'aniverModuleEnabled', 'agendaModuleEnabled', 'sirconvModuleEnabled',
            'sirconvDashboardModuleEnabled', 'sicorModuleEnabled', 'praticasModuleEnabled',
            'unidadesModuleEnabled', 'notasModuleEnabled'
        ])) || {};
        Object.assign(moduleSettings, otherSettings);

        // Inicia o loop que verifica e carrega os módulos dinamicamente.
        if (moduleCheckInterval) clearInterval(moduleCheckInterval);
        moduleCheckInterval = setInterval(checkAllModules, 1000);
    };

    // 4. Configura os gatilhos para a inicialização dos módulos dependentes.
    window.addEventListener('message', (event) => {
        if (event.source === window && event.data?.type === 'FROM_BACKGROUND' && event.data?.action === 'sispmg-ready') {
            initializeDependentModules();
        }
    });
    setTimeout(() => {
        if (!modulesInitialized) {
            console.warn('SisPMG+ [Loader]: Timeout esperando pelo sinal "sispmg-ready". Forçando inicialização dos módulos.');
            initializeDependentModules();
        }
    }, 5000); // Timeout de 5 segundos como segurança.

    // 5. Envia o gatilho de identificação do usuário, que fará o background responder com 'sispmg-ready'.
    try {
        const { getCookie, decodeJwt } = await import(globalConfig.utilsUrl);
        const token = getCookie('tokiuz');
        if (token) {
            const decoded = decodeJwt(token);
            if (decoded) {
                userTokiuzE = decoded.e ? String(decoded.e) : null;
                
                // OTIMIZAÇÃO: Armazena o Tokiuz decodificado no sessionStorage para uso rápido em todos os scripts/módulos
                sessionStorage.setItem('sispmg_user_tokiuz', JSON.stringify(decoded));

                if (decoded.g) {
                    sendMessageToBackground('intranet-user-identified', {
                        userPM: decoded.g,
                        unitCode: decoded.u,
                        system: 'INTRANET'
                    });
                } else {
                    console.warn('SisPMG+ [Loader]: Token JWT não contém identificação (g). Forçando inicialização.');
                    initializeDependentModules();
                }
            } else {
                console.warn('SisPMG+ [Loader]: Token JWT não pôde ser decodificado. Forçando inicialização.');
                initializeDependentModules();
            }
        } else {
            console.warn('SisPMG+ [Loader]: Token "tokiuz" não encontrado. Forçando inicialização.');
            initializeDependentModules();
        }
    } catch (e) {
        console.error('SisPMG+ [Loader]: Falha ao processar token. Forçando inicialização de módulos.', e);
        initializeDependentModules();
    }
}


// --- VERIFICAÇÃO E CICLO DE VIDA DOS MÓDULOS ---

/**
 * Verifica periodicamente as condições para carregar ou descarregar os submódulos.
 */
function checkAllModules() {
    const isPrincipalPage = window.location.hostname === 'principal.policiamilitar.mg.gov.br';
    const isPAdmPage = window.location.hostname === 'pa.policiamilitar.mg.gov.br';

    // Verifica o módulo de Aniversariantes
    if (moduleSettings.aniverModuleEnabled !== false) {
        if (isPrincipalPage && !aniverModuleInstance) {
            loadAniverModule();
        } else if (!isPrincipalPage && aniverModuleInstance) {
            destroyAniverModule();
        }
    }
    
    // Verifica o módulo da Agenda
    if (moduleSettings.agendaModuleEnabled !== false) {
        if ((isPrincipalPage || isPAdmPage) && !agendaModuleInstance) {
            const loadUI = isPrincipalPage; // Só carrega a UI na página principal
            loadAgendaModule(loadUI);
        } else if (!isPrincipalPage && !isPAdmPage && agendaModuleInstance) {
            destroyAgendaModule();
        }
    }

    // Verifica o módulo do PAdm
    if (moduleSettings.padmModuleEnabled !== false) {
        if (isPAdmPage && !padmModuleInstance) {
            loadPAdmModule();
        } else if (!isPAdmPage && padmModuleInstance) {
            destroyPAdmModule();
        }
    }
    
    // Verifica o módulo do SIRCONV
    const isSirconvPage = window.location.href.includes('/lite/convenio/web/convenio/view');
    const isSirconvEnabled = moduleSettings.sirconvModuleEnabled !== false && userTokiuzE === '6869';
    if (isSirconvEnabled) {
        if (isSirconvPage && !sirconvModuleInstance) {
            loadSirconvModule();
        } else if (!isSirconvPage && sirconvModuleInstance) {
            destroySirconvModule();
        }
    } else if (sirconvModuleInstance) {
        destroySirconvModule();
    }

    // Verifica o módulo do SIRCONV Dashboard
    const isSirconvDashboardPage = window.location.href.includes('/lite/convenio/');
    if (moduleSettings.sirconvDashboardModuleEnabled !== false) {
        if (isSirconvDashboardPage && !sirconvDashboardModuleInstance) {
            loadSirconvDashboardModule();
        } else if (!isSirconvDashboardPage && sirconvDashboardModuleInstance) {
            destroySirconvDashboardModule();
        }
    }

    // Verifica o módulo do SICOR
    const isSicorPage = window.location.href.includes('/SICOR/');
    const isSicorEnabled = moduleSettings.sicorModuleEnabled !== false && userTokiuzE === '6869';
    if (isSicorEnabled) { 
        if (isSicorPage && !sicorModuleInstance) {
            loadSicorModule();
        } else if (!isSicorPage && sicorModuleInstance) {
            destroySicorModule();
        }
    } else if (sicorModuleInstance) {
        destroySicorModule();
    }

    // Verifica o módulo de Unidades (disponível em todas as páginas da Intranet)
    const isIntranetPage = window.location.hostname.includes('policiamilitar.mg.gov.br');
    const isUnidadesEnabled = moduleSettings.unidadesModuleEnabled !== false && userTokiuzE === '6869';
    if (isUnidadesEnabled) {
        if (isIntranetPage && !unidadesModuleInstance) {
            loadUnidadesModule();
        } else if (!isIntranetPage && unidadesModuleInstance) {
            destroyUnidadesModule();
        }
    } else if (unidadesModuleInstance) {
        destroyUnidadesModule();
    }

    // Verifica o módulo de Práticas Supervisionadas
    const isPraticasPage = window.location.href.includes('/sige/paginas/perfil/avaliador/praticas.jsf');
    if (moduleSettings.praticasModuleEnabled !== false) {
        if (isPraticasPage && !praticasModuleInstance) {
            loadPraticasModule();
        } else if (!isPraticasPage && praticasModuleInstance) {
            destroyPraticasModule();
        }
    }

    // Verifica o módulo de Notas (Integração com Terminal)
    const isNotasPage = window.location.href.includes('manterNota.jsf');
    if (moduleSettings.notasModuleEnabled !== false) {
        if (isNotasPage && !notasModuleInstance) {
            loadNotasModule();
        } else if (!isNotasPage && notasModuleInstance) {
            destroyNotasModule();
        }
    }
}

/** Carrega o módulo de Notas (Integração com Terminal). */
async function loadNotasModule() {
    try {
        console.log("SisPMG+: Página de Notas detectada. Carregando módulo...");
        const { IntranetNotasModule } = await import(globalConfig.notasModuleUrl);
        const iconModule = await import(globalConfig.iconUrl);
        notasModuleInstance = new IntranetNotasModule({ ...globalConfig, iconSVG_28: iconModule.iconSVG_28 });
        notasModuleInstance.init();
    } catch(e) {
         console.error("SisPMG+: Falha ao carregar o módulo de Notas.", e);
    }
}

/** Descarrega o módulo de Notas. */
function destroyNotasModule() {
    console.log("SisPMG+: Saindo da página de Notas. Descarregando módulo.");
    if (notasModuleInstance && typeof notasModuleInstance.destroy === 'function') {
        notasModuleInstance.destroy();
    }
    notasModuleInstance = null;
}

/** Carrega o módulo de Agenda. */
async function loadAgendaModule(loadUI = true) {
    try {
        console.log("SisPMG+: Página principal detectada. Carregando módulo de Agenda...");
        loadCSS(globalConfig.agendaCssUrl);
        const { IntranetAgendaModule } = await import(globalConfig.agendaModuleUrl);
        agendaModuleInstance = new IntranetAgendaModule();
        agendaModuleInstance.init(loadUI);
        if (loadUI) {
            uiModuleInstance.registerModule({ name: 'Agenda', instance: agendaModuleInstance });
        }
    } catch(e) {
         console.error("SisPMG+: Falha ao carregar o módulo de Agenda.", e);
    }
}

/** Descarrega o módulo de Agenda. */
function destroyAgendaModule() {
    console.log("SisPMG+: Saíndo da página principal. Descarregando módulo de Agenda.");
    if (agendaModuleInstance && typeof agendaModuleInstance.destroy === 'function') {
        agendaModuleInstance.destroy();
    }
    agendaModuleInstance = null;
    uiModuleInstance.unregisterModule('Agenda');
}

/** Carrega o módulo SICOR de forma segura. */
async function loadSicorModule() {
    try {
        console.log("SisPMG+: Página SICOR detectada. Carregando módulo...");
        loadCSS(globalConfig.sicorCssUrl);
        const sicor = await import(globalConfig.sicorModuleUrl);
        sicor.initSicorModule(); // A função init cria o botão e o modal
        sicorModuleInstance = sicor; // Armazena a referência do módulo importado
    } catch(e) {
         console.error("SisPMG+: Falha ao carregar o módulo SICOR.", e);
    }
}

/** Descarrega o módulo SICOR. */
function destroySicorModule() {
    console.log("SisPMG+: Saindo da página SICOR. Descarregando módulo.");
    if (sicorModuleInstance && typeof sicorModuleInstance.destroySicorModule === 'function') {
        sicorModuleInstance.destroySicorModule();
    }
    sicorModuleInstance = null;
}

/** Carrega o módulo UNIDADES de forma segura. */
async function loadUnidadesModule() {
    try {
        console.log("SisPMG+: Página UNIDADES detectada. Carregando módulo...");
        loadCSS(globalConfig.unidadesCssUrl);
        const unidades = await import(globalConfig.unidadesModuleUrl);
        unidades.initUnidadesModule(uiModuleInstance); // Passa a instância da UI diretamente
        unidadesModuleInstance = unidades; // Armazena a referência do módulo importado
    } catch(e) {
         console.error("SisPMG+: Falha ao carregar o módulo UNIDADES.", e);
    }
}

/** Descarrega o módulo UNIDADES. */
function destroyUnidadesModule() {
    console.log("SisPMG+: Saindo da página UNIDADES. Descarregando módulo.");
    if (unidadesModuleInstance && typeof unidadesModuleInstance.destroyUnidadesModule === 'function') {
        unidadesModuleInstance.destroyUnidadesModule();
    }
    unidadesModuleInstance = null;
}

/** Carrega o módulo Práticas Supervisionadas. */
async function loadPraticasModule() {
    try {
        console.log("SisPMG+: Página Práticas Supervisionadas detectada. Carregando módulo...");
        loadCSS(globalConfig.praticasCssUrl);
        const praticas = await import(globalConfig.praticasModuleUrl);
        praticasModuleInstance = praticas;
        if (praticas && typeof praticas.init === 'function') {
            praticas.init();
        }
    } catch(e) {
         console.error("SisPMG+: Falha ao carregar o módulo Práticas.", e);
    }
}

/** Descarrega o módulo Práticas Supervisionadas. */
function destroyPraticasModule() {
    console.log("SisPMG+: Saindo da página Práticas. Resetando instância.");
    praticasModuleInstance = null;
}


/** Carrega o módulo SIRCONV de forma segura, aguardando o DOM. */
async function loadSirconvModule() {
    const load = async () => {
        try {
            console.log("SisPMG+: Página SIRCONV detectada. Carregando módulo...");
            loadCSS(globalConfig.sirconvCssUrl);
            const { SirconvModule } = await import(globalConfig.sirconvModuleUrl);
            const iconModule = await import(globalConfig.iconUrl);
            sirconvModuleInstance = new SirconvModule({ ...globalConfig, iconSVG_28: iconModule.iconSVG_28 });
            sirconvModuleInstance.init();
        } catch(e) {
             console.error("SisPMG+: Falha ao carregar o módulo SIRCONV.", e);
        }
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', load);
    } else {
        load();
    }
}

/** Descarrega o módulo SIRCONV. */
function destroySirconvModule() {
    console.log("SisPMG+: Saindo da página SIRCONV. Descarregando módulo.");
    if (sirconvModuleInstance && typeof sirconvModuleInstance.stopObserver === 'function') {
        sirconvModuleInstance.stopObserver();
    }
    sirconvModuleInstance = null;
}


/** Carrega o módulo SIRCONV Dashboard de forma segura. */
async function loadSirconvDashboardModule() {
    try {
        console.log("SisPMG+: Página SIRCONV detectada. Carregando módulo de Dashboard...");
        loadCSS(globalConfig.sirconvDashboardCssUrl);
        const { SirconvDashboardModule } = await import(globalConfig.sirconvDashboardModuleUrl);
        sirconvDashboardModuleInstance = new SirconvDashboardModule(globalConfig);
        await sirconvDashboardModuleInstance.init();
        
        // Injeta de forma independente o utilitário de busca de concedentes na página
        const baseUrl = globalConfig.sirconvDashboardModuleUrl.split('/modules/')[0];
        import(`${baseUrl}/common/busca-concedentes.js`).catch(err => {
            console.error("SisPMG+: Falha ao carregar busca-concedentes.js", err);
        });
    } catch(e) {
         console.error("SisPMG+: Falha ao carregar o módulo SIRCONV Dashboard.", e);
    }
}

/** Descarrega o módulo SIRCONV Dashboard. */
function destroySirconvDashboardModule() {
    console.log("SisPMG+: Saindo da página SIRCONV. Descarregando módulo de Dashboard.");
    if (sirconvDashboardModuleInstance && typeof sirconvDashboardModuleInstance.destroy === 'function') {
        sirconvDashboardModuleInstance.destroy();
    }
    sirconvDashboardModuleInstance = null;
}

/** Carrega o módulo de Aniversariantes. */
async function loadAniverModule() {
    try {
        console.log("SisPMG+: Página principal detectada. Carregando módulo de Aniversariantes...");
        loadCSS(globalConfig.aniverCssUrl);
        const { BirthdayModule } = await import(globalConfig.aniverModuleUrl);
        const iconModule = await import(globalConfig.iconUrl);
        aniverModuleInstance = new BirthdayModule({ ...globalConfig, uiModuleInstance, iconSVG_28: iconModule.iconSVG_28 });
        aniverModuleInstance.init();
        uiModuleInstance.registerModule({ name: 'Aniversariantes', instance: aniverModuleInstance });
    } catch(e) {
         console.error("SisPMG+: Falha ao carregar o módulo de Aniversariantes.", e);
    }
}

/** Descarrega o módulo de Aniversariantes. */
function destroyAniverModule() {
    console.log("SisPMG+: Saindo da página principal. Descarregando módulo de Aniversariantes.");
    aniverModuleInstance = null; 
    uiModuleInstance.unregisterModule('Aniversariantes');
}

/** Carrega o módulo do PAdm. */
async function loadPAdmModule() {
    try {
        console.log("SisPMG+: Host do PAdm detectado. Carregando módulo...");
        loadCSS(globalConfig.padmCssUrl);
        const { PAdmModule } = await import(globalConfig.padmModuleUrl);
        const iconModule = await import(globalConfig.iconUrl);
        padmModuleInstance = new PAdmModule({ ...globalConfig, iconSVG_28: iconModule.iconSVG_28 });
        padmModuleInstance.init();
        uiModuleInstance.registerModule({ name: 'PAdm+', instance: padmModuleInstance });
    } catch (error) {
        console.error("SisPMG+: Falha ao carregar ou inicializar o módulo do PAdm.", error);
    }
}

/** Descarrega o módulo do PAdm. */
function destroyPAdmModule() {
    console.log("SisPMG+: Módulo PAdm redefinido devido à navegação.");
    if (padmModuleInstance && typeof padmModuleInstance.stopObserver === 'function') {
        padmModuleInstance.stopObserver();
    }
    padmModuleInstance = null;
    uiModuleInstance.unregisterModule('PAdm+');
}

// --- FUNÇÕES AUXILIARES ---

/**
 * Injeta uma folha de estilos no <head> da página se ela ainda não existir.
 * @param {string} url - A URL do arquivo CSS.
 */
function loadCSS(url) {
    if (!url || url === 'undefined') return; // Proteção contra URLs inválidas
    if (!document.querySelector(`link[href="${url}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        document.head.appendChild(link);
    }
}

/**
 * Envia uma mensagem para o background script.
 * @param {string} action - A ação a ser executada.
 * @param {object} payload - Os dados a serem enviados.
 * @returns {Promise<any>} A resposta do background.
 */
function sendMessageToBackground(action, payload) {
    return new Promise(resolve => {
        const messageId = Date.now() + Math.random();
        
        const responseListener = (event) => {
            if (!event.detail) return;

            // O event.detail agora é uma string JSON enviada pelo content-script.
            const detail = JSON.parse(event.detail);

            if (detail.messageId === messageId) {
                document.removeEventListener('SisPMG+:Response', responseListener);
                resolve(detail.response);
            }
        };
        document.addEventListener('SisPMG+:Response', responseListener);

        window.postMessage({ type: 'FROM_APP', action, payload, messageId }, '*');
    });
}

/**
 * Busca configurações do browser.storage.
 * @param {string[]} keys - Um array de chaves a serem buscadas.
 * @returns {Promise<object>} Um objeto com as configurações.
 */
async function getSettingsFromStorage(keys) {
    return await sendMessageToBackground('getSettings', { keys });
}
