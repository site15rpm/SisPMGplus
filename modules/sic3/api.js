// Arquivo: modules/sic3/api.js
// Cliente de comunicação HTTP REST com a API do Google Apps Script (GAS) para o SIC3.

/**
 * Obtém a URL configurada do Web App do GAS a partir do armazenamento da extensão.
 * @returns {Promise<string>} A URL do Web App do GAS.
 */
export async function getGasApiUrl() {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        const result = await browser.storage.local.get('sispmg_sic3_gas_api_url');
        return result.sispmg_sic3_gas_api_url || "";
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
            chrome.storage.local.get('sispmg_sic3_gas_api_url', (result) => {
                resolve(result.sispmg_sic3_gas_api_url || "");
            });
        });
    }
    return "";
}

/**
 * Salva a URL do Web App do GAS no armazenamento da extensão.
 * @param {string} url - A URL do Web App.
 */
export async function saveGasApiUrl(url) {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        await browser.storage.local.set({ 'sispmg_sic3_gas_api_url': url });
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ 'sispmg_sic3_gas_api_url': url }, () => {
                resolve();
            });
        });
    }
}

// Mapeamento de ações para chaves de APIs específicas expostas via Google Apps Script
const actionToApiMap = {
    // Módulo de Convênios (gas-backend/Convenios.gs)
    "carregarConveniosMunicipio": "convenios",
    "incluirConvenio": "convenios",
    "alterarConvenio": "convenios",
    "excluirConvenio": "convenios",
    "sincronizarConveniosLote": "convenios",

    // Módulo de Endereços (gas-backend/Enderecos.gs)
    "gerenciarEnderecoMedidor": "enderecos",

    // Módulo de Estrutura (gas-backend/Estrutura.gs)
    "criarEstruturaRpmAno": "estrutura",

    // Módulo de Lançamentos e Transações (gas-backend/Lancamentos.gs)
    "salvarDadosNaPlanilha": "lancamentos",
    "obterDadosItens99": "lancamentos",
    "excluirItem99Principal": "lancamentos",
    "atualizarStatusItem99": "lancamentos",
    "verificarStatusBloqueio": "lancamentos",
    "atualizarStatusEdicao": "lancamentos",
    "atualizarStatusSirconvSiad": "lancamentos",
    "salvarItensPrimariosEmLote": "lancamentos"
};

/**
 * Obtém o mapa de URLs de APIs específicas do local storage.
 * @returns {Promise<object>}
 */
export async function getGasApiUrls() {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        const result = await browser.storage.local.get('sispmg_sic3_apis_urls');
        return result.sispmg_sic3_apis_urls || {};
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
            chrome.storage.local.get('sispmg_sic3_apis_urls', (result) => {
                resolve(result.sispmg_sic3_apis_urls || {});
            });
        });
    }
    return {};
}

/**
 * Salva o mapa de URLs de APIs específicas no local storage.
 * @param {object} urlsMap - Dicionário contendo as URLs mapeadas.
 */
export async function saveGasApiUrls(urlsMap) {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        await browser.storage.local.set({ 'sispmg_sic3_apis_urls': urlsMap });
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ 'sispmg_sic3_apis_urls': urlsMap }, () => {
                resolve();
            });
        });
    }
}

/**
 * Executa uma requisição HTTP POST contra a API do Google Apps Script correspondente à ação.
 * @param {string} action - O nome da ação/rota a ser chamada no servidor.
 * @param {object} params - Os parâmetros de entrada da função.
 * @returns {Promise<object>} O resultado da requisição retornado pelo GAS.
 */
export async function executarApi(action, params = {}) {
    // Injeta de forma transparente os IDs de planilhas com base na action executada para evitar que o GAS faça buscas no Drive
    if (typeof window !== 'undefined' && Array.isArray(params)) {
        const idbase = window.idbase || sessionStorage.getItem("sic3_idbase");
        const idBDConvenios = window.idBDConvenios || sessionStorage.getItem("sic3_idBDConvenios");
        const idBDEnderecos = window.idBDEnderecos || sessionStorage.getItem("sic3_idBDEnderecos");
        const idTBPrimaria = window.idTBPrimaria || sessionStorage.getItem("sic3_idTBPrimaria");

        if (action === "salvarDadosNaPlanilha" && params.length >= 6) {
            params[6] = idbase;
        } else if (action === "salvarItensPrimariosEmLote" && params.length >= 1) {
            params[1] = idTBPrimaria;
        } else if (action === "obterDadosItens99" && params.length >= 2) {
            params[2] = idbase;
        } else if (action === "excluirItem99Principal" && params.length >= 2) {
            params[2] = idbase;
        } else if (action === "atualizarStatusItem99" && params.length >= 3) {
            params[3] = idbase;
        } else if (action === "verificarStatusBloqueio" && params.length >= 4) {
            params[4] = idbase;
        } else if (action === "atualizarStatusEdicao" && params.length >= 6) {
            params[6] = idbase;
        } else if (action === "atualizarStatusSirconvSiad" && params.length >= 7) {
            params[7] = idbase;
        } else if (action === "gerenciarEnderecoMedidor" && params.length >= 2) {
            const dados = params[1];
            params[0] = dados;
            params[1] = idBDEnderecos;
        } else if (action === "sincronizarConveniosLote" && params.length >= 2) {
            params[2] = idBDConvenios;
        } else if (action === "carregarConveniosMunicipio" && params.length >= 1) {
            params[2] = idBDConvenios;
        } else if (action === "incluirConvenio" && params.length >= 8) {
            params[9] = idBDConvenios;
        } else if (action === "alterarConvenio" && params.length >= 8) {
            params[9] = idBDConvenios;
        } else if (action === "excluirConvenio" && params.length >= 2) {
            params[3] = idBDConvenios;
        }
    }

    const apiUrls = await getGasApiUrls();
    const apiKey = actionToApiMap[action] || "lancamentos";
    const scriptId = apiUrls[apiKey];

    if (!scriptId) {
        throw new Error(`A URL/ID da API para a ação "${action}" (módulo "${apiKey}") não está configurada na extensão. Sincronize as URLs de APIs a partir da Planilha Central.`);
    }

    // Se for apenas o ID do script (não contém o protocolo http/https), monta a URL completa
    let apiUrl = scriptId;
    if (!scriptId.includes('http://') && !scriptId.includes('https://')) {
        apiUrl = `https://script.google.com/macros/s/${scriptId}/exec`;
    }
 
    const token = sessionStorage.getItem('authToken') || '';
    
    // Resolve o ano com prioridade máxima para sessionStorage para evitar colisões com DOM
    let ano = sessionStorage.getItem('sic3_ano');
    if (!ano) {
        if (window.ano && typeof window.ano === 'string') {
            ano = window.ano;
        } else if (window.ano && typeof window.ano === 'object' && window.ano.value) {
            ano = window.ano.value;
        } else {
            ano = new Date().getFullYear().toString();
        }
    }

    // Resolve a RPM com prioridade máxima para sessionStorage
    let rpm = sessionStorage.getItem('sic3_rpm');
    if (!rpm) {
        if (window.rpm && typeof window.rpm === 'string') {
            rpm = window.rpm;
        } else if (window.rpm && typeof window.rpm === 'object' && window.rpm.value) {
            rpm = window.rpm.value;
        } else {
            rpm = "";
        }
    }
    
    console.log(`[SIC3 v3.0 Log] [API Request] executando action: "${action}" (API: ${apiKey}) para RPM: ${rpm}, Ano: ${ano} na URL: ${apiUrl}. Params:`, params);
    const startTime = Date.now();

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8' // GAS lida melhor com text/plain para evitar redirecionamentos complexos de CORS preflight
            },
            body: JSON.stringify({
                action: action,
                authToken: token,
                rpm: rpm,
                ano: ano,
                params: params
            })
        });

        if (!response.ok) {
            throw new Error(`Erro na requisição: Código HTTP ${response.status}`);
        }

        const responseText = await response.text();
        console.log(`[SIC3 v3.0 Log] [API Response Raw] Recebido em ${Date.now() - startTime}ms para action "${action}":`, responseText.substring(0, 500) + (responseText.length > 500 ? "..." : ""));
        
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error("[SIC3 v3.0 Log] Erro ao fazer parse da resposta do GAS. Resposta bruta:", responseText);
            throw new Error("Resposta inválida do servidor. Verifique se o Web App do GAS está implantado corretamente.");
        }

        console.log(`[SIC3 v3.0 Log] [API Response Object] Parsed com sucesso para action "${action}":`, data);

        // Se a resposta indicar erro de autorização expirada
        if (data && data.errorCode === "UNAUTHORIZED") {
            console.warn(`[SIC3 v3.0 Log] [API Warning] Acesso não autorizado (UNAUTHORIZED) retornado pela action "${action}". Expulsando usuário para a tela admin.`);
            sessionStorage.removeItem('authToken');
            // Redireciona para a tela de login local caso o token seja inválido
            document.dispatchEvent(new CustomEvent('sic3:unauthorized'));
        }

        return data;
    } catch (error) {
        console.error(`[SIC3 v3.0 Log] [API Error] Falha ao chamar a API para action "${action}" após ${Date.now() - startTime}ms:`, error);
        throw error;
    }
}
