// Funções e lógica para o dashboard de convênios SIRCONV
import { sendMessageToBackground, getCookie } from '../../common/utils.js';
import { iconSVG_28 } from '../../common/icon.js';

/**
 * Módulo Dashboard SIRCONV
 * Gerencia a extração, auditoria e exibição de dados de convênios.
 * Utiliza duas bases JSON persistidas: ativos (12h TTL) e inativos (Permanente).
 */
export class SirconvDashboardModule {
    constructor(config) {
        this.config = config;
        this.ui = window.SisPMG_UI;
        this.activeData = {}; // Convênios Ativos (Vigentes ou Vencidos) - Persistente 12h
        this.inactiveData = {}; // Convênios Inativos - Persistente Permanente
        this.advSearchIds = []; // IDs da última busca avançada (Volátil)
        this.currentView = 'meus'; // 'meus' ou 'adv'
        this.conveniosData = []; // Array derivado para exibição e ordenação
        this.filteredData = [];
        this.activeFilters = {}; 
        this.lastFiltros = { tipoBusca: 'ativos', tipo: 'todos', periodo: 'todos', manual: '', municipio: 'todos', includeCPE: false };
        this.isLoading = false;
        this.activeConvId = null;
        this.backgroundAuditQueue = [];
        this.isQueueProcessing = false;
        this.CACHE_TTL = 8 * 60 * 60 * 1000; // 8 horas para validade da auditoria profunda
        this.DATA_TTL_ACTIVE = 12 * 60 * 60 * 1000; // 12 horas para manutenção dos ativos
        this.STORAGE_KEY_ACTIVE = 'sirconv_active_data';
        this.STORAGE_KEY_INACTIVE = 'sirconv_inactive_data';
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
                this.activeData = response.value[this.STORAGE_KEY_ACTIVE] || {};
                this.inactiveData = response.value[this.STORAGE_KEY_INACTIVE] || {};
                
                const agora = Date.now();
                let mudou = false;
                // Manutenção de Ativos (12h TTL)
                for (const id in this.activeData) {
                    if (agora - (this.activeData[id].lastUpdate || 0) > this.DATA_TTL_ACTIVE) {
                        delete this.activeData[id];
                        mudou = true;
                    }
                }
                // Inativos são permanentes, sem manutenção de expiração.
                
                if (mudou) await this.savePersistentCache();
                this.refreshConveniosList();
            }
        } catch (e) { console.error("[Dashboard] Erro ao carregar Cache:", e); }
    }

    /**
     * Persiste as bases no storage.
     */
    async savePersistentCache() {
        try {
            const dataToSave = {};
            dataToSave[this.STORAGE_KEY_ACTIVE] = this.activeData;
            dataToSave[this.STORAGE_KEY_INACTIVE] = this.inactiveData;
            await sendMessageToBackground('setStorage', dataToSave);
        } catch (e) { console.error("[Dashboard] Erro ao salvar Cache:", e); }
    }

    /**
     * Sincroniza e agrega dados de um convênio à base persistente correta.
     */
    syncConvenio(id, newData, isMeus = false) {
        const idStr = String(id);
        const agora = Date.now();
        
        // Determinar se é Ativo (Vigente/Vencido) ou Inativo
        const statusLabel = this.getStatusLabel(newData);
        const isActive = statusLabel === 'Vigente' || statusLabel === 'Vencido' || newData.ATIVO === 'S';

        // Roteamento e Migração entre categorias se necessário
        if (isActive) {
            delete this.inactiveData[idStr];
            if (!this.activeData[idStr]) this.activeData[idStr] = { ID: idStr, audit: null, pendencias: [] };
        } else {
            delete this.activeData[idStr];
            if (!this.inactiveData[idStr]) this.inactiveData[idStr] = { ID: idStr, audit: null, pendencias: [] };
        }

        const entry = isActive ? this.activeData[idStr] : this.inactiveData[idStr];
        if (isMeus) entry.isMeus = true;
        
        // Agregação de campos
        for (const key in newData) {
            if (key === 'audit' && newData.audit) {
                entry.audit = newData.audit;
                entry.audit.timestamp = entry.audit.timestamp || agora;
            } else if (key !== 'pendencias' && key !== 'ID' && key !== 'lastUpdate') {
                entry[key] = newData[key];
            }
        }
        
        entry.lastUpdate = agora;

        // Recálculo de pendências se houver auditoria
        if (entry.audit) {
            entry.pendencias = this.analisarPendencias(entry.audit, this.lastFiltros, entry);
            const totalLiq = entry.audit.planoItens?.reduce((sum, p) => sum + (parseFloat(p.valorExecutado) || 0), 0);
            if (totalLiq > 0) entry.LIQUIDADO = totalLiq;
            if (entry.audit.vigenciaInfo?.dtInicio && (!entry.DTINICIAL || entry.DTINICIAL === '-')) {
                entry.DTINICIAL = entry.audit.vigenciaInfo.dtInicio;
            }
        }

        return entry;
    }

    refreshConveniosList() {
        const all = { ...this.activeData, ...this.inactiveData };
        if (this.currentView === 'meus') {
            this.conveniosData = Object.values(all).filter(c => c.isMeus);
        } else {
            this.conveniosData = Object.values(all).filter(c => this.advSearchIds.includes(c.ID));
        }
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
                            <button id="sispmg-dashboard-refresh" class="sispmg-dashboard-btn sispmg-dashboard-btn-primary">
                                <i class="fas fa-search"></i> Busca Avançada
                            </button>
                            <button id="sispmg-dashboard-close-global" class="sispmg-dashboard-btn sispmg-global-close">Fechar</button>
                        </div>
                    </div>

                    <div id="sispmg-dashboard-summary" class="sispmg-dashboard-summary">
                        <div class="sispmg-dashboard-card"><span class="sispmg-dashboard-card-value" id="dash-total-convenios">-</span><span class="sispmg-dashboard-card-label">Total de Convênios</span></div>
                        <div class="sispmg-dashboard-card"><span class="sispmg-dashboard-card-value" id="dash-convenios-ativos">-</span><span class="sispmg-dashboard-card-label">Vigentes</span></div>
                        <div class="sispmg-dashboard-card"><span class="sispmg-dashboard-card-value" id="dash-valor-total">-</span><span class="sispmg-dashboard-card-label">Valor Estimado (R$)</span></div>
                        <div class="sispmg-dashboard-card"><span class="sispmg-dashboard-card-value" id="dash-valor-liquidado">-</span><span class="sispmg-dashboard-card-label">Valor Liquidado (R$)</span></div>
                    </div>

                    <div class="sispmg-dashboard-table-container">
                        <table class="sispmg-dashboard-table" style="font-size: 13px;">
                            <thead>
                                <tr>
                                    <th data-col="id" style="text-align: left;"><div class="sispmg-th-content">Convênio <i class="fas fa-filter sispmg-filter-trigger"></i></div></th>
                                    <th data-col="numero_face" class="sispmg-hide-on-audit" style="text-align: left;"><div class="sispmg-th-content">Nº Face <i class="fas fa-filter sispmg-filter-trigger"></i></div></th>
                                    <th data-col="municipio" style="text-align: left;"><div class="sispmg-th-content">Município <i class="fas fa-filter sispmg-filter-trigger"></i></div></th>
                                    <th data-col="unidade" style="text-align: left;"><div class="sispmg-th-content">Unidade <i class="fas fa-filter sispmg-filter-trigger"></i></div></th>
                                    <th class="sispmg-hide-on-audit" style="text-align: left;">Vigência (Início/Fim)</th>
                                    <th class="sispmg-hide-on-audit" style="text-align: center;">Meses (Ex/Tt)</th>
                                    <th class="sispmg-hide-on-audit" style="text-align: right;">Estimado (R$)</th>
                                    <th class="sispmg-hide-on-audit" style="text-align: right;">Liquidado (R$)</th>
                                    <th class="sispmg-hide-on-audit" style="text-align: right;">Média Prev.</th>
                                    <th class="sispmg-hide-on-audit" style="text-align: right;">Média Real</th>
                                    <th class="sispmg-hide-on-audit" style="text-align: center;">%</th>
                                    <th data-col="status" style="text-align: center;"><div class="sispmg-th-content" style="justify-content: center;">Situação <i class="fas fa-filter sispmg-filter-trigger"></i></div></th>
                                    <th style="text-align: center;">Pendências</th>
                                </tr>
                            </thead>
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
            const layout = document.getElementById('sispmg-dashboard-layout');
            if (layout && (layout.classList.contains('audit-active') || layout.classList.contains('filter-active'))) {
                this.closeSidebar();
            } else {
                this.closeAllFilterDropdowns();
                overlay.remove();
                document.body.style.overflow = '';
            }
        };

        modalContainer.querySelector('#sispmg-dashboard-refresh').onclick = () => this.showFilterSidebar();

        modalContainer.querySelectorAll('.sispmg-filter-trigger').forEach(trigger => {
            trigger.onclick = (e) => { e.stopPropagation(); this.toggleFilterDropdown(trigger, trigger.closest('th').dataset.col); };
        });

        overlay.onclick = (e) => { if (e.target === overlay) this.closeAllFilterDropdowns(); };
        modalContainer.onclick = () => this.closeAllFilterDropdowns();

        this.fetchConveniosData({ tipoBusca: 'ativos' });
    }

    closeSidebar() {
        const layout = document.getElementById('sispmg-dashboard-layout');
        const sidebar = document.getElementById('sispmg-dashboard-sidebar');
        const globalClose = document.getElementById('sispmg-dashboard-close-global');
        const actionBtn = document.getElementById('sispmg-dashboard-action-btn');
        if (layout && sidebar) {
            sidebar.classList.remove('active');
            layout.classList.remove('audit-active', 'filter-active');
            this.activeConvId = null;
            if (globalClose) globalClose.style.setProperty('display', 'inline-flex', 'important');
            if (actionBtn) actionBtn.style.setProperty('display', 'inline-flex', 'important');
            this.renderDashboard(true);
        }
    }

    updateBackgroundStatus(isActive, message = "") {
        const statusEl = document.getElementById('sispmg-dashboard-bg-status');
        if (!statusEl) return;

        statusEl.style.display = isActive ? 'flex' : 'none';
        if (isActive) {
            statusEl.querySelector('span').innerText = message;
        }
    }

    showFilterSidebar() {
        const layout = document.getElementById('sispmg-dashboard-layout'), sidebar = document.getElementById('sispmg-dashboard-sidebar');
        if (!layout || !sidebar) return;
        layout.classList.remove('audit-active'); layout.classList.add('filter-active'); sidebar.classList.add('active');
        
        const globalClose = document.getElementById('sispmg-dashboard-close-global');
        if (globalClose) globalClose.style.setProperty('display', 'none', 'important');

        const municipios = [...new Set(this.conveniosData.map(c => this.getMunicipioClean(c.CONCEDENTE)))].sort();

        sidebar.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; padding: 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #b3a368; padding: 15px 20px;">
                    <h2 style="color: #574e2d; font-size: 18px; margin: 0;"><i class="fas fa-filter"></i> Busca Avançada</h2>
                    <button id="sispmg-close-sidebar-btn" class="sispmg-dashboard-btn sispmg-global-close" style="background-color: #dc3545 !important; color: white !important;">Fechar</button>
                </div>
                <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 15px; padding: 20px; overflow-y: auto;">
                    <div style="background: #fdfaf6; border: 1px solid #e8dfbf; border-radius: 6px; padding: 12px; font-size: 12px; color: #574e2d; line-height: 1.4; margin-bottom: 5px;">
                        <i class="fas fa-info-circle" style="color: #b3a368;"></i> Esta é uma <strong>Busca Profunda</strong> que verifica todos os convênios através dos códigos dos concedentes. Permite rastrear todo o histórico, incluindo convênios firmados com outras unidades.
                    </div>

                    <div>
                        <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 13px;">Tipo de Busca:</label>
                        <select id="sispmg-dashboard-tipo-busca" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #dcd3c5; background: #fff;">
                            <option value="ativos" ${this.lastFiltros?.tipoBusca === 'ativos' ? 'selected' : ''}>Convênios Ativos</option>
                            <option value="todos" ${this.lastFiltros?.tipoBusca === 'todos' ? 'selected' : ''}>Todos</option>
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
                        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; color: #dc3545;">
                            <input type="checkbox" id="sispmg-clear-memory">
                            Limpar memória (Ativos e Inativos)
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
            const clearMemory = sidebar.querySelector('#sispmg-clear-memory').checked;
            if (clearMemory) {
                if (confirm("Isso apagará todo o histórico de convênios salvos localmente. Continuar?")) {
                    this.activeData = {};
                    this.inactiveData = {};
                    await sendMessageToBackground('removeStorage', { keys: [this.STORAGE_KEY_ACTIVE, this.STORAGE_KEY_INACTIVE] });
                } else {
                    return;
                }
            }

            const filtros = {
                tipoBusca: sidebar.querySelector('#sispmg-dashboard-tipo-busca').value,
                municipio: sidebar.querySelector('#sispmg-filter-municipio').value,
                includeCanceled: sidebar.querySelector('#sispmg-include-canceled').checked,
                includeCPE: sidebar.querySelector('#sispmg-include-cpe').checked
            };
            
            this.currentView = filtros.tipoBusca === 'todos' ? 'adv' : 'meus';
            if (this.currentView === 'adv') this.advSearchIds = []; 
            
            sidebar.classList.remove('active'); layout.classList.remove('filter-active');
            if (globalClose) globalClose.style.setProperty('display', 'inline-flex', 'important');
            this.fetchConveniosData(filtros);
        };
    }

    async fetchConveniosData(filtrosInput = null) {
        if (this.isLoading) return;
        if (filtrosInput && typeof filtrosInput === 'object') this.lastFiltros = { ...this.lastFiltros, ...filtrosInput };
        
        const { tipoBusca, municipio, includeCanceled } = this.lastFiltros;
        this.isLoading = true;
        if (this.ui) this.ui.showLoader(tipoBusca === 'todos' ? 'Iniciando varredura profunda de concedentes...' : 'Carregando seus convênios ativos...');

        try {
            let list = [];
            if (tipoBusca === 'ativos') {
                const pesquisa = JSON.stringify({ preposto: "", numeroConvenio: "", numeroFace: "", status: "" });
                const res = await fetch(`https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/convenio/meus-convenios?pesquisa=${encodeURIComponent(pesquisa)}`);
                const data = await res.json();
                if (data?.convenios) list = data.convenios;
            } else {
                list = await this.fetchAllConveniosFromConcedentes(municipio);
            }

            // Filtrar cancelados se solicitado
            if (!includeCanceled) {
                list = list.filter(c => {
                    // Verifica status textual extraído da tag .ne (Busca Avançada)
                    if (c.STATUS_TEXTO) {
                        return !c.STATUS_TEXTO.toLowerCase().includes('cancelado');
                    }
                    // Fallback para ATIVO='S' (Meus Convênios)
                    return String(c.ATIVO).toUpperCase() === 'S';
                });
            }

            if (tipoBusca === 'ativos') {
                list.forEach(c => this.syncConvenio(c.ID, c, true));
            } else {
                this.advSearchIds = list.map(r => String(r.ID));
                list.forEach(r => this.syncConvenio(r.ID, r));
            }
            
            const all = { ...this.activeData, ...this.inactiveData };
            for (const id in all) { if (all[id].audit) all[id].pendencias = this.analisarPendencias(all[id].audit, this.lastFiltros, all[id]); }
            
            await this.savePersistentCache();
            this.refreshConveniosList();
            this.applyFilters();
            
            const allToAudit = this.conveniosData.filter(c => {
                const entry = this.activeData[c.ID] || this.inactiveData[c.ID];
                return !entry?.audit || (Date.now() - (entry.audit.timestamp || 0) > this.CACHE_TTL);
            });
            
            if (this.ui) this.ui.hideLoader();
            this.backgroundAuditQueue = this.sortConvenios(allToAudit).map(c => c.ID);
            this.processBackgroundQueue();
        } catch (error) { 
            console.error("Erro Dashboard:", error); 
            if (this.ui) this.ui.hideLoader();
        } finally { 
            this.isLoading = false; 
        }
    }

    async fetchAllConveniosFromConcedentes(municipioFiltro = 'todos') {
        const links = document.querySelectorAll('a[href*="concedente/view?id="]');
        const cMap = new Map();
        links.forEach(l => {
            const m = l.href.match(/id=(\d+)/);
            if (m) {
                const n = l.innerText.trim(), mc = this.getMunicipioClean(n);
                if (municipioFiltro === 'todos' || mc === municipioFiltro) cMap.set(m[1], n);
            }
        });
        const concedentes = Array.from(cMap).map(([id, nome]) => ({ id, nome }));
        const resultados = [];
        const includeCPE = this.lastFiltros?.includeCPE;

        if (this.ui) this.ui.showLoader(`Localizando convênios em ${concedentes.length} concedentes...`);
        this.updateBackgroundStatus(true, `Busca: 0/${concedentes.length}`);

        for (let i = 0; i < concedentes.length; i++) {
            const c = concedentes[i];
            if (this.ui) this.ui.updateLoaderMessage(`Extraindo ${i + 1}/${concedentes.length}: ${c.nome}`);
            this.updateBackgroundStatus(true, `Busca: ${i + 1}/${concedentes.length}`);

            try {
                const resH = await fetch(`https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/concedente/view?id=${c.id}`);
                const hTxt = await resH.text(), doc = new DOMParser().parseFromString(hTxt, 'text/html');
                const nReal = doc.querySelector('.barra.item h2')?.innerText.trim() || c.nome;
                const targetH = Array.from(doc.querySelectorAll('h2')).find(h => h.textContent.includes('Convênios firmados'));
                if (targetH?.parentElement) {
                    const items = targetH.parentElement.querySelectorAll('a.item.flex-linha');
                    for (const item of items) {
                        const lIdM = item.href.match(/id=(\d+)/);
                        if (!lIdM) continue;
                        let cod = lIdM[1], face = '', val = '0', uni = '-', vigFim = '-', st = 'S', dtIni = '-';
                        
                        // Extração do status textual
                        const statusTexto = item.querySelector('.flex-coluna.tam-g .ne')?.innerText.trim() || '';
                        const isInactive = statusTexto.toLowerCase().includes('cancelado') || statusTexto.toLowerCase().includes('finalizado');
                        if (isInactive) st = 'N';

                        item.querySelectorAll('.flex-coluna').forEach(col => {
                            const lblEl = col.querySelector('.tc.menor'), lbl = lblEl?.innerText.trim() || '', v = col.innerText.replace(lbl, '').trim();
                            if (lbl.includes('Código') && !cod) cod = v; 
                            else if (lbl.includes('face')) face = v; 
                            else if (lbl.includes('Valor')) val = v; 
                            else if (lbl.includes('Unidade')) uni = v; 
                            else if (lbl.includes('Término')) vigFim = v; 
                            else if (lbl.includes('Início')) dtIni = v;
                        });

                        // Filtro de CPE
                        if (!includeCPE && uni.toUpperCase().includes('CPE')) continue;

                        resultados.push({ 
                            ID: cod, 
                            NUMERO_FACE: face || '-', 
                            CONCEDENTE: nReal, 
                            UNI_NOME_PRINCIPAL: uni, 
                            DTINICIAL: dtIni, 
                            DTFINAL: vigFim, 
                            VALOR_ESTIMADO: parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0, 
                            ATIVO: st,
                            STATUS_TEXTO: statusTexto,
                            VENCIDO: (vigFim !== '-' && this.parseDate(vigFim) < new Date() ? '1' : '0') 
                        });
                    }
                }
            } catch (e) { console.error(e); }
            await new Promise(r => setTimeout(r, 50));
        }
        this.updateBackgroundStatus(false);
        return resultados;
    }

    async processBackgroundQueue() {
        if (this.isQueueProcessing || this.backgroundAuditQueue.length === 0) return;
        this.isQueueProcessing = true;
        const total = this.backgroundAuditQueue.length;
        
        // Ativar status informativo
        this.updateBackgroundStatus(true, `Auditoria: 0/${total}`);

        let processed = 0;
        while (this.backgroundAuditQueue.length > 0) {
            const convId = this.backgroundAuditQueue.shift();
            try {
                const auditData = await this.performDeepAudit(convId);
                if (auditData) {
                    this.syncConvenio(convId, { audit: auditData });
                    const row = document.querySelector(`.sispmg-clickable-row[onclick*="'${convId}'"]`);
                    if (row) {
                        const tempDiv = document.createElement('tbody');
                        const entry = this.activeData[convId] || this.inactiveData[convId];
                        tempDiv.innerHTML = this.renderRowHtml(entry);
                        row.replaceWith(tempDiv.firstChild);
                    }
                }
            } catch (e) { console.error(e); }
            processed++;
            this.updateBackgroundStatus(true, `Auditoria: ${processed}/${total}`);
            if (processed % 5 === 0) { this.updateSummaryCards(); await this.savePersistentCache(); }
            await new Promise(r => setTimeout(r, 600));
        }
        this.isQueueProcessing = false;
        this.updateBackgroundStatus(false);
        this.updateSummaryCards();
        await this.savePersistentCache();
    }

    async performDeepAudit(convId, ignoreCache = false) {
        const entry = this.activeData[String(convId)] || this.inactiveData[String(convId)];
        if (!ignoreCache && entry?.audit && (Date.now() - (entry.audit.timestamp || 0) < this.CACHE_TTL)) return entry.audit;

        try {
            const res = await fetch(`https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/convenio/view?id=${convId}`);
            const html = await res.text(), doc = new DOMParser().parseFromString(html, 'text/html');
            
            const historico = [];
            doc.querySelectorAll('#historico .item').forEach(row => {
                const dEl = row.querySelector('.tc');
                if (dEl) historico.push({ data: dEl.innerText.trim(), log: row.innerText.replace(dEl.innerText, '').trim().replace(/\n\s*\n/g, '<br>').replace(/\n/g, ' ') });
            });

            const statusLabel = this.getStatusLabel(entry || {});
            if (statusLabel === 'Inativo' && entry?.audit?.historico) {
                if (JSON.stringify(entry.audit.historico) === JSON.stringify(historico)) return entry.audit;
            }

            let planoItens = [];
            try {
                const token = getCookie('tokiuz');
                const pRes = await sendMessageToBackground('fetchConvenioPlano', { convenioId: convId, token });
                if (pRes?.success && pRes.data?.planos) {
                    planoItens = pRes.data.planos.map(p => ({ naturezaId: p.NATUREZA_ID, naturezaItem: p.NATUREZA_ITEM, nome: `${p.ITEM} - ${p.NATUREZA_ITEM}`, valorEstimado: parseFloat(p.VALOR) || 0, valorExecutado: 0 }));
                }
            } catch (e) { console.error(e); }

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
                let dIdM = linkRow.getAttribute('onclick')?.match(/detalheCronograma-(\d+)/);
                if (!dIdM || processedIds.has(dIdM[1])) return;
                processedIds.add(dIdM[1]);
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
                cronogramas.push({ mesTexto, valorPrevisto: vPrev, valorExecutado: vExec, prazoLimite: pLim, dataLiquidado: dLiq, status });
            });

            const vTotalEst = planoItens.reduce((sum, p) => sum + p.valorEstimado, 0);
            return { cronogramas, planoItens, historico, timestamp: Date.now(), lastUpdate: new Date().toLocaleString(), valorEstimadoReal: vTotalEst > 0 ? vTotalEst : (parseFloat(entry?.VALOR_ESTIMADO) || 0) };

        } catch (e) { console.error(e); return null; }
    }

    analisarPendencias(audit, filtros = { tipo: 'todos', periodo: 'todos', manual: '' }, conv = null) {
        const pendencias = [], hoje = new Date(), anoAtual = hoje.getFullYear(), mesAtual = hoje.getMonth();
        let filtroMes = null, filtroAno = null;
        if (filtros.periodo === 'ano_atual') filtroAno = anoAtual;
        else if (filtros.periodo === 'mes_anterior') { const dAnt = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1); filtroMes = dAnt.getMonth(); filtroAno = dAnt.getFullYear(); }
        else if (filtros.periodo === 'mes_atual') { filtroMes = mesAtual; filtroAno = anoAtual; }
        else if (filtros.periodo === 'manual' && filtros.manual) { const partes = filtros.manual.split(' '); if (partes.length === 2) { const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']; filtroMes = meses.indexOf(partes[0].toUpperCase()); filtroAno = parseInt(partes[1]); } }
        const mP = { 'JAN': 0, 'FEV': 1, 'MAR': 2, 'ABR': 3, 'MAI': 4, 'JUN': 5, 'JUL': 6, 'AGO': 7, 'SET': 8, 'OUT': 9, 'NOV': 10, 'DEZ': 11, 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };
        const isNoPeriodo = (mesTexto) => { if (filtros.periodo === 'todos') return true; if (!mesTexto) return false; const p = mesTexto.toUpperCase().split(' '); return mP[p[0]] === filtroMes && parseInt(p[1]) === filtroAno; };
        let duracaoMeses = 0, mesesDecorridos = 0;
        let d1 = this.parseDate(conv?.DTINICIAL), d2 = this.parseDate(conv?.DTFINAL);
        if (!d1 && audit.cronogramas?.length > 0) {
            const s = [...audit.cronogramas].sort((a, b) => { const pa = a.mesTexto.split(' '), pb = b.mesTexto.split(' '); return (parseInt(pa[1]) - parseInt(pb[1])) || (mP[pa[0]] - mP[pb[0]]); });
            const p1 = s[0].mesTexto.split(' '); d1 = new Date(parseInt(p1[1]), mP[p1[0]], 1);
        }
        if (d1 && d2) {
            duracaoMeses = Math.max(1, (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()) + 1);
            mesesDecorridos = Math.min(duracaoMeses, Math.max(0, (hoje.getFullYear() - d1.getFullYear()) * 12 + (hoje.getMonth() - d1.getMonth())) + 1);
            audit.vigenciaInfo = { duracaoMeses, mesesDecorridos, mesesFaltantes: Math.max(0, duracaoMeses - mesesDecorridos), dtInicio: d1.toISOString().split('T')[0], dtFim: d2.toISOString().split('T')[0] };
        }
        if (filtros.tipo === 'todos' || filtros.tipo === 'excesso_valor') { audit.cronogramas?.forEach(c => { if (isNoPeriodo(c.mesTexto) && c.valorExecutado > c.valorPrevisto + 0.01) pendencias.push({ tipo: 'excesso_valor_mensal', msg: `Excesso em ${c.mesTexto}` }); }); }
        if (filtros.tipo === 'todos' || filtros.tipo === 'atraso_liquidacao') { audit.cronogramas?.forEach(c => { if (isNoPeriodo(c.mesTexto) && c.prazoLimite && c.prazoLimite !== '-') { const pt = c.prazoLimite.split('/'); if (new Date(pt[2], pt[1]-1, pt[0]) < hoje && c.status.includes('Aguardando')) pendencias.push({ tipo: 'atraso_liquidacao', msg: `Atraso: ${c.mesTexto}` }); } }); }
        if (filtros.tipo === 'todos' || filtros.tipo === 'excesso_valor') { audit.planoItens?.forEach(p => { if (p.valorExecutado > p.valorEstimado + 0.01) pendencias.push({ tipo: 'excesso_valor_natureza', nivel: 'critico', msg: `Excesso: ${p.nome}` }); else if (duracaoMeses > 0 && p.valorExecutado > (p.valorEstimado / duracaoMeses) * mesesDecorridos * 1.3) pendencias.push({ tipo: 'excesso_valor_natureza', nivel: 'alerta', msg: `Consumo acelerado: ${p.nome}` }); }); }
        return pendencias;
    }

    async loadAuditData(convId) {
        this.activeConvId = convId;
        const entry = this.activeData[String(convId)] || this.inactiveData[String(convId)];
        if (!entry) return;
        if (entry.audit && (Date.now() - (entry.audit.timestamp || 0) < this.CACHE_TTL)) { this.renderAuditSidebar(entry); return; }
        if (this.ui) this.ui.showLoader(`Buscando detalhes do convênio ${convId}...`);
        try {
            const auditData = await this.performDeepAudit(convId);
            if (auditData) {
                this.syncConvenio(convId, { audit: auditData });
                const updated = this.activeData[convId] || this.inactiveData[convId];
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
        const actionBtn = document.getElementById('sispmg-dashboard-action-btn');
        if (actionBtn) actionBtn.style.setProperty('display', 'none', 'important');

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
                    <button id="sispmg-close-audit-btn" class="sispmg-dashboard-btn sispmg-global-close" style="background-color: #dc3545 !important; color: white !important;">Fechar</button>
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
                                const prog = p.valorEstimado > 0 ? ((p.valorExecutado / p.valorEstimado) * 100).toFixed(1) : 0;
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
                            <thead><tr><th style="text-align: left;">Mês</th><th style="text-align: right;">Previsto (R$)</th><th style="text-align: right;">Executado (R$)</th><th style="text-align: center;">%</th><th style="text-align: center;">Progresso</th><th style="text-align: left;">Prazo Limite</th><th style="text-align: left;">Data Liq.</th><th style="text-align: center;">Status</th></tr></thead>
                            <tbody>${audit.cronogramas?.length > 0 ? audit.cronogramas.map(c => {
                                const perc = c.valorPrevisto > 0 ? ((c.valorExecutado / c.valorPrevisto) * 100).toFixed(1) : (c.valorExecutado > 0 ? 100 : 0);
                                const isEx = c.valorExecutado > c.valorPrevisto, isCo = parseFloat(perc) >= 100, corC = c.valorExecutado > 0 ? (isEx ? '#dc3545' : '#155724') : 'inherit', corP = isEx ? '#dc3545' : (isCo ? '#b3a368' : '#28a745');
                                return `<tr><td style="white-space: nowrap;">${c.mesTexto || "-"}</td><td style="text-align: right;">${(c.valorPrevisto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="text-align: right; font-weight: 600; color: ${corC};">${(c.valorExecutado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="text-align: center; font-weight: 600; color: ${corC};">${perc}%</td><td style="text-align: center;"><div style="background: #eee; width: 60px; border-radius: 4px; overflow: hidden; height: 10px; display: inline-block; vertical-align: middle;"><div style="background: ${corP}; height: 100%; width: ${parseFloat(perc) > 100 ? 100 : perc}%;"></div></div></td><td>${c.prazoLimite || "-"}</td><td>${c.dataLiquidado || "-"}</td><td style="text-align: center;"><span class="sispmg-status-badge ${c.status.includes('Liquidado') ? 'sispmg-status-vigente' : 'sispmg-status-outros'}">${c.status || "Pendente"}</span></td></tr>`;
                            }).join('') : '<tr><td colspan="8" style="text-align: center;">Nenhum registro extraído.</td></tr>'}</tbody>
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
        this.closeAllFilterDropdowns(trigger);
        let dropdown = document.getElementById(`filter-dropdown-${colId}`);
        if (dropdown) { dropdown.classList.toggle('show'); if (dropdown.classList.contains('show')) this.positionDropdown(trigger, dropdown); return; }
        dropdown = document.createElement('div'); dropdown.id = `filter-dropdown-${colId}`; dropdown.className = 'sispmg-filter-dropdown show';
        let values = [];
        if (colId === 'municipio') values = [...new Set(this.conveniosData.map(c => this.getMunicipioClean(c.CONCEDENTE)))];
        else if (colId === 'unidade') values = [...new Set(this.conveniosData.map(c => this.cleanUnidade(c.UNI_NOME_PRINCIPAL)))];
        else if (colId === 'status') values = ['Vigente', 'Vencido', 'Inativo'];
        else if (colId === 'id') values = [...new Set(this.conveniosData.map(c => c.ID))];
        else if (colId === 'numero_face') values = [...new Set(this.conveniosData.map(c => c.NUMERO_FACE || "-"))];
        values.sort(); const selected = this.activeFilters[colId] || [];
        dropdown.innerHTML = `<div class="sispmg-filter-search"><input type="text" placeholder="Pesquisar..." id="search-${colId}"></div><div class="sispmg-filter-list" id="list-${colId}">${values.map(val => `<label class="sispmg-filter-item"><input type="checkbox" value="${val}" ${selected.includes(val) ? 'checked' : ''}><span>${val}</span></label>`).join('')}</div><div class="sispmg-filter-actions"><button class="sispmg-filter-btn clear">Limpar</button><button class="sispmg-filter-btn apply">Aplicar</button></div>`;
        document.getElementById('sispmg-plus-container').appendChild(dropdown);
        this.positionDropdown(trigger, dropdown);
        dropdown.querySelector('.apply').onclick = () => {
            const checked = Array.from(dropdown.querySelectorAll('input:checked')).map(i => i.value);
            if (checked.length > 0) { this.activeFilters[colId] = checked; trigger.classList.add('active'); } else { delete this.activeFilters[colId]; trigger.classList.remove('active'); }
            this.applyFilters(); this.closeAllFilterDropdowns();
        };
        dropdown.querySelector('.clear').onclick = () => { delete this.activeFilters[colId]; trigger.classList.remove('active'); this.applyFilters(); this.closeAllFilterDropdowns(); };
        const searchInput = dropdown.querySelector('input');
        searchInput.oninput = () => { const term = searchInput.value.toLowerCase(); dropdown.querySelectorAll('.sispmg-filter-item').forEach(item => item.style.display = item.textContent.toLowerCase().includes(term) ? 'flex' : 'none'); };
    }

    positionDropdown(trigger, dropdown) { const rect = trigger.getBoundingClientRect(); dropdown.style.top = `${rect.bottom + 5}px`; dropdown.style.left = `${Math.max(10, rect.left - 200)}px`; }
    closeAllFilterDropdowns() { document.querySelectorAll('.sispmg-filter-dropdown').forEach(d => d.classList.remove('show')); }
    cleanUnidade(u) { if (!u) return "-"; return u.replace(/24\s*CIA\s*PM\s*IND\s*815\s*RPM/i, '24 CIA PM IND').replace(/\s*\/15\s*RPM/gi, '').trim(); }
    sortConvenios(data) { 
        const p = { 'EM15RPM': 1, '19 BPM': 2, '44 BPM': 3, '70 BPM': 4, '24 CIA PM IND': 5 };
        return data.sort((a, b) => { const uA = this.cleanUnidade(a.UNI_NOME_PRINCIPAL), uB = this.cleanUnidade(b.UNI_NOME_PRINCIPAL), pA = p[uA] || 999, pB = p[uB] || 999; if (pA !== pB) return pA - pB; return this.getMunicipioClean(a.CONCEDENTE).localeCompare(this.getMunicipioClean(b.CONCEDENTE), 'pt-BR'); });
    }
    applyFilters() {
        let filtered = this.conveniosData.filter(conv => {
            for (const colId in this.activeFilters) {
                const sel = this.activeFilters[colId];
                let val = (colId === 'municipio' ? this.getMunicipioClean(conv.CONCEDENTE) : (colId === 'unidade' ? this.cleanUnidade(conv.UNI_NOME_PRINCIPAL) : (colId === 'status' ? this.getStatusLabel(conv) : conv[colId.toUpperCase()])));
                if (!sel.includes(String(val))) return false;
            }
            return true;
        });
        this.filteredData = this.sortConvenios(filtered); this.renderDashboard(true);
    }
    renderDashboard(isFiltered = false) {
        const tbody = document.getElementById('sispmg-dashboard-tbody'); if (!tbody) return;
        let data = isFiltered ? this.filteredData : this.sortConvenios([...this.conveniosData]);
        if (data.length === 0) { tbody.innerHTML = `<tr><td colspan="13" style="text-align: center; padding: 40px;">Nenhum convênio encontrado.</td></tr>`; return; }
        this.updateSummaryCards();
        tbody.innerHTML = data.map(conv => this.renderRowHtml(conv)).join('');
        window.SisPMG_SirconvDashboard = this;
    }
    renderRowHtml(conv) {
        const statusLabel = this.getStatusLabel(conv), isAudited = conv.ID === this.activeConvId;
        const vEst = parseFloat(conv.audit?.valorEstimadoReal || conv.VALOR_ESTIMADO) || 0, vLiq = parseFloat(conv.LIQUIDADO) || 0, prog = vEst > 0 ? ((vLiq / vEst) * 100).toFixed(1) : 0;
        const colorT = vLiq > 0 ? (parseFloat(prog) > 100 ? '#dc3545' : '#155724') : '#666';
        let dur = 0, dec = 0, fal = 0, mPrev = 0, mReal = 0, rowStyle = '';
        if (conv.audit?.vigenciaInfo) {
            const v = conv.audit.vigenciaInfo; dur = v.duracaoMeses; dec = v.mesesDecorridos; fal = v.mesesFaltantes;
            mPrev = vEst / (dur || 1); mReal = vLiq / (dec || 1);
            if (statusLabel === 'Vigente') { if (fal <= 3) rowStyle = 'background-color: #fffde7 !important; border-left: 5px solid #fdd835;'; if (fal <= 1) rowStyle = 'background-color: #fff3e0 !important; border-left: 5px solid #ff9800;'; }
        }
        if (statusLabel === 'Vencido') rowStyle = 'background-color: #fce8e8 !important; border-left: 5px solid #dc3545;';
        const p = conv.pendencias || [];
        const hA = p.some(x => x.tipo === 'atraso_liquidacao'), hEM = p.some(x => x.tipo === 'excesso_valor_mensal'), hEN = p.filter(x => x.tipo === 'excesso_valor_natureza');
        const isC = hEN.some(x => x.nivel === 'critico'), isAl = !isC && hEN.some(x => x.nivel === 'alerta');
        return `<tr class="sispmg-clickable-row ${isAudited ? 'sispmg-row-audited' : ''}" style="${rowStyle}" onclick="window.SisPMG_SirconvDashboard.loadAuditData('${conv.ID}')">
            <td style="text-align: left;"><strong>${conv.ID}</strong></td><td class="sispmg-hide-on-audit" style="text-align: left;">${conv.NUMERO_FACE || '-'}</td><td style="text-align: left;">${this.getMunicipioClean(conv.CONCEDENTE)}</td><td style="text-align: left;">${this.cleanUnidade(conv.UNI_NOME_PRINCIPAL)}</td><td class="sispmg-hide-on-audit" style="text-align: left; font-size: 12px;">${this.formatDate(conv.DTINICIAL)}<br>${this.formatDate(conv.DTFINAL)}</td><td class="sispmg-hide-on-audit" style="text-align: center;">${dec}/${dur}</td><td class="sispmg-hide-on-audit" style="text-align: right;">${vEst.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td class="sispmg-hide-on-audit" style="text-align: right; font-weight: bold; color: ${colorT};">${vLiq.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td class="sispmg-hide-on-audit" style="text-align: right; color: #666;">${mPrev.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td class="sispmg-hide-on-audit" style="text-align: right; font-weight: bold; color: #155724;">${mReal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td class="sispmg-hide-on-audit" style="text-align: center; font-weight: bold; color: ${colorT};">${prog}%</td><td style="text-align: center;"><span class="sispmg-status-badge ${statusLabel === 'Vigente' ? 'sispmg-status-vigente' : 'sispmg-status-outros'}">${statusLabel}</span></td>
            <td style="text-align: center;"><div style="display: flex; gap: 8px; justify-content: center; width: 60px; margin: 0 auto;"><div style="width: 14px; text-align: center;">${hA ? '<i class="fas fa-clock" title="Atraso Liquidação" style="color: #dc3545;"></i>' : ''}</div><div style="width: 14px; text-align: center;">${hEM ? '<i class="fas fa-chart-line" title="Excesso Mensal" style="color: #dc3545;"></i>' : ''}</div><div style="width: 14px; text-align: center;">${isC ? '<i class="fas fa-exclamation-triangle" title="Excesso Crítico" style="color: #dc3545;"></i>' : (isAl ? '<i class="fas fa-exclamation-triangle" title="Consumo Acelerado" style="color: #9c27b0;"></i>' : '')}</div></div></td></tr>`;
    }
    updateSummaryCards() {
        const data = this.filteredData.length > 0 ? this.filteredData : this.conveniosData;
        const tE = data.reduce((a, b) => a + (parseFloat(b.audit?.valorEstimadoReal || b.VALOR_ESTIMADO) || 0), 0);
        const tL = data.reduce((a, b) => a + (parseFloat(b.LIQUIDADO) || 0), 0);
        const totalEl = document.getElementById('dash-total-convenios'), ativosEl = document.getElementById('dash-convenios-ativos'), valorEl = document.getElementById('dash-valor-total'), liqEl = document.getElementById('dash-valor-liquidado');
        if (totalEl) totalEl.innerText = data.length;
        if (ativosEl) ativosEl.innerText = data.filter(c => this.getStatusLabel(c) === 'Vigente').length;
        if (valorEl) valorEl.innerText = tE.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        if (liqEl) liqEl.innerText = tL.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    }
    formatDate(d) { if (!d || d === '-') return '-'; const p = d.split(' ')[0].split(/[\/-]/); return p[0].length === 4 ? `${p[2]}/${p[1]}/${p[0]}` : d; }
    parseDate(d) { if (!d || d === '-') return null; const p = d.split(' ')[0].split(/[\/-]/); return p[0].length === 4 ? new Date(p[0], p[1]-1, p[2]) : new Date(p[2], p[1]-1, p[0]); }
}
