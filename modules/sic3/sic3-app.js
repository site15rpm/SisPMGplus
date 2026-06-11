// Arquivo: modules/sic3/sic3-app.js
// Roteador e Controlador Principal do SPA do SIC3 na extensão SisPMGplus.

import { executarApi, getGasApiUrl, saveGasApiUrl } from './api.js';

// Elementos do DOM
const appContainer = document.getElementById('sic3-app-container');
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
    _failureHandler: null,
    
    withSuccessHandler(handler) {
        this._successHandler = handler;
        return this;
    },
    
    withFailureHandler(handler) {
        this._failureHandler = handler;
        return this;
    }
};

const runProxy = new Proxy(scriptRunShim, {
    get(target, propKey) {
        if (propKey === 'withSuccessHandler' || propKey === 'withFailureHandler') {
            return target[propKey].bind(target);
        }
        
        // Retorna uma função dinâmica correspondente a rota do GAS
        return function(...args) {
            const successHandler = target._successHandler;
            const failureHandler = target._failureHandler;
            
            target._successHandler = null;
            target._failureHandler = null;
            
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
                                const nUserMatch = response.content?.match(/var nUser = "([^"]*)"/) || [];
                                
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
// NAVEGAÇÃO SPA
// ============================================================================

/**
 * Roteia a aplicação para a página especificada.
 * @param {string} pagina - 'login', 'admin' ou 'lancamentos'
 * @param {object} [contexto={}] - Variáveis de contexto para passar à página
 */
export async function navegarPara(pagina, contexto = {}) {
    window.mostrarCarregamentoGlobal(`Carregando painel ${pagina}...`);
    limparRecursosInjetados();

    try {
        if (pagina === 'login') {
            const html = await obterHtmlLocal('sic3/html/login.html');
            appContainer.innerHTML = html;
            
            carregarCSS('sic3/css/login.css');
            
            window.pUser = contexto.pUser || "html/login";
            window.mLog = contexto.mLog || "";
            window.nUser = contexto.nUser || "";
            window.authToken = contexto.authToken || "";
            window.idbase = contexto.idbase || "";

            await carregarJS('sic3/js/utils_global.js');
            await carregarJS('sic3/js/form_validation.js');
            await carregarJS('sic3/js/login-controller.js');
            
        } else if (pagina === 'admin') {
            const html = await obterHtmlLocal('sic3/html/admin.html');
            appContainer.innerHTML = html;
            
            carregarCSS('sic3/css/admin.css');
            
            window.pUser = contexto.pUser || "html/admin";
            window.mLog = contexto.mLog || "";
            window.nUser = contexto.nUser || "";
            window.authToken = contexto.authToken || "";
            window.idbase = contexto.idbase || "";
            window.dadosConveniosPrepostos = [];
            
            if (contexto.convenios) {
                window.convenios = typeof contexto.convenios === 'string' ? contexto.convenios : JSON.stringify(contexto.convenios);
            }

            await carregarJS('sic3/js/utils_global.js');
            await carregarJS('sic3/js/admin/init_config_geral.js');
            await carregarJS('sic3/js/admin/interface_ui.js');
            await carregarJS('sic3/js/admin/carreg_manip_dados.js');
            await carregarJS('sic3/js/admin/utilitarios.js');
            await carregarJS('sic3/js/admin/crud_convenios.js');
            await carregarJS('sic3/js/admin/datatables.js');
            await carregarJS('sic3/js/admin/gerarpdf.js');
            
        } else if (pagina === 'lancamentos') {
            const html = await obterHtmlLocal('sic3/html/lancamentos.html');
            appContainer.innerHTML = html;
            
            carregarCSS('sic3/css/lancamentos.css');
            
            window.pUser = contexto.pUser || "html/lancamentos";
            window.mLog = contexto.mLog || "";
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

            await carregarJS('sic3/js/utils_global.js');
            await carregarJS('sic3/js/lancamentos/global_vars_and_init.js');
            await carregarJS('sic3/js/lancamentos/address_manager.js');
            await carregarJS('sic3/js/lancamentos/data_main.js');
            await carregarJS('sic3/js/lancamentos/form_generic.js');
            await carregarJS('sic3/js/lancamentos/datatable_material_init.js');
            await carregarJS('sic3/js/lancamentos/form_abastecimento.js');
            await carregarJS('sic3/js/lancamentos/form_manutencao.js');
            await carregarJS('sic3/js/lancamentos/form_outros_itens.js');
            await carregarJS('sic3/js/lancamentos/form_material.js');
            await carregarJS('sic3/js/lancamentos/system_init.js');
            await carregarJS('sic3/js/lancamentos/autocompletar.js');
        }
        
    } catch (error) {
        console.error("Erro na navegação do SIC3:", error);
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
        navegarPara('admin');
    });
}

// Inicializa a aplicação
window.addEventListener('DOMContentLoaded', async () => {
    await initConfigBar();

    window.executarApiGas = executarApi;
    window.navegarParaSic3 = navegarPara;

    // Obtém parâmetros da Query String para abertura rápida e contexto de RPM/Ano
    const urlParams = new URLSearchParams(window.location.search);
    const convenioId = urlParams.get('convenioId');
    const urlRpm = urlParams.get('rpm');
    const urlAno = urlParams.get('ano');

    if (urlRpm) {
        window.rpm = urlRpm;
    }
    if (urlAno) {
        window.ano = urlAno;
    }

    // Resolve dinamicamente o ID do banco de dados (Spreadsheet) correspondente à RPM e ao Ano ativos
    window.mostrarCarregamentoGlobal("Inicializando banco de dados do SIC3...");
    try {
        const rpmAtiva = window.rpm || "15";
        const anoAtivo = window.ano || new Date().getFullYear().toString();
        const resId = await executarApi("obterIdPlanilha", [rpmAtiva, anoAtivo]);
        if (resId && resId.success && resId.spreadsheetId) {
            window.idbase = resId.spreadsheetId;
            if (resId.arquivosCompartilhados) {
                window.idBDConvenios = resId.arquivosCompartilhados.BDConvenios;
                window.idBDEnderecos = resId.arquivosCompartilhados.BDEnderecos;
                window.idTBPrimaria = resId.arquivosCompartilhados.TBPrimaria;
                window.idTBSecundaria = resId.arquivosCompartilhados.TBSecundaria;
            }
        } else {
            console.warn("Não foi possível obter o ID da planilha do GAS. Usando fallback vazio.");
            window.idbase = "";
        }
    } catch (e) {
        console.error("Erro ao resolver ID do banco de dados:", e);
        window.idbase = "";
    } finally {
        window.ocultarCarregamentoGlobal();
    }

    if (convenioId) {
        window.mostrarCarregamentoGlobal("Carregando dados do convênio...");
        try {
            // Executa chamada de API para obter os convênios
            const result = await executarApi("carregarConveniosMunicipio", ["admin", { username: "extensao", municipio: "admin" }]);
            if (result && Array.isArray(result)) {
                // Encontra o convênio específico correspondente ao ID
                const conv = result.find(c => c.convenio === convenioId);
                if (conv) {
                    const dataAtual = new Date();
                    const meses = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
                    // Lançamento abre por padrão no mês corrente
                    const mesAtual = meses[dataAtual.getMonth()];
                    const anoAtual = window.ano || dataAtual.getFullYear().toString();

                    // Salva a lista de convênios na memória global para que a navegação do botão "Voltar" funcione
                    window.dadosConveniosPrepostos = result;

                    await navegarPara('lancamentos', {
                        municipio: conv.municipio,
                        convenio: conv.convenio,
                        ano: anoAtual,
                        mes: mesAtual,
                        acao: "lancar",
                        nUser: "Operador Extensão",
                        authToken: "bypass",
                        idbase: window.idbase
                    });
                    return;
                }
            }
            alert(`Convênio ${convenioId} não foi localizado na base de dados do SIC3.`);
        } catch (error) {
            console.error("Erro ao carregar convênio via atalho:", error);
            alert(`Erro ao comunicar com o servidor GAS: ${error.message}`);
        } finally {
            window.ocultarCarregamentoGlobal();
        }
    }

    // Se não houver convenioId ou não for encontrado, inicia na tela do Painel Geral de administração
    navegarPara('admin', { nUser: "Operador Extensão", authToken: "bypass", idbase: window.idbase });
});
