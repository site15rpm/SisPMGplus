// Funções e lógica para o dashboard de convênios SIRCONV
import { sendMessageToBackground, getCookie } from '../../common/utils.js';
import { iconSVG_28 } from '../../common/icon.js';

/**
 * Módulo Dashboard SIRCONV
 * Gerencia a extração, auditoria e exibição de dados de convênios.
 */
export class SirconvDashboardModule {
    constructor(config) {
        this.config = config;
        this.ui = window.SisPMG_UI;
        this.masterData = {}; // Meus Convênios (Persistente)
        this.advSearchData = {}; // Busca Avançada (Volátil)
        this.currentView = 'meus'; // 'meus' ou 'adv'
        this.conveniosData = []; 
        this.filteredData = [];
        this.activeFilters = {}; 
        this.lastFiltros = { tipoBusca: 'ativos', tipo: 'todos', periodo: 'todos', manual: '', municipio: 'todos' };
        this.isLoading = false;
        this.activeConvId = null;
        this.backgroundAuditQueue = [];
        this.isQueueProcessing = false;
        this.CACHE_TTL = 8 * 60 * 60 * 1000;
        this.DATA_TTL = 72 * 60 * 60 * 1000;
        this.STORAGE_KEY = 'sirconv_master_data';
        console.log("SirconvDashboardModule: Instância inicializada.");
    }

    async init() {
        if (this.ui) {
            await this.loadPersistentCache();
            this.ui.registerModule({ name: 'SIRCONV Dashboard', instance: this });
        }
    }

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
                this.refreshConveniosList();
            }
        } catch (e) { console.error("[Dashboard] Erro ao carregar Master Data:", e); }
    }

    async savePersistentCache() {
        try {
            const dataToSave = {};
            dataToSave[this.STORAGE_KEY] = this.masterData;
            await sendMessageToBackground('setStorage', dataToSave);
        } catch (e) { console.error("[Dashboard] Erro ao salvar Master Data:", e); }
    }

    syncConvenio(id, newData) {
        const idStr = String(id);
        const agora = Date.now();
        const targetDb = this.currentView === 'meus' ? this.masterData : this.advSearchData;

        if (!targetDb[idStr]) {
            targetDb[idStr] = { ID: idStr, lastUpdate: agora, audit: null, pendencias: [] };
        }

        const entry = targetDb[idStr];
        for (const key in newData) {
            if (key === 'audit' && newData.audit) {
                entry.audit = newData.audit;
                entry.audit.timestamp = entry.audit.timestamp || agora;
            } else if (key !== 'pendencias' && key !== 'ID' && key !== 'lastUpdate') {
                entry[key] = newData[key];
            }
        }
        entry.lastUpdate = agora;

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
                            <h2 style="margin: 0; font-size: 18px; color: #574e2d;">Dashboard SIRCONV <span id="sispmg-dash-view-title" style="font-size: 14px; font-weight: normal; color: #666;">(Meus Convênios)</span></h2>
                        </div>
                        <div class="sispmg-dashboard-actions" style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                            <div id="sispmg-dashboard-bg-status" style="display: none; align-items: center; gap: 8px; color: #b3a368; font-size: 12px; margin-right: 15px; font-weight: 600; background: #fff; padding: 5px 12px; border-radius: 20px; border: 1px solid #dcd3c5;">
                                <i class="fas fa-circle-notch fa-spin"></i>
                                <span>Atualizando...</span>
                            </div>
                            <button id="sispmg-dashboard-action-btn" class="sispmg-dashboard-btn sispmg-dashboard-btn-primary">
                                <i class="fas fa-sync-alt"></i> Recarregar
                            </button>
                            <button id="sispmg-dashboard-refresh" class="sispmg-dashboard-btn sispmg-dashboard-btn-primary">
                                <i class="fas fa-search"></i> Busca Avançada
                            </button>
                            <button id="sispmg-dashboard-close-global" class="sispmg-global-close">Fechar</button>
                        </div>
                    </div>

                    <div id="sispmg-dashboard-summary" class="sispmg-dashboard-summary">
                        <div class="sispmg-dashboard-card"><span class="sispmg-dashboard-card-value" id="dash-total-convenios">-</span><span class="sispmg-dashboard-card-label">Total de Convênios</span></div>
                        <div class="sispmg-dashboard-card"><span class="sispmg-dashboard-card-value" id="dash-convenios-ativos">-</span><span class="sispmg-dashboard-card-label">Vigentes</span></div>
                        <div class="sispmg-dashboard-card"><span class="sispmg-dashboard-card-value" id="dash-valor-total">-</span><span class="sispmg-dashboard-card-label">Valor Estimado (R$)</span></div>
                        <div class="sispmg-dashboard-card"><span class="sispmg-dashboard-card-value" id="dash-valor-liquidado">-</span><span class="sispmg-dashboard-card-label">Valor Liquidado (R$)</span></div>
                    </div>

                    <div class="sispmg-dashboard-table-container">
                        <table class="sispmg-dashboard-table">
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

        modalContainer.querySelector('#sispmg-dashboard-action-btn').onclick = async () => {
            if (this.isQueueProcessing) {
                this.backgroundAuditQueue = [];
                return;
            }
            if (confirm("Limpar base local e recarregar meus convênios?")) {
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

    closeSidebar() {
        const layout = document.getElementById('sispmg-dashboard-layout');
        const sidebar = document.getElementById('sispmg-dashboard-sidebar');
        if (layout && sidebar) {
            sidebar.classList.remove('active');
            layout.classList.remove('audit-active', 'filter-active');
            this.activeConvId = null;
            this.renderDashboard(true);
        }
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
        const db = this.currentView === 'meus' ? this.masterData : this.advSearchData;
        const municipios = [...new Set(Object.values(db).map(c => this.getMunicipioClean(c.CONCEDENTE)))].sort();

        sidebar.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; padding: 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #b3a368; padding: 15px 20px;">
                    <h2 style="color: #574e2d; font-size: 18px; margin: 0;"><i class="fas fa-filter"></i> Busca Avançada</h2>
                    <button id="sispmg-close-sidebar-btn" class="sispmg-global-close" style="position: static; padding: 5px 10px;">Fechar</button>
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

        sidebar.querySelector('#sispmg-close-sidebar-btn').onclick = () => this.closeSidebar();

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
            this.currentView = filtros.tipoBusca === 'todos' ? 'adv' : 'meus';
            if (this.currentView === 'adv') this.advSearchData = {}; 
            
            document.getElementById('sispmg-dash-view-title').innerText = this.currentView === 'meus' ? '(Meus Convênios)' : '(Busca Avançada)';
            this.closeSidebar();
            this.fetchConveniosData(filtros);
        };
    }

    async fetchConveniosData(filtrosInput = null) {
        if (this.isLoading) return;
        if (typeof filtrosInput === 'string') this.lastFiltros.tipoBusca = filtrosInput;
        else if (filtrosInput) this.lastFiltros = { ...this.lastFiltros, ...filtrosInput };

        const { tipoBusca, municipio } = this.lastFiltros;
        this.isLoading = true;
        if (!this.isQueueProcessing && this.ui) this.ui.showLoader(tipoBusca === 'todos' ? 'Varrendo todos os concedentes...' : 'Sincronizando meus convênios...');

        try {
            if (tipoBusca === 'ativos') {
                const res = await fetch(`https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/convenio/meus-convenios?pesquisa=${encodeURIComponent(JSON.stringify({ preposto: "", numeroConvenio: "", numeroFace: "", status: "" }))}`);
                const data = await res.json();
                if (data?.convenios) data.convenios.forEach(c => this.syncConvenio(c.ID, c));
            } else {
                const results = await this.fetchAllConveniosFromConcedentes(municipio);
                results.forEach(r => this.syncConvenio(r.ID, r));
            }
            
            const db = this.currentView === 'meus' ? this.masterData : this.advSearchData;
            for (const id in db) {
                const c = db[id];
                if (c.audit) c.pendencias = this.analisarPendencias(c.audit, this.lastFiltros, c);
            }
            
            if (this.currentView === 'meus') await this.savePersistentCache();
            this.refreshConveniosList();
            this.applyFilters();
            
            const allToAudit = this.conveniosData.filter(c => {
                const audit = (this.currentView === 'meus' ? this.masterData[c.ID] : this.advSearchData[c.ID])?.audit;
                return !audit || (Date.now() - (audit.timestamp || 0) > this.CACHE_TTL);
            });
            
            this.backgroundAuditQueue = this.sortConvenios(allToAudit).map(c => c.ID);
            this.processBackgroundQueue();
        } catch (error) { console.error("Erro Dashboard:", error); } 
        finally { this.isLoading = false; if (this.ui) this.ui.hideLoader(); }
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
                        let cod = lIdM[1], face = '', val = '0', uni = '-', vigFim = '-', st = 'S', dtIni = '-';
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
                            ID: cod, NUMERO_FACE: face || '-', CONCEDENTE: nReal, UNI_NOME_PRINCIPAL: uni, DTINICIAL: dtIni, DTFINAL: vigFim, 
                            VALOR_ESTIMADO: parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0, ATIVO: st, VENCIDO: (vigFim !== '-' && this.parseDate(vigFim) < new Date() ? '1' : '0') 
                        });
                    }
                }
            } catch (e) { console.error(e); }
            if (i % 2 === 0) await new Promise(r => setTimeout(r, 50));
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
                const pRes = await sendMessageToBackground('fetchConvenioPlano', { convenioId: convId, token: getCookie('tokiuz') });
                if (pRes?.success && pRes.data?.planos) {
                    planoItens = pRes.data.planos.map(p => ({
                        naturezaId: p.NATUREZA_ID, naturezaItem: p.NATUREZA_ITEM, nome: `${p.ITEM} - ${p.NATUREZA_ITEM}`,
                        valorEstimado: parseFloat(p.VALOR) || 0, valorExecutado: 0
                    }));
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

            return { 
                cronogramas, planoItens, timestamp: Date.now(), 
                lastUpdate: new Date().toLocaleString(),
                valorEstimadoReal: vTotalEst > 0 ? vTotalEst : (parseFloat(entry?.VALOR_ESTIMADO) || 0)
            };
        } catch (e) { console.error(e); return null; }
    }

    analisarPendencias(audit, filtros = { tipo: 'todos', periodo: 'todos', manual: '' }, conv = null) {
        const pendencias = [], hoje = new Date();
        const anoAtual = hoje.getFullYear(), mesAtual = hoje.getMonth();
        let fMes = null, fAno = null;

        if (filtros.periodo === 'ano_atual') fAno = anoAtual;
        else if (filtros.periodo === 'mes_anterior') { const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1); fMes = d.getMonth(); fAno = d.getFullYear(); }
        else if (filtros.periodo === 'mes_atual') { fMes = mesAtual; fAno = anoAtual; }
        else if (filtros.periodo === 'manual' && filtros.manual) {
            const p = filtros.manual.split(' '), meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
            if (p.length === 2) { fMes = meses.indexOf(p[0].toUpperCase()); fAno = parseInt(p[1]); }
        }

        const mP = { 'JAN': 0, 'FEV': 1, 'MAR': 2, 'ABR': 3, 'MAI': 4, 'JUN': 5, 'JUL': 6, 'AGO': 7, 'SET': 8, 'OUT': 9, 'NOV': 10, 'DEZ': 11, 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };
        const isNoPeriodo = (mesTexto) => {
            if (filtros.periodo === 'todos') return true;
            if (!mesTexto) return false;
            const p = mesTexto.toUpperCase().split(' ');
            return mP[p[0]] === fMes && parseInt(p[1]) === fAno;
        };

        let dur = 0, dec = 0;
        let d1 = this.parseDate(conv?.DTINICIAL), d2 = this.parseDate(conv?.DTFINAL);
        if (!d1 && audit.cronogramas?.length > 0) {
            const s = [...audit.cronogramas].sort((a, b) => { const pa = a.mesTexto.split(' '), pb = b.mesTexto.split(' '); return (parseInt(pa[1]) - parseInt(pb[1])) || (mP[pa[0]] - mP[pb[0]]); });
            const p = s[0].mesTexto.split(' '); d1 = new Date(parseInt(p[1]), mP[p[0]], 1);
        }
        if (d1 && d2) {
            dur = Math.max(1, (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()) + 1);
            dec = Math.min(dur, Math.max(0, (hoje.getFullYear() - d1.getFullYear()) * 12 + (hoje.getMonth() - d1.getMonth())) + 1);
            audit.vigenciaInfo = { duracaoMeses: dur, mesesDecorridos: dec, mesesFaltantes: Math.max(0, dur - dec), dtInicio: d1.toISOString().split('T')[0], dtFim: d2.toISOString().split('T')[0] };
        }
        
        if (filtros.tipo === 'todos' || filtros.tipo === 'excesso_valor') {
            audit.cronogramas?.forEach(c => { if (isNoPeriodo(c.mesTexto) && c.valorExecutado > c.valorPrevisto + 0.01) pendencias.push({ tipo: 'excesso_valor_mensal', msg: `Excesso em ${c.mesTexto}` }); });
            audit.planoItens?.forEach(p => {
                if (p.valorExecutado > p.valorEstimado + 0.01) pendencias.push({ tipo: 'excesso_valor_natureza', nivel: 'critico', msg: `Excesso: ${p.nome}` });
                else if (dur > 0 && p.valorExecutado > (p.valorEstimado / dur) * dec * 1.3) pendencias.push({ tipo: 'excesso_valor_natureza', nivel: 'alerta', msg: `Consumo acelerado: ${p.nome}` });
            });
        }
        if (filtros.tipo === 'todos' || filtros.tipo === 'atraso_liquidacao') {
            audit.cronogramas?.forEach(c => {
                if (isNoPeriodo(c.mesTexto) && c.prazoLimite && c.prazoLimite !== '-') {
                    const pt = c.prazoLimite.split('/');
                    if (new Date(pt[2], pt[1]-1, pt[0]) < hoje && c.status.includes('Aguardando')) pendencias.push({ tipo: 'atraso_liquidacao', msg: `Atraso: ${c.mesTexto}` });
                }
            });
        }
        return pendencias;
    }

    async loadAuditData(convId) {
        this.activeConvId = convId;
        const db = this.currentView === 'meus' ? this.masterData : this.advSearchData;
        const conv = db[String(convId)];
        if (!conv) return;
        
        if (conv.audit && (Date.now() - (conv.audit.timestamp || 0) < this.CACHE_TTL)) { this.renderAuditSidebar(conv); return; }
        if (this.ui) this.ui.showLoader(`Buscando detalhes do convênio ${convId}...`);
        try {
            const auditData = await this.performDeepAudit(convId);
            if (auditData) { this.syncConvenio(convId, { audit: auditData }); this.renderAuditSidebar(db[convId]); this.updateSummaryCards(); }
        } catch (e) { console.error(e); } finally { if (this.ui) this.ui.hideLoader(); }
    }

    renderAuditSidebar(conv) {
        const audit = conv.audit, layout = document.getElementById('sispmg-dashboard-layout'), sidebar = document.getElementById('sispmg-dashboard-sidebar');
        if (!layout || !sidebar || !audit) return;
        layout.classList.remove('filter-active'); layout.classList.add('audit-active'); sidebar.classList.add('active');
        const v = audit.vigenciaInfo || {};
        
        sidebar.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #b3a368; padding: 15px 20px;">
                    <h2 style="color: #574e2d; font-size: 18px; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 250px;">Convênio ${conv.ID}</h2>
                    <button id="sispmg-close-audit-btn" class="sispmg-global-close" style="position: static; padding: 5px 10px;">Fechar</button>
                </div>
                <div style="flex-grow: 1; overflow-y: auto; padding: 20px;">
                    <div style="background: #fbf8f5; border: 1px solid #dcd3c5; border-radius: 6px; padding: 12px; margin-bottom: 20px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 13px;">
                        <div><strong>Início:</strong> ${this.formatDate(conv.DTINICIAL)}</div>
                        <div><strong>Término:</strong> ${this.formatDate(conv.DTFINAL)}</div>
                        <div><strong>Duração:</strong> ${v.duracaoMeses || '-'} m</div>
                        <div><strong>Nº Face:</strong> ${conv.NUMERO_FACE || '-'}</div>
                        <div><strong>Decorridos:</strong> ${v.mesesDecorridos || '-'} m</div>
                        <div><strong>Faltantes:</strong> ${v.mesesFaltantes || '-'} m</div>
                    </div>
                    <h3 style="font-size: 15px; color: #333; margin-top: 0;"><i class="fas fa-list-check"></i> Plano de Trabalho</h3>
                    <table class="sispmg-dashboard-table" style="width: 100%; font-size: 12px;">
                        <thead><tr><th style="text-align: left;">Natureza</th><th style="text-align: right;">Prev (R$)</th><th style="text-align: right;">Exec (R$)</th><th style="text-align: center;">%</th></tr></thead>
                        <tbody>${audit.planoItens?.map(p => {
                            const prog = p.valorEstimado > 0 ? ((p.valorExecutado / p.valorEstimado) * 100).toFixed(1) : 0;
                            return `<tr><td>${p.nome}</td><td style="text-align: right;">${p.valorEstimado.toLocaleString('pt-BR')}</td><td style="text-align: right; color: ${parseFloat(prog) > 100 ? '#dc3545' : '#155724'}">${p.valorExecutado.toLocaleString('pt-BR')}</td><td style="text-align: center;">${prog}%</td></tr>`;
                        }).join('')}</tbody>
                    </table>
                </div>
            </div>
        `;
        sidebar.querySelector('#sispmg-close-audit-btn').onclick = () => this.closeSidebar();
        this.renderDashboard(true);
    }

    getMunicipioClean(c) { if (!c) return "-"; let n = c; const p = [/^PREFEITURA\s+MUNICIAP?AL\s+DE\s+/i, /^PREFEITURA\s+MUNICIPAL\s+DE\s+/i, /^PREFEITURA\s+MUNICIPAL\s+/i, /^PREFEITURA\s+DE\s+/i, /^MUNICIPIO\s+DE\s+/i, /^P\.\s*M\.\s*DE\s+/i, /^PM\s+/i]; for (const pref of p) { if (pref.test(n)) { n = n.replace(pref, ''); break; } } return n.replace(/\s+/g, ' ').trim(); }
    getStatusLabel(c) { const v = c.ATIVO === 'S' && c.VENCIDO === '0'; return v ? 'Vigente' : (c.ATIVO === 'N' ? 'Inativo' : 'Vencido'); }
    cleanUnidade(u) { if (!u) return "-"; return u.replace(/24\s*CIA\s*PM\s*IND\s*815\s*RPM/i, '24 CIA PM IND').replace(/\s*\/15\s*RPM/gi, '').trim(); }
    sortConvenios(d) { const p = { 'EM15RPM': 1, '19 BPM': 2, '44 BPM': 3, '70 BPM': 4, '24 CIA PM IND': 5 }; return d.sort((a, b) => (p[this.cleanUnidade(a.UNI_NOME_PRINCIPAL)] || 999) - (p[this.cleanUnidade(b.UNI_NOME_PRINCIPAL)] || 999) || this.getMunicipioClean(a.CONCEDENTE).localeCompare(this.getMunicipioClean(b.CONCEDENTE), 'pt-BR')); }
    
    applyFilters() {
        let f = this.conveniosData.filter(c => {
            for (const id in this.activeFilters) {
                const s = this.activeFilters[id];
                let v = (id === 'municipio' ? this.getMunicipioClean(c.CONCEDENTE) : (id === 'unidade' ? this.cleanUnidade(c.UNI_NOME_PRINCIPAL) : (id === 'status' ? this.getStatusLabel(c) : c[id.toUpperCase()])));
                if (!s.includes(String(v))) return false;
            }
            return true;
        });
        this.filteredData = this.sortConvenios(f); this.renderDashboard(true);
    }

    renderDashboard(isF = false) {
        const tb = document.getElementById('sispmg-dashboard-tbody'); if (!tb) return;
        let d = isF ? this.filteredData : this.sortConvenios([...this.conveniosData]);
        if (d.length === 0) { tb.innerHTML = `<tr><td colspan="13" style="text-align: center; padding: 40px;">Nenhum convênio encontrado.</td></tr>`; return; }
        this.updateSummaryCards();
        tb.innerHTML = d.map(c => this.renderRowHtml(c)).join('');
        window.SisPMG_SirconvDashboard = this;
    }

    renderRowHtml(c) {
        const s = this.getStatusLabel(c), vEst = parseFloat(c.audit?.valorEstimadoReal || c.VALOR_ESTIMADO) || 0, vLiq = parseFloat(c.LIQUIDADO) || 0, prog = vEst > 0 ? ((vLiq / vEst) * 100).toFixed(1) : 0;
        let dur = 0, dec = 0, rowStyle = '';
        if (c.audit?.vigenciaInfo) { const v = c.audit.vigenciaInfo; dur = v.duracaoMeses; dec = v.mesesDecorridos; if (s === 'Vigente') { if (v.mesesFaltantes <= 1) rowStyle = 'background-color: #fff3e0 !important; border-left: 5px solid #ff9800;'; else if (v.mesesFaltantes <= 3) rowStyle = 'background-color: #fffde7 !important; border-left: 5px solid #fdd835;'; } }
        if (s === 'Vencido') rowStyle = 'background-color: #fce8e8 !important; border-left: 5px solid #dc3545;';

        const p = c.pendencias || [];
        const hA = p.some(x => x.tipo === 'atraso_liquidacao'), hEM = p.some(x => x.tipo === 'excesso_valor_mensal'), hEN = p.filter(x => x.tipo === 'excesso_valor_natureza');

        return `<tr class="sispmg-clickable-row ${c.ID === this.activeConvId ? 'sispmg-row-audited' : ''}" style="${rowStyle}" onclick="window.SisPMG_SirconvDashboard.loadAuditData('${c.ID}')">
            <td style="text-align: left;"><strong>${c.ID}</strong></td>
            <td class="sispmg-hide-on-audit" style="text-align: left;">${c.NUMERO_FACE || '-'}</td>
            <td style="text-align: left;">${this.getMunicipioClean(c.CONCEDENTE)}</td>
            <td style="text-align: left;">${this.cleanUnidade(c.UNI_NOME_PRINCIPAL)}</td>
            <td class="sispmg-hide-on-audit" style="text-align: left;">${this.formatDate(c.DTINICIAL)}<br>${this.formatDate(c.DTFINAL)}</td>
            <td class="sispmg-hide-on-audit" style="text-align: center;">${dec}/${dur}</td>
            <td class="sispmg-hide-on-audit" style="text-align: right;">${vEst.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td class="sispmg-hide-on-audit" style="text-align: right; font-weight: bold;">${vLiq.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td class="sispmg-hide-on-audit" style="text-align: right; color: #666;">${(vEst/(dur||1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td class="sispmg-hide-on-audit" style="text-align: right; font-weight: bold; color: #155724;">${(vLiq/(dec||1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td class="sispmg-hide-on-audit" style="text-align: center; font-weight: bold;">${prog}%</td>
            <td style="text-align: center;"><span class="sispmg-status-badge ${s === 'Vigente' ? 'sispmg-status-vigente' : 'sispmg-status-outros'}">${s}</span></td>
            <td style="text-align: center;">
                <div style="display: flex; gap: 4px; justify-content: center;">
                    ${hA ? '<i class="fas fa-clock" title="Atraso Liquidação" style="color: #dc3545;"></i>' : ''}
                    ${hEM ? '<i class="fas fa-chart-line" title="Excesso Mensal" style="color: #dc3545;"></i>' : ''}
                    ${hEN.some(x => x.nivel === 'critico') ? '<i class="fas fa-exclamation-triangle" title="Excesso Crítico" style="color: #dc3545;"></i>' : (hEN.some(x => x.nivel === 'alerta') ? '<i class="fas fa-exclamation-triangle" title="Consumo Acelerado" style="color: #fd7e14;"></i>' : '')}
                </div>
            </td>
        </tr>`;
    }

    updateSummaryCards() {
        const d = this.filteredData.length > 0 ? this.filteredData : this.conveniosData;
        const tE = d.reduce((a, b) => a + (parseFloat(b.audit?.valorEstimadoReal || b.VALOR_ESTIMADO) || 0), 0);
        const tL = d.reduce((a, b) => a + (parseFloat(b.LIQUIDADO) || 0), 0);
        document.getElementById('dash-total-convenios').innerText = d.length;
        document.getElementById('dash-convenios-ativos').innerText = d.filter(c => this.getStatusLabel(c) === 'Vigente').length;
        document.getElementById('dash-valor-total').innerText = tE.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        document.getElementById('dash-valor-liquidado').innerText = tL.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    }

    toggleFilterDropdown(tr, id) {
        this.closeAllFilterDropdowns(tr);
        let dd = document.getElementById(`filter-dropdown-${id}`);
        if (dd) { dd.classList.toggle('show'); if (dd.classList.contains('show')) this.positionDropdown(tr, dd); return; }
        dd = document.createElement('div'); dd.id = `filter-dropdown-${id}`; dd.className = 'sispmg-filter-dropdown show';
        let v = [];
        if (id === 'municipio') v = [...new Set(this.conveniosData.map(c => this.getMunicipioClean(c.CONCEDENTE)))];
        else if (id === 'unidade') v = [...new Set(this.conveniosData.map(c => this.cleanUnidade(c.UNI_NOME_PRINCIPAL)))];
        else if (id === 'status') v = ['Vigente', 'Vencido', 'Inativo'];
        else if (id === 'id') v = [...new Set(this.conveniosData.map(c => c.ID))];
        else if (id === 'numero_face') v = [...new Set(this.conveniosData.map(c => c.NUMERO_FACE || "-"))];
        v.sort(); const sel = this.activeFilters[id] || [];
        dd.innerHTML = `<div class="sispmg-filter-search"><input type="text" placeholder="Pesquisar..." id="search-${id}"></div><div class="sispmg-filter-list">${v.map(val => `<label class="sispmg-filter-item"><input type="checkbox" value="${val}" ${sel.includes(val) ? 'checked' : ''}><span>${val}</span></label>`).join('')}</div><div class="sispmg-filter-actions"><button class="sispmg-filter-btn clear">Limpar</button><button class="sispmg-filter-btn apply">Aplicar</button></div>`;
        document.getElementById('sispmg-plus-container').appendChild(dd); this.positionDropdown(tr, dd);
        dd.querySelector('.apply').onclick = () => { const ch = Array.from(dd.querySelectorAll('input:checked')).map(i => i.value); if (ch.length > 0) { this.activeFilters[id] = ch; tr.classList.add('active'); } else { delete this.activeFilters[id]; tr.classList.remove('active'); } this.applyFilters(); this.closeAllFilterDropdowns(); };
        dd.querySelector('.clear').onclick = () => { delete this.activeFilters[id]; tr.classList.remove('active'); this.applyFilters(); this.closeAllFilterDropdowns(); };
    }

    positionDropdown(t, d) { const r = t.getBoundingClientRect(); d.style.top = `${r.bottom + 5}px`; d.style.left = `${Math.max(10, r.left - 200)}px`; }
    closeAllFilterDropdowns() { document.querySelectorAll('.sispmg-filter-dropdown').forEach(d => d.classList.remove('show')); }
    formatDate(d) { if (!d || d === '-') return '-'; const p = d.split(' ')[0].split(/[\/-]/); return p[0].length === 4 ? `${p[2]}/${p[1]}/${p[0]}` : d; }
    parseDate(d) { if (!d || d === '-') return null; const p = d.split(' ')[0].split(/[\/-]/); return p[0].length === 4 ? new Date(p[0], p[1]-1, p[2]) : new Date(p[2], p[1]-1, p[0]); }
}
