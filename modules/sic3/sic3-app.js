// Arquivo: modules/sic3/sic3-app.js
// Roteador e Controlador Principal do SPA do SIC3 na extensão SisPMGplus.

import { executarApi, getGasApiUrl, saveGasApiUrl } from './api.js';
import { getCookie, decodeJwt } from '../../common/utils.js';

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
                console.log("[SIC3 v3.0 Log] Interceptando logout local do usuário. Fechando aba...");
                sessionStorage.clear();
                window.close();
                if (successHandler) {
                    successHandler("");
                }
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
    const rpmAtiva = sessionStorage.getItem("sic3_rpm") || (window.rpm && typeof window.rpm === 'string' ? window.rpm : "");
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

            if (cachedData && cachedData.spreadsheetId && cachedData.arquivosCompartilhados && cachedData.arquivosCompartilhados.BDEnderecos) {
                console.log(`[SIC3 v3.0 Log] IDs das planilhas recuperados do cache permanente (${cacheKey})`);
                window.idbase = cachedData.spreadsheetId;
                window.idBDConvenios = cachedData.arquivosCompartilhados.BDConvenios;
                window.idBDEnderecos = cachedData.arquivosCompartilhados.BDEnderecos;
                window.idTBPrimaria = cachedData.arquivosCompartilhados.TBPrimaria;
                window.idTBSecundaria = cachedData.arquivosCompartilhados.TBSecundaria;

                sessionStorage.setItem("sic3_idbase", window.idbase);
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

    // 1. Tenta obter a lista de URLs de APIs atualizadas a partir da aba 'apis' da planilha central antes de resolver os IDs específicos
    try {
        console.log("[SIC3 v3.0 Log] Atualizando URLs de Web Apps das APIs a partir da planilha central...");
        const apisRows = await window.carregarDadosPlanilha({
            sheetId: "1hP7wQgtsgUMuSNDC7Ac4gHKX0uWPVMTQV7Q5Xwpqwic",
            sheet: "apis",
            query: "SELECT A, B"
        });

        if (apisRows && apisRows.length > 0) {
            const mapUrls = {};
            apisRows.forEach(r => {
                const key = String(r[0] || "").trim();
                const url = String(r[1] || "").trim();
                if (key && url) {
                    mapUrls[key] = url;
                }
            });
            
            // Salva no local storage importando do api.js
            const { saveGasApiUrls } = await import('./api.js');
            await saveGasApiUrls(mapUrls);
            console.log("[SIC3 v3.0 Log] URLs de APIs atualizadas com sucesso no storage:", mapUrls);
        }
    } catch (apisErr) {
        console.warn("[SIC3 v3.0 Log] Não foi possível carregar as URLs de APIs personalizadas da central:", apisErr);
    }

    // 2. Tenta obter também os IDs globais de tabelas da aba 'config' da planilha central
    let configGlobais = { TBPrimaria: "", TBSecundaria: "" };
    try {
        console.log("[SIC3 v3.0 Log] Carregando IDs globais de tabelas da aba 'config'...");
        const configRows = await window.carregarDadosPlanilha({
            sheetId: "1hP7wQgtsgUMuSNDC7Ac4gHKX0uWPVMTQV7Q5Xwpqwic",
            sheet: "config",
            query: "SELECT A, B"
        });

        if (configRows && configRows.length > 0) {
            configRows.forEach(r => {
                const key = String(r[0] || "").trim();
                const val = String(r[1] || "").trim();
                if (key === "TBPrimaria" || key === "TBSecundaria") {
                    configGlobais[key] = val;
                }
            });
            console.log("[SIC3 v3.0 Log] IDs globais de TBPrimaria e TBSecundaria carregados com sucesso:", configGlobais);
        }
    } catch (configErr) {
        console.warn("[SIC3 v3.0 Log] Não foi possível carregar as configurações globais da aba 'config':", configErr);
    }

    // 3. Tenta resolver a partir da Planilha Central de Links via GViz (rápido, sem passar pelo GAS!)
    console.log(`[SIC3 v3.0 Log] Tentando obter IDs da planilha central links para RPM: ${rpmAtiva}, Ano: ${anoAtivo}`);
    let linksResolvidos = null;
    try {
        const linksRows = await window.carregarDadosPlanilha({
            sheetId: "1hP7wQgtsgUMuSNDC7Ac4gHKX0uWPVMTQV7Q5Xwpqwic",
            sheet: "links",
            query: "SELECT A, B, C, D, E"
        });

        const rpmNorm = String(rpmAtiva).trim().replace(/\s+/g, '').toUpperCase();
        const anoNorm = String(anoAtivo).trim();

        // Encontra a linha correspondente
        const row = linksRows.find(r => {
            const rowRpm = String(r[0] || "").trim().replace(/\s+/g, '').toUpperCase();
            const rowAno = String(r[1] || "").trim();
            return (rowRpm === rpmNorm || rowRpm === rpmNorm + "RPM") && rowAno === anoNorm;
        });

        if (row) {
            linksResolvidos = {
                success: true,
                spreadsheetId: String(row[2]).trim(),
                arquivosCompartilhados: {
                    BDConvenios: String(row[3]).trim(),
                    BDEnderecos: String(row[4]).trim()
                }
            };
            console.log(`[SIC3 v3.0 Log] IDs resolvidos com sucesso da planilha central de links para ${rpmAtiva}/${anoAtivo}`);
        }
    } catch (gvizErr) {
        console.error("[SIC3 v3.0 Log] Erro ao buscar IDs na planilha central de links via GViz:", gvizErr);
    }

    // 4. Se não encontrou na planilha de links (por exemplo, nova RPM ou novo ano não inicializado)
    if (!linksResolvidos) {
        console.warn(`[SIC3 v3.0 Log] Mapeamento não encontrado para RPM: ${rpmAtiva}, Ano: ${anoAtivo}. Solicitando criação da estrutura ao GAS...`);
        try {
            // Chama a API de estrutura do GAS que criará os arquivos no Drive, registrará na central de links e responderá os IDs
            const resCriacao = await executarApi("criarEstruturaRpmAno", [rpmAtiva, anoAtivo]);
            if (resCriacao && resCriacao.success && resCriacao.spreadsheetId) {
                linksResolvidos = resCriacao;
                window.sic3_estrutura_criada_agora = true;
            } else {
                throw new Error(resCriacao?.error || "Falha na criação de estrutura.");
            }
        } catch (apiErr) {
            console.error("[SIC3 v3.0 Log] Erro crítico ao solicitar criação de estrutura ao GAS:", apiErr);
            throw new Error("Não foi possível inicializar os bancos de dados do SiC3 para esta RPM/Ano.");
        }
    }

    if (linksResolvidos && linksResolvidos.success && linksResolvidos.spreadsheetId) {
        window.idbase = linksResolvidos.spreadsheetId;
        if (linksResolvidos.arquivosCompartilhados) {
            window.idBDConvenios = linksResolvidos.arquivosCompartilhados.BDConvenios;
            window.idBDEnderecos = linksResolvidos.arquivosCompartilhados.BDEnderecos;
            
            // Atribui os IDs globais preferencialmente a partir de configGlobais, com fallback para o retorno da API do GAS se necessário
            window.idTBPrimaria = configGlobais.TBPrimaria || linksResolvidos.arquivosCompartilhados.TBPrimaria || "";
            window.idTBSecundaria = configGlobais.TBSecundaria || linksResolvidos.arquivosCompartilhados.TBSecundaria || "";

            sessionStorage.setItem("sic3_idbase", window.idbase);
            sessionStorage.setItem("sic3_idBDConvenios", window.idBDConvenios);
            sessionStorage.setItem("sic3_idBDEnderecos", window.idBDEnderecos);
            sessionStorage.setItem("sic3_idTBPrimaria", window.idTBPrimaria);
            sessionStorage.setItem("sic3_idTBSecundaria", window.idTBSecundaria);

            if (storage) {
                const dataToCache = {
                    spreadsheetId: linksResolvidos.spreadsheetId,
                    arquivosCompartilhados: {
                        BDConvenios: window.idBDConvenios,
                        BDEnderecos: window.idBDEnderecos,
                        TBPrimaria: window.idTBPrimaria,
                        TBSecundaria: window.idTBSecundaria
                    }
                };
                storage.set({ [cacheKey]: dataToCache }, () => {
                    console.log(`[SIC3 v3.0 Log] Cache permanente atualizado para ${cacheKey}`);
                });
            }
        }
        return linksResolvidos;
    } else {
        throw new Error("Não foi possível resolver os IDs das planilhas.");
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
    if (typeof window.resetarCarregamento === 'function') {
        window.resetarCarregamento();
    }
    window.mostrarCarregamentoGlobal(`Carregando painel ${pagina}...`);
    limparRecursosInjetados();

    // Limpa o menu de navegação dinâmico no cabeçalho
    const dynamicMenu = document.getElementById('header-dynamic-menu');
    if (dynamicMenu) {
        dynamicMenu.innerHTML = '';
    }

    // Exibe ou oculta o botão de logout conforme a tela
    const btnLogout = document.getElementById('btn-logout-global');
    if (btnLogout) {
        btnLogout.style.display = (pagina === 'login') ? 'none' : 'flex';
    }
    // Oculta o painel de perfil por padrão se for login
    if (pagina === 'login') {
        const profilePanel = document.getElementById('user-profile-panel');
        if (profilePanel) profilePanel.style.display = 'none';
    }

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
        const rpmAtiva = sessionStorage.getItem("sic3_rpm") || (window.rpm && typeof window.rpm === 'string' ? window.rpm : "");
        const anoAtivo = sessionStorage.getItem("sic3_ano") || (window.ano && typeof window.ano === 'string' ? window.ano : new Date().getFullYear().toString());

        if (!window.idBDConvenios || !window.idBDEnderecos || !window.idTBPrimaria || !window.idTBSecundaria || contexto.idbase || contexto.rpm || contexto.ano) {
            try {
                // Passa false para usar prioritariamente o cache permanente do storage local em vez de forçar rede no GAS
                await window.resolverIdsPlanilhas(false);
            } catch (apiErr) {
                console.error("[SIC3 v3.0 Log] Erro ao obter IDs das planilhas compartilhadas no roteador:", apiErr);
            }
        }

        if (pagina === 'login') {
            console.log("[SIC3 v3.0 Log] Redirecionamento de login interceptado. Fechando aba...");
            alert("Sua sessão expirou ou você saiu do sistema. Faça login novamente através do portal da Intranet PM.");
            window.close();
            return;
        } else if (pagina === 'admin') {
            console.log("[SIC3 v3.0 Log] Carregando fragmento HTML local de admin...");
            const dynamicMenu = document.getElementById('header-dynamic-menu');
            if (dynamicMenu) {
                const btnSyncHtml = window.isAdmin ? `
                    <button id="btnSincronizarConvenios" class="btn-info btn-expand" style="margin-right: 10px;">
                        <i class="fas fa-sync-alt"></i> <span>SINCRONIZAR CONVÊNIOS</span>
                    </button>
                ` : '';
                dynamicMenu.innerHTML = `
                    ${btnSyncHtml}
                    <button id="btnGerenciarItem99" class="btn-info btn-expand" style="margin-right: 10px;">
                        <i class="fas fa-tasks"></i> <span>GERENCIAR ITENS 99</span>
                    </button>
                    <button id="btnIrParaPesquisa" class="btn-info btn-expand" style="margin-right: 10px;">
                        <i class="fas fa-search"></i> <span>MATERIAIS DE CONSUMO</span>
                    </button>
                    <button id="btnVoltarLancamentos" class="btn-info" style="display: none; margin-right: 10px;">
                        <i class="fas fa-arrow-left"></i> VOLTAR
                    </button>
                `;
            }
            const html = await obterHtmlLocal('html/admin.html');
            appContainer.innerHTML = html;
            
            carregarCSS('css/admin.css');
            
            window.pUser = contexto.pUser || window.pUser || "html/admin";
            window.mLog = contexto.mLog || window.mLog || "";
            window.nUser = contexto.nUser || window.nUser || "";
            window.authToken = contexto.authToken || window.authToken || "";
            window.idbase = contexto.idbase || window.idbase || "";
            window.dadosConveniosPrepostos = window.dadosConveniosPrepostos || [];
            
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
            const dynamicMenu = document.getElementById('header-dynamic-menu');
            if (dynamicMenu) {
                dynamicMenu.innerHTML = `
                    <button class="btn-voltar btn-info" type="button"><i class="fas fa-arrow-left"></i> VOLTAR</button>
                `;
            }
            const html = await obterHtmlLocal('html/lancamentos.html');
            appContainer.innerHTML = html;
            
            carregarCSS('css/lancamentos.css');
            
            window.pUser = contexto.pUser || window.pUser || "html/lancamentos";
            window.mLog = contexto.mLog || window.mLog || "";
            window.nUser = contexto.nUser || window.nUser || "";
            window.municipio = contexto.municipio || window.municipio || "";
            window.convenio = contexto.convenio || window.convenio || "";
            window.ano = contexto.ano || window.ano || "";
            window.mes = contexto.mes || window.mes || "";
            window.acao = contexto.acao || window.acao || "";
            window.authToken = contexto.authToken || window.authToken || "";
            window.idbase = contexto.idbase || window.idbase || "";
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
            await carregarJS('js/lancamentos/system_init.js');
            console.log("[SIC3 v3.0 Log] Scripts do Lançamento injetados com sucesso.");
        } else if (pagina === 'item99') {
            console.log("[SIC3 v3.0 Log] Carregando fragmento HTML local de item99...");
            const dynamicMenu = document.getElementById('header-dynamic-menu');
            if (dynamicMenu) {
                dynamicMenu.innerHTML = `
                    <button id="btn-voltar" class="btn btn-secondary"><i class="fas fa-arrow-left"></i> Voltar ao Painel</button>
                `;
            }
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
    if (apiUrlInput) {
        apiUrlInput.value = currentUrl;
    }

    if (apiUrlSaveBtn) {
        apiUrlSaveBtn.addEventListener('click', async () => {
            const url = apiUrlInput ? apiUrlInput.value.trim() : "";
            await saveGasApiUrl(url);
            alert("URL do Web App do GAS configurada com sucesso!");
            navegarPara('admin', { nUser: window.userNome || "Operador Extensão", mLog: window.mLog, authToken: "bypass", idbase: window.idbase });
        });
    }
}

// Inicializa a aplicação
window.addEventListener('DOMContentLoaded', async () => {
    // Garante o carregamento dos utilitários globais de planilha
    try {
        await carregarJS('js/utils_global.js');
    } catch(errJS) {
        console.error("[SIC3 v3.0 Log] Erro crítico ao carregar js/utils_global.js:", errJS);
    }

    // 0. Validação de Segurança contra Acesso Direto por URL/Favorito
    let extensionSessionStore = null;
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.session) {
        extensionSessionStore = browser.storage.session;
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
        extensionSessionStore = chrome.storage.session;
    }

    let currentBrowserToken = null;
    if (extensionSessionStore) {
        try {
            const resSession = await extensionSessionStore.get('browser_session_token');
            currentBrowserToken = resSession ? resSession.browser_session_token : null;
        } catch (e) {
            console.error("[SIC3 v3.0 Log] Erro ao obter session token da extensão:", e);
        }
    }

    // A sessão só é válida para esta aba específica se o token do navegador atual coincidir com o salvo na aba
    const isSessionActive = sessionStorage.getItem('sic3_active_session') === 'true';
    const localBrowserToken = sessionStorage.getItem('sic3_browser_session_token');
    
    let authorized = false;

    if (isSessionActive && currentBrowserToken && localBrowserToken === currentBrowserToken) {
        authorized = true;
    } else {
        try {
            let storage = null;
            if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
                storage = browser.storage.local;
            } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                storage = chrome.storage.local;
            }
            
            if (storage) {
                const res = await new Promise(resolve => {
                    storage.get('sispmg_sic3_access_authorized', r => resolve(r ? r.sispmg_sic3_access_authorized : null));
                });
                
                if (res && res.authorized === true) {
                    const now = Date.now();
                    // O token gerado pelo background é válido por 15 segundos
                    if (now - res.timestamp < 15000) {
                        authorized = true;
                        
                        // Vincula esta aba específica ao token de sessão do navegador ativo
                        sessionStorage.setItem('sic3_active_session', 'true');
                        if (currentBrowserToken) {
                            sessionStorage.setItem('sic3_browser_session_token', currentBrowserToken);
                        }
                    }
                }
                
                // Consome o token de acesso único
                if (res) {
                    await new Promise(resolve => {
                        storage.remove('sispmg_sic3_access_authorized', resolve);
                    });
                }
            }
        } catch (errAuth) {
            console.error("[SIC3 v3.0 Log] Erro ao validar token de acesso:", errAuth);
        }
    }

    if (!authorized) {
        console.warn("[SIC3 v3.0 Log] [Acesso Negado] Tentativa de acesso direto à página do SIC3 detectada.");
        
        // Renderiza tela de acesso negado de alta qualidade estética integrada ao design do SisPMG+
        document.body.innerHTML = `
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                background: radial-gradient(circle, #1a2230 0%, #0c1017 100%);
                color: #ffffff;
                font-family: 'Outfit', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                text-align: center;
                padding: 20px;
                box-sizing: border-box;
            ">
                <div style="
                    background: rgba(30, 41, 59, 0.45);
                    border: 1px solid rgba(179, 163, 104, 0.25);
                    border-radius: 16px;
                    padding: 40px 30px;
                    max-width: 500px;
                    width: 100%;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                ">
                    <!-- Ícone SVG da Extensão -->
                    <div style="display: flex; justify-content: center; margin-bottom: 25px;">
                        <svg width="80" height="80" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" style="font-family: 'Inter', sans-serif; border-radius: 18px; box-shadow: 0 8px 24px rgba(0,0,0,0.45);">
                            <defs>
                                <linearGradient id="gradBg-128" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#574e2d;"/><stop offset="100%" style="stop-color:#b3a368;"/></linearGradient>
                                <linearGradient id="gradItem0-128" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#b3a368;"/><stop offset="100%" style="stop-color:#efe6dd;"/></linearGradient>
                                <filter id="shadowItem0-128" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="3" dy="0" stdDeviation="1" flood-color="#000000" flood-opacity="0.45"/></filter>
                                <linearGradient id="gradItem1-128" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#000000;"/><stop offset="100%" style="stop-color:#efe6dd;"/></linearGradient>
                                <filter id="shadowItem1-128" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="1" dy="1" stdDeviation="0" flood-color="#000000" flood-opacity="1"/></filter>
                                <linearGradient id="gradItem2-128" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#51ff51;"/><stop offset="100%" style="stop-color:#00d200;"/></linearGradient>
                                <filter id="shadowItem2-128" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="1" dy="1" stdDeviation="0" flood-color="#000000" flood-opacity="1"/></filter>
                                <linearGradient id="gradItem3-128" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#333333;"/><stop offset="100%" style="stop-color:#efe6dd;"/></linearGradient>
                                <filter id="shadowItem3-128" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="1" dy="1" stdDeviation="0" flood-color="#000000" flood-opacity="1"/></filter>
                            </defs>
                            <rect width="128" height="128" rx="28" fill="url(#gradBg-128)" opacity="1"/>
                            <g transform="scale(1.28)">
                                <text x="39" y="85" font-family="'Inter', sans-serif" font-size="105" font-weight="800" fill="url(#gradItem0-128)" text-anchor="middle" style="filter: url(#shadowItem0-128);" opacity="1" stroke="#1e293b" stroke-width="1">S</text>
                                <text x="25" y="94" font-family="'Inter', sans-serif" font-size="27" font-weight="800" fill="url(#gradItem1-128)" text-anchor="middle" style="filter: url(#shadowItem1-128);" opacity="1" stroke="#000000" stroke-width="0">P</text>
                                <text x="75" y="94" font-family="'Inter', sans-serif" font-size="27" font-weight="800" fill="url(#gradItem1-128)" text-anchor="middle" style="filter: url(#shadowItem1-128);" opacity="1" stroke="#000000" stroke-width="0">G</text>
                                <text x="79" y="72" font-family="'Inter', sans-serif" font-size="62" font-weight="900" fill="url(#gradItem2-128)" text-anchor="middle" style="filter: url(#shadowItem2-128);" opacity="1" stroke="#000000" stroke-width="0">+</text>
                                <text x="48" y="94" font-family="'Inter', sans-serif" font-size="30" font-weight="800" fill="url(#gradItem3-128)" text-anchor="middle" style="filter: url(#shadowItem3-128);" opacity="1" stroke="#000000" stroke-width="0">M</text>
                            </g>
                        </svg>
                    </div>

                    <h2 style="font-size: 24px; font-weight: 600; margin-bottom: 15px; letter-spacing: 0.5px; color: #b3a368;">Acesso Restrito</h2>
                    <p style="font-size: 15px; line-height: 1.6; color: #e2e8f0; margin-bottom: 25px;">
                        Por razões de segurança, o módulo <strong>SiC3 v3.0</strong> não pode ser acessado diretamente por URL ou favoritos.
                    </p>
                    <div style="
                        background: rgba(179, 163, 104, 0.08);
                        border-left: 4px solid #b3a368;
                        padding: 12px 15px;
                        border-radius: 4px;
                        font-size: 13.5px;
                        color: #efe6dd;
                        text-align: left;
                        margin-bottom: 25px;
                        line-height: 1.5;
                    ">
                        <strong>Como acessar:</strong> Faça login na Intranet da PM e clique no botão de acesso do SiC3 através do painel do SisPMG+.
                    </div>
                    <button id="sic3-close-tab-btn" style="
                        background: linear-gradient(135deg, #574e2d 0%, #b3a368 100%);
                        color: #0d1117;
                        border: none;
                        padding: 12px 25px;
                        font-size: 14px;
                        font-weight: 700;
                        border-radius: 8px;
                        cursor: pointer;
                        box-shadow: 0 4px 15px rgba(179, 163, 104, 0.25);
                        transition: all 0.3s ease;
                        font-family: inherit;
                        width: 100%;
                    " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(179, 163, 104, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(179, 163, 104, 0.25)'">
                        Fechar Aba
                    </button>
                </div>
            </div>
        `;

        // Associa o evento de clique para fechar a aba de forma robusta
        const closeBtn = document.getElementById('sic3-close-tab-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                try {
                    if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.getCurrent) {
                        browser.tabs.getCurrent().then(tab => {
                            if (tab) {
                                browser.tabs.remove(tab.id);
                            } else {
                                window.close();
                            }
                        }).catch(() => {
                            window.close();
                        });
                    } else if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.getCurrent) {
                        chrome.tabs.getCurrent(tab => {
                            if (tab) {
                                chrome.tabs.remove(tab.id);
                            } else {
                                window.close();
                            }
                        });
                    } else {
                        window.close();
                    }
                } catch (e) {
                    console.error("Erro ao fechar a aba:", e);
                    window.close();
                }
            });
        }
        return;
    }

    console.log("[SIC3 v3.0 Log] DOMContentLoaded disparado no sic3.html. Inicializando barra de configurações de API.");
    await initConfigBar();

    window.executarApiGas = executarApi;
    window.navegarParaSic3 = navegarPara;

    // Registra o ouvinte para o botão de logout global no cabeçalho
    const btnLogoutGlobal = document.getElementById('btn-logout-global');
    if (btnLogoutGlobal) {
        btnLogoutGlobal.addEventListener('click', () => {
            if (confirm("Deseja realmente sair do SiC3?")) {
                console.log("[SIC3 v3.0 Log] Efetuando logout global. Fechando aba...");
                sessionStorage.clear();
                window.close();
            }
        });
    }

    // 1. Extrair os parâmetros do Storage Local (método prioritário sem parâmetros na URL) ou da Query String (fallback legado)
    try {
        let municipioParam = null;
        let rpmParam = null;
        let secaoParam = null;
        
        let storage = null;
        if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
            storage = browser.storage.local;
        } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            storage = chrome.storage.local;
        }
        
        if (storage) {
            try {
                const resParams = await new Promise(resolve => {
                    storage.get('sic3_url_params', res => resolve(res ? res.sic3_url_params : null));
                });
                
                if (resParams) {
                    console.log("[SIC3 v3.0 Log] Parâmetros de inicialização recuperados com sucesso do storage local:", resParams);
                    municipioParam = resParams.municipio || null;
                    rpmParam = resParams.rpm || null;
                    secaoParam = resParams.secao || null;
                    
                    if (resParams.convenioId) {
                        window.convenioId = resParams.convenioId;
                        sessionStorage.setItem("sic3_convenioId", resParams.convenioId);
                    }
                    if (resParams.ano) {
                        sessionStorage.setItem("sic3_ano", resParams.ano);
                        window.ano = resParams.ano;
                    }
                    
                    // Limpa do storage para evitar reutilizações obsoletas em aberturas subsequentes
                    storage.remove('sic3_url_params', () => {
                        console.log("[SIC3 v3.0 Log] Parâmetros consumidos e limpos do storage local.");
                    });
                }
            } catch (errStorage) {
                console.warn("[SIC3 v3.0 Log] Falha ao recuperar sic3_url_params do storage:", errStorage);
            }
        }
        
        // Fallback: se não encontrou no storage, tenta ler da URL (retrocompatibilidade)
        if (!municipioParam && !rpmParam && !secaoParam) {
            const urlParams = new URLSearchParams(window.location.search);
            municipioParam = urlParams.get('municipio');
            rpmParam = urlParams.get('rpm');
            secaoParam = urlParams.get('secao');
            
            const convenioIdParam = urlParams.get('convenioId');
            const anoParam = urlParams.get('ano');
            if (convenioIdParam) {
                window.convenioId = convenioIdParam;
                sessionStorage.setItem("sic3_convenioId", convenioIdParam);
            }
            if (anoParam) {
                sessionStorage.setItem("sic3_ano", anoParam);
                window.ano = anoParam;
            }
            
            if (municipioParam || rpmParam || secaoParam) {
                console.log("[SIC3 v3.0 Log] Parâmetros de inicialização lidos da Query String da URL.");
            }
        }

        console.log("[SIC3 v3.0 Log] [SIC3-Extração] Lendo credenciais e dados da unidade ('sic3_user_info') do browser.storage.local...");
        // Sempre tenta ler do storage local para obter as informações completas do usuário
        const storageResult = await browser.storage.local.get('sic3_user_info');
        const info = (storageResult && storageResult.sic3_user_info) ? storageResult.sic3_user_info : null;
        console.log("[SIC3 v3.0 Log] [SIC3-Extração] Informações recuperadas do storage local:", info);
        
        if (info) {
            window.userPM = info.numeroPM || "";
            window.userNome = info.nome || "";
            window.userSecao = info.secao || "";
            window.userRegiao = info.nomeRegiao || "";
            window.userPostoGraduacao = info.postoGraduacao || "";
            window.isAdmin = info.isAdmin === true;
            
            window.municipio = municipioParam ? decodeURIComponent(municipioParam).toUpperCase() : (info.municipio ? info.municipio.toUpperCase() : "");
            window.rpm = rpmParam ? rpmParam : (info.nomeRegiao || "");
            window.secao = secaoParam ? decodeURIComponent(secaoParam) : (info.secao || "");
            
            console.log("[SIC3 v3.0 Log] [SIC3-Mapeamento] Dados mapeados com sucesso:", {
                userPM: window.userPM,
                userNome: window.userNome,
                userSecao: window.userSecao,
                userRegiao: window.userRegiao,
                userPostoGraduacao: window.userPostoGraduacao,
                isAdmin: window.isAdmin,
                municipio: window.municipio,
                rpm: window.rpm,
                secao: window.secao
            });
        } else {
            console.warn("[SIC3 v3.0 Log] [SIC3-Extração] Nenhuma credencial 'sic3_user_info' encontrada no storage local. Aplicando fallback de teste.");
            // Fallback de teste
            window.municipio = municipioParam ? decodeURIComponent(municipioParam).toUpperCase() : "PARÁ DE MINAS";
            window.rpm = rpmParam || "19";
            window.secao = secaoParam ? decodeURIComponent(secaoParam) : "19º BPM";
            window.isAdmin = false;
            window.userPM = "";
            window.userNome = "Usuário Teste";
            window.userSecao = window.secao;
            window.userPostoGraduacao = "";
            console.log("[SIC3 v3.0 Log] [SIC3-Mapeamento] Fallback aplicado:", {
                municipio: window.municipio,
                rpm: window.rpm,
                secao: window.secao,
                isAdmin: window.isAdmin
            });
        }
        
        // Define o filtro de município com base no privilégio de administrador
        window.mLog = window.isAdmin ? "admin" : window.municipio;
        console.log(`[SIC3 v3.0 Log] [SIC3-Mapeamento] Globais definidos: window.municipio="${window.municipio}", window.rpm="${window.rpm}", window.isAdmin=${window.isAdmin}, window.mLog="${window.mLog}"`);
        
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
            const regiaoEl = document.getElementById('user-profile-regiao');
            const secaoEl = document.getElementById('user-profile-secao');
            const statusEl = document.getElementById('user-profile-admin-status');
            
            if (panel) {
                if (nameEl) nameEl.textContent = `${info.postoGraduacao || ''} ${info.nome || 'Usuário'}`.trim();
                if (regiaoEl) regiaoEl.textContent = info.nomeRegiao || `${info.codigoRegiao || '-'}ª RPM`;
                if (secaoEl) secaoEl.textContent = info.secao || '-';
                
                if (statusEl) {
                    if (window.isAdmin) {
                        statusEl.innerHTML = `<span class="admin-badge"><i class="fas fa-user-shield"></i> Admin</span>`;
                    } else {
                        statusEl.innerHTML = '';
                    }
                }
                
                panel.style.display = 'flex';
                console.log("[SIC3 v3.0 Log] [SIC3-Interface] Painel de Perfil do usuário renderizado com sucesso na barra lateral.");
            }
        }
        
    } catch (e) {
        console.error("[SIC3 v3.0 Log] Falha ao configurar contexto do usuário:", e);
    }

    // --- VALIDAÇÃO DE CONVÊNIOS ATIVOS (BLOQUEIO DE ACESSO) ---
    if (!window.isAdmin) {
        window.mostrarCarregamentoGlobal("Validando permissões de acesso...");
        try {
            const { obterConveniosAtivosJSON } = await import('../../common/busca-convenios.js');
            const conveniosUsuario = await obterConveniosAtivosJSON();
            if (!conveniosUsuario || conveniosUsuario.length === 0) {
                window.ocultarCarregamentoGlobal();
                alert("Acesso Negado: O acesso ao SIC3 é restrito a militares cadastrados em pelo menos um convênio no Portal de Convênios.");
                window.close();
                return;
            }
        } catch (errVal) {
            console.error("[SIC3 v3.0 Log] Erro ao validar convênios do usuário:", errVal);
        } finally {
            window.ocultarCarregamentoGlobal();
        }
    }

    // Resolve dinamicamente o ID do banco de dados (Spreadsheet) correspondente à RPM e ao Ano ativos
    window.mostrarCarregamentoGlobal("Inicializando banco de dados do SIC3...");
    try {
        await window.resolverIdsPlanilhas(false);
        
        // --- EXTRAÇÃO AUTOMÁTICA DE CONVÊNIOS SEMANAL ---
        let precisaSincronizar = false;
        let primeiraBuscaObrigatoria = false;
        
        let bancoVazio = false;
        try {
            const conveniosSalvos = await window.carregarDadosPlanilha({
                sheetId: window.idbase,
                sheet: "convenios",
                query: "SELECT A LIMIT 5"
            });
            if (!conveniosSalvos || conveniosSalvos.length <= 1) {
                bancoVazio = true;
            }
        } catch (errVerificacao) {
            console.warn("[SIC3 v3.0 Log] Erro ao verificar se a tabela 'convenios' está vazia. Assumindo que está vazia:", errVerificacao);
            bancoVazio = true;
        }

        if (window.sic3_estrutura_criada_agora || bancoVazio) {
            primeiraBuscaObrigatoria = true;
            precisaSincronizar = true;
            console.log(`[SIC3 v3.0 Log] Sincronização obrigatória de primeira busca ativada. Estrutura criada agora: ${!!window.sic3_estrutura_criada_agora}, Banco vazio: ${bancoVazio}`);
        } else if (window.userPM && !window.isAdmin) {
            const lastRunKey = `sic3_last_auto_sync_${window.userPM}`;
            const lastRunResult = await new Promise(resolve => {
                let storage = null;
                if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
                    storage = browser.storage.local;
                } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    storage = chrome.storage.local;
                }
                
                if (storage) {
                    storage.get(lastRunKey, res => resolve(res ? res[lastRunKey] : null));
                } else {
                    resolve(null);
                }
            });
            
            const hoje = Date.now();
            const umaSemanaMs = 7 * 24 * 60 * 60 * 1000;
            if (!lastRunResult || (hoje - lastRunResult) >= umaSemanaMs) {
                precisaSincronizar = true;
            }
        }
        
        if (precisaSincronizar) {
            window.mostrarCarregamentoGlobal(primeiraBuscaObrigatoria 
                ? "Iniciando primeira busca e sincronização de convênios..." 
                : "Iniciando sincronização automática de convênios semanal...");
            const { executarSincronizacaoConvenios } = await import('./js/sync-convenios.js');
            await executarSincronizacaoConvenios(primeiraBuscaObrigatoria);
            
            if (window.userPM && !primeiraBuscaObrigatoria) {
                const lastRunKey = `sic3_last_auto_sync_${window.userPM}`;
                let storage = null;
                if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
                    storage = browser.storage.local;
                } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    storage = chrome.storage.local;
                }
                if (storage) {
                    await new Promise(resolve => {
                        storage.set({ [lastRunKey]: Date.now() }, resolve);
                    });
                }
            }
        }
        
    } catch (e) {
        console.error("[SIC3 v3.0 Log] Erro ao inicializar ou sincronizar convênios:", e);
        window.idbase = "";
    } finally {
        window.ocultarCarregamentoGlobal();
    }

    // Navega diretamente para a tela do Painel Geral de administração original do v2 (formato de tabela)
    console.log("[SIC3 v3.0 Log] Navegando automaticamente para o painel admin.");
    navegarPara('admin', { nUser: window.userNome || "Operador Extensão", mLog: window.mLog, authToken: "bypass", idbase: window.idbase });
});
