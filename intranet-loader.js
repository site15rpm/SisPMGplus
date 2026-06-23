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

let globalConfig = null;
let reportarErroGlobal = null;
const failedModules = new Set();

function logarErro(error) {
    if (reportarErroGlobal) {
        reportarErroGlobal(error, 'INTRANET');
    } else {
        console.error('SisPMG+ [Loader]: reportarErroGlobal não inicializado para o erro:', error);
    }
}

/**
 * Set de módulos permitidos para o usuário atual.
 * Populado via gviz da planilha de configuração.
 * null = ainda não carregado; Set vazio = nenhum módulo; Set com itens = módulos liberados.
 * Se o fetch falhar em todas as tentativas e não houver cache, é definido como null
 * e o checkAllModules trata como "liberar tudo".
 */
let allowedModules = null;

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

    // 1. Evita inicialização no fluxo de login/autenticação/SSO
    const path = window.location.pathname.toLowerCase();
    const isAuthPage = path.includes('/autenticacaosso/') || path.includes('/autenticacao/');
    if (isAuthPage) {
        console.log('SisPMG+ [Loader]: Página de autenticação/SSO detectada. Abortando inicialização.');
        return;
    }

    // 2. Importa e verifica a existência do token 'tokiuz' e do usuário no token
    let getCookieFunc = null;
    let decodeJwtFunc = null;
    try {
        const { getCookie, decodeJwt } = await import(globalConfig.utilsUrl);
        getCookieFunc = getCookie;
        decodeJwtFunc = decodeJwt;
    } catch (e) {
        console.error('SisPMG+ [Loader]: Falha ao importar utilitários de inicialização.', e);
        return;
    }

    const token = getCookieFunc ? getCookieFunc('tokiuz') : null;
    if (!token) {
        console.log('SisPMG+ [Loader]: Token "tokiuz" não encontrado (usuário não autenticado). Abortando inicialização.');
        return;
    }

    const decoded = decodeJwtFunc ? decodeJwtFunc(token) : null;
    if (!decoded || !decoded.g) {
        console.log('SisPMG+ [Loader]: Token "tokiuz" inválido ou sem identificação de usuário. Abortando inicialização.');
        return;
    }

    // Armazena o Tokiuz decodificado no sessionStorage imediatamente para uso rápido de todos os scripts/módulos
    try {
        sessionStorage.setItem('sispmg_user_tokiuz', JSON.stringify(decoded));
    } catch (e) {
        console.warn('SisPMG+ [Loader]: Não foi possível gravar o token no sessionStorage.', e);
    }

    // Inicializa o sistema de comunicação e logs de erros global
    try {
        const comunicacaoUrl = globalConfig.utilsUrl.replace('utils.js', 'comunicacao.js');
        const { iniciarComunicacao, reportarErro } = await import(comunicacaoUrl);
        reportarErroGlobal = reportarErro;
        await iniciarComunicacao('INTRANET');
    } catch (err) {
        console.error('SisPMG+ [Loader]: Falha ao inicializar o canal de comunicação/erros.', err);
    }

    // 1. Carrega o Módulo de UI, que é a base para os outros.
    try {
        const iconModule = await import(globalConfig.iconUrl);
        loadCSS(globalConfig.uiCssUrl);
        const { UIModule } = await import(globalConfig.uiModuleUrl);
        uiModuleInstance = new UIModule({ ...globalConfig, iconSVG_28: iconModule.iconSVG_28 });
        uiModuleInstance.init();
    } catch (error) {
        console.error("SisPMG+: Falha ao carregar o módulo de UI principal.", error);
        const erroEnriquecido = new Error(`Falha no submódulo UI Principal: ${error.message}`);
        erroEnriquecido.stack = error.stack;
        logarErro(erroEnriquecido);
        return; // Interrompe se o módulo base falhar.
    }

    // 2. Lógica de inicialização em fases para aguardar o background.
    let modulesInitialized = false;
    const initializeDependentModules = async () => {
        if (modulesInitialized) return;
        modulesInitialized = true;

        console.log('SisPMG+ [Loader]: Inicializando módulos dependentes...');

        // Inicia o fetch das permissões de módulos via gviz (em background).
        // O checkAllModules aguardará allowedModules ser populado.
        fetchModulosPermitidos().then(permitidos => {
            allowedModules = permitidos;
            if (allowedModules) {
                console.log('SisPMG+ [Loader]: Módulos permitidos carregados:', [...allowedModules]);
            } else {
                console.log('SisPMG+ [Loader]: Falha ao carregar módulos permitidos. Liberando tudo como fallback.');
            }
        });

        // Inicia o loop que verifica e carrega os módulos dinamicamente.
        if (moduleCheckInterval) clearInterval(moduleCheckInterval);
        moduleCheckInterval = setInterval(checkAllModules, 1000);
    };

    // 3. Configura os gatilhos para a inicialização dos módulos dependentes.
    window.addEventListener('message', (event) => {
        if (event.source === window && event.data?.type === 'FROM_BACKGROUND' && event.data?.action === 'sispmg-ready') {
            initializeDependentModules();
        }
        // Escuta atualizações de módulos em tempo real enviadas pelo background
        if (event.source === window && event.data?.type === 'FROM_SISPMG_BACKGROUND') {
            if (event.data?.action === 'modulos-updated') {
                console.log('SisPMG+ [Loader]: Atualização de abrangência de módulos recebida. Atualizando...');
                fetchModulosPermitidos().then(permitidos => {
                    allowedModules = permitidos;
                    checkAllModules();
                });
            }
        }
    });
    setTimeout(() => {
        if (!modulesInitialized) {
            console.warn('SisPMG+ [Loader]: Timeout esperando pelo sinal "sispmg-ready". Forçando inicialização dos módulos.');
            initializeDependentModules();
        }
    }, 5000); // Timeout de 5 segundos como segurança.

    // 4. Envia o gatilho de identificação do usuário, que fará o background responder com 'sispmg-ready'.
    try {
        sendMessageToBackground('intranet-user-identified', {
            userPM: decoded.g,
            unitCode: decoded.u,
            system: 'INTRANET'
        });
    } catch (e) {
        console.error('SisPMG+ [Loader]: Falha ao enviar identificação do usuário para o background. Forçando inicialização de módulos.', e);
        initializeDependentModules();
    }
}


// --- CONTROLE DE ABRANGÊNCIA DE MÓDULOS VIA GVIZ ---

const SHEET_ID = '1e93QrFOFFHRhuq1_5J6scH_JTAEWe4Rk-mIZ1SYaQ1s';
const SHEET_NAME = 'modulos';
const CACHE_KEY = 'sispmg_modulos_permitidos';
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

/**
 * Constrói o objeto userData a partir do token decodificado armazenado no sessionStorage.
 * O formato é compatível com checkAbrangencia().
 * @returns {object} userData
 */
function buildUserDataFromSession() {
    try {
        const raw = sessionStorage.getItem('sispmg_user_tokiuz');
        if (!raw) return null;
        const decoded = JSON.parse(raw);

        const funcoes = Array.isArray(decoded.f) ? decoded.f.map(String) : [];
        const fl = [];
        const ff = [];
        funcoes.forEach(func => {
            const parts = func.split('.');
            if (parts.length > 1) {
                fl.push(parts[0]);
                ff.push(parts.slice(1).join('.'));
            } else {
                fl.push(func);
                ff.push('');
            }
        });

        return {
            g: String(decoded.g || ''),
            t: String(decoded.t || ''),
            e: String(decoded.e || ''),
            p: String(decoded.p || ''),
            r: String(decoded.r || ''),
            u: String(decoded.u || ''),
            c: String(decoded.c || ''),
            f: funcoes,
            fl,
            ff
        };
    } catch (e) {
        console.warn('SisPMG+ [Loader]: Falha ao reconstruir userData da sessão.', e);
        return null;
    }
}

/**
 * Parseia a resposta gviz e retorna um Set com as chaves de módulos
 * para os quais o usuário tem abrangência.
 * Estrutura esperada da aba "modulos":
 *   C[0]: Abrangência (ex: "PMMG", "e:6869")
 *   C[1]: Chave do módulo (ex: "aniver", "sicor")
 * @param {string} responseText - Texto bruto da resposta gviz.
 * @param {object} userData - Dados do usuário para checar abrangência.
 * @returns {Set<string>}
 */
async function parseModulosResponse(responseText, userData) {
    const { checkAbrangencia } = await import(globalConfig.utilsUrl);

    // Limpa o envelope JSONP do gviz
    let jsonString = responseText.substring(47).slice(0, -2);
    jsonString = jsonString.replace(/\[null/g, '[{"v":"NAO"}');
    jsonString = jsonString.replace(/,null/g, ',{"v":""}');
    jsonString = jsonString.replace(/:null/g, ':""');

    const json = JSON.parse(jsonString).table;
    const permitidos = new Set();

    if (json.rows && json.rows.length > 0) {
        for (const row of json.rows) {
            if (!row.c || row.c.length < 2) continue;
            const abrangencia = row.c[0]?.v || '';
            const moduloKey = row.c[1]?.v || '';
            if (moduloKey && checkAbrangencia(abrangencia, userData)) {
                permitidos.add(moduloKey.trim());
            }
        }
    }

    return permitidos;
}

/**
 * Busca os módulos permitidos para o usuário via gviz.
 * Tenta até MAX_RETRIES vezes com intervalo crescente.
 * Em caso de falha total, usa o cache do sessionStorage.
 * Se não houver cache, retorna null (libera tudo como fallback de segurança).
 * @returns {Promise<Set<string>|null>} Set de módulos permitidos, ou null para "liberar tudo".
 */
async function fetchModulosPermitidos() {
    const userData = buildUserDataFromSession();
    let ultimoErro = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await sendMessageToBackground('obterPlanilhaGviz', {
                sheetId: SHEET_ID,
                sheetName: SHEET_NAME
            });

            if (!response || !response.success) {
                throw new Error(response?.error || 'Falha ao buscar planilha via background.');
            }

            const text = response.text;

            // Se não houver userData (token não disponível ainda), aguarda e retenta
            const ud = userData || buildUserDataFromSession();
            if (!ud) {
                throw new Error('userData não disponível ainda');
            }

            const permitidos = await parseModulosResponse(text, ud);

            // Persiste no cache para uso em caso de falha futura
            try {
                sessionStorage.setItem(CACHE_KEY, JSON.stringify([...permitidos]));
            } catch (_) {}

            console.log(`SisPMG+ [Loader]: Abrangência de módulos carregada com sucesso (tentativa ${attempt}).`);
            return permitidos;

        } catch (e) {
            ultimoErro = e;
            console.warn(`SisPMG+ [Loader]: Falha ao buscar módulos permitidos (tentativa ${attempt}/${MAX_RETRIES}): ${e.message}`);

            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
            }
        }
    }

    // Se falhar em todas as tentativas, reporta ativamente
    if (ultimoErro) {
        const erroEnriquecido = new Error(`Falha crítica ao buscar abrangência de módulos via gviz após ${MAX_RETRIES} tentativas: ${ultimoErro.message}`);
        erroEnriquecido.stack = ultimoErro.stack;
        logarErro(erroEnriquecido);
    }

    // Todas as tentativas falharam — tenta o cache do sessionStorage
    try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            console.warn('SisPMG+ [Loader]: Usando cache local de módulos permitidos (planilha inacessível).');
            return new Set(parsed);
        }
    } catch (_) {}

    // Sem cache — libera tudo como fallback de segurança
    console.warn('SisPMG+ [Loader]: Sem cache e sem acesso à planilha. Liberando todos os módulos como fallback.');
    return null; // null = "liberar tudo"
}

/**
 * Verifica se um módulo está permitido para o usuário atual.
 * @param {string} moduloKey - Chave do módulo (ex: "sicor", "aniver").
 * @returns {boolean}
 */
function isModuloPermitido(moduloKey) {
    if (allowedModules === null) return true; // null = fallback "liberar tudo"
    return allowedModules.has(moduloKey);
}


// --- VERIFICAÇÃO E CICLO DE VIDA DOS MÓDULOS ---

/**
 * Verifica periodicamente as condições para carregar ou descarregar os submódulos.
 * Aguarda o carregamento inicial das permissões antes de agir.
 */
function checkAllModules() {
    // Enquanto as permissões ainda estão sendo carregadas (undefined não é o caso aqui,
    // allowedModules começa como null mas pode estar em fetching), deixa passar.
    // O fetch é assíncrono — allowedModules começa null (= libera tudo temporariamente),
    // e é atualizado quando o fetch termina. Isso evita delay na inicialização.

    const isPrincipalPage = window.location.hostname === 'principal.policiamilitar.mg.gov.br';
    const isPAdmPage = window.location.hostname === 'pa.policiamilitar.mg.gov.br';

    // Verifica o módulo de Aniversariantes
    if (isModuloPermitido('aniver')) {
        if (isPrincipalPage && !aniverModuleInstance && !failedModules.has('aniver')) {
            loadAniverModule();
        } else if (!isPrincipalPage && aniverModuleInstance) {
            destroyAniverModule();
        }
    } else if (aniverModuleInstance) {
        destroyAniverModule();
    }

    // Verifica o módulo da Agenda
    if (isModuloPermitido('agenda')) {
        if ((isPrincipalPage || isPAdmPage) && !agendaModuleInstance && !failedModules.has('agenda')) {
            const loadUI = isPrincipalPage;
            loadAgendaModule(loadUI);
        } else if (!isPrincipalPage && !isPAdmPage && agendaModuleInstance) {
            destroyAgendaModule();
        }
    } else if (agendaModuleInstance) {
        destroyAgendaModule();
    }

    // Verifica o módulo do PAdm
    if (isModuloPermitido('padm')) {
        if (isPAdmPage && !padmModuleInstance && !failedModules.has('padm')) {
            loadPAdmModule();
        } else if (!isPAdmPage && padmModuleInstance) {
            destroyPAdmModule();
        }
    } else if (padmModuleInstance) {
        destroyPAdmModule();
    }

    // Verifica o módulo do SIRCONV
    const isSirconvPage = window.location.href.includes('/lite/convenio/web/convenio/view');
    if (isModuloPermitido('sirconv')) {
        if (isSirconvPage && !sirconvModuleInstance && !failedModules.has('sirconv')) {
            loadSirconvModule();
        } else if (!isSirconvPage && sirconvModuleInstance) {
            destroySirconvModule();
        }
    } else if (sirconvModuleInstance) {
        destroySirconvModule();
    }

    // Verifica o módulo do SIRCONV Dashboard
    const isSirconvDashboardPage = window.location.href.includes('/lite/convenio/');
    if (isModuloPermitido('sirconvDashboard')) {
        if (isSirconvDashboardPage && !sirconvDashboardModuleInstance && !failedModules.has('sirconvDashboard')) {
            loadSirconvDashboardModule();
        } else if (!isSirconvDashboardPage && sirconvDashboardModuleInstance) {
            destroySirconvDashboardModule();
        }
    } else if (sirconvDashboardModuleInstance) {
        destroySirconvDashboardModule();
    }

    // Verifica o módulo do SICOR
    const isSicorPage = window.location.href.includes('/SICOR/');
    if (isModuloPermitido('sicor')) {
        if (isSicorPage && !sicorModuleInstance && !failedModules.has('sicor')) {
            loadSicorModule();
        } else if (!isSicorPage && sicorModuleInstance) {
            destroySicorModule();
        }
    } else if (sicorModuleInstance) {
        destroySicorModule();
    }

    // Verifica o módulo de Unidades
    const isIntranetPage = window.location.hostname.includes('policiamilitar.mg.gov.br');
    if (isModuloPermitido('unidades')) {
        if (isIntranetPage && !unidadesModuleInstance && !failedModules.has('unidades')) {
            loadUnidadesModule();
        } else if (!isIntranetPage && unidadesModuleInstance) {
            destroyUnidadesModule();
        }
    } else if (unidadesModuleInstance) {
        destroyUnidadesModule();
    }

    // Verifica o módulo de Práticas Supervisionadas
    const isPraticasPage = window.location.href.includes('/sige/paginas/perfil/avaliador/praticas.jsf');
    if (isModuloPermitido('praticas')) {
        if (isPraticasPage && !praticasModuleInstance && !failedModules.has('praticas')) {
            loadPraticasModule();
        } else if (!isPraticasPage && praticasModuleInstance) {
            destroyPraticasModule();
        }
    } else if (praticasModuleInstance) {
        destroyPraticasModule();
    }

    // Verifica o módulo de Notas (Integração com Terminal)
    const isNotasPage = window.location.href.includes('manterNota.jsf');
    if (isModuloPermitido('notas')) {
        if (isNotasPage && !notasModuleInstance && !failedModules.has('notas')) {
            // Nota: o código original usa notasModuleInstance, vamos corrigir uma possível inconsistência se houver
            loadNotasModule();
        } else if (!isNotasPage && notasModuleInstance) {
            destroyNotasModule();
        }
    } else if (notasModuleInstance) {
        destroyNotasModule();
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
         failedModules.add('notas');
         const erroEnriquecido = new Error(`Falha no submódulo Notas: ${e.message}`);
         erroEnriquecido.stack = e.stack;
         logarErro(erroEnriquecido);
    }
}

/** Descarrega o módulo de Notas. */
function destroyNotasModule() {
    console.log("SisPMG+: Saindo da página de Notas. Descarregando módulo.");
    if (notasModuleInstance && typeof notasModuleInstance.destroy === 'function') {
        notasModuleInstance.destroy();
    }
    notasModuleInstance = null;
    failedModules.delete('notas');
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
         failedModules.add('agenda');
         const erroEnriquecido = new Error(`Falha no submódulo Agenda: ${e.message}`);
         erroEnriquecido.stack = e.stack;
         logarErro(erroEnriquecido);
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
    failedModules.delete('agenda');
}

/** Carrega o módulo SICOR de forma segura. */
async function loadSicorModule() {
    try {
        console.log("SisPMG+: Página SICOR detectada. Carregando módulo...");
        loadCSS(globalConfig.sicorCssUrl);
        const sicor = await import(globalConfig.sicorModuleUrl);
        sicor.initSicorModule();
        sicorModuleInstance = sicor;
    } catch(e) {
         console.error("SisPMG+: Falha ao carregar o módulo SICOR.", e);
         failedModules.add('sicor');
         const erroEnriquecido = new Error(`Falha no submódulo SICOR: ${e.message}`);
         erroEnriquecido.stack = e.stack;
         logarErro(erroEnriquecido);
    }
}

/** Descarrega o módulo SICOR. */
function destroySicorModule() {
    console.log("SisPMG+: Saindo da página SICOR. Descarregando módulo.");
    if (sicorModuleInstance && typeof sicorModuleInstance.destroySicorModule === 'function') {
        sicorModuleInstance.destroySicorModule();
    }
    sicorModuleInstance = null;
    failedModules.delete('sicor');
}

/** Carrega o módulo UNIDADES de forma segura. */
async function loadUnidadesModule() {
    try {
        console.log("SisPMG+: Página UNIDADES detectada. Carregando módulo...");
        loadCSS(globalConfig.unidadesCssUrl);
        const unidades = await import(globalConfig.unidadesModuleUrl);
        unidades.initUnidadesModule(uiModuleInstance);
        unidadesModuleInstance = unidades;
    } catch(e) {
         console.error("SisPMG+: Falha ao carregar o módulo UNIDADES.", e);
         failedModules.add('unidades');
         const erroEnriquecido = new Error(`Falha no submódulo Unidades: ${e.message}`);
         erroEnriquecido.stack = e.stack;
         logarErro(erroEnriquecido);
    }
}

/** Descarrega o módulo UNIDADES. */
function destroyUnidadesModule() {
    console.log("SisPMG+: Saindo da página UNIDADES. Descarregando módulo.");
    if (unidadesModuleInstance && typeof unidadesModuleInstance.destroyUnidadesModule === 'function') {
        unidadesModuleInstance.destroyUnidadesModule();
    }
    unidadesModuleInstance = null;
    failedModules.delete('unidades');
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
         failedModules.add('praticas');
         const erroEnriquecido = new Error(`Falha no submódulo Práticas: ${e.message}`);
         erroEnriquecido.stack = e.stack;
         logarErro(erroEnriquecido);
    }
}

/** Descarrega o módulo Práticas Supervisionadas. */
function destroyPraticasModule() {
    console.log("SisPMG+: Saindo da página Práticas. Resetando instância.");
    praticasModuleInstance = null;
    failedModules.delete('praticas');
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
             failedModules.add('sirconv');
             const erroEnriquecido = new Error(`Falha no submódulo SIRCONV: ${e.message}`);
             erroEnriquecido.stack = e.stack;
             logarErro(erroEnriquecido);
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
    failedModules.delete('sirconv');
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
         failedModules.add('sirconvDashboard');
         const erroEnriquecido = new Error(`Falha no submódulo SIRCONV Dashboard: ${e.message}`);
         erroEnriquecido.stack = e.stack;
         logarErro(erroEnriquecido);
    }
}

/** Descarrega o módulo SIRCONV Dashboard. */
function destroySirconvDashboardModule() {
    console.log("SisPMG+: Saindo da página SIRCONV. Descarregando módulo de Dashboard.");
    if (sirconvDashboardModuleInstance && typeof sirconvDashboardModuleInstance.destroy === 'function') {
        sirconvDashboardModuleInstance.destroy();
    }
    sirconvDashboardModuleInstance = null;
    failedModules.delete('sirconvDashboard');
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
         failedModules.add('aniver');
         const erroEnriquecido = new Error(`Falha no submódulo Aniversariantes: ${e.message}`);
         erroEnriquecido.stack = e.stack;
         logarErro(erroEnriquecido);
    }
}

/** Descarrega o módulo de Aniversariantes. */
function destroyAniverModule() {
    console.log("SisPMG+: Saindo da página principal. Descarregando módulo de Aniversariantes.");
    aniverModuleInstance = null;
    uiModuleInstance.unregisterModule('Aniversariantes');
    failedModules.delete('aniver');
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
        failedModules.add('padm');
        const erroEnriquecido = new Error(`Falha no submódulo PAdm+: ${error.message}`);
        erroEnriquecido.stack = error.stack;
        logarErro(erroEnriquecido);
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
    failedModules.delete('padm');
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
