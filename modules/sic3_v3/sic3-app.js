// Arquivo: modules/sic3_v3/sic3-app.js
// Controlador SPA do SIC3 v3.0 com Interface Premium e Logs integrados

import { executarApi, getGasApiUrl, saveGasApiUrl } from './api.js';

// --- logs de depuração ---
function logDebug(message, data = null) {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    console.log(`%c[SIC3 v3.0 Log ${timestamp}] ${message}`, 'color: #a08f63; font-weight: bold;', data || '');
}

function logError(message, error = null) {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    console.error(`%c[SIC3 v3.0 Erro ${timestamp}] ${message}`, 'color: #AB2328; font-weight: bold;', error || '');
}

// --- Inicialização de variáveis de contexto ---
window.municipio = "";
window.rpm = "15";
window.secao = "";
window.ano = new Date().getFullYear().toString();

// Variáveis de perfil de usuário do tokiuz
window.userPM = "";
window.userNome = "";
window.userSecao = "";
window.userRegiao = "";
window.isAdmin = false;

// Utilitários de Carregamento Global
window.mostrarCarregamentoGlobal = function(mensagem = "Aguarde...") {
    const overlay = document.getElementById('loading-overlay-global');
    const msgEl = document.getElementById('loading-message-global');
    if (overlay && msgEl) {
        msgEl.textContent = mensagem;
        overlay.style.opacity = '1';
        overlay.style.display = "flex";
    }
};

window.ocultarCarregamentoGlobal = function() {
    const overlay = document.getElementById('loading-overlay-global');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = "none";
        }, 300);
    }
};

/**
 * Inicialização principal do SPA
 */
document.addEventListener("DOMContentLoaded", async () => {
    logDebug("Inicializando o SIC3 v3.0 DOM...");
    window.mostrarCarregamentoGlobal("Carregando contexto de usuário...");
    
    // 1. Extrair os parâmetros da Query String ou do Storage
    try {
        const urlParams = new URLSearchParams(window.location.search);
        let municipioParam = urlParams.get('municipio');
        let rpmParam = urlParams.get('rpm');
        let secaoParam = urlParams.get('secao');
        
        // Sempre tenta ler do storage local para obter as informações completas do usuário
        const storageResult = await browser.storage.local.get('sic3_v3_user_info');
        const info = (storageResult && storageResult.sic3_v3_user_info) ? storageResult.sic3_v3_user_info : null;
        
        if (info) {
            window.userPM = info.numeroPM || "";
            window.userNome = info.nome || "";
            window.userSecao = info.secaoUsuario || info.nomenclatura || "";
            window.userRegiao = info.nomeRPM || "";
            window.isAdmin = info.isAdmin === true;
            
            window.municipio = municipioParam ? decodeURIComponent(municipioParam).toUpperCase() : info.municipio.toUpperCase();
            window.rpm = rpmParam ? rpmParam : (info.codigoRPM || "15");
            window.secao = secaoParam ? decodeURIComponent(secaoParam) : (info.nomenclatura || "");
            
            logDebug("Dados de identificação carregados do storage local:", info);
        } else {
            // Fallback de teste
            window.municipio = municipioParam ? decodeURIComponent(municipioParam).toUpperCase() : "PARÁ DE MINAS";
            window.rpm = rpmParam || "19";
            window.secao = secaoParam ? decodeURIComponent(secaoParam) : "19º BPM";
            logDebug("Sem informações pré-carregadas no storage. Usando query string ou fallbacks.", {
                municipio: window.municipio, rpm: window.rpm, secao: window.secao
            });
        }
        
        // Formatar o nome da RPM
        if (/^\d+$/.test(window.rpm)) {
            window.rpm = window.rpm + "ª RPM";
        }
        
        // Atualiza a exibição no cabeçalho
        document.getElementById('user-municipio-display').textContent = window.municipio;
        document.getElementById('user-rpm-display').textContent = window.rpm;
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
                logDebug("Painel de perfil do usuário exibido com sucesso.");
            }
        }
        
    } catch (e) {
        logError("Falha ao configurar contexto do usuário:", e);
    }
    
    // 2. Configurar o Rodapé da API
    try {
        const currentUrl = await getGasApiUrl();
        const apiInput = document.getElementById('api-gas-url-input');
        if (apiInput) {
            apiInput.value = currentUrl;
        }
        
        const saveBtn = document.getElementById('api-gas-url-save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const newUrl = apiInput.value.trim();
                if (newUrl) {
                    window.mostrarCarregamentoGlobal("Salvando API e recarregando...");
                    await saveGasApiUrl(newUrl);
                    logDebug("Nova URL do GAS salva:", newUrl);
                    window.location.reload();
                } else {
                    alert("A URL da API do GAS não pode ser vazia.");
                }
            });
        }
    } catch (e) {
        logError("Falha ao configurar os campos de API do GAS no rodapé:", e);
    }
    
    // 3. Carregar dados de Convênios
    await carregarDashboardConvenios();
});

/**
 * Carrega a lista de convênios do município e monta o dashboard
 */
async function carregarDashboardConvenios() {
    logDebug(`Carregando convênios para o município: ${window.municipio}. Modo Admin: ${window.isAdmin}`);
    window.mostrarCarregamentoGlobal("Carregando convênios da planilha...");
    
    const container = document.getElementById('sic3-views-container') || document.getElementById('sic3-app-container');
    if (!container) {
        logError("Container #sic3-views-container não encontrado.");
        window.ocultarCarregamentoGlobal();
        return;
    }
    
    try {
        const userInfo = {
            username: window.userNome || "intranet_user",
            municipio: window.municipio,
            isAdmin: window.isAdmin === true
        };
        
        const convenios = await executarApi("carregarConveniosMunicipio", [window.municipio, userInfo]);
        
        if (!convenios || !Array.isArray(convenios) || convenios.length === 0) {
            logDebug("Nenhum convênio retornado para o município:", window.municipio);
            container.innerHTML = `
                <div class="card-premium" style="text-align: center; padding: 48px; border-style: dashed;">
                    <i class="fas fa-folder-open" style="font-size: 48px; color: var(--cor-caqui); margin-bottom: 16px;"></i>
                    <h2 class="card-title">Nenhum convênio cadastrado</h2>
                    <p style="color: var(--cor-fonte-fraca); margin-bottom: 24px;">Não foram encontrados convênios ativos vinculados ao município de ${window.municipio} para o ano de ${window.ano}.</p>
                    <button class="btn-premium btn-premium-primary" style="margin: 0 auto;" id="btn-recarregar">
                        <i class="fas fa-sync-alt"></i> Tentar Novamente
                    </button>
                </div>
            `;
            
            document.getElementById('btn-recarregar')?.addEventListener('click', () => {
                carregarDashboardConvenios();
            });
            window.ocultarCarregamentoGlobal();
            return;
        }
        
        logDebug(`${convenios.length} convênios carregados com sucesso!`);
        
        // Monta o grid do dashboard
        let gridHtml = `
            <div style="margin-top: 8px; margin-bottom: 24px;">
                <h2 style="font-family: var(--font-family-title); font-size: 24px; font-weight: 700; color: var(--cor-fonte-forte); margin-bottom: 6px;">
                    ${window.isAdmin ? "Visualização Regional de Convênios" : "Convênios Ativos do Município"}
                </h2>
                <p style="color: var(--cor-fonte-fraca); font-size: 14px;">
                    ${window.isAdmin 
                        ? `Acesso Administrativo (Locais 29/126) - Visualizando todos os municípios pertencentes à região ${window.userRegiao}.` 
                        : `Exibindo os convênios cadastrados para o município de ${window.municipio}.`}
                </p>
            </div>
            <div class="dashboard-grid">
        `;
        
        convenios.forEach(conv => {
            const numConvenio = conv.convenio || "N/A";
            const prepostoStr = conv.preposto ? `${conv.preposto_pg || ''} ${conv.preposto}`.trim() : "Não especificado";
            const dataFimStr = conv.dataFim || "Permanente";
            const localidadeInfo = conv.unidade || window.secao || "PMMG";
            
            gridHtml += `
                <div class="card-premium">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                        <span class="status-pill success">Ativo</span>
                        <span style="font-size: 11px; color: var(--cor-fonte-fraca); font-weight: 600;">#${numConvenio}</span>
                    </div>
                    <h3 class="card-title">${conv.municipio}</h3>
                    <div class="card-meta">
                        <span><i class="fas fa-file-signature"></i> <strong>Convênio:</strong> ${numConvenio}</span>
                        <span><i class="fas fa-user-tie"></i> <strong>Gestor:</strong> ${prepostoStr}</span>
                        <span><i class="fas fa-sitemap"></i> <strong>Unidade:</strong> ${localidadeInfo}</span>
                        <span><i class="fas fa-calendar-alt"></i> <strong>Validade:</strong> ${conv.dataInicio || 'N/A'} a ${dataFimStr}</span>
                    </div>
                    <div class="card-actions">
                        <button class="btn-premium btn-edit-conv" data-convenio="${numConvenio}" data-muni="${conv.municipio}">
                            <i class="fas fa-edit"></i> Lançamentos
                        </button>
                        <button class="btn-premium btn-premium-primary btn-audit-conv" data-convenio="${numConvenio}" data-muni="${conv.municipio}">
                            <i class="fas fa-clipboard-check"></i> Auditar
                        </button>
                    </div>
                </div>
            `;
        });
        
        gridHtml += `</div>`;
        container.innerHTML = gridHtml;
        
        // Registra listeners de cliques
        container.querySelectorAll('.btn-edit-conv').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const convId = e.currentTarget.getAttribute('data-convenio');
                const muni = e.currentTarget.getAttribute('data-muni');
                logDebug(`Ação: Editar Lançamentos para convênio ${convId} (${muni})`);
                alert(`Lançamentos do Convênio ${convId} (${muni}) - Funcionalidade em construção no SIC3 v3.0.`);
            });
        });
        
        container.querySelectorAll('.btn-audit-conv').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const convId = e.currentTarget.getAttribute('data-convenio');
                const muni = e.currentTarget.getAttribute('data-muni');
                logDebug(`Ação: Auditar Convênio ${convId} (${muni})`);
                alert(`Auditoria do Convênio ${convId} (${muni}) - Funcionalidade em construção no SIC3 v3.0.`);
            });
        });
        
    } catch (e) {
        logError("Erro ao carregar os dados de convênios do GAS:", e);
        container.innerHTML = `
            <div class="card-premium" style="text-align: center; padding: 48px; border-color: var(--cor-vermelho);">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: var(--cor-vermelho); margin-bottom: 16px;"></i>
                <h2 class="card-title" style="color: var(--cor-vermelho);">Falha na comunicação com o GAS</h2>
                <p style="color: var(--cor-fonte-fraca); margin-bottom: 24px;">Não foi possível recuperar os convênios. Verifique se a URL da API do GAS no rodapé está correta e se o script correspondente está publicado.</p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button class="btn-premium" id="btn-recarregar-erro">
                        <i class="fas fa-sync-alt"></i> Tentar Novamente
                    </button>
                </div>
            </div>
        `;
        
        document.getElementById('btn-recarregar-erro')?.addEventListener('click', () => {
            carregarDashboardConvenios();
        });
    } finally {
        window.ocultarCarregamentoGlobal();
    }
}
