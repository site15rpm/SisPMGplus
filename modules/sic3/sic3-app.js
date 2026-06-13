// Arquivo: modules/sic3/sic3-app.js
// Roteador e Controlador Principal do SPA do SIC3 na extensão SisPMGplus.

import { executarApi, getGasApiUrl, saveGasApiUrl } from './api.js';

// Funções de decodificação de credenciais do tokiuz (Intranet PM)
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

function extrairRpmDoToken() {
    try {
        const token = getCookie('tokiuz');
        if (!token) return null;
        const tokenData = decodeJwt(token);
        if (!tokenData) return null;
        
        // e = codigoRegiao (geralmente número puro da RPM, ex: "15" ou 15)
        if (tokenData.e) {
            const match = String(tokenData.e).match(/\d+/);
            if (match) return match[0];
        }
        
        // r = regiao (ex: "15ª RPM" ou "15 RPM")
        if (tokenData.r) {
            const match = String(tokenData.r).match(/\d+/);
            if (match) return match[0];
        }
        
        // u = codigoUnidadeContabil
        if (tokenData.u) {
            const match = String(tokenData.u).match(/\d+/);
            if (match) return match[0];
        }
    } catch (e) {
        console.error("Erro ao extrair RPM do token:", e);
    }
    return null;
}

// Elementos do DOM
const appContainer = document.getElementById('sic3-views-container') || document.getElementById('sic3-app-container');
const globalOverlay = document.getElementById('loading-overlay-global');
const globalOverlayMessage = document.getElementById('loading-message-global');
const apiUrlInput = document.getElementById('api-gas-url-input');
const apiUrlSaveBtn = document.getElementById('api-gas-url-save-btn');

// Utilitários de Carregamento Global
window.mostrarCarregamentoGlobal = function(mensagem = "Aguarde...") {
    globalOverlayMessage.textContent = mensagem;
    globalOverlay.style.display = "flex";
};

window.ocultarCarregamentoGlobal = function() {
    globalOverlay.style.display = "none";
};

// Histórico de Scripts e CSS injetados dinamicamente para evitar duplicação ou lixo
let activeStylesheets = [];
let activeScripts = [];

/**
 * Limpa recursos (CSS e JS) injetados dinamicamente na navegação anterior.
 */
function limparRecursosInjetados() {
    activeStylesheets.forEach(el => el.remove());
    activeStylesheets = [];
    
    activeScripts.forEach(el => el.remove());
    activeScripts = [];
}

/**
 * Injeta uma folha de estilo CSS dinamicamente.
 */
function carregarCSS(url) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild(link);
    activeStylesheets.push(link);
}

/**
 * Injeta um arquivo JavaScript de forma clássica no escopo global.
 */
function carregarJS(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => resolve(script);
        script.onerror = () => reject(new Error(`Falha ao carregar o script: ${url}`));
        document.body.appendChild(script);
        activeScripts.push(script);
    });
}

/**
 * Carrega o fragmento de HTML local.
 */
async function obterHtmlLocal(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Erro ao carregar fragmento HTML local: ${url}`);
    }
    return await response.text();
}

// ============================================================================
// SHIM DE COMPATIBILIDADE PARA google.script.run (RETROFIT PARA EXTENSÃO)
// ============================================================================
const scriptRunShim = {
    _successHandler: null,
    _failureHandler: null
};

const runProxy = new Proxy(scriptRunShim, {
    get(target, propKey) {
        if (propKey === 'withSuccessHandler') {
            return function(handler) {
                target._successHandler = handler;
                return runProxy; // Retorna o Proxy para manter o encadeamento
            };
        }
        if (propKey === 'withFailureHandler') {
            return function(handler) {
                target._failureHandler = handler;
                return runProxy; // Retorna o Proxy para manter o encadeamento
            };
        }
        
        // Retorna uma função dinâmica correspondente à rota do GAS
        return function(...args) {
            const successHandler = target._successHandler;
            const failureHandler = target._failureHandler;
            
            target._successHandler = null;
            target._failureHandler = null;
            
            // Intercepta e simula rotas de navegação localmente para evitar latência e erros do GAS
            if (propKey === 'irParaPainelLancamentos') {
                const [authToken, municipio, convenio, ano, mes, acao] = args;
                console.log(`[SIC3 v3.0 Log] Interceptando navegação local para Lançamentos: ${municipio} - ${convenio} (${mes}/${ano}) [${acao}]`);
                
                navegarPara('lancamentos', {
                    authToken: authToken || sessionStorage.getItem('authToken') || 'bypass',
                    municipio: municipio,
                    convenio: convenio,
                    ano: ano,
                    mes: mes,
                    acao: acao,
                    mLog: sessionStorage.getItem('sic3_mLog') || window.mLog,
                    nUser: window.userNome || "Operador Extensão",
                    idbase: window.idbase
                }).then(() => {
                    if (successHandler) {
                        successHandler(""); // Retorna vazio para o includeHtmlBody legado ignorar
                    }
                }).catch(err => {
                    if (failureHandler) failureHandler(err);
                });
                return;
            }

            if (propKey === 'voltarParaPainelAdmin') {
                console.log("[SIC3 v3.0 Log] Interceptando navegação local de volta para Admin.");
                navegarPara('admin', {
                    authToken: sessionStorage.getItem('authToken') || 'bypass',
                    mLog: sessionStorage.getItem('sic3_mLog') || window.mLog,
                    nUser: window.userNome || "Operador Extensão",
                    idbase: window.idbase
                }).then(() => {
                    if (successHandler) {
                        successHandler(""); // Ignora
                    }
                }).catch(err => {
                    if (failureHandler) failureHandler(err);
                });
                return;
            }

            if (propKey === 'logoutUser') {
                console.log("[SIC3 v3.0 Log] Interceptando logout local do usuário.");
                sessionStorage.clear();
                navegarPara('login').then(() => {
                    if (successHandler) {
                        successHandler("");
                    }
                }).catch(err => {
                    if (failureHandler) failureHandler(err);
                });
                return;
            }
            
            // Exibe feedback visual de carregamento para operações de gravação pesadas
            if (['salvarDadosNaPlanilha', 'incluirConvenio', 'alterarConvenio', 'excluirConvenio'].includes(propKey)) {
                if (typeof window.mostrarCarregamento === 'function') {
                    window.mostrarCarregamento("Salvando dados no servidor...");
                }
            }
            
            // Dispara chamada de API assíncrona
            executarApi(propKey, args)
                .then(result => {
                    if (typeof window.ocultarCarregamento === 'function') {
                        window.ocultarCarregamento();
                    }
                    if (successHandler) {
                        // O front-end do GAS espera receber a string de conteúdo HTML para renderização em algumas rotas
                        // Se o retorno contiver HTML gerado de rotas como 'voltarParaPainelAdmin' ou 'logoutUser',
                        // nós interceptamos e fazemos a navegação local na extensão em vez de injetar HTML bruto!
                        if (result && result.success && typeof result.content === 'string') {
                            const matchPage = result.content.match(/var pUser = "([^"]*)"/);
                            if (matchPage && matchPage[1]) {
                                const pageTarget = matchPage[1].split('/').pop(); // 'admin' ou 'login'
                                const tokenMatch = result.content.match(/var authToken = "([^"]*)"/);
                                const mLogMatch = result.content.match(/var mLog = "([^"]*)"/);
                                const nUserMatch = result.content.match(/var nUser = "([^"]*)"/) || [];
                                
                                navegarPara(pageTarget, {
                                    authToken: tokenMatch ? tokenMatch[1] : '',
                                    mLog: mLogMatch ? mLogMatch[1] : '',
                                    nUser: nUserMatch ? nUserMatch[1] : '',
                                    convenios: result.convenios || []
                                });
                                return;
                            }
                        }
                        successHandler(result);
                    }
                })
                .catch(err => {
                    if (typeof window.ocultarCarregamento === 'function') {
                        window.ocultarCarregamento();
                    }
                    if (failureHandler) {
                        failureHandler(err);
                    } else {
                        console.error(`Erro ao executar chamada API [${propKey}]:`, err);
                        alert(`Erro de conexão com o servidor GAS: ${err.message}`);
                    }
                });
        };
    }
});

// Inicialização Global
window.google = {
    script: {
        run: runProxy
    }
};

// Atacha manipulador para injeções legadas (includeHtmlBody)
window.includeHtmlBody = function(contentHtml) {
    if (!contentHtml || typeof contentHtml !== 'string') return;
    
    // Intercepta a tela de gerenciamento de itens 99
    if (contentHtml.includes("tabela-itens-99") || contentHtml.includes("Gerenciamento de Itens 99")) {
        const tokenMatch = contentHtml.match(/var authToken = "([^"]*)"/);
        const mLogMatch = contentHtml.match(/var mLog = "([^"]*)"/);
        const nUserMatch = contentHtml.match(/var nUser = "([^"]*)"/);
        const idbaseMatch = contentHtml.match(/var idbase = "([^"]*)"/);

        navegarPara('item99', {
            authToken: tokenMatch ? tokenMatch[1] : '',
            mLog: mLogMatch ? mLogMatch[1] : '',
            nUser: nUserMatch ? nUserMatch[1] : '',
            idbase: idbaseMatch ? idbaseMatch[1] : ''
        });
        return;
    }
    
    // Tenta identificar qual tela renderizar a partir da variável pUser do HTML recebido
    const matchPage = contentHtml.match(/var pUser = "([^"]*)"/);
    if (matchPage && matchPage[1]) {
        const pageTarget = matchPage[1].split('/').pop(); // 'admin', 'login', 'lancamentos'
        
        const tokenMatch = contentHtml.match(/var authToken = "([^"]*)"/);
        const mLogMatch = contentHtml.match(/var mLog = "([^"]*)"/);
        const nUserMatch = contentHtml.match(/var nUser = "([^"]*)"/);
        const idbaseMatch = contentHtml.match(/var idbase = "([^"]*)"/);
        
        // Parâmetros para Lançamentos se houver
        const municipioMatch = contentHtml.match(/var municipio = "([^"]*)"/);
        const convenioMatch = contentHtml.match(/var convenio = "([^"]*)"/);
        const anoMatch = contentHtml.match(/var ano = "([^"]*)"/);
        const mesMatch = contentHtml.match(/var mes = "([^"]*)"/);
        const acaoMatch = contentHtml.match(/var acao = "([^"]*)"/);

        navegarPara(pageTarget, {
            authToken: tokenMatch ? tokenMatch[1] : '',
            mLog: mLogMatch ? mLogMatch[1] : '',
            nUser: nUserMatch ? nUserMatch[1] : '',
            idbase: idbaseMatch ? idbaseMatch[1] : '',
            municipio: municipioMatch ? municipioMatch[1] : '',
            convenio: convenioMatch ? convenioMatch[1] : '',
            ano: anoMatch ? anoMatch[1] : '',
            mes: mesMatch ? mesMatch[1] : '',
            acao: acaoMatch ? acaoMatch[1] : ''
        });
    }
};

// ============================================================================
// RESOLUÇÃO DE IDS E CACHE PERMANENTE
// ============================================================================

/**
 * Resolve os IDs das planilhas ativas em cache permanente ou consulta o servidor caso falhe.
 * @param {boolean} [forcarRecarregamento=false] - Se true, ignora o cache e atualiza do servidor.
 * @returns {Promise<object>} Objeto contendo os IDs das planilhas resolvidas.
 */
window.resolverIdsPlanilhas = async function(forcarRecarregamento = false) {
    const rpmAtiva = sessionStorage.getItem("sic3_rpm") || (window.rpm && typeof window.rpm === 'string' ? window.rpm : "15 RPM");
    const anoAtivo = sessionStorage.getItem("sic3_ano") || (window.ano && typeof window.ano === 'string' ? window.ano : new Date().getFullYear().toString());
    const cacheKey = `sic3_ids_cache_${rpmAtiva.replace(/\s+/g, '_')}_${anoAtivo}`;
    
    let storage = null;
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        storage = browser.storage.local;
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        storage = chrome.storage.local;
    }

    if (!forcarRecarregamento && storage) {
        try {
            const cachedData = await new Promise((resolve) => {
                storage.get(cacheKey, (res) => {
                    resolve(res ? res[cacheKey] : null);
                });
            });

            if (cachedData && cachedData.spreadsheetId && cachedData.arquivosCompartilhados) {
                console.log(`[SIC3 v3.0 Log] IDs das planilhas recuperados do cache permanente (${cacheKey})`);
                window.idbase = cachedData.spreadsheetId;
                window.idBDConvenios = cachedData.arquivosCompartilhados.BDConvenios;
                window.idBDEnderecos = cachedData.arquivosCompartilhados.BDEnderecos;
                window.idTBPrimaria = cachedData.arquivosCompartilhados.TBPrimaria;
                window.idTBSecundaria = cachedData.arquivosCompartilhados.TBSecundaria;

                sessionStorage.setItem("sic3_idBDConvenios", window.idBDConvenios);
                sessionStorage.setItem("sic3_idBDEnderecos", window.idBDEnderecos);
                sessionStorage.setItem("sic3_idTBPrimaria", window.idTBPrimaria);
                sessionStorage.setItem("sic3_idTBSecundaria", window.idTBSecundaria);
                return cachedData;
            }
        } catch (err) {
            console.error("[SIC3 v3.0 Log] Erro ao carregar IDs do cache permanente:", err);
        }
    }

    // Caso não tenha cache ou precise forçar, busca do servidor GAS
    console.log(`[SIC3 v3.0 Log] Requisitando obterIdPlanilha do servidor para RPM: ${rpmAtiva}, Ano: ${anoAtivo}`);
    const resId = await executarApi("obterIdPlanilha", [rpmAtiva, anoAtivo]);
    console.log("[SIC3 v3.0 Log] Resultado obterIdPlanilha do servidor:", resId);

    if (resId && resId.success && resId.spreadsheetId) {
        window.idbase = resId.spreadsheetId;
        if (resId.arquivosCompartilhados) {
            window.idBDConvenios = resId.arquivosCompartilhados.BDConvenios;
            window.idBDEnderecos = resId.arquivosCompartilhados.BDEnderecos;
            window.idTBPrimaria = resId.arquivosCompartilhados.TBPrimaria;
            window.idTBSecundaria = resId.arquivosCompartilhados.TBSecundaria;

            sessionStorage.setItem("sic3_idBDConvenios", window.idBDConvenios);
            sessionStorage.setItem("sic3_idBDEnderecos", window.idBDEnderecos);
            sessionStorage.setItem("sic3_idTBPrimaria", window.idTBPrimaria);
            sessionStorage.setItem("sic3_idTBSecundaria", window.idTBSecundaria);

            if (storage) {
                const dataToCache = {
                    spreadsheetId: resId.spreadsheetId,
                    arquivosCompartilhados: resId.arquivosCompartilhados
                };
                storage.set({ [cacheKey]: dataToCache }, () => {
                    console.log(`[SIC3 v3.0 Log] Cache permanente salvo para ${cacheKey}`);
                });
            }
        }
        return resId;
    } else {
        throw new Error("Não foi possível obter os IDs da planilha do servidor.");
    }
};

// ============================================================================
// NAVEGAÇÃO SPA
// ============================================================================

/**
 * Roteia a aplicação para a página especificada.
 * @param {string} pagina - 'login', 'admin' ou 'lancamentos'
 * @param {object} [contexto={}] - Variáveis de contexto para passar à página
 */
export async function navegarPara(pagina, contexto = {}) {
    console.log(`[SIC3 v3.0 Log] navegarPara iniciado. Destino: "${pagina}". Contexto:`, contexto);
    window.mostrarCarregamentoGlobal(`Carregando painel ${pagina}...`);
    limparRecursosInjetados();

    try {
        // Propaga e persiste o contexto na sessão
        if (contexto.authToken) {
            sessionStorage.setItem("authToken", contexto.authToken);
            window.authToken = contexto.authToken;
        }
        if (contexto.rpm) {
            sessionStorage.setItem("sic3_rpm", contexto.rpm);
            window.rpm = contexto.rpm;
            console.log(`[SIC3 v3.0 Log] RPM definida globalmente: ${window.rpm}`);
        }
        if (contexto.ano) {
            sessionStorage.setItem("sic3_ano", contexto.ano);
            window.ano = contexto.ano;
            console.log(`[SIC3 v3.0 Log] Ano definido globalmente: ${window.ano}`);
        }
        if (contexto.mLog) {
            sessionStorage.setItem("sic3_mLog", contexto.mLog);
            window.mLog = contexto.mLog;
            console.log(`[SIC3 v3.0 Log] mLog definido globalmente: ${window.mLog}`);
        }

        // Resolve dinamicamente de forma segura os valores de RPM e Ano ativos (evitando colisões com DOM)
        const rpmAtiva = sessionStorage.getItem("sic3_rpm") || (window.rpm && typeof window.rpm === 'string' ? window.rpm : "15 RPM");
        const anoAtivo = sessionStorage.getItem("sic3_ano") || (window.ano && typeof window.ano === 'string' ? window.ano : new Date().getFullYear().toString());

        if (!window.idBDConvenios || !window.idBDEnderecos || !window.idTBPrimaria || !window.idTBSecundaria || contexto.idbase) {
            try {
                await window.resolverIdsPlanilhas(!!contexto.idbase);
            } catch (apiErr) {
                console.error("[SIC3 v3.0 Log] Erro ao obter IDs das planilhas compartilhadas no roteador:", apiErr);
            }
        }

        if (pagina === 'login') {
            console.log("[SIC3 v3.0 Log] Carregando fragmento HTML local de login...");
            const html = await obterHtmlLocal('html/login.html');
            appContainer.innerHTML = html;
            
            carregarCSS('css/login.css');
            
            window.pUser = contexto.pUser || "html/login";
            window.mLog = contexto.mLog || "";
            window.nUser = contexto.nUser || "";
            window.authToken = contexto.authToken || "";
            window.idbase = contexto.idbase || "";

            await carregarJS('js/utils_global.js');
            await carregarJS('js/form_validation.js');
            await carregarJS('js/login-controller.js');
            console.log("[SIC3 v3.0 Log] Scripts do Login injetados com sucesso.");
            
        } else if (pagina === 'admin') {
            console.log("[SIC3 v3.0 Log] Carregando fragmento HTML local de admin...");
            const html = await obterHtmlLocal('html/admin.html');
            appContainer.innerHTML = html;
            
            carregarCSS('css/admin.css');
            
            window.pUser = contexto.pUser || "html/admin";
            window.mLog = contexto.mLog || window.mLog || "";
            window.nUser = contexto.nUser || "";
            window.authToken = contexto.authToken || "";
            window.idbase = contexto.idbase || "";
            window.dadosConveniosPrepostos = [];
            
            if (contexto.convenios) {
                window.convenios = typeof contexto.convenios === 'string' ? contexto.convenios : JSON.stringify(contexto.convenios);
            }

            window.ADMIN_CONFIG = window.ADMIN_CONFIG || {
                adminInicializado: false,
                lancamentosCarregados: false,
                dados: {
                    convenios: [],
                    lancamentos: [],
                    anos: [],
                },
                estados: {
                    carregando: 0,
                    telaAtual: "lancamentos",
                },
            };

            await carregarJS('js/utils_global.js');
            await carregarJS('js/form_validation.js');
            await carregarJS('js/admin/interface_ui.js');
            await carregarJS('js/admin/carreg_manip_dados.js');
            await carregarJS('js/admin/utilitarios.js');
            await carregarJS('js/admin/crud_convenios.js');
            await carregarJS('js/admin/datatables.js');
            await carregarJS('js/admin/gerarpdf.js');
            await carregarJS('js/admin/init_config_geral.js');
            console.log("[SIC3 v3.0 Log] Scripts do Admin injetados com sucesso.");
            
        } else if (pagina === 'lancamentos') {
            console.log("[SIC3 v3.0 Log] Carregando fragmento HTML local de lancamentos...");
            const html = await obterHtmlLocal('html/lancamentos.html');
            appContainer.innerHTML = html;
            
            carregarCSS('css/lancamentos.css');
            
            window.pUser = contexto.pUser || "html/lancamentos";
            window.mLog = contexto.mLog || window.mLog || "";
            window.nUser = contexto.nUser || "";
            window.municipio = contexto.municipio || "";
            window.convenio = contexto.convenio || "";
            window.ano = contexto.ano || "";
            window.mes = contexto.mes || "";
            window.acao = contexto.acao || "";
            window.authToken = contexto.authToken || "";
            window.idbase = contexto.idbase || "";
            window.preposto_n = "";
            window.preposto_pg = "";
            window.preposto = "";

            await carregarJS('js/utils_global.js');
            await carregarJS('js/form_validation.js');
            await carregarJS('js/lancamentos/global_vars_and_init.js');
            await carregarJS('js/lancamentos/address_manager.js');
            await carregarJS('js/lancamentos/data_main.js');
            await carregarJS('js/lancamentos/form_generic.js');
            await carregarJS('js/lancamentos/datatable_material_init.js');
            await carregarJS('js/lancamentos/form_abastecimento.js');
            await carregarJS('js/lancamentos/form_manutencao.js');
            await carregarJS('js/lancamentos/form_outros_itens.js');
            await carregarJS('js/lancamentos/form_material.js');
            await carregarJS('js/lancamentos/autocompletar.js');
            await carregarJS('js/lancamentos/system_init.js');
            console.log("[SIC3 v3.0 Log] Scripts do Lançamento injetados com sucesso.");
        } else if (pagina === 'item99') {
            console.log("[SIC3 v3.0 Log] Carregando fragmento HTML local de item99...");
            const html = await obterHtmlLocal('html/item99.html');
            appContainer.innerHTML = html;
            
            carregarCSS('css/item99.css');
            
            window.pUser = contexto.pUser || "html/item99";
            window.mLog = contexto.mLog || window.mLog || "";
            window.nUser = contexto.nUser || "";
            window.authToken = contexto.authToken || "";
            window.idbase = contexto.idbase || "";

            await carregarJS('js/utils_global.js');
            await carregarJS('js/form_validation.js');
            await carregarJS('js/item99.js');
            console.log("[SIC3 v3.0 Log] Scripts de Itens 99 injetados com sucesso.");
        }
        
    } catch (error) {
        console.error("[SIC3 v3.0 Log] Erro na navegação do SIC3:", error);
        alert(`Ocorreu um erro ao carregar a página: ${error.message}`);
    } finally {
        window.ocultarCarregamentoGlobal();
    }
}

// Ouvinte para rebaixar sessões inválidas (redireciona para o admin em caso de falha de autenticação na extensão)
document.addEventListener('sic3:unauthorized', () => {
    navegarPara('admin');
});

// Inicialização da barra de configuração de API
async function initConfigBar() {
    const currentUrl = await getGasApiUrl();
    apiUrlInput.value = currentUrl;

    apiUrlSaveBtn.addEventListener('click', async () => {
        const url = apiUrlInput.value.trim();
        await saveGasApiUrl(url);
        alert("URL do Web App do GAS configurada com sucesso!");
        navegarPara('admin', { nUser: window.userNome || "Operador Extensão", mLog: window.mLog, authToken: "bypass", idbase: window.idbase });
    });
}

// Inicializa a aplicação
window.addEventListener('DOMContentLoaded', async () => {
    console.log("[SIC3 v3.0 Log] DOMContentLoaded disparado no sic3.html. Inicializando barra de configurações de API.");
    await initConfigBar();

    window.executarApiGas = executarApi;
    window.navegarParaSic3 = navegarPara;

    // 1. Extrair os parâmetros da Query String ou do Storage
    try {
        const urlParams = new URLSearchParams(window.location.search);
        let municipioParam = urlParams.get('municipio');
        let rpmParam = urlParams.get('rpm');
        let secaoParam = urlParams.get('secao');
        
        console.log("[SIC3 v3.0 Log] Extraindo dados do browser.storage.local para 'sic3_v3_user_info'...");
        // Sempre tenta ler do storage local para obter as informações completas do usuário
        const storageResult = await browser.storage.local.get('sic3_v3_user_info');
        const info = (storageResult && storageResult.sic3_v3_user_info) ? storageResult.sic3_v3_user_info : null;
        console.log("[SIC3 v3.0 Log] Dados recuperados do storage local:", info);
        
        if (info) {
            window.userPM = info.numeroPM || "";
            window.userNome = info.nome || "";
            window.userSecao = info.secaoUsuario || info.nomenclatura || "";
            window.userRegiao = info.nomeRPM || "";
            window.isAdmin = info.isAdmin === true;
            
            window.municipio = municipioParam ? decodeURIComponent(municipioParam).toUpperCase() : info.municipio.toUpperCase();
            window.rpm = rpmParam ? rpmParam : (info.codigoRPM || "15");
            window.secao = secaoParam ? decodeURIComponent(secaoParam) : (info.nomenclatura || "");
        } else {
            console.warn("[SIC3 v3.0 Log] Nenhuma credencial 'sic3_v3_user_info' no storage local. Aplicando fallback de teste.");
            // Fallback de teste
            window.municipio = municipioParam ? decodeURIComponent(municipioParam).toUpperCase() : "PARÁ DE MINAS";
            window.rpm = rpmParam || "19";
            window.secao = secaoParam ? decodeURIComponent(secaoParam) : "19º BPM";
            window.isAdmin = false;
        }
        
        // Define o filtro de município com base no privilégio de administrador
        window.mLog = window.isAdmin ? "admin" : window.municipio;
        console.log(`[SIC3 v3.0 Log] Definidos globais: window.municipio=${window.municipio}, window.rpm=${window.rpm}, window.isAdmin=${window.isAdmin}, window.mLog=${window.mLog}`);
        
        // Grava no sessionStorage para inicialização segura do contexto
        sessionStorage.setItem("sic3_rpm", window.rpm);
        sessionStorage.setItem("sic3_ano", new Date().getFullYear().toString());
        sessionStorage.setItem("authToken", "bypass");
        
        // Updates de display no cabeçalho superior
        document.getElementById('user-municipio-display').textContent = window.municipio;
        document.getElementById('user-rpm-display').textContent = /^\d+$/.test(window.rpm) ? window.rpm + "ª RPM" : window.rpm;
        document.getElementById('user-secao-display').textContent = window.secao || "Geral";
        
        // Preenche e exibe o Painel de Perfil de Usuário Premium
        if (info) {
            const panel = document.getElementById('user-profile-panel');
            const nameEl = document.getElementById('user-profile-name');
            const pmEl = document.getElementById('user-profile-pm');
            const secaoMuniEl = document.getElementById('user-profile-secao-municipio');
            const regiaoEl = document.getElementById('user-profile-regiao');
            const statusEl = document.getElementById('user-profile-admin-status');
            
            if (panel) {
                if (nameEl) nameEl.textContent = `${info.postoGraduacao || ''} ${info.nome || 'Usuário'}`.trim();
                if (pmEl) pmEl.textContent = `PM nº ${info.numeroPM || '-'}`;
                if (secaoMuniEl) secaoMuniEl.textContent = `${info.secaoUsuario || info.nomenclatura || '-'} / ${info.municipio}`;
                if (regiaoEl) regiaoEl.textContent = info.nomeRPM || `${info.codigoRPM || '-'}ª RPM`;
                
                if (statusEl) {
                    if (window.isAdmin) {
                        statusEl.innerHTML = `<span class="admin-badge"><i class="fas fa-user-shield"></i> Administrador</span>`;
                    } else {
                        statusEl.innerHTML = '';
                    }
                }
                
                panel.style.display = 'flex';
                console.log("[SIC3 v3.0 Log] Painel de Perfil do usuário renderizado com sucesso.");
            }
        }
        
    } catch (e) {
        console.error("[SIC3 v3.0 Log] Falha ao configurar contexto do usuário:", e);
    }

    // Resolve dinamicamente o ID do banco de dados (Spreadsheet) correspondente à RPM e ao Ano ativos
    window.mostrarCarregamentoGlobal("Inicializando banco de dados do SIC3...");
    try {
        await window.resolverIdsPlanilhas(false);
    } catch (e) {
        console.error("[SIC3 v3.0 Log] Erro ao resolver ID do banco de dados na inicialização:", e);
        window.idbase = "";
    } finally {
        window.ocultarCarregamentoGlobal();
    }

    // Navega diretamente para a tela do Painel Geral de administração original do v2 (formato de tabela)
    console.log("[SIC3 v3.0 Log] Navegando automaticamente para o painel admin.");
    navegarPara('admin', { nUser: window.userNome || "Operador Extensão", mLog: window.mLog, authToken: "bypass", idbase: window.idbase });
});
