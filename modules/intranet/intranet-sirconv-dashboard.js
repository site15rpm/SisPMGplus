// Funções e lógica para o dashboard de convênios SIRCONV
import { sendMessageToBackground, getCookie } from '../../common/utils.js';
import { iconSVG_28 } from '../../common/icon.js';

/**
 * Módulo Dashboard SIRCONV
 * Gerencia a extração, auditoria e exibição de dados de convênios.
 * Utiliza uma base JSON centralizada (masterData) persistida no storage.
 */
export class SirconvDashboardModule {
    constructor(config) {
        this.config = config;
        this.ui = window.SisPMG_UI;
        this.masterData = {}; // Meus Convênios (Persistente)
        this.advSearchData = {}; // Busca Avançada (Volátil)
        this.currentView = 'meus'; // 'meus' ou 'adv'
        this.conveniosData = []; // Array derivado para exibição e ordenação
        this.filteredData = [];
        this.activeFilters = {}; 
        this.lastFiltros = { tipoBusca: 'ativos', tipo: 'todos', periodo: 'todos', manual: '', municipio: 'todos' };
        this.isLoading = false;
        this.activeConvId = null;
        this.backgroundAuditQueue = [];
        this.isQueueProcessing = false;
        this.CACHE_TTL = 8 * 60 * 60 * 1000; // 8 horas para validade da auditoria profunda
        this.DATA_TTL = 72 * 60 * 60 * 1000; // 72 horas para manutenção dos dados básicos no master
        this.STORAGE_KEY = 'sirconv_master_data';
        console.log("SirconvDashboardModule: Instância inicializada.");
    }

    async init() {
        if (this.ui) {
            await this.loadPersistentCache();
            this.ui.registerModule({ name: 'SIRCONV Dashboard', instance: this });
        }
    }

    /**
     * Carrega a base de dados master do storage local e realiza manutenção.
     */
    async loadPersistentCache() {
        try {
            const response = await sendMessageToBackground('getStorage', { keys: [this.STORAGE_KEY] });
            if (response && response.success && response.value?.[this.STORAGE_KEY]) {
                this.masterData = response.value[this.STORAGE_KEY];
                
                const agora = Date.now();
                let mudou = false;
                for (const id in this.masterData) {
                    if (agora - (this.masterData[id].lastUpdate || 0) > this.DATA_TTL) {
                        delete this.masterData[id];
                        mudou = true;
                    }
                }
                if (mudou) await this.savePersistentCache();
                console.log(`[Dashboard] Base Master carregada: ${Object.keys(this.masterData).length} convênios.`);
                this.refreshConveniosList();
            }
        } catch (e) { console.error("[Dashboard] Erro ao carregar Master Data:", e); }
    }

    /**
     * Persiste o masterData no storage.
     */
    async savePersistentCache() {
        try {
            const dataToSave = {};
            dataToSave[this.STORAGE_KEY] = this.masterData;
            await sendMessageToBackground('setStorage', dataToSave);
        } catch (e) { console.error("[Dashboard] Erro ao salvar Master Data:", e); }
    }

    /**
     * Sincroniza e agrega dados de um convênio à base master.
     */
    syncConvenio(id, newData) {
        const idStr = String(id);
        const agora = Date.now();
        const targetDb = this.currentView === 'meus' ? this.masterData : this.advSearchData;

        if (!targetDb[idStr]) {
            targetDb[idStr] = {
                ID: idStr,
                lastUpdate: agora,
                audit: null,
                pendencias: []
            };
        }

        const entry = targetDb[idStr];
        
        // Agregação de campos: Mescla preservando o que já existe
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
        const db = this.currentView === 'meus' ? this.masterData : this.advSearchData;
        this.conveniosData = Object.values(db);
    }

    showDashboard() {
        document.body.style.overflow = 'hidden';
        const container = document.getElementById('sispmg-plus-container');
        if (!container) return;

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
                            <button id="sispmg-dashboard-action-btn" class="sispmg-dashboard-btn sispmg-dashboard-btn-primary">
                                <i class="fas fa-sync-alt"></i> Recarregar
                            </button>
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
                document.getElementById('sispmg-dashboard-sidebar').classList.remove('active');
                layout.classList.remove('audit-active', 'filter-active');
                this.activeConvId = null;
                this.renderDashboard(true);
            } else {
                this.closeAllFilterDropdowns();
                overlay.remove();
                document.body.style.overflow = '';
            }
        };

        modalContainer.querySelector('#sispmg-dashboard-action-btn').onclick = async () => {
            if (this.isQueueProcessing) {
                this.backgroundAuditQueue = [];
                return;
            }
            if (confirm("Deseja realmente limpar a base master e recarregar seus convênios?")) {
                this.masterData = {};
                await sendMessageToBackground('removeStorage', { keys: [this.STORAGE_KEY] });
                this.fetchConveniosData('ativos');
            }
        };

        modalContainer.querySelector('#sispmg-dashboard-refresh').onclick = () => this.showFilterSidebar();

        modalContainer.querySelectorAll('.sispmg-filter-trigger').forEach(trigger => {
            trigger.onclick = (e) => { e.stopPropagation(); this.toggleFilterDropdown(trigger, trigger.closest('th').dataset.col); };
        });

        overlay.onclick = (e) => { if (e.target === overlay) this.closeAllFilterDropdowns(); };
        modalContainer.onclick = () => this.closeAllFilterDropdowns();

        this.fetchConveniosData('ativos');
    }

    updateBackgroundStatus(isActive, message = "") {
        const statusEl = document.getElementById('sispmg-dashboard-bg-status');
        const actionBtn = document.getElementById('sispmg-dashboard-action-btn');
        if (!statusEl || !actionBtn) return;

        statusEl.style.display = isActive ? 'flex' : 'none';
        if (isActive) {
            statusEl.querySelector('span').innerText = message;
            actionBtn.innerHTML = '<i class="fas fa-stop"></i> Parar';
            actionBtn.classList.add('sispmg-btn-stop');
        } else {
            actionBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Recarregar';
            actionBtn.classList.remove('sispmg-btn-stop');
        }
    }

    showFilterSidebar() {
        const layout = document.getElementById('sispmg-dashboard-layout'), sidebar = document.getElementById('sispmg-dashboard-sidebar');
        if (!layout || !sidebar) return;
        layout.classList.remove('audit-active'); layout.classList.add('filter-active'); sidebar.classList.add('active');
        
        // Ocultar botão fechar global para evitar duplicidade
        const globalClose = document.getElementById('sispmg-dashboard-close-global');
        if (globalClose) globalClose.style.display = 'none';

        const db = this.currentView === 'meus' ? this.masterData : this.advSearchData;
        const municipios = [...new Set(Object.values(db).map(c => this.getMunicipioClean(c.CONCEDENTE)))].sort();

        sidebar.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; padding: 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #b3a368; padding: 15px 20px;">
                    <h2 style="color: #574e2d; font-size: 18px; margin: 0;"><i class="fas fa-filter"></i> Busca Avançada</h2>
                    <button id="sispmg-close-sidebar-btn" class="sispmg-dashboard-btn sispmg-global-close">Fechar</button>
                </div>
                <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 20px; padding: 20px; overflow-y: auto;">
                    <div>
                        <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 13px;">Tipo de Busca:</label>
                        <select id="sispmg-dashboard-tipo-busca" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #dcd3c5; background: #fff;">
                            <option value="ativos" ${this.lastFiltros?.tipoBusca === 'ativos' ? 'selected' : ''}>Meus Convênios (Vigentes)</option>
                            <option value="todos" ${this.lastFiltros?.tipoBusca === 'todos' ? 'selected' : ''}>Todos os Convênios (Varredura de Concedentes)</option>
                        </select>
                    </div>

                    <div>
                        <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 13px;">Tipo de Pendência:</label>
                        <select id="sispmg-filter-tipo" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #dcd3c5; background: #fff;">
                            <option value="todos" ${this.lastFiltros?.tipo === 'todos' ? 'selected' : ''}>Todas as Pendências</option>
                            <option value="atraso_liquidacao" ${this.lastFiltros?.tipo === 'atraso_liquidacao' ? 'selected' : ''}>Atraso na Liquidação</option>
                            <option value="excesso_valor" ${this.lastFiltros?.tipo === 'excesso_valor' ? 'selected' : ''}>Excesso de Valor</option>
                        </select>
                    </div>

                    <div>
                        <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 13px;">Período de Referência:</label>
                        <select id="sispmg-filter-periodo" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #dcd3c5; background: #fff;">
                            <option value="todos" ${this.lastFiltros?.periodo === 'todos' ? 'selected' : ''}>Todos os Períodos</option>
                            <option value="ano_atual" ${this.lastFiltros?.periodo === 'ano_atual' ? 'selected' : ''}>Ano Atual</option>
                            <option value="mes_anterior" ${this.lastFiltros?.periodo === 'mes_anterior' ? 'selected' : ''}>Mês Anterior</option>
                            <option value="mes_atual" ${this.lastFiltros?.periodo === 'mes_atual' ? 'selected' : ''}>Mês Atual</option>
                            <option value="manual" ${this.lastFiltros?.periodo === 'manual' ? 'selected' : ''}>Digitar Mês/Ano</option>
                        </select>
                        <input type="text" id="sispmg-filter-manual" placeholder="JAN 2026" 
                               value="${this.lastFiltros?.manual || ''}"
                               style="display: ${this.lastFiltros?.periodo === 'manual' ? 'block' : 'none'}; width: 100%; margin-top: 10px; padding: 10px; border-radius: 6px; border: 1px solid #dcd3c5; text-transform: uppercase;">
                    </div>

                    <div>
                        <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 13px;">Município Específico:</label>
                        <select id="sispmg-filter-municipio" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #dcd3c5; background: #fff;">
                            <option value="todos">Todos os Municípios</option>
                            ${municipios.map(m => `<option value="${m}" ${this.lastFiltros?.municipio === m ? 'selected' : ''}>${m}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div style="padding: 20px; border-top: 1px solid #dcd3c5;">
                    <button id="sispmg-btn-start-audit" class="sispmg-dashboard-btn sispmg-dashboard-btn-primary" style="width: 100%; padding: 12px;">
                        <i class="fas fa-play"></i> Iniciar Busca
                    </button>
                </div>
            </div>
        `;

        sidebar.querySelector('#sispmg-close-sidebar-btn').onclick = () => {
            sidebar.classList.remove('active'); layout.classList.remove('filter-active');
            if (globalClose) globalClose.style.display = 'inline-flex';
        };

        const selectPeriodo = sidebar.querySelector('#sispmg-filter-periodo');
        const inputManual = sidebar.querySelector('#sispmg-filter-manual');
        selectPeriodo.onchange = () => { inputManual.style.display = selectPeriodo.value === 'manual' ? 'block' : 'none'; };

        sidebar.querySelector('#sispmg-btn-start-audit').onclick = () => {
            const filtros = {
                tipoBusca: sidebar.querySelector('#sispmg-dashboard-tipo-busca').value,
                tipo: sidebar.querySelector('#sispmg-filter-tipo').value,
                periodo: sidebar.querySelector('#sispmg-filter-periodo').value,
                manual: sidebar.querySelector('#sispmg-filter-manual').value.toUpperCase().trim(),
                municipio: sidebar.querySelector('#sispmg-filter-municipio').value
            };
            this.lastFiltros = filtros;
            
            // Alternar visualização e limpar dados temporários se for busca avançada
            this.currentView = filtros.tipoBusca === 'todos' ? 'adv' : 'meus';
            if (this.currentView === 'adv') this.advSearchData = {}; 
            
            const titleEl = document.getElementById('sispmg-dash-view-title');
            if (titleEl) titleEl.innerText = this.currentView === 'meus' ? '(Meus Convênios)' : '(Busca Avançada)';

            sidebar.classList.remove('active'); layout.classList.remove('filter-active');
            this.fetchConveniosData(filtros);
        };
    }

    async fetchConveniosData(filtrosInput = null) {
        if (this.isLoading) return;
        
        if (typeof filtrosInput === 'string') {
            this.lastFiltros.tipoBusca = filtrosInput;
        } else if (filtrosInput && typeof filtrosInput === 'object') {
            this.lastFiltros = { ...this.lastFiltros, ...filtrosInput };
        }
        
        const { tipoBusca, municipio } = this.lastFiltros;
        this.isLoading = true;
        if (!this.isQueueProcessing && this.ui) this.ui.showLoader(tipoBusca === 'todos' ? 'Extraindo lista de concedentes...' : 'Carregando meus convênios...');

        try {
            if (tipoBusca === 'ativos') {
                const pesquisa = JSON.stringify({ preposto: "", numeroConvenio: "", numeroFace: "", status: "" });
                const res = await fetch(`https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/convenio/meus-convenios?pesquisa=${encodeURIComponent(pesquisa)}`);
                const data = await res.json();
                if (data?.convenios) {
                    data.convenios.forEach(c => this.syncConvenio(c.ID, c));
                }
            } else {
                const results = await this.fetchAllConveniosFromConcedentes(municipio);
                results.forEach(r => this.syncConvenio(r.ID, r));
            }
            
            // Re-calcular pendências para todos os convênios na base master com os novos filtros
            for (const id in this.masterData) {
                const c = this.masterData[id];
                if (c.audit) {
                    c.pendencias = this.analisarPendencias(c.audit, this.lastFiltros, c);
                }
            }
            
            await this.savePersistentCache();
            this.refreshConveniosList();
            this.applyFilters();
            
            // Auditoria profunda: Todos os convênios encontrados na busca avançada que não tenham audit recente
            const allToAudit = this.conveniosData.filter(c => {
                const audit = this.masterData[c.ID]?.audit;
                return !audit || (Date.now() - (audit.timestamp || 0) > this.CACHE_TTL);
            });
            
            this.backgroundAuditQueue = this.sortConvenios(allToAudit).map(c => c.ID);
            this.processBackgroundQueue();
        } catch (error) {
            console.error("Erro Dashboard:", error);
        } finally {
            this.isLoading = false; 
            if (this.ui) this.ui.hideLoader();
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
        if (this.ui) this.ui.showLoader(`Localizando convênios em ${concedentes.length} concedentes...`);

        for (let i = 0; i < concedentes.length; i++) {
            const c = concedentes[i];
            if (this.ui) this.ui.updateLoaderMessage(`Extraindo ${i + 1}/${concedentes.length}: ${c.nome}`);
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
                        let cod = lIdM[1], face = '', val = '0', uni = '-', vigFim = '-', st = 'S';
                        item.querySelectorAll('.flex-coluna').forEach(col => {
                            const lblEl = col.querySelector('.tc.menor'), lbl = lblEl?.innerText.trim() || '', v = col.innerText.replace(lbl, '').trim();
                            if (lbl.includes('face')) face = v;
                            else if (lbl.includes('Valor')) val = v;
                            else if (lbl.includes('Unidade')) uni = v;
                            else if (lbl.includes('Término')) vigFim = v;
                            else if (lbl.includes('Início')) dtIni = v;
                            if (!lblEl && (v.toLowerCase().includes('inativo') || v.toLowerCase().includes('finalizado') || v.toLowerCase().includes('cancelado'))) st = 'N';
                        });
                        resultados.push({ 
                            ID: cod, 
                            NUMERO_FACE: face || '-', 
                            CONCEDENTE: nReal, 
                            UNI_NOME_PRINCIPAL: uni, 
                            DTINICIAL: dtIni,
                            DTFINAL: vigFim, 
                            VALOR_ESTIMADO: parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0, 
                            ATIVO: st, 
                            VENCIDO: (vigFim !== '-' && this.parseDate(vigFim) < new Date() ? '1' : '0') 
                        });
                    }
                }
            } catch (e) { console.error(e); }
            await new Promise(r => setTimeout(r, 50));
        }
        return resultados;
    }

    async processBackgroundQueue() {
        if (this.isQueueProcessing || this.backgroundAuditQueue.length === 0) return;
        this.isQueueProcessing = true;
        const total = this.backgroundAuditQueue.length;
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
                        const db = this.currentView === 'meus' ? this.masterData : this.advSearchData;
                        tempDiv.innerHTML = this.renderRowHtml(db[convId]);
                        row.replaceWith(tempDiv.firstChild);
                    }
                }
            } catch (e) { console.error(e); }
            processed++;
            this.updateBackgroundStatus(true, `Auditoria: ${processed}/${total}`);
            if (processed % 5 === 0) { this.updateSummaryCards(); if (this.currentView === 'meus') await this.savePersistentCache(); }
            await new Promise(r => setTimeout(r, 600));
        }
        this.isQueueProcessing = false;
        this.updateBackgroundStatus(false);
        this.updateSummaryCards();
        if (this.currentView === 'meus') await this.savePersistentCache();
    }

    async performDeepAudit(convId, ignoreCache = false) {
        const db = this.currentView === 'meus' ? this.masterData : this.advSearchData;
        const entry = db[String(convId)];
        if (!ignoreCache && entry?.audit && (Date.now() - (entry.audit.timestamp || 0) < this.CACHE_TTL)) return entry.audit;

        try {
            const res = await fetch(`https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/convenio/view?id=${convId}`);
            const html = await res.text(), doc = new DOMParser().parseFromString(html, 'text/html');
            
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
            } catch (e) { console.error(e); }

            // Execuções por natureza nas tabelas
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

            const historico = [];
            doc.querySelectorAll('#historico .item').forEach(row => {
                const dEl = row.querySelector('.tc');
                if (dEl) historico.push({ data: dEl.innerText.trim(), log: row.innerText.replace(dEl.innerText, '').trim().replace(/\n\s*\n/g, '<br>').replace(/\n/g, ' ') });
            });

            const vTotalEst = planoItens.reduce((sum, p) => sum + p.valorEstimado, 0);

            return { 
                cronogramas, planoItens, historico, timestamp: Date.now(), 
                lastUpdate: new Date().toLocaleString(),
                valorEstimadoReal: vTotalEst > 0 ? vTotalEst : (parseFloat(entry?.VALOR_ESTIMADO) || 0)
            };
        } catch (e) { console.error(e); return null; }
    }

    analisarPendencias(audit, filtros = { tipo: 'todos', periodo: 'todos', manual: '' }, conv = null) {
        const pendencias = [], hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const mesAtual = hoje.getMonth();
        let filtroMes = null, filtroAno = null;

        if (filtros.periodo === 'ano_atual') {
            filtroAno = anoAtual;
        } else if (filtros.periodo === 'mes_anterior') {
            const dAnt = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
            filtroMes = dAnt.getMonth(); filtroAno = dAnt.getFullYear();
        } else if (filtros.periodo === 'mes_atual') {
            filtroMes = mesAtual; filtroAno = anoAtual;
        } else if (filtros.periodo === 'manual' && filtros.manual) {
            const partes = filtros.manual.split(' ');
            if (partes.length === 2) {
                const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
                filtroMes = meses.indexOf(partes[0].toUpperCase());
                filtroAno = parseInt(partes[1]);
            }
        }

        const mP = { 'JAN': 0, 'FEV': 1, 'MAR': 2, 'ABR': 3, 'MAI': 4, 'JUN': 5, 'JUL': 6, 'AGO': 7, 'SET': 8, 'OUT': 9, 'NOV': 10, 'DEZ': 11, 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };

        const isNoPeriodo = (mesTexto) => {
            if (filtros.periodo === 'todos') return true;
            if (!mesTexto) return false;
            const p = mesTexto.toUpperCase().split(' ');
            return mP[p[0]] === filtroMes && parseInt(p[1]) === filtroAno;
        };

        let duracaoMeses = 0, mesesDecorridos = 0;
        let d1 = this.parseDate(conv?.DTINICIAL), d2 = this.parseDate(conv?.DTFINAL);
        
        if (!d1 && audit.cronogramas?.length > 0) {
            const s = [...audit.cronogramas].sort((a, b) => {
                const pa = a.mesTexto.split(' '), pb = b.mesTexto.split(' ');
                return (parseInt(pa[1]) - parseInt(pb[1])) || (mP[pa[0]] - mP[pb[0]]);
            });
            const p1 = s[0].mesTexto.split(' ');
            d1 = new Date(parseInt(p1[1]), mP[p1[0]], 1);
        }

        if (d1 && d2) {
            duracaoMeses = Math.max(1, (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()) + 1);
            mesesDecorridos = Math.min(duracaoMeses, Math.max(0, (hoje.getFullYear() - d1.getFullYear()) * 12 + (hoje.getMonth() - d1.getMonth())) + 1);
            audit.vigenciaInfo = { duracaoMeses, mesesDecorridos, mesesFaltantes: Math.max(0, duracaoMeses - mesesDecorridos), dtInicio: d1.toISOString().split('T')[0], dtFim: d2.toISOString().split('T')[0] };
        }
        
        if (filtros.tipo === 'todos' || filtros.tipo === 'excesso_valor') {
            audit.cronogramas?.forEach(c => {
                if (isNoPeriodo(c.mesTexto) && c.valorExecutado > c.valorPrevisto + 0.01) {
                    pendencias.push({ tipo: 'excesso_valor_mensal', msg: `Excesso em ${c.mesTexto}` });
                }
            });
        }

        if (filtros.tipo === 'todos' || filtros.tipo === 'atraso_liquidacao') {
            audit.cronogramas?.forEach(c => {
                if (isNoPeriodo(c.mesTexto) && c.prazoLimite && c.prazoLimite !== '-') {
                    const pt = c.prazoLimite.split('/');
                    if (new Date(pt[2], pt[1]-1, pt[0]) < hoje && c.status.includes('Aguardando')) {
                        pendencias.push({ tipo: 'atraso_liquidacao', msg: `Atraso: ${c.mesTexto}` });
                    }
                }
            });
        }

        if (filtros.tipo === 'todos' || filtros.tipo === 'excesso_valor') {
            audit.planoItens?.forEach(p => {
                if (p.valorExecutado > p.valorEstimado + 0.01) {
                    pendencias.push({ tipo: 'excesso_valor_natureza', nivel: 'critico', msg: `Excesso: ${p.nome}` });
                } else if (duracaoMeses > 0 && p.valorExecutado > (p.valorEstimado / duracaoMeses) * mesesDecorridos * 1.3) {
                    pendencias.push({ tipo: 'excesso_valor_natureza', nivel: 'alerta', msg: `Consumo acelerado: ${p.nome}` });
                }
            });
        }

        return pendencias;
    }

    async loadAuditData(convId) {
        this.activeConvId = convId;
        const conv = this.masterData[String(convId)];
        if (!conv) return;
        
        if (conv.audit && (Date.now() - (conv.audit.timestamp || 0) < this.CACHE_TTL)) {
            this.renderAuditSidebar(conv); return;
        }

        if (this.ui) this.ui.showLoader(`Buscando detalhes do convênio ${convId}...`);
        try {
            const auditData = await this.performDeepAudit(convId);
            if (auditData) {
                this.syncConvenio(convId, { audit: auditData });
                this.renderAuditSidebar(this.masterData[convId]);
                this.updateSummaryCards();
            }
        } catch (e) { console.error(e); } finally { if (this.ui) this.ui.hideLoader(); }
    }

    renderAuditSidebar(conv) {
        const audit = conv.audit, layout = document.getElementById('sispmg-dashboard-layout'), sidebar = document.getElementById('sispmg-dashboard-sidebar');
        if (!layout || !sidebar || !audit) return;
        layout.classList.remove('filter-active'); layout.classList.add('audit-active'); sidebar.classList.add('active');
        
        // Ocultar botão fechar global para evitar duplicidade
        const globalClose = document.getElementById('sispmg-dashboard-close-global');
        if (globalClose) globalClose.style.display = 'none';

        const v = audit.vigenciaInfo || {};
        const p = conv.pendencias || [];
        
        const pendenciasHtml = p.length > 0 ? `
            <div style="margin-top: 15px; padding-top: 10px; border-top: 1px dashed #dcd3c5;">
                <strong style="display: block; margin-bottom: 8px; font-size: 13px; color: #574e2d;">Alertas Identificados:</strong>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    ${p.map(x => {
                        let icon = '', color = '#dc3545';
                        if (x.tipo === 'atraso_liquidacao') icon = '<i class="fas fa-clock"></i>';
                        else if (x.tipo === 'excesso_valor_mensal') icon = '<i class="fas fa-chart-line"></i>';
                        else if (x.tipo === 'excesso_valor_natureza') {
                            icon = '<i class="fas fa-exclamation-triangle"></i>';
                            if (x.nivel === 'alerta') color = '#ff9800';
                        }
                        return `<div style="display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: #333;">
                            <span style="color: ${color}; width: 16px; text-align: center; flex-shrink: 0;">${icon}</span>
                            <span>${x.msg}</span>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        ` : '';

        sidebar.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #b3a368; padding: 15px 20px;">
                    <h2 style="color: #574e2d; font-size: 18px; margin: 0; white-space: nowrap;">Convênio ${conv.ID} - ${this.getMunicipioClean(conv.CONCEDENTE)}</h2>
                    <button id="sispmg-close-audit-btn" class="sispmg-dashboard-btn sispmg-global-close">Fechar</button>
                </div>
                <div style="flex-grow: 1; overflow-y: auto; padding: 20px;">
                    <div style="background: #fbf8f5; border: 1px solid #dcd3c5; border-radius: 6px; padding: 12px; margin-bottom: 20px; font-size: 13px;">
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                            <div><strong>Início:</strong> ${this.formatDate(conv.DTINICIAL)}</div>
                            <div><strong>Término:</strong> ${this.formatDate(conv.DTFINAL)}</div>
                            <div><strong>Duração:</strong> ${v.duracaoMeses || '-'} m</div>
                            <div><strong>Nº Face:</strong> ${conv.NUMERO_FACE || '-'}</div>
                            <div><strong>Decorridos:</strong> ${v.mesesDecorridos || '-'} m</div>
                            <div><strong>Faltantes:</strong> ${v.mesesFaltantes || '-'} m</div>
                        </div>
                        ${pendenciasHtml}
                    </div>
                    
                    <h3 style="font-size: 16px; color: #333; margin-top: 0;"><i class="fas fa-list-check"></i> Plano de Trabalho (Naturezas)</h3>
                    <div class="sispmg-dashboard-table-container">
                        <table class="sispmg-dashboard-table" style="min-width: 100%;">
                            <thead>
                                <tr>
                                    <th style="text-align: left;">Item / Natureza</th>
                                    <th style="text-align: right;">Previsto (R$)</th>
                                    <th style="text-align: right;">Executado (R$)</th>
                                    <th style="text-align: center;">%</th>
                                    <th style="text-align: center;">Progresso</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${audit.planoItens?.length > 0 ? audit.planoItens.map(p => {
                                    const progresso = p.valorEstimado > 0 ? ((p.valorExecutado / p.valorEstimado) * 100).toFixed(1) : 0;
                                    const isExcedido = parseFloat(progresso) > 100, isConcluido = parseFloat(progresso) >= 100;
                                    let corProgresso = isExcedido ? '#dc3545' : (isConcluido ? '#b3a368' : '#28a745');
                                    let corTextoExecutado = p.valorExecutado > 0 ? (isExcedido ? '#dc3545' : '#155724') : '#666';
                                    return `<tr>
                                        <td>${p.nome}</td>
                                        <td style="text-align: right;">${p.valorEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                        <td style="text-align: right; font-weight: 600; color: ${corTextoExecutado};">${p.valorExecutado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                        <td style="text-align: center; font-weight: 600; color: ${corTextoExecutado};">${progresso}%</td>
                                        <td style="text-align: center;"><div style="background: #eee; width: 60px; border-radius: 4px; overflow: hidden; height: 10px; display: inline-block; vertical-align: middle;"><div style="background: ${corProgresso}; height: 100%; width: ${progresso > 100 ? 100 : progresso}%;"></div></div></td>
                                    </tr>`;
                                }).join('') : '<tr><td colspan="5" style="text-align: center;">Nenhum registro no plano.</td></tr>'}
                            </tbody>
                            ${audit.planoItens?.length > 0 ? `<tfoot><tr style="background: #fbf8f5; font-weight: 700; border-top: 2px solid #dcd3c5;"><td style="text-align: right;">Total:</td><td style="text-align: right;">${audit.planoItens.reduce((a, b) => a + b.valorEstimado, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="text-align: right; color: #155724;">${audit.planoItens.reduce((a, b) => a + b.valorExecutado, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="text-align: center; color: #000;">${audit.planoItens.reduce((a, b) => a + b.valorEstimado, 0) > 0 ? ((audit.planoItens.reduce((a, b) => a + b.valorExecutado, 0) / audit.planoItens.reduce((a, b) => a + b.valorEstimado, 0)) * 100).toFixed(1) + '%' : '0%'}</td><td></td></tr></tfoot>` : ''}
                        </table>
                    </div>

                    <h3 style="font-size: 16px; color: #333; margin-top: 25px;"><i class="fas fa-calendar-alt"></i> Cronograma Mensal</h3>
                    <div class="sispmg-dashboard-table-container">
                        <table class="sispmg-dashboard-table" style="min-width: 100%;">
                            <thead>
                                <tr>
                                    <th style="text-align: left;">Mês</th>
                                    <th style="text-align: right;">Previsto (R$)</th>
                                    <th style="text-align: right;">Executado (R$)</th>
                                    <th style="text-align: center;">%</th>
                                    <th style="text-align: center;">Progresso</th>
                                    <th style="text-align: left;">Prazo Limite</th>
                                    <th style="text-align: left;">Data Liq.</th>
                                    <th style="text-align: center;">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${audit.cronogramas?.length > 0 ? audit.cronogramas.map(c => {
                                    const percCrono = c.valorPrevisto > 0 ? ((c.valorExecutado / c.valorPrevisto) * 100).toFixed(1) : (c.valorExecutado > 0 ? 100 : 0);
                                    const isCronoExcedido = c.valorExecutado > c.valorPrevisto, isCronoConcluido = parseFloat(percCrono) >= 100;
                                    const corCrono = c.valorExecutado > 0 ? (isCronoExcedido ? '#dc3545' : '#155724') : 'inherit';
                                    let corProgressoCrono = isCronoExcedido ? '#dc3545' : (isCronoConcluido ? '#b3a368' : '#28a745');
                                    return `<tr>
                                        <td style="white-space: nowrap;">${c.mesTexto || "-"}</td>
                                        <td style="text-align: right;">${(c.valorPrevisto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                        <td style="text-align: right; font-weight: 600; color: ${corCrono};">${(c.valorExecutado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                        <td style="text-align: center; font-weight: 600; color: ${corCrono};">${percCrono}%</td>
                                        <td style="text-align: center;"><div style="background: #eee; width: 60px; border-radius: 4px; overflow: hidden; height: 10px; display: inline-block; vertical-align: middle;"><div style="background: ${corProgressoCrono}; height: 100%; width: ${parseFloat(percCrono) > 100 ? 100 : percCrono}%;"></div></div></td>
                                        <td>${c.prazoLimite || "-"}</td>
                                        <td>${c.dataLiquidado || "-"}</td>
                                        <td style="text-align: center;"><span class="sispmg-status-badge ${c.status.includes('Liquidado') ? 'sispmg-status-vigente' : 'sispmg-status-outros'}">${c.status || "Pendente"}</span></td>
                                    </tr>`;
                                }).join('') : '<tr><td colspan="8" style="text-align: center;">Nenhum registro extraído.</td></tr>'}
                            </tbody>
                        </table>
                    </div>

                    <h3 style="font-size: 16px; color: #333; margin-top: 25px;"><i class="fas fa-history"></i> Histórico de Alterações</h3>
                    <div style="background: #fff; border: 1px solid #dcd3c5; border-radius: 6px; padding: 10px; font-size: 12px; max-height: 250px; overflow-y: auto;">
                        ${audit.historico?.length > 0 ? audit.historico.map(h => `<div style="margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px;"><strong style="color: #b3a368;">${h.data}</strong><br>${h.log}</div>`).join('') : 'Nenhum histórico registrado.'}
                    </div>
                </div>
            </div>
        `;
        sidebar.querySelector('#sispmg-close-audit-btn').onclick = () => {
            sidebar.classList.remove('active'); layout.classList.remove('audit-active'); this.activeConvId = null; 
            if (globalClose) globalClose.style.display = 'inline-flex';
            this.renderDashboard(true);
        };
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
        
        values.sort(); 
        const selected = this.activeFilters[colId] || [];
        
        dropdown.innerHTML = `
            <div class="sispmg-filter-search"><input type="text" placeholder="Pesquisar..." id="search-${colId}"></div>
            <div class="sispmg-filter-list" id="list-${colId}">${values.map(val => `<label class="sispmg-filter-item"><input type="checkbox" value="${val}" ${selected.includes(val) ? 'checked' : ''}><span>${val}</span></label>`).join('')}</div>
            <div class="sispmg-filter-actions"><button class="sispmg-filter-btn clear">Limpar</button><button class="sispmg-filter-btn apply">Aplicar</button></div>
        `;
        
        document.getElementById('sispmg-plus-container').appendChild(dropdown);
        this.positionDropdown(trigger, dropdown);
        
        dropdown.querySelector('.apply').onclick = () => {
            const checked = Array.from(dropdown.querySelectorAll('input:checked')).map(i => i.value);
            if (checked.length > 0) { this.activeFilters[colId] = checked; trigger.classList.add('active'); } else { delete this.activeFilters[colId]; trigger.classList.remove('active'); }
            this.applyFilters(); this.closeAllFilterDropdowns();
        };
        dropdown.querySelector('.clear').onclick = () => { delete this.activeFilters[colId]; trigger.classList.remove('active'); this.applyFilters(); this.closeAllFilterDropdowns(); };
        
        const searchInput = dropdown.querySelector('input');
        searchInput.oninput = () => {
            const term = searchInput.value.toLowerCase();
            dropdown.querySelectorAll('.sispmg-filter-item').forEach(item => item.style.display = item.textContent.toLowerCase().includes(term) ? 'flex' : 'none');
        };
    }

    positionDropdown(trigger, dropdown) { const rect = trigger.getBoundingClientRect(); dropdown.style.top = `${rect.bottom + 5}px`; dropdown.style.left = `${Math.max(10, rect.left - 200)}px`; }
    closeAllFilterDropdowns() { document.querySelectorAll('.sispmg-filter-dropdown').forEach(d => d.classList.remove('show')); }
    cleanUnidade(u) { if (!u) return "-"; return u.replace(/24\s*CIA\s*PM\s*IND\s*815\s*RPM/i, '24 CIA PM IND').replace(/\s*\/15\s*RPM/gi, '').trim(); }
    
    sortConvenios(data) { 
        const p = { 'EM15RPM': 1, '19 BPM': 2, '44 BPM': 3, '70 BPM': 4, '24 CIA PM IND': 5 };
        return data.sort((a, b) => {
            const uA = this.cleanUnidade(a.UNI_NOME_PRINCIPAL), uB = this.cleanUnidade(b.UNI_NOME_PRINCIPAL);
            const pA = p[uA] || 999, pB = p[uB] || 999;
            if (pA !== pB) return pA - pB;
            return this.getMunicipioClean(a.CONCEDENTE).localeCompare(this.getMunicipioClean(b.CONCEDENTE), 'pt-BR');
        });
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
        if (data.length === 0) { tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; padding: 40px;">Nenhum convênio encontrado.</td></tr>`; return; }
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
            const v = conv.audit.vigenciaInfo;
            dur = v.duracaoMeses; dec = v.mesesDecorridos; fal = v.mesesFaltantes;
            mPrev = vEst / (dur || 1); mReal = vLiq / (dec || 1);
            if (statusLabel === 'Vigente') {
                if (fal <= 3) rowStyle = 'background-color: #fffde7 !important; border-left: 5px solid #fdd835;';
                if (fal <= 1) rowStyle = 'background-color: #fff3e0 !important; border-left: 5px solid #ff9800;';
            }
        }
        if (statusLabel === 'Vencido') rowStyle = 'background-color: #fce8e8 !important; border-left: 5px solid #dc3545;';

        const p = conv.pendencias || [];
        const hA = p.some(x => x.tipo === 'atraso_liquidacao'), hEM = p.some(x => x.tipo === 'excesso_valor_mensal'), hEN = p.filter(x => x.tipo === 'excesso_valor_natureza');
        const isC = hEN.some(x => x.nivel === 'critico'), isAl = !isC && hEN.some(x => x.nivel === 'alerta');

        return `<tr class="sispmg-clickable-row ${isAudited ? 'sispmg-row-audited' : ''}" style="${rowStyle}" onclick="window.SisPMG_SirconvDashboard.loadAuditData('${conv.ID}')">
            <td style="text-align: left;"><strong>${conv.ID}</strong></td>
            <td class="sispmg-hide-on-audit" style="text-align: left;">${conv.NUMERO_FACE || '-'}</td>
            <td style="text-align: left;">${this.getMunicipioClean(conv.CONCEDENTE)}</td>
            <td style="text-align: left;">${this.cleanUnidade(conv.UNI_NOME_PRINCIPAL)}</td>
            <td class="sispmg-hide-on-audit" style="text-align: left; font-size: 12px;">${this.formatDate(conv.DTINICIAL)}<br>${this.formatDate(conv.DTFINAL)}</td>
            <td class="sispmg-hide-on-audit" style="text-align: center;">${dec}/${dur}</td>
            <td class="sispmg-hide-on-audit" style="text-align: right;">${vEst.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td class="sispmg-hide-on-audit" style="text-align: right; font-weight: bold; color: ${colorT};">${vLiq.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td class="sispmg-hide-on-audit" style="text-align: right; color: #666;">${mPrev.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td class="sispmg-hide-on-audit" style="text-align: right; font-weight: bold; color: #155724;">${mReal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td class="sispmg-hide-on-audit" style="text-align: center; font-weight: bold; color: ${colorT};">${prog}%</td>
            <td style="text-align: center;"><span class="sispmg-status-badge ${statusLabel === 'Vigente' ? 'sispmg-status-vigente' : 'sispmg-status-outros'}">${statusLabel}</span></td>
            <td style="text-align: center;">
                <div style="display: flex; gap: 8px; justify-content: center; width: 60px; margin: 0 auto;">
                    <div style="width: 14px; text-align: center;">${hA ? '<i class="fas fa-clock" title="Atraso Liquidação" style="color: #dc3545;"></i>' : ''}</div>
                    <div style="width: 14px; text-align: center;">${hEM ? '<i class="fas fa-chart-line" title="Excesso Mensal" style="color: #dc3545;"></i>' : ''}</div>
                    <div style="width: 14px; text-align: center;">${isC ? '<i class="fas fa-exclamation-triangle" title="Excesso Crítico" style="color: #dc3545;"></i>' : (isAl ? '<i class="fas fa-exclamation-triangle" title="Consumo Acelerado" style="color: #ff9800;"></i>' : '')}</div>
                </div>
            </td>
        </tr>`;
    }

    updateSummaryCards() {
        const data = this.filteredData.length > 0 ? this.filteredData : this.conveniosData;
        const tE = data.reduce((a, b) => a + (parseFloat(b.VALOR_ESTIMADO) || 0), 0);
        const tL = data.reduce((a, b) => a + (parseFloat(b.LIQUIDADO) || 0), 0);
        document.getElementById('dash-total-convenios').innerText = data.length;
        document.getElementById('dash-convenios-ativos').innerText = data.filter(c => this.getStatusLabel(c) === 'Vigente').length;
        document.getElementById('dash-valor-total').innerText = tE.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        document.getElementById('dash-valor-liquidado').innerText = tL.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    }

    formatDate(d) { if (!d || d === '-') return '-'; const p = d.split(' ')[0].split(/[\/-]/); return p[0].length === 4 ? `${p[2]}/${p[1]}/${p[0]}` : d; }
    parseDate(d) { if (!d || d === '-') return null; const p = d.split(' ')[0].split(/[\/-]/); return p[0].length === 4 ? new Date(p[0], p[1]-1, p[2]) : new Date(p[2], p[1]-1, p[0]); }
}
