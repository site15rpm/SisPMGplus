// Funções e lógica para o dashboard de convênios SIRCONV
import { sendMessageToBackground, getCookie } from '../../common/utils.js';
import { iconSVG_28 } from '../../common/icon.js';
import { obterConveniosAtivosJSON, obterListaConcedentes, obterConveniosDeConcedentes } from '../../common/busca-concedentes.js';

/**
 * Módulo Dashboard SIRCONV
 * Gerencia a extração, auditoria e exibição de dados de convênios.
 * Utiliza duas bases JSON persistidas: ativos (12h TTL) e inativos (Permanente).
 */
export class SirconvDashboardModule {
    constructor(config) {
        this.config = config;
        this.ui = window.SisPMG_UI;
        this.meusConvenios = {}; // Meus Convênios - Persistente 12h
        this.outrosConvenios = {}; // Outros Convênios - Persistente Permanente
        this.advSearchIds = []; // IDs da última busca avançada (Volátil)
        this.currentView = 'meus'; // 'meus', 'adv' ou 'consolidado'
        this.conveniosData = []; // Array derivado para exibição e ordenação
        this.consolidatedData = []; // Array de registros achatados para consolidação
        this.filteredData = [];
        this.activeFilters = {}; 
        this.lastFiltros = { tipoBusca: 'todos', tipo: 'todos', periodo: 'todos', manual: '', municipio: 'todos', includeCPE: false };
        this.isLoading = false;
        this.activeConvId = null;
        this.backgroundAuditQueue = [];
        this.isQueueProcessing = false;
        this.currentQueueSessionId = 0; // Identificador de sessão de fila
        this.CACHE_TTL = 8 * 60 * 60 * 1000; // 8 horas para validade da auditoria profunda
        this.DATA_TTL_ACTIVE = 12 * 60 * 60 * 1000; // 12 horas para manutenção dos ativos
        this.STORAGE_KEY_ACTIVE = 'sirconv_meus_convenios';
        this.STORAGE_KEY_INACTIVE = 'sirconv_outros_convenios';
        console.log("SirconvDashboardModule: Instância inicializada.");
    }

    async init() {
        if (this.ui) {
            await this.loadPersistentCache();
            this.ui.registerModule({ name: 'SIRCONV Dashboard', instance: this });
        }
    }

    /**
     * Carrega as bases de dados do storage local e realiza manutenção.
     */
    async loadPersistentCache() {
        try {
            const keys = [this.STORAGE_KEY_ACTIVE, this.STORAGE_KEY_INACTIVE];
            const response = await sendMessageToBackground('getStorage', { keys });
            if (response && response.success) {
                this.meusConvenios = response.value[this.STORAGE_KEY_ACTIVE] || {};
                this.outrosConvenios = response.value[this.STORAGE_KEY_INACTIVE] || {};
                
                const agora = Date.now();
                let mudou = false;
                // Manutenção de Ativos (12h TTL)
                for (const id in this.meusConvenios) {
                    if (agora - (this.meusConvenios[id].lastUpdate || 0) > this.DATA_TTL_ACTIVE) {
                        delete this.meusConvenios[id];
                        mudou = true;
                    }
                }
                
                if (mudou) this.savePersistentCache();
                this.refreshConveniosList();
            }
        } catch (e) { console.error("[Dashboard] Erro ao carregar Cache:", e); }
    }

    async savePersistentCache() {
        try {
            const dataToSave = {};
            dataToSave[this.STORAGE_KEY_ACTIVE] = this.meusConvenios;
            dataToSave[this.STORAGE_KEY_INACTIVE] = this.outrosConvenios;
            await sendMessageToBackground('setStorage', dataToSave);
        } catch (e) { console.error("[Dashboard] Erro ao salvar Cache:", e); }
    }

    syncConvenio(id, newData, isMeus = false) {
        const idStr = String(id);
        const agora = Date.now();
        
        let existing = this.meusConvenios[idStr] || this.outrosConvenios[idStr];
        
        // Determina isMeus combinando dados existentes e newData
        let combinedData = existing ? { ...existing, ...newData } : newData;
        if (newData && newData.hasOwnProperty('isMeus')) {
            combinedData.isMeus = newData.isMeus;
        } else if (isMeus) {
            combinedData.isMeus = true;
        }

        // Pertence a Meus Convênios se combinedData.isMeus for true
        const pertenceAMeus = !!combinedData.isMeus;

        if (pertenceAMeus) {
            if (!this.meusConvenios[idStr]) {
                this.meusConvenios[idStr] = this.outrosConvenios[idStr] || { ID: idStr, audit: null, pendencias: [] };
            }
            delete this.outrosConvenios[idStr];
        } else {
            if (!this.outrosConvenios[idStr]) {
                this.outrosConvenios[idStr] = this.meusConvenios[idStr] || { ID: idStr, audit: null, pendencias: [] };
            }
            delete this.meusConvenios[idStr];
        }

        const entry = pertenceAMeus ? this.meusConvenios[idStr] : this.outrosConvenios[idStr];
        
        for (const key in newData) {
            if (key === 'audit' && newData.audit) {
                entry.audit = newData.audit;
                entry.audit.timestamp = entry.audit.timestamp || agora;
            } else if (key !== 'pendencias' && key !== 'ID' && key !== 'lastUpdate') {
                entry[key] = newData[key];
            }
        }
        
        if (isMeus) entry.isMeus = true;
        if (newData && newData.hasOwnProperty('isMeus')) entry.isMeus = newData.isMeus;
        
        // Substitui a data de início do convênio atual pela data de início mais antiga da cadeia se identificada na auditoria
        if (entry.audit && entry.audit.dtInicialAbsoluta) {
            let dtAntigaDate = entry.audit.dtInicialAbsoluta;
            if (typeof dtAntigaDate === 'string') {
                dtAntigaDate = new Date(dtAntigaDate);
            }
            if (dtAntigaDate instanceof Date && !isNaN(dtAntigaDate.getTime())) {
                const dtAntigaStr = this.formatDate(dtAntigaDate.toISOString().split('T')[0]);
                if (entry.DTINICIAL !== dtAntigaStr) {
                    console.log(`[Dashboard] Data de início do convênio ${entry.ID} atualizada para a mais antiga da cadeia: ${dtAntigaStr} (era ${entry.DTINICIAL})`);
                    entry.DTINICIAL = dtAntigaStr;
                    // Força o recálculo da vigência com a nova data de início
                    if (entry.audit.vigenciaInfo) {
                        delete entry.audit.vigenciaInfo;
                    }
                }
            }
        }
        
        entry.lastUpdate = agora;

        const vInfo = this.calculateVigencia(entry);
        if (entry.audit) {
            entry.audit.vigenciaInfo = vInfo;
            entry.pendencias = this.analisarPendencias(entry.audit, this.lastFiltros, entry);
            const totalLiq = entry.audit.planoItens?.reduce((sum, p) => sum + (parseFloat(p.valorExecutado) || 0), 0);
            
            if (totalLiq > 0 && (!entry.LIQUIDADO || entry.LIQUIDADO === '-')) entry.LIQUIDADO = totalLiq;
        }

        return entry;
    }

    calculateVigencia(conv) {
        if (!conv) return { duracaoMeses: 0, mesesDecorridos: 0, mesesFaltantes: 0 };
        // Se já existe vigência calculada com auditoria (que considera aditivos), usa ela
        if (conv.audit?.vigenciaInfo) return conv.audit.vigenciaInfo;
        
        const hoje = new Date();
        const mP = { 'JAN': 0, 'FEV': 1, 'MAR': 2, 'ABR': 3, 'MAI': 4, 'JUN': 5, 'JUL': 6, 'AGO': 7, 'SET': 8, 'OUT': 9, 'NOV': 10, 'DEZ': 11, 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };
        
        let d1 = this.parseDate(conv.DTINICIAL), d2 = this.parseDate(conv.DTFINAL);
        
        if (!d1 && conv.audit?.cronogramas?.length > 0) {
            const s = [...conv.audit.cronogramas].sort((a, b) => { 
                const pa = a.mesTexto.split(' '), pb = b.mesTexto.split(' '); 
                return (parseInt(pa[1]) - parseInt(pb[1])) || (mP[pa[0].toUpperCase()] - mP[pb[0].toUpperCase()]); 
            });
            const p1 = s[0].mesTexto.split(' '); 
            d1 = new Date(parseInt(p1[1]), mP[p1[0].toUpperCase()], 1);
        }
        
        if (d1 && d2) {
            const duracaoMeses = Math.max(1, (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()) + 1);
            const mesesDecorridos = Math.min(duracaoMeses, Math.max(0, (hoje.getFullYear() - d1.getFullYear()) * 12 + (hoje.getMonth() - d1.getMonth())) + 1);
            return { 
                duracaoMeses, 
                mesesDecorridos, 
                mesesFaltantes: Math.max(0, duracaoMeses - mesesDecorridos), 
                dtInicio: d1.toISOString().split('T')[0], 
                dtFim: d2.toISOString().split('T')[0] 
            };
        }
        return { duracaoMeses: 0, mesesDecorridos: 0, mesesFaltantes: 0 };
    }

    refreshConveniosList() {
        const all = { ...this.meusConvenios, ...this.outrosConvenios };
        if (this.currentView === 'meus') {
            this.conveniosData = Object.values(all).filter(c => c.isMeus);
        } else if (this.currentView === 'adv') {
            this.conveniosData = Object.values(all).filter(c => this.advSearchIds.includes(c.ID));
        }
        // No modo consolidado, preservamos o conveniosData anterior para referência se necessário
    }

    showDashboard() {
        if (this.ui) this.ui.showLoader('Carregando Dashboard...');
        document.body.style.overflow = 'hidden';
        const container = document.getElementById('sispmg-plus-container');
        if (!container) { if (this.ui) this.ui.hideLoader(); return; }

        document.getElementById('sispmg-sirconv-dashboard-overlay')?.remove();
        this.currentView = 'meus';
        this.refreshConveniosList();

        const overlay = document.createElement('div');
        overlay.id = 'sispmg-sirconv-dashboard-overlay';
        overlay.className = 'sispmg-sirconv-dashboard-overlay';

        const modalContainer = document.createElement('div');
        modalContainer.id = 'sispmg-sirconv-dashboard-modal-container';

        modalContainer.innerHTML = `
            <div id="sispmg-dashboard-layout" class="sispmg-dashboard-layout">
                <div class="sispmg-dashboard-main">
                    <div class="sispmg-dashboard-header" style="display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; border-bottom: 1px solid #dcd3c5; background: #fdfaf6; position: sticky; top: 0; z-index: 100;">
                        <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
                            ${iconSVG_28}
                            <h2 style="margin: 0; font-size: 18px; color: #574e2d;">Dashboard SIRCONV</h2>
                        </div>
                        <div class="sispmg-dashboard-actions" style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                            <div id="sispmg-dashboard-bg-status" style="display: none; align-items: center; gap: 8px; color: #b3a368; font-size: 12px; margin-right: 15px; font-weight: 600;">
                                <i class="fas fa-circle-notch fa-spin"></i>
                                <span>Atualizando...</span>
                            </div>
                            <button id="sispmg-dashboard-consolidate" class="sispmg-dashboard-btn" style="background-color: #28a745 !important; color: white !important;" title="Consolidação Financeira">
                                <i class="fas fa-table"></i> Consolidação
                            </button>
                            <button id="sispmg-dashboard-refresh" class="sispmg-dashboard-btn sispmg-dashboard-btn-primary" title="Busca Avançada Profunda">
                                <i class="fas fa-search"></i>
                            </button>
                            <button id="sispmg-dashboard-clear-cache" class="sispmg-dashboard-btn" style="background-color: #5e5e5e !important; color: white !important;" title="Limpar Cache Local">
                                <i class="fas fa-trash"></i>
                            </button>
                            <button id="sispmg-dashboard-back" class="sispmg-dashboard-btn" style="display: none; background-color: #6c757d !important; color: white !important;">
                                <i class="fas fa-arrow-left"></i> VOLTAR
                            </button>
                            <button id="sispmg-dashboard-close-global" class="sispmg-dashboard-btn sispmg-global-close">Fechar</button>
                        </div>
                    </div>

                    <div id="sispmg-dashboard-summary" class="sispmg-dashboard-summary">
                        <div class="sispmg-dashboard-card"><span class="sispmg-dashboard-card-value" id="dash-total-convenios">-</span><span class="sispmg-dashboard-card-label">Total de Convênios</span></div>
                        <div class="sispmg-dashboard-card"><span class="sispmg-dashboard-card-value" id="dash-convenios-ativos">-</span><span class="sispmg-dashboard-card-label">Vigentes</span></div>
                        <div class="sispmg-dashboard-card"><span class="sispmg-dashboard-card-value" id="dash-valor-total">-</span><span class="sispmg-dashboard-card-label">Valor Estimado (R$)</span></div>
                        <div class="sispmg-dashboard-card">
                            <span id="dash-valor-liquidado-label" style="display: block; font-size: 10px; color: #888; margin-top: -5px; margin-bottom: 2px;">Valor Liquidado (R$)</span>
                            <span class="sispmg-dashboard-card-value" id="dash-valor-liquidado">-</span>
                        </div>
                    </div>

                    <div class="sispmg-dashboard-table-container">
                        <table class="sispmg-dashboard-table" style="font-size: 13px;">
                            <thead id="sispmg-dashboard-thead"></thead>
                            <tbody id="sispmg-dashboard-tbody"></tbody>
                        </table>
                    </div>
                </div>
                <div id="sispmg-dashboard-sidebar" class="sispmg-dashboard-sidebar"></div>
            </div>
        `;

        overlay.appendChild(modalContainer);
        container.appendChild(overlay);

        modalContainer.querySelector('#sispmg-dashboard-close-global').onclick = () => {
            this.activeFilters = {};
            const layout = document.getElementById('sispmg-dashboard-layout');
            if (layout && (layout.classList.contains('audit-active') || layout.classList.contains('filter-active') || layout.classList.contains('consolidation-active'))) {
                this.closeSidebar();
            } else {
                this.closeAllFilterDropdowns();
                overlay.remove();
                document.body.style.overflow = '';
            }
        };

        modalContainer.querySelector('#sispmg-dashboard-refresh').onclick = () => this.showFilterSidebar();

        modalContainer.querySelector('#sispmg-dashboard-consolidate').onclick = () => this.showConsolidationSidebar();

        modalContainer.querySelector('#sispmg-dashboard-clear-cache').onclick = async () => {
            if (confirm("Isso apagará TODO o histórico de convênios salvos localmente, forçando sistema recarregar os dados na próxima execução. Continuar?")) {
                this.meusConvenios = {};
                this.outrosConvenios = {};
                await sendMessageToBackground('removeStorage', { keys: [this.STORAGE_KEY_ACTIVE, this.STORAGE_KEY_INACTIVE] });
                this.advSearchIds = [];
                this.currentView = 'meus';
                this.refreshConveniosList();
                this.applyFilters();
                if (this.ui) this.ui.showToast('Cache limpo com sucesso!', 'success');
            }
        };

        modalContainer.querySelector('#sispmg-dashboard-back').onclick = () => {
            this.closeSidebar(); // Limpa estados de sidebar e layout
            this.activeFilters = {};
            // Ao voltar da consolidação ou da busca avançada, retornamos ao painel principal 'meus'
            this.currentView = 'meus';
            this.advSearchIds = []; // Limpa resultados de busca profunda
            this.refreshConveniosList();
            this.applyFilters();
        };

        overlay.onclick = (e) => { if (e.target === overlay) this.closeAllFilterDropdowns(); };
        modalContainer.onclick = () => this.closeAllFilterDropdowns();

        this.fetchConveniosData({ tipoBusca: 'ativos' }, false, true);
    }

    showConsolidationSidebar() {
        const layout = document.getElementById('sispmg-dashboard-layout'), sidebar = document.getElementById('sispmg-dashboard-sidebar');
        if (!layout || !sidebar) return;
        layout.classList.remove('audit-active', 'filter-active'); layout.classList.add('consolidation-active'); sidebar.classList.add('active');
        
        this.updateActionButtons();

        const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
        const hoje = new Date();
        const mesAtual = meses[hoje.getMonth()];
        const anoNumber = hoje.getFullYear();
        const anos = [anoNumber, anoNumber - 1, anoNumber - 2, anoNumber - 3];

        sidebar.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; padding: 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #28a745; padding: 15px 20px;">
                    <h2 style="color: #155724; font-size: 18px; margin: 0;"><i class="fas fa-table"></i> Consolidação</h2>
                    <button id="sispmg-close-sidebar-btn" class="sispmg-dashboard-btn" style="background-color: #dc3545 !important; color: white !important;">Fechar</button>
                </div>
                <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 15px; padding: 20px; overflow-y: auto;">
                    <div style="background: #f4fdf4; border: 1px solid #c3e6cb; border-radius: 6px; padding: 12px; font-size: 12px; color: #155724; line-height: 1.4; margin-bottom: 5px;">
                        <i class="fas fa-info-circle"></i> A consolidação agrupa os gastos de todos os convênios selecionados por <strong>mês/ano</strong> e <strong>natureza de despesa</strong>.
                    </div>
                    <div>
                        <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 13px;">Tipo de Busca:</label>
                        <select id="sispmg-consolidate-tipo-busca" style="width: 100%; min-width: 0; max-width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #dcd3c5; background: #fff; box-sizing: border-box;">
                            <option value="ativos">Convênios Ativos</option>
                            <option value="todos" selected>Todos os Convênios</option>
                        </select>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div>
                            <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 13px;">Mês Inicial:</label>
                            <select id="sispmg-consolidate-mes-ini" style="width: 100%; min-width: 0; max-width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #dcd3c5; background: #fff; box-sizing: border-box;">
                                ${meses.map(m => `<option value="${m}" ${m === 'JAN' ? 'selected' : ''}>${m}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 13px;">Ano Inicial:</label>
                            <select id="sispmg-consolidate-ano-ini" class="sispmg-year-select" style="width: 100%; min-width: 0; max-width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #dcd3c5; background: #fff; box-sizing: border-box;">
                                ${anos.map(a => `<option value="${a}" ${a === anoNumber ? 'selected' : ''}>${a}</option>`).join('')}
                                <option value="outro">Outro...</option>
                            </select>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div>
                            <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 13px;">Mês Final:</label>
                            <select id="sispmg-consolidate-mes-fim" style="width: 100%; min-width: 0; max-width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #dcd3c5; background: #fff; box-sizing: border-box;">
                                ${meses.map(m => `<option value="${m}" ${m === mesAtual ? 'selected' : ''}>${m}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 13px;">Ano Final:</label>
                            <select id="sispmg-consolidate-ano-fim" class="sispmg-year-select" style="width: 100%; min-width: 0; max-width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #dcd3c5; background: #fff; box-sizing: border-box;">
                                ${anos.map(a => `<option value="${a}" ${a === anoNumber ? 'selected' : ''}>${a}</option>`).join('')}
                                <option value="outro">Outro...</option>
                            </select>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 5px;">
                        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                            <input type="checkbox" id="sispmg-consolidate-include-canceled">
                            Incluir Cancelados
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                            <input type="checkbox" id="sispmg-consolidate-include-cpe">
                            Incluir Convênios do CPE
                        </label>
                    </div>
                </div>
                <div style="padding: 20px; border-top: 1px solid #dcd3c5;">
                    <button id="sispmg-btn-run-consolidation" class="sispmg-dashboard-btn" style="width: 100%; padding: 12px; background-color: #28a745 !important; color: white !important;">
                        <i class="fas fa-play"></i> Gerar Consolidação
                    </button>
                </div>
            </div>
        `;

        sidebar.querySelectorAll('.sispmg-year-select').forEach(select => {
            select.onchange = (e) => {
                if (e.target.value === 'outro') {
                    const input = document.createElement('input');
                    input.type = 'number';
                    input.id = e.target.id;
                    input.style.setProperty('width', '100%', 'important');
                    input.style.setProperty('min-width', '0', 'important');
                    input.style.setProperty('max-width', '100%', 'important');
                    input.style.setProperty('padding', '10px', 'important');
                    input.style.setProperty('border-radius', '6px', 'important');
                    input.style.setProperty('border', '1px solid #dcd3c5', 'important');
                    input.style.setProperty('background', '#fff', 'important');
                    input.style.setProperty('color', '#333', 'important');
                    input.style.setProperty('box-sizing', 'border-box', 'important');
                    input.placeholder = 'Ano';
                    e.target.replaceWith(input);
                    input.focus();
                }
            };
        });

        const closeBtn = sidebar.querySelector('#sispmg-close-sidebar-btn');
        if (closeBtn) closeBtn.onclick = () => this.closeSidebar();

        sidebar.querySelector('#sispmg-btn-run-consolidation').onclick = async () => {
            const range = {
                tipoBusca: sidebar.querySelector('#sispmg-consolidate-tipo-busca').value,
                mesIni: sidebar.querySelector('#sispmg-consolidate-mes-ini').value,
                anoIni: sidebar.querySelector('#sispmg-consolidate-ano-ini').value || anoNumber,
                mesFim: sidebar.querySelector('#sispmg-consolidate-mes-fim').value,
                anoFim: sidebar.querySelector('#sispmg-consolidate-ano-fim').value || anoNumber,
                includeCanceled: sidebar.querySelector('#sispmg-consolidate-include-canceled').checked,
                includeCPE: sidebar.querySelector('#sispmg-consolidate-include-cpe').checked
            };
            
            if (range.tipoBusca === 'todos') {
                const layout = document.getElementById('sispmg-dashboard-layout');
                if (layout) layout.classList.remove('consolidation-active');
                sidebar.classList.remove('active');
                await this.fetchConveniosData({ 
                    tipoBusca: 'todos', 
                    municipio: 'todos', 
                    includeCanceled: range.includeCanceled, 
                    includeCPE: range.includeCPE,
                    range: range // Passa o range para otimizar auditoria
                }, true); 
                this.enterConsolidationView(range);
            } else {
                if (this.ui) this.ui.showLoader('Processando dados consolidados...');
                setTimeout(() => {
                    this.enterConsolidationView(range);
                    if (this.ui) this.ui.hideLoader();
                }, 100);
            }
        };
    }

    enterConsolidationView(range = null) {
        this.currentView = 'consolidado';
        this.generateConsolidatedData(range);
        this.activeFilters = {}; 
        this.filteredData = [...this.consolidatedData]; 
        this.closeSidebar();
        this.renderDashboard(true); 
    }

    generateConsolidatedData(range = null) {
        const rows = [];
        const mP = { 'JAN': 1, 'FEV': 2, 'MAR': 3, 'ABR': 4, 'MAI': 5, 'JUN': 6, 'JUL': 7, 'AGO': 8, 'SET': 9, 'OUT': 10, 'NOV': 11, 'DEZ': 12 };
        
        let minScore = 0, maxScore = 999999;
        if (range) {
            minScore = (parseInt(range.anoIni) * 100) + mP[range.mesIni];
            maxScore = (parseInt(range.anoFim) * 100) + mP[range.mesFim];
        }

        const source = (range?.tipoBusca === 'todos' || this.currentView === 'consolidado') ? { ...this.meusConvenios, ...this.outrosConvenios } : this.meusConvenios;
        const dataToConsolidate = Object.values(source).filter(c => {
            if (range?.tipoBusca === 'todos') return true;
            return c.isMeus || this.advSearchIds.includes(String(c.ID));
        });

        dataToConsolidate.forEach(conv => {
            // Filtros de Consolidação
            if (range) {
                if (!range.includeCanceled && conv.STATUS_TEXTO?.toLowerCase().includes('cancelado')) return;
                if (!range.includeCPE && conv.UNI_NOME_PRINCIPAL?.toUpperCase().includes('CPE')) return;
            }

            const audit = conv.audit;
            if (audit && audit.cronogramas) {
                audit.cronogramas.forEach(cron => {
                    const partesMes = cron.mesTexto.split(' ');
                    const mesOriginal = partesMes[0] || '-';
                    const mes = mesOriginal.toUpperCase();
                    const ano = partesMes[1] || '-';
                    
                    if (range) {
                        const score = (parseInt(ano) * 100) + (mP[mes] || 0);
                        if (score < minScore || score > maxScore) return;
                    }

                    if (cron.naturezas && cron.naturezas.length > 0) {
                        cron.naturezas.forEach(nat => {
                            rows.push({
                                ID: conv.ID,
                                NUMERO_FACE: conv.NUMERO_FACE || '-',
                                MUNICIPIO: this.getMunicipioClean(conv.CONCEDENTE),
                                UNIDADE: this.cleanUnidade(conv.UNI_NOME_PRINCIPAL),
                                NATUREZA: nat.nome,
                                ANO: ano,
                                MES: mesOriginal,
                                VALOR_EXECUTADO: nat.valorExecutado
                            });
                        });
                    } else if (cron.valorExecutado > 0) {
                        rows.push({
                            ID: conv.ID,
                            NUMERO_FACE: conv.NUMERO_FACE || '-',
                            MUNICIPIO: this.getMunicipioClean(conv.CONCEDENTE),
                            UNIDADE: this.cleanUnidade(conv.UNI_NOME_PRINCIPAL),
                            NATUREZA: 'Consumo Mensal (Não Identificado)',
                            ANO: ano,
                            MES: mesOriginal,
                            VALOR_EXECUTADO: cron.valorExecutado
                        });
                    }
                });
            }
        });
        this.consolidatedData = rows;
    }

    closeSidebar() {
        const layout = document.getElementById('sispmg-dashboard-layout');
        const sidebar = document.getElementById('sispmg-dashboard-sidebar');
        if (layout && sidebar) {
            this.activeFilters = {};
            sidebar.classList.remove('active');
            layout.classList.remove('audit-active', 'filter-active', 'consolidation-active');
            this.activeConvId = null;
            this.updateActionButtons();
            this.applyFilters();
        }
    }

    updateBackgroundStatus(isActive, message = "") {
        const statusEl = document.getElementById('sispmg-dashboard-bg-status');
        if (!statusEl) return;
        if (!isActive) { statusEl.style.setProperty('display', 'none', 'important'); return; }
        const isAdvancedSearchActive = this.isLoading && this.lastFiltros?.tipoBusca === 'todos';
        if (isAdvancedSearchActive && message.includes('Auditoria:')) return; 
        statusEl.style.setProperty('display', 'flex', 'important');
        statusEl.querySelector('span').innerText = message;
    }

    showFilterSidebar() {
        const layout = document.getElementById('sispmg-dashboard-layout'), sidebar = document.getElementById('sispmg-dashboard-sidebar');
        if (!layout || !sidebar) return;
        layout.classList.remove('audit-active'); layout.classList.add('filter-active'); sidebar.classList.add('active');
        
        this.updateActionButtons();
        const municipios = [...new Set(this.conveniosData.map(c => this.getMunicipioClean(c.CONCEDENTE)))].sort();

        sidebar.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; padding: 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #b3a368; padding: 15px 20px;">
                    <h2 style="color: #574e2d; font-size: 18px; margin: 0;"><i class="fas fa-filter"></i> Busca Avançada</h2>
                    <button id="sispmg-close-sidebar-btn" class="sispmg-dashboard-btn" style="background-color: #dc3545 !important; color: white !important;">Fechar</button>
                </div>
                <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 15px; padding: 20px; overflow-y: auto;">
                    <div style="background: #fdfaf6; border: 1px solid #e8dfbf; border-radius: 6px; padding: 12px; font-size: 12px; color: #574e2d; line-height: 1.4; margin-bottom: 5px;">
                        <i class="fas fa-info-circle" style="color: #b3a368;"></i> Esta é uma <strong>Busca Profunda</strong> que verifica todos os convênios através dos códigos dos concedentes. Permite rastrear todo o histórico, incluindo convênios firmados com outras unidades.
                    </div>
                    <div>
                        <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 13px;">Tipo de Busca:</label>
                        <select id="sispmg-dashboard-tipo-busca" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #dcd3c5; background: #fff;">
                            <option value="ativos" ${this.lastFiltros?.tipoBusca === 'ativos' && this.currentView !== 'meus' ? 'selected' : ''}>Convênios Ativos</option>
                            <option value="todos" ${this.lastFiltros?.tipoBusca === 'todos' || this.currentView === 'meus' || !this.lastFiltros?.tipoBusca ? 'selected' : ''}>Todos os Convênios</option>
                        </select>
                    </div>
                    <div>
                        <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 13px;">Município Específico:</label>
                        <select id="sispmg-filter-municipio" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #dcd3c5; background: #fff;">
                            <option value="todos">Todos os Municípios</option>
                            ${municipios.map(m => `<option value="${m}" ${this.lastFiltros?.municipio === m ? 'selected' : ''}>${m}</option>`).join('')}
                        </select>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 10px;">
                        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                            <input type="checkbox" id="sispmg-include-canceled" ${this.lastFiltros?.includeCanceled ? 'checked' : ''}>
                            Incluir cancelados
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                            <input type="checkbox" id="sispmg-include-cpe" ${this.lastFiltros?.includeCPE ? 'checked' : ''}>
                            Incluir Convênios do CPE
                        </label>
                    </div>
                </div>
                <div style="padding: 20px; border-top: 1px solid #dcd3c5;">
                    <button id="sispmg-btn-start-audit" class="sispmg-dashboard-btn sispmg-dashboard-btn-primary" style="width: 100%; padding: 12px;">
                        <i class="fas fa-play"></i> Iniciar Busca
                    </button>
                </div>
            </div>
        `;

        sidebar.querySelector('#sispmg-close-sidebar-btn').onclick = () => this.closeSidebar();
        sidebar.querySelector('#sispmg-btn-start-audit').onclick = async () => {
            const filtros = {
                tipoBusca: sidebar.querySelector('#sispmg-dashboard-tipo-busca').value,
                municipio: sidebar.querySelector('#sispmg-filter-municipio').value,
                includeCanceled: sidebar.querySelector('#sispmg-include-canceled').checked,
                includeCPE: sidebar.querySelector('#sispmg-include-cpe').checked
            };
            this.currentView = filtros.tipoBusca === 'todos' ? 'adv' : 'meus';
            if (this.currentView === 'adv') this.advSearchIds = []; 
            sidebar.classList.remove('active'); 
            layout.classList.remove('filter-active');
            this.updateActionButtons();
            this.fetchConveniosData(filtros);
        };
    }

    async fetchConveniosData(filtrosInput = null, waitForAudit = false, isInitialLoad = false) {
        if (this.isLoading) {
            console.log("[Dashboard] Já existe uma busca em andamento. Ignorando nova solicitação.");
            return;
        }

        if (filtrosInput && typeof filtrosInput === 'object') this.lastFiltros = { ...this.lastFiltros, ...filtrosInput };
        const { tipoBusca, municipio, includeCanceled } = this.lastFiltros;

        this.isLoading = true;
        const exibirLoader = (tipoBusca === 'todos') || isInitialLoad;
        if (exibirLoader && this.ui) {
            this.ui.showLoader(isInitialLoad ? 'Carregando seus convênios ativos...' : 'Iniciando varredura profunda de concedentes...');
        }

        try {
            let list = [];
            const idsToForceAudit = new Set();

            if (tipoBusca === 'ativos') {
                list = await obterConveniosAtivosJSON();

                const fetchedIds = new Set(list.map(c => String(c.ID)));

                // Premissa 1: Busca pelo concedente para atualizar orfãos, em vez de assumir inatividade.
                const missingIds = [];
                for (const id in this.meusConvenios) {
                    if (!fetchedIds.has(id)) {
                        missingIds.push(id);
                    }
                }

                if (missingIds.length > 0) {
                    console.log(`[Dashboard] Verificando ${missingIds.length} convênios que não apareceram na lista 'meus'...`);
                    for (const id of missingIds) {
                        const entry = this.meusConvenios[id];
                        if (entry && entry.CONCEDENTE_ID) {
                            try {
                                const resH = await fetch(`https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/concedente/view?id=${entry.CONCEDENTE_ID}`);
                                const hTxt = await resH.text();
                                const doc = new DOMParser().parseFromString(hTxt, 'text/html');
                                const item = Array.from(doc.querySelectorAll('a.item.flex-linha')).find(a => a.href.includes(`id=${id}`));
                                if (item) {
                                    const statusTexto = item.querySelector('.flex-coluna.tam-g .ne')?.innerText.trim() || '';
                                    const isInactive = statusTexto.toLowerCase().includes('cancelado') || statusTexto.toLowerCase().includes('finalizado');
                                    this.syncConvenio(id, { ATIVO: isInactive ? 'N' : 'S', STATUS_TEXTO: statusTexto, isMeus: !isInactive });
                                } else {
                                    this.syncConvenio(id, { ATIVO: 'N', isMeus: false });
                                }
                            } catch (e) {
                                console.error(`Erro ao verificar orfão ${id} no concedente:`, e);
                            }
                        }
                    }
                }

                // Premissa 3: Comparar apenas campos vitais com precisão para evitar auditorias falsas
                list.forEach(c => {
                    const existing = this.meusConvenios[String(c.ID)];
                    if (existing) {
                        const valExt = parseFloat(c.VALOR_ESTIMADO) || 0;
                        const valLoc = parseFloat(existing.VALOR_ESTIMADO) || 0;
                        const liqExt = parseFloat(c.LIQUIDADO) || 0;
                        const liqLoc = parseFloat(existing.LIQUIDADO) || 0;

                        const diffVal = Math.abs(valExt - valLoc);
                        const diffLiq = Math.abs(liqExt - liqLoc);
                        const statusMudou = existing.ATIVO !== c.ATIVO;

                        if (diffVal > 0.05 || diffLiq > 0.05 || statusMudou) {
                            console.log(`[Dashboard] Divergência no convênio ${c.ID}: Val(${diffVal.toFixed(2)}) Liq(${diffLiq.toFixed(2)}) Status(${statusMudou})`);
                            idsToForceAudit.add(String(c.ID));
                        }
                    }
                });
            } else { 
                list = await this.fetchAllConveniosFromConcedentes(municipio, tipoBusca !== 'todos'); 
            }

            if (!includeCanceled) {
                list = list.filter(c => {
                    if (c.STATUS_TEXTO) return !c.STATUS_TEXTO.toLowerCase().includes('cancelado');
                    return String(c.ATIVO).toUpperCase() === 'S';
                });
            }

            if (tipoBusca === 'ativos') { 
                list.forEach(c => this.syncConvenio(c.ID, c, true)); 
            } else { 
                this.advSearchIds = list.map(r => String(r.ID)); 
                list.forEach(r => this.syncConvenio(r.ID, r)); 
            }

            // Premissa 2: Remoção de duplicidades (Limpa do inativo se estiver no ativo)
            for (const id in this.meusConvenios) {
                if (this.outrosConvenios[id]) delete this.outrosConvenios[id];
            }

            const all = { ...this.meusConvenios, ...this.outrosConvenios };
            for (const id in all) { 
                if (all[id].audit) all[id].pendencias = this.analisarPendencias(all[id].audit, this.lastFiltros, all[id]); 
            }

            this.savePersistentCache();
            this.refreshConveniosList();
            this.applyFilters();

            // Premissa: Otimização por Período na Consolidação
            const range = this.lastFiltros.range;
            const mP = { 'JAN': 1, 'FEV': 2, 'MAR': 3, 'ABR': 4, 'MAI': 5, 'JUN': 6, 'JUL': 7, 'AGO': 8, 'SET': 9, 'OUT': 10, 'NOV': 11, 'DEZ': 12 };

            let rangeMin = 0, rangeMax = 999999;
            if (range) {
                rangeMin = (parseInt(range.anoIni) * 100) + (mP[String(range.mesIni).toUpperCase()] || 1);
                rangeMax = (parseInt(range.anoFim) * 100) + (mP[String(range.mesFim).toUpperCase()] || 12);
            }

            const baseList = (tipoBusca === 'todos') ? 
                Object.values(all).filter(c => this.advSearchIds.includes(String(c.ID))) : 
                this.conveniosData;

            const allToAudit = baseList.filter(c => {
                const entry = this.meusConvenios[c.ID] || this.outrosConvenios[c.ID];

                // Otimização: Filtrar por período se houver range (Consolidação)
                if (range) {
                    const dIni = this.parseDate(c.DTINICIAL);
                    const dFim = this.parseDate(c.DTFINAL);

                    if (dFim) {
                        const convMax = (dFim.getFullYear() * 100) + (dFim.getMonth() + 1);
                        if (convMax < rangeMin) return false;
                    }
                    if (dIni) {
                        const convMin = (dIni.getFullYear() * 100) + (dIni.getMonth() + 1);
                        if (convMin > rangeMax) return false;
                    }
                }

                const isForced = idsToForceAudit.has(String(c.ID));
                const auditExpirada = !entry?.audit || (Date.now() - (entry.audit.timestamp || 0) > this.CACHE_TTL);
                return isForced || auditExpirada;
            });

            console.log(`[Dashboard] Auditoria: ${allToAudit.length} convênios selecionados.`);
            
            // Cancela sessão de auditoria anterior e reinicia a fila
            this.currentQueueSessionId = Date.now();
            this.isQueueProcessing = false;
            this.backgroundAuditQueue = this.sortConvenios(allToAudit).map(c => c.ID);

            if (waitForAudit && this.backgroundAuditQueue.length > 0) {
                if (this.ui) this.ui.updateLoaderMessage(`Otimização: ${allToAudit.length}/${baseList.length} convênios no período...`);
                await this.processBackgroundQueue(true);
            } else if (this.backgroundAuditQueue.length > 0) {
                this.processBackgroundQueue();
            }

            if (exibirLoader && this.ui) this.ui.hideLoader();

            // Só executa a varredura silenciosa se não for uma busca manual profunda
            if (tipoBusca !== 'todos') {
                this.checkInactiveUpdatesSilently();
            }

        } catch (error) { 
            console.error("Erro Dashboard:", error); 
            if (exibirLoader && this.ui) this.ui.hideLoader(); 
        } finally { 
            this.isLoading = false; 
        }
    }

    async checkInactiveUpdatesSilently() {
        const keys = ['sirconv_last_inactive_sync'];
        const response = await sendMessageToBackground('getStorage', { keys });
        const lastSync = (response && response.success && response.value['sirconv_last_inactive_sync']) || 0;
        
        // 7 dias = 604800000 ms
        if (Date.now() - lastSync > 604800000) {
            console.log("[Dashboard] Iniciando varredura silenciosa de concedentes...");
            await sendMessageToBackground('setStorage', { 'sirconv_last_inactive_sync': Date.now() });
            this.fetchAllConveniosFromConcedentes('todos', true).then(list => {
                let mudou = false;
                list.forEach(c => {
                    const id = String(c.ID);
                    if (this.outrosConvenios[id] || !this.meusConvenios[id]) {
                        this.syncConvenio(id, c, false);
                        mudou = true;
                    }
                });
                if (mudou) this.savePersistentCache();
            }).catch(e => console.error(e));
        }
    }

    async fetchAllConveniosFromConcedentes(municipioFiltro = 'todos', silencioso = false) {
        try {
            const concedentes = await obterListaConcedentes(municipioFiltro);
            
            if (concedentes.length === 0) {
                console.warn("Nenhum concedente encontrado para a busca.");
                return [];
            }

            if (!silencioso && this.ui) this.ui.showLoader(`Localizando convênios em ${concedentes.length} concedentes...`);
            this.updateBackgroundStatus(true, `Busca: 0/${concedentes.length}`);
            
            const includeCPE = this.lastFiltros?.includeCPE;
            const resultados = await obterConveniosDeConcedentes(concedentes, includeCPE, (atual, total, nomeConcedente) => {
                if (!silencioso && this.ui) this.ui.updateLoaderMessage(`Extraindo ${atual}/${total}: ${nomeConcedente}`);
                this.updateBackgroundStatus(true, `Busca: ${atual}/${total}`);
            });
            
            console.log(`[Dashboard] Busca finalizada. Total extraído: ${resultados.length} convênios.`);
            this.updateBackgroundStatus(false);
            return resultados;
        } catch (e) {
            console.error("Erro ao buscar convênios dos concedentes:", e);
            this.updateBackgroundStatus(false);
            return [];
        }
    }

    async processBackgroundQueue(isSynchronous = false) {
        if (this.isQueueProcessing || this.backgroundAuditQueue.length === 0) return;
        
        this.isQueueProcessing = true;
        const sessionId = this.currentQueueSessionId;
        const total = this.backgroundAuditQueue.length;
        this.updateBackgroundStatus(true, `Auditoria: 0/${total}`);
        let processed = 0;
        
        if (isSynchronous && this.ui) {
            this.ui.updateLoaderMessage(`Extração detalhada: 0/${total} convênios...`);
        }

        while (this.backgroundAuditQueue.length > 0 && sessionId === this.currentQueueSessionId) {
            const convId = this.backgroundAuditQueue.shift();
            try {
                const auditData = await this.performDeepAudit(convId);
                if (auditData) {
                    this.syncConvenio(convId, { audit: auditData });
                    
                    // Se foi auditado via "orfão", remove o isMeus se confirmarmos inatividade.
                    const entry = this.meusConvenios[convId] || this.outrosConvenios[convId];
                    if (entry && this.getStatusLabel(entry) === 'Inativo' && entry.isMeus) {
                         this.syncConvenio(convId, { isMeus: false });
                    }

                    const row = document.querySelector(`.sispmg-clickable-row[onclick*="'${convId}'"]`);
                    if (row) {
                        const tempDiv = document.createElement('tbody');
                        tempDiv.innerHTML = this.renderRowHtml(entry);
                        row.replaceWith(tempDiv.firstChild);
                    }
                    if (this.activeConvId === convId) {
                        this.renderAuditSidebar(entry);
                    }
                }
            } catch (e) { console.error(e); }
            processed++;
            this.updateBackgroundStatus(true, `Auditoria: ${processed}/${total}`);
            if (isSynchronous && this.ui) {
                this.ui.updateLoaderMessage(`Extração detalhada: ${processed}/${total} convênios...`);
            }
            if (processed % 5 === 0) { this.updateSummaryCards(); this.savePersistentCache(); }
            await new Promise(r => setTimeout(r, 600));
        }

        if (sessionId === this.currentQueueSessionId) {
            this.isQueueProcessing = false;
            this.updateBackgroundStatus(false);
            this.updateSummaryCards();
            this.savePersistentCache();
        }
    }

    async performDeepAudit(convId, ignoreCache = false) {
        const visitedIds = new Set();
        let currentId = String(convId);
        const mostRecentId = currentId;
        
        let aggregatedAudit = {
            timestamp: Date.now(),
            historico: [],
            planoItens: [],
            cronogramas: [],
            lastUpdate: new Date().toLocaleString(),
            valorEstimadoReal: 0,
            dtInicialAbsoluta: null // Para rastrear a data mais antiga
        };

        const naturezasMap = new Map(); // code -> { ... }
        const mP = { 'JAN': 0, 'FEV': 1, 'MAR': 2, 'ABR': 3, 'MAI': 4, 'JUN': 5, 'JUL': 6, 'AGO': 7, 'SET': 8, 'OUT': 9, 'NOV': 10, 'DEZ': 11, 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };
        
        let isFirst = true;
        const entryOriginal = this.meusConvenios[String(convId)] || this.outrosConvenios[String(convId)];
        const rawCronogramas = [];

        while (currentId && !visitedIds.has(currentId)) {
            visitedIds.add(currentId);
            console.log(`[Audit] Processando ${isFirst ? 'convênio atual' : 'aditivo anterior'}: ${currentId}`);
            
            try {
                const singleAudit = await this.fetchSingleAudit(currentId);
                if (!singleAudit) break;

                const entry = this.meusConvenios[currentId] || this.outrosConvenios[currentId];

                // 2. Data de Início Absoluta (A mais antiga da cadeia)
                let dtIni = null;
                if (singleAudit.dtInicial) {
                    dtIni = this.parseDate(singleAudit.dtInicial);
                } else {
                    dtIni = this.parseDate(entry?.DTINICIAL);
                }
                if (dtIni && (!aggregatedAudit.dtInicialAbsoluta || dtIni < aggregatedAudit.dtInicialAbsoluta)) {
                    aggregatedAudit.dtInicialAbsoluta = dtIni;
                }

                // 1. Histórico: Acumula
                aggregatedAudit.historico.push(...(singleAudit.historico || []));

                // 3. Plano de Trabalho (Naturezas)
                singleAudit.planoItens?.forEach(p => {
                    const natCode = p.naturezaId || p.nome.split(' - ')[0];
                    if (isFirst) {
                        naturezasMap.set(natCode, { 
                            ...p,
                            isRecent: true
                        });
                    } else {
                        if (naturezasMap.has(natCode)) {
                            const existing = naturezasMap.get(natCode);
                            existing.valorExecutado += p.valorExecutado;
                        } else {
                            // Natureza legada: Mantém o previsto original (Correção regra 3)
                            naturezasMap.set(natCode, {
                                ...p,
                                nome: `${p.nome} (Conv: ${currentId})`,
                                valorEstimado: p.valorEstimado, 
                                valorExecutado: p.valorExecutado,
                                isRecent: false
                            });
                        }
                    }
                });

                // 4. Cronogramas: Coleta bruta
                singleAudit.cronogramas?.forEach(c => {
                    rawCronogramas.push({
                        ...c,
                        convId: currentId
                    });
                });

                if (isFirst) {
                    aggregatedAudit.valorEstimadoReal = singleAudit.valorEstimadoReal;
                }

                // Próximo Aditivo na Cadeia
                currentId = entry?.ADITIVO ? String(entry.ADITIVO) : null;
                isFirst = false;
            } catch (error) {
                console.error(`[Audit] Erro ao processar ID ${currentId}:`, error);
                break;
            }
        }

        // Finaliza aglutinação Naturezas
        aggregatedAudit.planoItens = Array.from(naturezasMap.values());
        
        // Regras de Cronograma
        const agora = new Date();
        const mesAtualScore = (agora.getFullYear() * 100) + agora.getMonth();
        const groups = {}; 

        rawCronogramas.forEach(c => {
            if (!groups[c.mesTexto]) groups[c.mesTexto] = [];
            groups[c.mesTexto].push(c);
        });

        const finalCronos = [];
        for (const mesTexto in groups) {
            const entries = groups[mesTexto];
            const pa = mesTexto.split(' ');
            const score = (parseInt(pa[1]) * 100) + (mP[pa[0].toUpperCase()] || 0);

            const filteredEntries = entries.filter(e => {
                const isRecent = String(e.convId) === mostRecentId;
                if (isRecent) return score <= mesAtualScore; 
                return (e.valorExecutado || 0) > 0.01; 
            });

            if (filteredEntries.length === 0) continue;

            const withExec = filteredEntries.filter(e => (e.valorExecutado || 0) > 0.01);
            if (withExec.length > 1) {
                const recentEntry = filteredEntries.find(e => String(e.convId) === mostRecentId);
                const base = recentEntry || filteredEntries[0];
                const merged = { ...base };
                merged.valorExecutado = filteredEntries.reduce((sum, e) => sum + (e.valorExecutado || 0), 0);
                // Regra 1: Valor previsto não deve ser somado, vale o do convênio mais recente
                merged.valorPrevisto = recentEntry ? recentEntry.valorPrevisto : base.valorPrevisto;
                merged.convId = "Mesclado";
                merged.score = score;
                finalCronos.push(merged);
            } else {
                filteredEntries.forEach(e => finalCronos.push({ ...e, score }));
            }
        }

        finalCronos.sort((a, b) => {
            if (a.score !== b.score) return a.score - b.score;
            return String(a.convId).localeCompare(String(b.convId));
        });
        aggregatedAudit.cronogramas = finalCronos;
        
        // Ordena histórico
        aggregatedAudit.historico.sort((a, b) => {
            const parseD = (s) => {
                const [d, t] = s.split(' ');
                const [day, mon, year] = d.split('/');
                return new Date(`${year}-${mon}-${day}T${t || '00:00'}`);
            };
            try { return parseD(b.data) - parseD(a.data); } catch(e) { return 0; }
        });

        if (aggregatedAudit.valorEstimadoReal === 0) {
            aggregatedAudit.valorEstimadoReal = parseFloat(entryOriginal?.VALOR_ESTIMADO) || 0;
        }

        // Se encontrou uma data absoluta, garante que ela esteja formatada no objeto de auditoria
        if (aggregatedAudit.dtInicialAbsoluta) {
            aggregatedAudit.dtInicialFormatada = this.formatDate(aggregatedAudit.dtInicialAbsoluta.toISOString().split('T')[0]);
        }

        return aggregatedAudit;
    }

    async fetchSingleAudit(convId) {
        try {
            const res = await fetch(`https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/convenio/view?id=${convId}`);
            const html = await res.text(), doc = new DOMParser().parseFromString(html, 'text/html');
            
            let dtInicial = null;
            let dtFinal = null;
            doc.querySelectorAll('.info-convenio .flex-coluna').forEach(col => {
                const tcMenor = col.querySelector('.tc.menor');
                if (tcMenor) {
                    const lbl = tcMenor.innerText.trim().toLowerCase();
                    const val = col.innerText.replace(tcMenor.innerText, '').trim();
                    if (lbl.includes('vigência inicial') || lbl.includes('início') || lbl.includes('inicial')) {
                        dtInicial = val;
                    } else if (lbl.includes('vigência final') || lbl.includes('término') || lbl.includes('final')) {
                        dtFinal = val;
                    }
                }
            });

            const historico = [];
            doc.querySelectorAll('#historico .item').forEach(row => {
                const dEl = row.querySelector('.tc');
                if (dEl) historico.push({ data: dEl.innerText.trim(), log: row.innerText.replace(dEl.innerText, '').trim().replace(/\n\s*\n/g, '<br>').replace(/\n/g, ' ') });
            });

            let planoItens = [];
            try {
                const token = getCookie('tokiuz');
                const pRes = await sendMessageToBackground('fetchConvenioPlano', { convenioId: convId, token });
                if (pRes?.success && pRes.data?.planos) {
                    planoItens = pRes.data.planos.map(p => ({ 
                        naturezaId: p.NATUREZA_ID, 
                        naturezaItem: p.NATUREZA_ITEM, 
                        nome: `${p.ITEM} - ${p.NATUREZA_ITEM}`, 
                        valorEstimado: parseFloat(p.VALOR) || 0, 
                        valorExecutado: 0 
                    }));
                }
            } catch (e) { console.error("Erro fetchPlano:", e); }

            // Scrape de execuções na tabela t1 para atualizar valorExecutado das naturezas
            doc.querySelectorAll('table.t1').forEach(table => {
                if (!table.textContent.toUpperCase().includes('NATUREZA')) return;
                table.querySelectorAll('tbody tr').forEach(tr => {
                    const tds = tr.querySelectorAll('td');
                    if (tds.length >= 6) {
                        const nomeNat = tds[0].textContent.trim();
                        const valTotal = parseFloat(tds[5].textContent.replace(/\./g, '').replace(',', '.')) || 0;
                        if (valTotal > 0) {
                            const item = planoItens.find(p => p.nome.includes(nomeNat) || nomeNat.includes(p.nome.split(' - ')[1]));
                            if (item) item.valorExecutado += valTotal;
                        }
                    }
                });
            });

            const cronogramas = [], processedIds = new Set();
            doc.querySelectorAll('a.item.flex-linha').forEach(linkRow => {
                let dIdM = linkRow.getAttribute('onclick')?.match(/detalhes?Cronograma-(\d+)/);
                if (!dIdM || processedIds.has(dIdM[1])) return;
                const cronId = dIdM[1];
                processedIds.add(cronId);
                const mesEl = linkRow.querySelector('.ne');
                if (!mesEl) return;
                const mesTexto = mesEl.innerText.replace(/[\n\r]/g, '').replace(/(\d+)\s+anexos?/, '').trim();
                let vPrev = 0, vExec = 0, pLim = '-', dLiq = '-', status = 'Aguardando execução';
                linkRow.querySelectorAll('span.flex-coluna').forEach(span => {
                   const txt = span.textContent.trim(), lbl = span.querySelector('div.tc.menor')?.textContent.trim();
                   const m = txt.match(/R\$\s*([\d\.,]+)/);
                   if (lbl === 'Valor' && m) vPrev = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
                   else if (lbl === 'Executado' && m) vExec = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
                   else if (lbl === 'Prazo limite') pLim = txt.replace('Prazo limite', '').trim();
                   const dt = span.querySelector('dl.ic dt'); if (dt) dLiq = dt.textContent.trim();
                });
                if (vExec > 0 || dLiq !== '-') { status = 'Liquidado'; }

                const naturezasGranulares = {}; 
                const detalheDiv = doc.getElementById(`detalheCronograma-${cronId}`) || doc.getElementById(`detalhesCronograma-${cronId}`);
                if (detalheDiv) {
                    detalheDiv.querySelectorAll('table.t1').forEach(table => {
                        const rows = table.querySelectorAll('tr');
                        rows.forEach((row, idx) => {
                            if (idx === 0 || row.querySelector('th')) return;
                            const tds = row.querySelectorAll('td');
                            if (tds.length >= 6) {
                                let nomeNat = tds[0].textContent.trim();
                                if (!nomeNat || nomeNat === 'Natureza') return;
                                const itemPlano = planoItens.find(p => p.nome.toUpperCase().includes(nomeNat.toUpperCase()) || nomeNat.toUpperCase().includes(p.naturezaItem.toUpperCase()));
                                if (itemPlano) nomeNat = itemPlano.nome;
                                const valText = tds[5].textContent.trim().replace(/\s/g, '');
                                const valExecItem = parseFloat(valText.replace(/\./g, '').replace(',', '.')) || 0;
                                if (valExecItem > 0) naturezasGranulares[nomeNat] = (naturezasGranulares[nomeNat] || 0) + valExecItem;
                            }
                        });
                    });
                }
                const naturezasArray = Object.entries(naturezasGranulares).map(([nome, valor]) => ({ nome, valorExecutado: valor }));

                cronogramas.push({ 
                    mesTexto, valorPrevisto: vPrev, valorExecutado: vExec, 
                    prazoLimite: pLim, dataLiquidado: dLiq, status,
                    naturezas: naturezasArray 
                });
            });

            const vTotalEst = planoItens.reduce((sum, p) => sum + p.valorEstimado, 0);
            return { cronogramas, planoItens, historico, valorEstimadoReal: vTotalEst, dtInicial, dtFinal };
        } catch (e) { console.error(`Erro fetchSingleAudit(${convId}):`, e); return null; }
    }

    analisarPendencias(audit, filtros = { tipo: 'todos', periodo: 'todos', manual: '' }, conv = null) {
        const pendencias = [], hoje = new Date();
        const mP = { 'JAN': 0, 'FEV': 1, 'MAR': 2, 'ABR': 3, 'MAI': 4, 'JUN': 5, 'JUL': 6, 'AGO': 7, 'SET': 8, 'OUT': 9, 'NOV': 10, 'DEZ': 11, 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };
        let duracaoMeses = 0, mesesDecorridos = 0;
        let d1 = this.parseDate(conv?.DTINICIAL), d2 = this.parseDate(conv?.DTFINAL);
        
        // Usa cronogramas para vigência se datas faltarem
        if (!d1 && audit.cronogramas?.length > 0) {
            const s = [...audit.cronogramas].sort((a, b) => { 
                const pa = a.mesTexto.split(' '), pb = b.mesTexto.split(' '); 
                return (parseInt(pa[1]) - parseInt(pb[1])) || (mP[pa[0].toUpperCase()] - mP[pb[0].toUpperCase()]); 
            });
            const p1 = s[0].mesTexto.split(' '); d1 = new Date(parseInt(p1[1]), mP[p1[0].toUpperCase()], 1);
        }
        if (d1 && d2) {
            duracaoMeses = Math.max(1, (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()) + 1);
            mesesDecorridos = Math.min(duracaoMeses, Math.max(0, (hoje.getFullYear() - d1.getFullYear()) * 12 + (hoje.getMonth() - d1.getMonth())) + 1);
            audit.vigenciaInfo = { duracaoMeses, mesesDecorridos, mesesFaltantes: Math.max(0, duracaoMeses - mesesDecorridos), dtInicio: d1.toISOString().split('T')[0], dtFim: d2.toISOString().split('T')[0] };
        }

        // Pendências mensais
        const mesesAnalise = {}; // mesTexto -> { vPrev, vExec }
        audit.cronogramas?.forEach(c => {
            if (!mesesAnalise[c.mesTexto]) mesesAnalise[c.mesTexto] = { vPrev: 0, vExec: 0 };
            mesesAnalise[c.mesTexto].vPrev += c.valorPrevisto;
            mesesAnalise[c.mesTexto].vExec += c.valorExecutado;
        });

        if (filtros.tipo === 'todos' || filtros.tipo === 'excesso_valor') { 
            Object.entries(mesesAnalise).forEach(([mes, vals]) => {
                if (vals.vExec > vals.vPrev + 0.01) pendencias.push({ tipo: 'excesso_valor_mensal', msg: `Excesso em ${mes}` });
            });
        }
        
        if (filtros.tipo === 'todos' || filtros.tipo === 'atraso_liquidacao') { 
            audit.cronogramas?.forEach(c => { 
                if (c.prazoLimite && c.prazoLimite !== '-') { 
                    const pt = c.prazoLimite.split('/'); 
                    if (new Date(pt[2], pt[1]-1, pt[0]) < hoje && c.status.includes('Aguardando')) pendencias.push({ tipo: 'atraso_liquidacao', msg: `Atraso: ${c.mesTexto}` }); 
                } 
            }); 
        }
        
        if (filtros.tipo === 'todos' || filtros.tipo === 'excesso_valor') { 
            audit.planoItens?.forEach(p => { 
                if (p.valorExecutado > p.valorEstimado + 0.01) pendencias.push({ tipo: 'excesso_valor_natureza', nivel: 'critico', msg: `Excesso: ${p.nome}` }); 
                else if (duracaoMeses > 0 && p.valorExecutado > (p.valorEstimado / duracaoMeses) * mesesDecorridos * 1.3) pendencias.push({ tipo: 'excesso_valor_natureza', nivel: 'alerta', msg: `Consumo acelerado: ${p.nome}` }); 
            }); 
        }
        return pendencias;
    }

    async loadAuditData(convId) {
        this.activeConvId = convId;
        const entry = this.meusConvenios[String(convId)] || this.outrosConvenios[String(convId)];
        if (!entry) return;
        if (entry.audit && (Date.now() - (entry.audit.timestamp || 0) < this.CACHE_TTL)) { this.renderAuditSidebar(entry); return; }
        if (this.ui) this.ui.showLoader(`Buscando detalhes do convênio ${convId}...`);
        try {
            const auditData = await this.performDeepAudit(convId);
            if (auditData) {
                this.syncConvenio(convId, { audit: auditData });
                const updated = this.meusConvenios[convId] || this.outrosConvenios[convId];
                this.renderAuditSidebar(updated);
                this.updateSummaryCards();
            }
        } catch (e) { console.error(e); } finally { if (this.ui) this.ui.hideLoader(); }
    }

    renderAuditSidebar(conv) {
        const audit = conv.audit, layout = document.getElementById('sispmg-dashboard-layout'), sidebar = document.getElementById('sispmg-dashboard-sidebar');
        if (!layout || !sidebar || !audit) return;
        layout.classList.remove('filter-active'); layout.classList.add('audit-active'); sidebar.classList.add('active');
        const globalClose = document.getElementById('sispmg-dashboard-close-global');
        if (globalClose) globalClose.style.setProperty('display', 'none', 'important');

        const v = audit.vigenciaInfo || {}, p = conv.pendencias || [];
        const agrp = { atraso: [], mensal: [], natureza: [], acelerado: [] };
        p.forEach(x => {
            if (x.tipo === 'atraso_liquidacao') agrp.atraso.push(x.msg.replace('Atraso: ', ''));
            else if (x.tipo === 'excesso_valor_mensal') agrp.mensal.push(x.msg.replace('Excesso em ', ''));
            else if (x.tipo === 'excesso_valor_natureza') { if (x.nivel === 'critico') agrp.natureza.push(x.msg.replace('Excesso: ', '')); else agrp.acelerado.push(x.msg.replace('Consumo acelerado: ', '')); }
        });
        const alertas = [];
        if (agrp.atraso.length > 0) alertas.push({ icon: '<i class="fas fa-clock"></i>', color: '#dc3545', msg: `Liquidação pendente fora do prazo nos meses: ${agrp.atraso.join(', ')}.` });
        if (agrp.mensal.length > 0) alertas.push({ icon: '<i class="fas fa-chart-line"></i>', color: '#dc3545', msg: `Valor executado superior ao previsto nos meses: ${agrp.mensal.join(', ')}.` });
        agrp.natureza.forEach(n => { const item = audit.planoItens?.find(it => it.nome.includes(n)); const perc = item ? ((item.valorExecutado / item.valorEstimado) * 100).toFixed(1) : '?'; alertas.push({ icon: '<i class="fas fa-exclamation-triangle"></i>', color: '#dc3545', msg: `Excesso Crítico em "${n}": Execução de ${perc}% (superior ao limite de 100%).` }); });
        agrp.acelerado.forEach(n => { const item = audit.planoItens?.find(it => it.nome.includes(n)); const percExec = item ? ((item.valorExecutado / item.valorEstimado) * 100).toFixed(1) : '?'; const percTempo = v.duracaoMeses ? ((v.mesesDecorridos / v.duracaoMeses) * 100).toFixed(1) : '?'; alertas.push({ icon: '<i class="fas fa-exclamation-triangle"></i>', color: '#9c27b0', msg: `Consumo Acelerado em "${n}": ${percExec}% do recurso utilizado em apenas ${percTempo}% do tempo de vigência (projeção linear excedida em mais de 30%).` }); });

        const pendenciasHtml = alertas.length > 0 ? `<div style="margin-top: 15px; padding-top: 10px; border-top: 1px dashed #dcd3c5;"><strong style="display: block; margin-bottom: 10px; font-size: 13px; color: #574e2d;">Alertas de Auditoria:</strong><div style="display: flex; flex-direction: column; gap: 10px;">${alertas.map(a => `<div style="display: flex; align-items: flex-start; gap: 10px; font-size: 12px; color: #333; line-height: 1.4;"><span style="color: ${a.color}; width: 16px; text-align: center; flex-shrink: 0; padding-top: 2px;">${a.icon}</span><span>${a.msg}</span></div>`).join('')}</div></div>` : '';

        sidebar.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #b3a368; padding: 15px 20px;">
                    <h2 style="color: #574e2d; font-size: 18px; margin: 0; white-space: normal; line-height: 1.2;">Detalhamento: ${conv.ID} - ${this.getMunicipioClean(conv.CONCEDENTE)}</h2>
                    <button id="sispmg-close-audit-btn" class="sispmg-dashboard-btn" style="background-color: #dc3545 !important; color: white !important;">Fechar</button>
                </div>
                <div style="flex-grow: 1; overflow-y: auto; padding: 20px;">
                    <div style="background: #fbf8f5; border: 1px solid #dcd3c5; border-radius: 6px; padding: 15px; margin-bottom: 20px; font-size: 13px;">
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                            <div><strong>Início:</strong> ${this.formatDate(conv.DTINICIAL)}</div>
                            <div><strong>Término:</strong> ${this.formatDate(conv.DTFINAL)}</div>
                            <div><strong>Duração:</strong> ${v.duracaoMeses === 0 ? '0' : `${v.duracaoMeses} ${v.duracaoMeses === 1 ? 'mês' : 'meses'}`}</div>
                            <div><strong>Nº Face:</strong> ${conv.NUMERO_FACE || '-'}</div>
                            <div><strong>Decorridos:</strong> ${v.mesesDecorridos === 0 ? '0' : `${v.mesesDecorridos} ${v.mesesDecorridos === 1 ? 'mês' : 'meses'}`}</div>
                            <div><strong>Faltantes:</strong> ${v.mesesFaltantes === 0 ? '0' : `${v.mesesFaltantes} ${v.mesesFaltantes === 1 ? 'mês' : 'meses'}`}</div>
                        </div>
                        ${pendenciasHtml}
                    </div>
                    <h3 style="font-size: 16px; color: #333; margin-top: 0;"><i class="fas fa-list-check"></i> Plano de Trabalho (Naturezas)</h3>
                    <div class="sispmg-dashboard-table-container">
                        <table class="sispmg-dashboard-table" style="min-width: 100%;">
                            <thead><tr><th style="text-align: left;">Item / Natureza</th><th style="text-align: right;">Previsto (R$)</th><th style="text-align: right;">Executado (R$)</th><th style="text-align: center;">%</th><th style="text-align: center;">Progresso</th></tr></thead>
                            <tbody>${audit.planoItens?.length > 0 ? audit.planoItens.map(p => {
                                const isAcelerado = agrp.acelerado.some(n => p.nome.includes(n));
                                const prog = p.valorEstimado > 0 ? ((p.valorExecutado / p.valorEstimado) * 100).toFixed(1) : (p.valorExecutado > 0 ? 100 : 0);
                                const isEx = parseFloat(prog) > 100, isCo = parseFloat(prog) >= 100;
                                let corP = isEx ? '#dc3545' : (isAcelerado ? '#9c27b0' : (isCo ? '#b3a368' : '#28a745')), corT = p.valorExecutado > 0 ? (isEx ? '#dc3545' : (isAcelerado ? '#9c27b0' : '#155724')) : '#666';
                                return `<tr><td>${p.nome}</td><td style="text-align: right;">${p.valorEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="text-align: right; font-weight: 600; color: ${corT};">${p.valorExecutado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="text-align: center; font-weight: 600; color: ${corT};">${prog}%</td><td style="text-align: center;"><div style="background: #eee; width: 60px; border-radius: 4px; overflow: hidden; height: 10px; display: inline-block; vertical-align: middle;"><div style="background: ${corP}; height: 100%; width: ${prog > 100 ? 100 : prog}%;"></div></div></td></tr>`;
                            }).join('') : '<tr><td colspan="5" style="text-align: center;">Nenhum registro no plano.</td></tr>'}</tbody>
                            ${audit.planoItens?.length > 0 ? `<tfoot><tr style="background: #fbf8f5; font-weight: 700; border-top: 2px solid #dcd3c5;"><td style="text-align: right;">Total:</td><td style="text-align: right;">${audit.planoItens.reduce((a, b) => a + b.valorEstimado, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="text-align: right; color: #155724;">${audit.planoItens.reduce((a, b) => a + b.valorExecutado, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="text-align: center; color: #000;">${audit.planoItens.reduce((a, b) => a + b.valorEstimado, 0) > 0 ? ((audit.planoItens.reduce((a, b) => a + b.valorExecutado, 0) / audit.planoItens.reduce((a, b) => a + b.valorEstimado, 0)) * 100).toFixed(1) + '%' : '0%'}</td><td></td></tr></tfoot>` : ''}
                        </table>
                    </div>
                    <h3 style="font-size: 16px; color: #333; margin-top: 25px;"><i class="fas fa-calendar-alt"></i> Cronograma Mensal</h3>
                    <div class="sispmg-dashboard-table-container">
                        <table class="sispmg-dashboard-table" style="min-width: 100%;">
                            <thead><tr><th style="text-align: left;">Mês</th><th style="text-align: left;">Convênio</th><th style="text-align: right;">Previsto (R$)</th><th style="text-align: right;">Executado (R$)</th><th style="text-align: center;">%</th><th style="text-align: center;">Progresso</th><th style="text-align: left;">Prazo Limite</th><th style="text-align: left;">Data Liq.</th><th style="text-align: center;">Status</th></tr></thead>
                            <tbody>${audit.cronogramas?.length > 0 ? audit.cronogramas.map(c => {
                                const perc = c.valorPrevisto > 0 ? ((c.valorExecutado / c.valorPrevisto) * 100).toFixed(1) : (c.valorExecutado > 0 ? 100 : 0);
                                const isEx = c.valorExecutado > c.valorPrevisto + 0.01, isCo = parseFloat(perc) >= 100, corC = c.valorExecutado > 0 ? (isEx ? '#dc3545' : '#155724') : 'inherit', corP = isEx ? '#dc3545' : (isCo ? '#b3a368' : '#28a745');
                                return `<tr><td style="white-space: nowrap;">${c.mesTexto || "-"}</td><td style="font-size: 11px;">${c.convId || "-"}</td><td style="text-align: right;">${(c.valorPrevisto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="text-align: right; font-weight: 600; color: ${corC};">${(c.valorExecutado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="text-align: center; font-weight: 600; color: ${corC};">${perc}%</td><td style="text-align: center;"><div style="background: #eee; width: 60px; border-radius: 4px; overflow: hidden; height: 10px; display: inline-block; vertical-align: middle;"><div style="background: ${corP}; height: 100%; width: ${parseFloat(perc) > 100 ? 100 : perc}%;"></div></div></td><td>${c.prazoLimite || "-"}</td><td>${c.dataLiquidado || "-"}</td><td style="text-align: center;"><span class="sispmg-status-badge ${c.status.includes('Liquidado') ? 'sispmg-status-vigente' : 'sispmg-status-outros'}">${c.status || "Pendente"}</span></td></tr>`;
                            }).join('') : '<tr><td colspan="9" style="text-align: center;">Nenhum registro extraído.</td></tr>'}</tbody>
                        </table>
                    </div>
                    <h3 style="font-size: 16px; color: #333; margin-top: 25px;"><i class="fas fa-history"></i> Histórico de Alterações</h3>
                    <div style="background: #fff; border: 1px solid #dcd3c5; border-radius: 6px; padding: 10px; font-size: 12px; max-height: 250px; overflow-y: auto;">
                        ${audit.historico?.length > 0 ? audit.historico.map(h => `<div style="margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px;"><strong style="color: #b3a368;">${h.data}</strong><br>${h.log}</div>`).join('') : 'Nenhum histórico registrado.'}
                    </div>
                </div>
            </div>
        `;
        sidebar.querySelector('#sispmg-close-audit-btn').onclick = () => this.closeSidebar();
        this.renderDashboard(true);
    }

    getMunicipioClean(concedente) {
        if (!concedente) return "-";
        let nome = concedente;
        const prefixos = [/^PREFEITURA\s+MUNICIAP?AL\s+DE\s+/i, /^PREFEITURA\s+MUNICIPAL\s+DE\s+/i, /^PREFEITURA\s+MUNICIPAL\s+/i, /^PREFEITURA\s+DE\s+/i, /^MUNICIPIO\s+DE\s+/i, /^P\.\s*M\.\s*DE\s+/i, /^PM\s+/i];
        for (const pref of prefixos) { if (pref.test(nome)) { nome = nome.replace(pref, ''); break; } }
        nome = nome.replace(/Ã‡/g, 'Ç').replace(/Ã\“/g, 'Ó').replace(/Ã\*/g, 'Ó').replace(/Ã\‰/g, 'É').replace(/Ãƒ/g, 'Ã').replace(/Ã\…/g, 'Ã').replace(/Ã\•/g, 'Õ').replace(/Ã\š/g, 'Ú').replace(/Ã\*/g, 'Ú').replace(/Ã\?/g, 'Í').replace(/Â/g, '').replace(/\s+/g, ' ').trim();
        return nome;
    }

    getStatusLabel(conv) { const isVigente = conv.ATIVO === 'S' && conv.VENCIDO === '0'; return isVigente ? 'Vigente' : (conv.ATIVO === 'N' ? 'Inativo' : 'Vencido'); }

    toggleFilterDropdown(trigger, colId) {
        this.closeAllFilterDropdowns();
        let dropdown = document.getElementById(`filter-dropdown-${colId}`);
        if (dropdown) { 
            dropdown.classList.toggle('show'); 
            if (dropdown.classList.contains('show')) {
                this.positionDropdown(trigger, dropdown);
                const searchInput = dropdown.querySelector('input');
                setTimeout(() => {
                    searchInput.focus();
                    searchInput.style.setProperty('pointer-events', 'auto', 'important');
                    searchInput.style.setProperty('cursor', 'text', 'important');
                }, 50);
            }
            return; 
        }

        dropdown = document.createElement('div'); 
        dropdown.id = `filter-dropdown-${colId}`; 
        dropdown.className = 'sispmg-filter-dropdown show';
        
        // Bloqueio agressivo no dropdown para evitar fechamento acidental
        dropdown.onclick = (e) => e.stopPropagation();
        dropdown.onmousedown = (e) => e.stopPropagation();

        let values = [];
        const dataForValues = this.currentView === 'consolidado' ? this.consolidatedData : this.conveniosData;
        
        if (this.currentView === 'consolidado') {
            values = [...new Set(dataForValues.map(row => row[colId.toUpperCase()]))];
        } else {
            if (colId === 'municipio') values = [...new Set(dataForValues.map(c => this.getMunicipioClean(c.CONCEDENTE)))];
            else if (colId === 'unidade') values = [...new Set(dataForValues.map(c => this.cleanUnidade(c.UNI_NOME_PRINCIPAL)))];
            else if (colId === 'status') values = ['Vigente', 'Vencido', 'Inativo'];
            else if (colId === 'id') values = [...new Set(dataForValues.map(c => c.ID))];
            else if (colId === 'numero_face') values = [...new Set(dataForValues.map(c => c.NUMERO_FACE || "-"))];
        }
        
        values.sort(); 
        const selected = this.activeFilters[colId] || [];

        dropdown.innerHTML = `
            <div class="sispmg-filter-search">
                <input type="text" placeholder="Pesquisar..." id="search-${colId}" autocomplete="off" style="pointer-events: auto !important; cursor: text !important;">
            </div>
            <div class="sispmg-filter-list" id="list-${colId}">
                ${values.map(val => `<label class="sispmg-filter-item"><input type="checkbox" value="${val}" ${selected.includes(String(val)) ? 'checked' : ''}><span>${val}</span></label>`).join('')}
            </div>
            <div class="sispmg-filter-actions">
                <button class="sispmg-filter-btn clear">Limpar</button>
                <button class="sispmg-filter-btn apply">Aplicar</button>
            </div>
        `;

        document.getElementById('sispmg-plus-container').appendChild(dropdown);
        this.positionDropdown(trigger, dropdown);
        
        const searchInput = dropdown.querySelector('input');
        
        // Isolamento agressivo de interferências no campo de busca
        const preventInterference = (e) => {
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        };

        ['click', 'mousedown', 'mouseup', 'keydown', 'keyup', 'keypress'].forEach(evt => {
            searchInput.addEventListener(evt, preventInterference, true);
        });

        // Garantir foco com pequeno delay para processamento do DOM
        setTimeout(() => {
            searchInput.focus();
            searchInput.style.setProperty('pointer-events', 'auto', 'important');
            searchInput.style.setProperty('cursor', 'text', 'important');
        }, 100);

        dropdown.querySelector('.apply').onclick = () => {
            const checked = Array.from(dropdown.querySelectorAll('input:checked')).map(i => i.value);
            if (checked.length > 0) { 
                this.activeFilters[colId] = checked; 
                trigger.classList.add('active'); 
            } else { 
                delete this.activeFilters[colId]; 
                trigger.classList.remove('active'); 
            }
            this.applyFilters(); 
            this.closeAllFilterDropdowns();
        };

        dropdown.querySelector('.clear').onclick = () => { 
            delete this.activeFilters[colId]; 
            trigger.classList.remove('active'); 
            this.applyFilters(); 
            this.closeAllFilterDropdowns(); 
        };

        searchInput.oninput = () => { 
            const term = searchInput.value.toLowerCase(); 
            dropdown.querySelectorAll('.sispmg-filter-item').forEach(item => {
                if (item.textContent.toLowerCase().includes(term)) {
                    item.style.setProperty('display', 'flex', 'important');
                } else {
                    item.style.setProperty('display', 'none', 'important');
                }
            }); 
        };
    }

    positionDropdown(trigger, dropdown) { const rect = trigger.getBoundingClientRect(); dropdown.style.top = `${rect.bottom + 5}px`; dropdown.style.left = `${Math.max(10, rect.left - 200)}px`; }
    closeAllFilterDropdowns() { document.querySelectorAll('.sispmg-filter-dropdown').forEach(d => d.classList.remove('show')); }
    cleanUnidade(u) { if (!u) return "-"; return u.replace(/24\s*CIA\s*PM\s*IND\s*815\s*RPM/i, '24 CIA PM IND').replace(/\s*\/15\s*RPM/gi, '').trim(); }
    sortConvenios(data) { 
        const p = { 'EM15RPM': 1, '19 BPM': 2, '44 BPM': 3, '70 BPM': 4, '24 CIA PM IND': 5 };
        return data.sort((a, b) => { const uA = this.cleanUnidade(a.UNI_NOME_PRINCIPAL), uB = this.cleanUnidade(b.UNI_NOME_PRINCIPAL), pA = p[uA] || 999, pB = p[uB] || 999; if (pA !== pB) return pA - pB; return this.getMunicipioClean(a.CONCEDENTE).localeCompare(this.getMunicipioClean(b.CONCEDENTE), 'pt-BR'); });
    }
    applyFilters() {
        const sourceData = this.currentView === 'consolidado' ? this.consolidatedData : this.conveniosData;
        let filtered = sourceData.filter(item => {
            for (const colId in this.activeFilters) {
                const sel = this.activeFilters[colId];
                let val;
                if (this.currentView === 'consolidado') {
                    val = item[colId.toUpperCase()];
                } else {
                    val = (colId === 'municipio' ? this.getMunicipioClean(item.CONCEDENTE) : (colId === 'unidade' ? this.cleanUnidade(item.UNI_NOME_PRINCIPAL) : (colId === 'status' ? this.getStatusLabel(item) : item[colId.toUpperCase()])));
                }
                if (!sel.includes(String(val))) return false;
            }
            return true;
        });
        this.filteredData = this.currentView === 'consolidado' ? filtered : this.sortConvenios(filtered); 
        this.renderDashboard(true);
    }

    renderDashboard(isFiltered = false) {
        const tbody = document.getElementById('sispmg-dashboard-tbody'); if (!tbody) return;
        const thead = document.getElementById('sispmg-dashboard-thead');
        let data = isFiltered ? this.filteredData : (this.currentView === 'consolidado' ? this.consolidatedData : this.sortConvenios([...this.conveniosData]));
        
        const headerTitle = document.querySelector('.sispmg-dashboard-header h2');
        if (headerTitle) {
            headerTitle.innerText = this.currentView === 'consolidado' ? 'Dashboard SIRCONV - Consolidação de dados por natureza' : 'Dashboard SIRCONV';
        }

        this.updateActionButtons();
        this.updateSummaryCards();

        const getTriggerClass = (colId) => {
            return (this.activeFilters[colId] && this.activeFilters[colId].length > 0) ? 'sispmg-filter-trigger active' : 'sispmg-filter-trigger';
        };

        if (this.currentView === 'consolidado') {
            thead.innerHTML = `
                <tr>
                    <th data-col="id"><div class="sispmg-th-content">Convênio <i class="fas fa-filter ${getTriggerClass('id')}"></i></div></th>
                    <th data-col="numero_face"><div class="sispmg-th-content">Nº Face <i class="fas fa-filter ${getTriggerClass('numero_face')}"></i></div></th>
                    <th data-col="municipio"><div class="sispmg-th-content">Município <i class="fas fa-filter ${getTriggerClass('municipio')}"></i></div></th>
                    <th data-col="unidade"><div class="sispmg-th-content">Unidade <i class="fas fa-filter ${getTriggerClass('unidade')}"></i></div></th>
                    <th data-col="ano" style="text-align: center;"><div class="sispmg-th-content" style="justify-content: center;">Ano <i class="fas fa-filter ${getTriggerClass('ano')}"></i></div></th>
                    <th data-col="mes" style="text-align: center;"><div class="sispmg-th-content" style="justify-content: center;">Mês <i class="fas fa-filter ${getTriggerClass('mes')}"></i></div></th>
                    <th data-col="natureza"><div class="sispmg-th-content">Natureza <i class="fas fa-filter ${getTriggerClass('natureza')}"></i></div></th>
                    <th style="text-align: right;">Valor Executado (R$)</th>
                </tr>
            `;
            tbody.innerHTML = data.map(row => `
                <tr>
                    <td><strong>${row.ID}</strong></td>
                    <td>${row.NUMERO_FACE}</td>
                    <td>${row.MUNICIPIO}</td>
                    <td>${row.UNIDADE}</td>
                    <td style="text-align: center;">${row.ANO}</td>
                    <td style="text-align: center;">${row.MES}</td>
                    <td style="font-size: 11px;">${row.NATUREZA}</td>
                    <td style="text-align: right; font-weight: 600; color: #155724;">${row.VALOR_EXECUTADO.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                </tr>
            `).join('');
        } else {
            thead.innerHTML = `
                <tr>
                    <th data-col="id" style="text-align: left;"><div class="sispmg-th-content">Convênio <i class="fas fa-filter ${getTriggerClass('id')}"></i></div></th>
                    <th data-col="numero_face" class="sispmg-hide-on-audit" style="text-align: left;"><div class="sispmg-th-content">Nº Face <i class="fas fa-filter ${getTriggerClass('numero_face')}"></i></div></th>
                    <th data-col="municipio" style="text-align: left;"><div class="sispmg-th-content">Município <i class="fas fa-filter ${getTriggerClass('municipio')}"></i></div></th>
                    <th data-col="unidade" style="text-align: left;"><div class="sispmg-th-content">Unidade <i class="fas fa-filter ${getTriggerClass('unidade')}"></i></div></th>
                    <th class="sispmg-hide-on-audit" style="text-align: left;">Vigência (Início/Fim)</th>
                    <th class="sispmg-hide-on-audit" style="text-align: center;">Meses (Ex/Tt)</th>
                    <th class="sispmg-hide-on-audit" style="text-align: right;">Estimado (R$)</th>
                    <th class="sispmg-hide-on-audit" style="text-align: right;">Liquidado (R$)</th>
                    <th class="sispmg-hide-on-audit" style="text-align: right;">Média Prev.</th>
                    <th class="sispmg-hide-on-audit" style="text-align: right;">Média Real</th>
                    <th class="sispmg-hide-on-audit" style="text-align: center;">%</th>
                    <th data-col="status" style="text-align: center;"><div class="sispmg-th-content" style="justify-content: center;">Situação <i class="fas fa-filter ${getTriggerClass('status')}"></i></div></th>
                    <th style="text-align: center;">Pendências</th>
                </tr>
            `;
            tbody.innerHTML = data.map(conv => this.renderRowHtml(conv)).join('');
        }

        document.querySelectorAll('.sispmg-filter-trigger').forEach(trigger => {
            trigger.onclick = (e) => { e.stopPropagation(); this.toggleFilterDropdown(trigger, trigger.closest('th').dataset.col); };
        });
        
        window.SisPMG_SirconvDashboard = this;
    }

    updateActionButtons() {
        const refreshBtn = document.getElementById('sispmg-dashboard-refresh');
        const consolidateBtn = document.getElementById('sispmg-dashboard-consolidate');
        const clearCacheBtn = document.getElementById('sispmg-dashboard-clear-cache');
        const backBtn = document.getElementById('sispmg-dashboard-back');
        const globalClose = document.getElementById('sispmg-dashboard-close-global');
        const layout = document.getElementById('sispmg-dashboard-layout');
        
        if (!refreshBtn || !consolidateBtn || !clearCacheBtn || !backBtn || !globalClose || !layout) return;

        const isSidebarOpen = layout.classList.contains('audit-active') || layout.classList.contains('filter-active') || layout.classList.contains('consolidation-active');

        if (isSidebarOpen) {
            refreshBtn.style.setProperty('display', 'none', 'important');
            consolidateBtn.style.setProperty('display', 'none', 'important');
            clearCacheBtn.style.setProperty('display', 'none', 'important');
            backBtn.style.setProperty('display', 'none', 'important');
            globalClose.style.setProperty('display', 'none', 'important');
        } else {
            if (this.currentView === 'meus') {
                refreshBtn.style.setProperty('display', 'inline-flex', 'important');
                consolidateBtn.style.setProperty('display', 'inline-flex', 'important');
                clearCacheBtn.style.setProperty('display', 'inline-flex', 'important');
                backBtn.style.setProperty('display', 'none', 'important');
                globalClose.style.setProperty('display', 'inline-flex', 'important');
            } else if (this.currentView === 'adv') {
                refreshBtn.style.setProperty('display', 'none', 'important');
                consolidateBtn.style.setProperty('display', 'none', 'important');
                clearCacheBtn.style.setProperty('display', 'none', 'important');
                backBtn.style.setProperty('display', 'inline-flex', 'important');
                globalClose.style.setProperty('display', 'none', 'important');
            } else if (this.currentView === 'consolidado') {
                refreshBtn.style.setProperty('display', 'none', 'important');
                consolidateBtn.style.setProperty('display', 'none', 'important');
                clearCacheBtn.style.setProperty('display', 'none', 'important');
                backBtn.style.setProperty('display', 'inline-flex', 'important');
                globalClose.style.setProperty('display', 'none', 'important');
            }
        }
    }

    renderRowHtml(conv) {
        const statusLabel = this.getStatusLabel(conv), isAudited = conv.ID === this.activeConvId;
        const vEst = parseFloat(conv.audit?.valorEstimadoReal || conv.VALOR_ESTIMADO) || 0, vLiq = parseFloat(conv.LIQUIDADO) || 0, prog = vEst > 0 ? ((vLiq / vEst) * 100).toFixed(1) : 0;
        const colorT = vLiq > 0 ? (parseFloat(prog) > 100 ? '#dc3545' : '#155724') : '#666';
        let dur = 0, dec = 0, fal = 0, mPrev = 0, mReal = 0, rowStyle = '';
        const v = this.calculateVigencia(conv);
        dur = v.duracaoMeses; dec = v.mesesDecorridos; fal = v.mesesFaltantes;
        mPrev = vEst / (dur || 1); mReal = vLiq / (dec || 1);
        if (statusLabel === 'Vigente') { if (fal <= 3) rowStyle = 'background-color: #fffde7 !important; border-left: 5px solid #fdd835;'; if (fal <= 1) rowStyle = 'background-color: #fff3e0 !important; border-left: 5px solid #ff9800;'; }
        if (statusLabel === 'Vencido') rowStyle = 'background-color: #fce8e8 !important; border-left: 5px solid #dc3545;';
        const p = conv.pendencias || [];
        const hA = p.some(x => x.tipo === 'atraso_liquidacao'), hEM = p.some(x => x.tipo === 'excesso_valor_mensal'), hEN = p.filter(x => x.tipo === 'excesso_valor_natureza');
        const isC = hEN.some(x => x.nivel === 'critico'), isAl = !isC && hEN.some(x => x.nivel === 'alerta');
        return `<tr class="sispmg-clickable-row ${isAudited ? 'sispmg-row-audited' : ''}" style="${rowStyle}" onclick="window.SisPMG_SirconvDashboard.loadAuditData('${conv.ID}')">
            <td style="text-align: left;"><strong>${conv.ID}</strong></td><td class="sispmg-hide-on-audit" style="text-align: left;">${conv.NUMERO_FACE || '-'}</td><td style="text-align: left;">${this.getMunicipioClean(conv.CONCEDENTE)}</td><td style="text-align: left;">${this.cleanUnidade(conv.UNI_NOME_PRINCIPAL)}</td><td class="sispmg-hide-on-audit" style="text-align: left; font-size: 12px;">${this.formatDate(conv.DTINICIAL)}<br>${this.formatDate(conv.DTFINAL)}</td><td class="sispmg-hide-on-audit" style="text-align: center;">${dec}/${dur}</td><td class="sispmg-hide-on-audit" style="text-align: right;">${vEst.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td class="sispmg-hide-on-audit" style="text-align: right; font-weight: bold; color: ${colorT};">${vLiq.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td class="sispmg-hide-on-audit" style="text-align: right; color: #666;">${mPrev.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td class="sispmg-hide-on-audit" style="text-align: right; font-weight: bold; color: #155724;">${mReal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td class="sispmg-hide-on-audit" style="text-align: center; font-weight: bold; color: ${colorT};">${prog}%</td><td style="text-align: center;"><span class="sispmg-status-badge ${statusLabel === 'Vigente' ? 'sispmg-status-vigente' : 'sispmg-status-outros'}">${statusLabel}</span></td>
            <td style="text-align: center;"><div style="display: flex; gap: 8px; justify-content: center; width: 60px; margin: 0 auto;"><div style="width: 14px; text-align: center;">${hA ? '<i class="fas fa-clock" title="Atraso Liquidação" style="color: #dc3545;"></i>' : ''}</div><div style="width: 14px; text-align: center;">${hEM ? '<i class="fas fa-chart-line" title="Excesso Mensal" style="color: #dc3545;"></i>' : ''}</div><div style="width: 14px; text-align: center;">${isC ? '<i class="fas fa-exclamation-triangle" title="Excesso Crítico" style="color: #dc3545;"></i>' : (isAl ? '<i class="fas fa-exclamation-triangle" title="Consumo Acelerado" style="color: #9c27b0;"></i>' : '')}</div></div></td></tr>`;
    }

    updateSummaryCards() {
        const data = this.filteredData.length > 0 ? this.filteredData : (this.currentView === 'consolidado' ? this.consolidatedData : this.conveniosData);
        let tE = 0, tL = 0, totalCount = 0, vigentesCount = 0;

        if (this.currentView === 'consolidado') {
            tL = data.reduce((a, b) => a + (parseFloat(b.VALOR_EXECUTADO) || 0), 0);
            const uniqueIds = [...new Set(data.map(r => r.ID))];
            totalCount = uniqueIds.length;
            
            const allSource = { ...this.meusConvenios, ...this.outrosConvenios };
            uniqueIds.forEach(id => {
                const conv = allSource[id];
                if (conv) {
                    tE += (parseFloat(conv.audit?.valorEstimadoReal || conv.VALOR_ESTIMADO) || 0);
                    if (this.getStatusLabel(conv) === 'Vigente') vigentesCount++;
                }
            });
        } else {
            tE = data.reduce((a, b) => a + (parseFloat(b.audit?.valorEstimadoReal || b.VALOR_ESTIMADO) || 0), 0);
            tL = data.reduce((a, b) => a + (parseFloat(b.LIQUIDADO) || 0), 0);
            totalCount = data.length;
            vigentesCount = data.filter(c => this.getStatusLabel(c) === 'Vigente').length;
        }

        const totalEl = document.getElementById('dash-total-convenios'), ativosEl = document.getElementById('dash-convenios-ativos'), valorEl = document.getElementById('dash-valor-total'), liqEl = document.getElementById('dash-valor-liquidado');
        const liqLabelEl = document.getElementById('dash-valor-liquidado-label');

        if (totalEl) totalEl.innerText = totalCount;
        if (ativosEl) ativosEl.innerText = vigentesCount;
        if (valorEl) valorEl.innerText = tE.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        if (liqEl) liqEl.innerText = tL.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        
        if (liqLabelEl) {
            liqLabelEl.innerText = this.currentView === 'consolidado' ? 'Valor Consolidado (R$)' : 'Valor Liquidado (R$)';
        }
    }

    formatDate(d) { if (!d || d === '-') return '-'; const p = d.split(' ')[0].split(/[\/-]/); return p[0].length === 4 ? `${p[2]}/${p[1]}/${p[0]}` : d; }
    parseDate(d) { if (!d || d === '-') return null; const p = d.split(' ')[0].split(/[\/-]/); return p[0].length === 4 ? new Date(p[0], p[1]-1, p[2]) : new Date(p[2], p[1]-1, p[0]); }
}
