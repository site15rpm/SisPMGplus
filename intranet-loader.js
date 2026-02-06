// Arquivo: intranet-loader.js
// Ponto de entrada para os módulos da Intranet, com monitoramento contínuo de navegação.

let padmModuleInstance = null;
let uiModuleInstance = null;
let aniverModuleInstance = null;
let sirconvModuleInstance = null;
let sirconvConveniosModuleInstance = null;
let sicorModuleInstance = null;
let praticasModuleInstance = null;
let unidadesModuleInstance = null; // <-- ADICIONADO
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

    moduleSettings = await getSettingsFromStorage([
        'intranetModuleEnabled', 
        'intranetUiCustomization',
        'padmModuleEnabled', 
        'aniverModuleEnabled',
        'sirconvModuleEnabled',
        'sirconvConveniosModuleEnabled',
        'sicorModuleEnabled',
        'praticasModuleEnabled',
        'unidadesModuleEnabled' // <-- ADICIONADO
    ]);

    if (moduleSettings.intranetModuleEnabled === false) {
        return;
    }

    // Carrega o Módulo de UI, que é a base para os outros
    try {
        const iconModule = await import(globalConfig.iconUrl);
        loadCSS(globalConfig.uiCssUrl);
        const { UIModule } = await import(globalConfig.uiModuleUrl);
        uiModuleInstance = new UIModule({ ...globalConfig, iconSVG_28: iconModule.iconSVG_28 });
        uiModuleInstance.init();
    } catch (error) {
        console.error("SisPMG+: Falha ao carregar o módulo de UI principal.", error);
        return; // Interrompe se o módulo base falhar
    }

    // Inicia o loop de verificação contínua para carregar/descarregar módulos dinamicamente
    setInterval(checkAllModules, 1000);

    // --- Início da Modificação: Gatilho de Token ---
    // Informa ao background que uma página foi carregada e um usuário foi identificado.
    try {
        const { getCookie, decodeJwt } = await import(globalConfig.utilsUrl);
        const token = getCookie('tokiuz'); // Usa a função com fallback do PrimeFaces
        
        if (token) {
            const decoded = decodeJwt(token);
            if (decoded && decoded.g) {
                 // Envia o "gatilho" genérico para o background
                sendMessageToBackground('intranet-user-identified', {
                    userPM: decoded.g,
                    unitCode: decoded.u,
                    system: 'INTRANET' // Identificador genérico
                });
            }
        }
    } catch (e) {
        console.error('SisPMG+ [Loader]: Falha ao processar token para gatilho de usuário.', e);
    }
    // --- Fim da Modificação ---
}


// --- VERIFICAÇÃO E CICLO DE VIDA DOS MÓDULOS ---

/**
 * Verifica periodicamente as condições para carregar ou descarregar os submódulos.
 */
function checkAllModules() {
    // Verifica o módulo de Aniversariantes
    const isPrincipalPage = window.location.hostname === 'principal.policiamilitar.mg.gov.br';
    if (moduleSettings.aniverModuleEnabled !== false) {
        if (isPrincipalPage && !aniverModuleInstance) {
            loadAniverModule();
        } else if (!isPrincipalPage && aniverModuleInstance) {
            destroyAniverModule();
        }
    }

    // Verifica o módulo do PAdm
    const isPAdmPage = window.location.hostname === 'pa.policiamilitar.mg.gov.br';
    if (moduleSettings.padmModuleEnabled !== false) {
        if (isPAdmPage && !padmModuleInstance) {
            loadPAdmModule();
        } else if (!isPAdmPage && padmModuleInstance) {
            destroyPAdmModule();
        }
    }
    
    // Verifica o módulo do SIRCONV
    const isSirconvPage = window.location.href.includes('/lite/convenio/web/convenio/view');
    if (moduleSettings.sirconvModuleEnabled !== false) {
        if (isSirconvPage && !sirconvModuleInstance) {
            loadSirconvModule();
        } else if (!isSirconvPage && sirconvModuleInstance) {
            destroySirconvModule();
        }
    }

    // Verifica o módulo do SIRCONV Convenios
    const isSirconvConveniosPage = window.location.href.includes('/lite/convenio/');
    if (moduleSettings.sirconvConveniosModuleEnabled !== false) {
        if (isSirconvConveniosPage && !sirconvConveniosModuleInstance) {
            loadSirconvConveniosModule();
        } else if (!isSirconvConveniosPage && sirconvConveniosModuleInstance) {
            destroySirconvConveniosModule();
        }
    }

    // Verifica o módulo do SICOR
    const isSicorPage = window.location.href.includes('/SICOR/');
    if (moduleSettings.sicorModuleEnabled !== false) { 
        if (isSicorPage && !sicorModuleInstance) {
            loadSicorModule();
        } else if (!isSicorPage && sicorModuleInstance) {
            destroySicorModule();
        }
    }

    // Verifica o módulo de Unidades (disponível em todas as páginas da Intranet)
    const isIntranetPage = window.location.hostname.includes('policiamilitar.mg.gov.br');
    if (moduleSettings.unidadesModuleEnabled !== false) {
        if (isIntranetPage && !unidadesModuleInstance) {
            loadUnidadesModule();
        } else if (!isIntranetPage && unidadesModuleInstance) {
            destroyUnidadesModule();
        }
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
        unidades.initUnidadesModule(); // A função init cria o botão e o modal
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
        
        // CORREÇÃO: Usamos a URL base vinda do globalConfig, pois browser.runtime não existe no contexto da página.
        const baseUrl = globalConfig.uiModuleUrl 
            ? globalConfig.uiModuleUrl.split('/modules/')[0] 
            : '';

        if (!baseUrl) {
             console.error("SisPMG+: Não foi possível determinar a URL base da extensão para carregar Práticas.");
             return;
        }

        const cssUrl = `${baseUrl}/modules/intranet/intranet-praticas-styles.css`;
        const jsUrl = `${baseUrl}/modules/intranet/intranet-praticas.js`;
        
        loadCSS(cssUrl);
        
        // Importa e executa o módulo
        const praticas = await import(jsUrl);
        praticasModuleInstance = praticas; 
        
        // Se o módulo exportar um init, executamos.
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

/** Carrega o módulo SIRCONV Convênios de forma segura. */
async function loadSirconvConveniosModule() {
    try {
        console.log("SisPMG+: Página SIRCONV Convênios detectada. Carregando módulo...");
        
        // Se houver URL de CSS definida, carrega (evita erro 404 se undefined)
        if (globalConfig.sirconvConveniosCssUrl) {
            loadCSS(globalConfig.sirconvConveniosCssUrl);
        }

        const module = await import(globalConfig.sirconvConveniosModuleUrl);
        
        if (typeof module.initSirconvConveniosModule === 'function') {
            module.initSirconvConveniosModule(globalConfig); 
            sirconvConveniosModuleInstance = module; 
        } else {
            console.error("SisPMG+: A função initSirconvConveniosModule não foi encontrada no módulo exportado.");
        }

    } catch(e) {
         console.error("SisPMG+: Falha ao carregar o módulo SIRCONV Convênios.", e);
    }
}

/** Descarrega o módulo SIRCONV Convênios. */
function destroySirconvConveniosModule() {
    console.log("SisPMG+: Saindo da página SIRCONV Convênios. Descarregando módulo.");
    if (sirconvConveniosModuleInstance && typeof sirconvConveniosModuleInstance.destroySirconvConveniosModule === 'function') {
        sirconvConveniosModuleInstance.destroySirconvConveniosModule();
    }
    sirconvConveniosModuleInstance = null;
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
            if (event.detail.messageId === messageId) {
                document.removeEventListener('SisPMG+:Response', responseListener);
                resolve(event.detail.response);
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
