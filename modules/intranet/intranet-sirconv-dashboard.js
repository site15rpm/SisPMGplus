// Funções e lógica para o dashboard de convênios SIRCONV
import { sendMessageToBackground, getCookie } from '../../common/utils.js';
import { iconSVG_28 } from '../../common/icon.js';

export class SirconvDashboardModule {
    constructor(config) {
        this.config = config;
        this.ui = window.SisPMG_UI;
        this.conveniosData = [];
        this.filteredData = [];
        this.activeFilters = {}; // { columnId: [selectedValues] }
        this.isLoading = false;
        this.activeConvId = null;
        this.backgroundAuditQueue = [];
        this.isQueueProcessing = false;
        this.initialLoadComplete = false;
        this.auditCache = {}; // Cache como objeto simples para persistência via sendMessageToBackground
        this.CACHE_TTL = 8 * 60 * 60 * 1000; // 30 minutos de validade padrão
        console.log("SirconvDashboardModule: Instância da UI recebida:", this.ui);
    }

    async init() {
        if (this.ui) {
            await this.loadPersistentCache();
            this.ui.registerModule({ name: 'SIRCONV Dashboard', instance: this });
            console.log("SirconvDashboardModule: Módulo registrado na UI com cache carregado.");
        } else {
            console.error("SirconvDashboardModule: A instância da UI não foi encontrada.");
        }
    }

    async loadPersistentCache() {
        try {
            const response = await sendMessageToBackground('getStorage', { keys: ['sirconv_audit_cache'] });
            if (response && response.success && response.value?.sirconv_audit_cache) {
                this.auditCache = response.value.sirconv_audit_cache;
                // Limpeza de itens expirados (mais de 24h para manter o storage limpo)
                const agora = Date.now();
                let mudou = false;
                for (const id in this.auditCache) {
                    if (agora - this.auditCache[id].timestamp > 24 * 60 * 60 * 1000) {
                        delete this.auditCache[id];
                        mudou = true;
                    }
                }
                if (mudou) await this.savePersistentCache();
                console.log(`[Dashboard] Cache persistente carregado: ${Object.keys(this.auditCache).length} itens.`);
            }
        } catch (e) { console.error("[Dashboard] Erro ao carregar cache do storage:", e); }
    }

    async savePersistentCache() {
        try {
            await sendMessageToBackground('setStorage', { sirconv_audit_cache: this.auditCache });
        } catch (e) { console.error("[Dashboard] Erro ao salvar cache no storage:", e); }
    }

    showDashboard() {
        console.log("SirconvDashboardModule: showDashboard() chamado.");
        document.body.style.overflow = 'hidden';
        
        const container = document.getElementById('sispmg-plus-container');
        if (!container) return;

        document.getElementById('sispmg-sirconv-dashboard-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'sispmg-sirconv-dashboard-overlay';
        overlay.className = 'sispmg-sirconv-dashboard-overlay';

        const modalContainer = document.createElement('div');
        modalContainer.id = 'sispmg-sirconv-dashboard-modal-container';

        // Layout Principal contendo MAIN e SIDEBAR
        modalContainer.innerHTML = `
            <div id="sispmg-dashboard-layout" class="sispmg-dashboard-layout">
                <div class="sispmg-dashboard-main">
                    <div class="sispmg-dashboard-header">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            ${iconSVG_28}
                            <h2>Dashboard de Convênios SIRCONV</h2>
                        </div>
                        <div class="sispmg-dashboard-actions" style="display: flex; align-items: center; gap: 10px;">
                            <div id="sispmg-dashboard-bg-status" style="display: none; align-items: center; gap: 8px; color: #b3a368; font-size: 12px; margin-right: 15px; font-weight: 600;">
                                <i class="fas fa-circle-notch fa-spin"></i>
                                <span>Atualização de segundo plano em andamento...</span>
                            </div>
                            <button id="sispmg-dashboard-force-reload" class="sispmg-dashboard-btn" title="Recarregar dados do zero">
                                <i class="fas fa-sync-alt"></i> Recarregar
                            </button>
                            <button id="sispmg-dashboard-refresh" class="sispmg-dashboard-btn sispmg-dashboard-btn-primary">
                                <i class="fas fa-search"></i> Busca Avançada
                            </button>
                            <button id="sispmg-dashboard-close-global" class="sispmg-global-close">
                                Fechar
                            </button>
                        </div>
                    </div>

                    <div id="sispmg-dashboard-summary" class="sispmg-dashboard-summary">
                        <div class="sispmg-dashboard-card">
                            <span class="sispmg-dashboard-card-value" id="dash-total-convenios">-</span>
                            <span class="sispmg-dashboard-card-label">Total de Convênios</span>
                        </div>
                        <div class="sispmg-dashboard-card">
                            <span class="sispmg-dashboard-card-value" id="dash-convenios-ativos">-</span>
                            <span class="sispmg-dashboard-card-label">Vigentes</span>
                        </div>
                        <div class="sispmg-dashboard-card">
                            <span class="sispmg-dashboard-card-value" id="dash-valor-total">-</span>
                            <span class="sispmg-dashboard-card-label">Valor Estimado (R$)</span>
                        </div>
                        <div class="sispmg-dashboard-card">
                            <span class="sispmg-dashboard-card-value" id="dash-valor-liquidado">-</span>
                            <span class="sispmg-dashboard-card-label">Valor Liquidado (R$)</span>
                        </div>
                    </div>

                    <div class="sispmg-dashboard-table-container">
                        <table class="sispmg-dashboard-table">
                            <thead>
                                <tr>
                                    <th data-col="id" style="text-align: left;">
                                        <div class="sispmg-th-content">Convênio <i class="fas fa-filter sispmg-filter-trigger"></i></div>
                                    </th>
                                    <th data-col="numero_face" class="sispmg-hide-on-audit" style="text-align: left;">
                                        <div class="sispmg-th-content">Nº Face <i class="fas fa-filter sispmg-filter-trigger"></i></div>
                                    </th>
                                    <th data-col="municipio" style="text-align: left;">
                                        <div class="sispmg-th-content">Município <i class="fas fa-filter sispmg-filter-trigger"></i></div>
                                    </th>
                                    <th data-col="unidade" style="text-align: left;">
                                        <div class="sispmg-th-content">Unidade Responsável <i class="fas fa-filter sispmg-filter-trigger"></i></div>
                                    </th>
                                    <th data-col="vigencia" class="sispmg-hide-on-audit" style="text-align: left;">
                                        <div class="sispmg-th-content">Vigência (Fim) <i class="fas fa-filter sispmg-filter-trigger"></i></div>
                                    </th>
                                    <th class="sispmg-hide-on-audit" style="text-align: right;">Valor Estimado (R$)</th>
                                    <th class="sispmg-hide-on-audit" style="text-align: right;">Valor Liquidado (R$)</th>
                                    <th class="sispmg-hide-on-audit" style="text-align: center;">%</th>
                                    <th class="sispmg-hide-on-audit" style="text-align: center;">Progresso</th>
                                    <th data-col="status" style="text-align: center;">
                                        <div class="sispmg-th-content" style="justify-content: center;">Status <i class="fas fa-filter sispmg-filter-trigger"></i></div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody id="sispmg-dashboard-tbody">
                                <tr>
                                    <td colspan="10" style="text-align: center; padding: 40px;">
                                        Carregando dados...
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div id="sispmg-dashboard-sidebar" class="sispmg-dashboard-sidebar">
                    <!-- O conteúdo da auditoria será injetado aqui -->
                </div>
            </div>
        `;

        overlay.appendChild(modalContainer);
        container.appendChild(overlay);

        // Eventos Globais
        const closeBtnGlobal = modalContainer.querySelector('#sispmg-dashboard-close-global');
        if (closeBtnGlobal) {
            closeBtnGlobal.onclick = () => {
                const layout = document.getElementById('sispmg-dashboard-layout');
                const sidebar = document.getElementById('sispmg-dashboard-sidebar');
                
                if (layout && (layout.classList.contains('audit-active') || layout.classList.contains('filter-active'))) {
                    sidebar.classList.remove('active');
                    layout.classList.remove('audit-active');
                    layout.classList.remove('filter-active');
                    this.activeConvId = null;
                    this.renderDashboard(true);
                } else {
                    this.closeAllFilterDropdowns();
                    overlay.remove();
                    document.body.style.overflow = '';
                }
            };
        }

        const reloadBtn = modalContainer.querySelector('#sispmg-dashboard-force-reload');
        if (reloadBtn) {
            reloadBtn.onclick = async () => {
                if (confirm("Deseja realmente limpar o cache persistente e recarregar todos os dados do zero?")) {
                    this.auditCache = {};
                    await sendMessageToBackground('removeStorage', { keys: ['sirconv_audit_cache'] });
                    this.fetchConveniosData('ativos');
                }
            };
        }

        const refreshBtn = modalContainer.querySelector('#sispmg-dashboard-refresh');
        if (refreshBtn) {
            refreshBtn.onclick = () => this.showFilterSidebar();
        }

        const filterTriggers = modalContainer.querySelectorAll('.sispmg-filter-trigger');
        filterTriggers.forEach(trigger => {
            trigger.onclick = (e) => {
                e.stopPropagation();
                const th = trigger.closest('th');
                const colId = th.dataset.col;
                this.toggleFilterDropdown(trigger, colId);
            };
        });

        overlay.onclick = (e) => {
            if (e.target === overlay) {
                this.closeAllFilterDropdowns();
            }
        };
        modalContainer.onclick = () => this.closeAllFilterDropdowns();

        this.fetchConveniosData('ativos');
    }

    updateBackgroundStatus(isActive, message = "Atualização de segundo plano em andamento...") {
        const statusEl = document.getElementById('sispmg-dashboard-bg-status');
        if (!statusEl) return;
        
        if (isActive) {
            statusEl.style.display = 'flex';
            statusEl.querySelector('span').innerText = message;
        } else {
            statusEl.style.display = 'none';
        }
    }

    showFilterSidebar() {
        const layout = document.getElementById('sispmg-dashboard-layout');
        const sidebar = document.getElementById('sispmg-dashboard-sidebar');
        
        if (!layout || !sidebar) return;

        layout.classList.remove('audit-active');
        layout.classList.add('filter-active');
        sidebar.classList.add('active');

        const municipios = [...new Set(this.conveniosData.map(c => this.getMunicipioClean(c.CONCEDENTE)))].sort();

        sidebar.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%;">
                <h2 style="color: #574e2d; font-size: 18px; border-bottom: 2px solid #b3a368; padding-bottom: 10px; margin-top: 0; margin-bottom: 20px;">
                    <i class="fas fa-filter"></i> Busca Avançada
                </h2>

                <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 20px;">
                    <div>
                        <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 13px;">Tipo de Busca:</label>
                        <select id="sispmg-dashboard-tipo-busca" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #dcd3c5; background: #fff;">
                            <option value="ativos" selected>Convênios Ativos</option>
                            <option value="todos">Todos os Convênios (Concedentes na Página)</option>
                        </select>
                        <p style="font-size: 11px; color: #666; margin-top: 5px;">A opção 'Todos' extrai dados de cada concedente listado na página atual da Intranet.</p>
                    </div>

                    <div>
                        <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 13px;">Tipo de Pendência (Auditoria):</label>
                        <select id="sispmg-filter-tipo" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #dcd3c5; background: #fff;">
                            <option value="todos">Todas as Pendências</option>
                            <option value="atraso_liquidacao">Atraso na Liquidação</option>
                            <option value="excesso_valor">Excesso de Valor</option>
                        </select>
                    </div>

                    <div>
                        <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 13px;">Período de Referência:</label>
                        <select id="sispmg-filter-periodo" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #dcd3c5; background: #fff;">
                            <option value="todos">Todos os Períodos</option>
                            <option value="ano_atual">Ano Atual</option>
                            <option value="mes_anterior">Mês Anterior</option>
                            <option value="mes_atual">Mês Atual</option>
                            <option value="manual">Digitar Mês/Ano</option>
                        </select>
                        <input type="text" id="sispmg-filter-manual" placeholder="JAN 2026" 
                               style="display: none; width: 100%; margin-top: 10px; padding: 10px; border-radius: 6px; border: 1px solid #dcd3c5; text-transform: uppercase;">
                    </div>

                    <div>
                        <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 13px;">Município Específico:</label>
                        <select id="sispmg-filter-municipio" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #dcd3c5; background: #fff;">
                            <option value="todos">Todos os Municípios</option>
                            ${municipios.map(m => `<option value="${m}">${m}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div style="padding-top: 20px; border-top: 1px solid #dcd3c5;">
                    <button id="sispmg-btn-start-audit" class="sispmg-dashboard-btn sispmg-dashboard-btn-primary" style="width: 100%; padding: 12px;">
                        <i class="fas fa-play"></i> Iniciar Auditoria Avançada
                    </button>
                </div>
            </div>
        `;

        const selectPeriodo = sidebar.querySelector('#sispmg-filter-periodo');
        const inputManual = sidebar.querySelector('#sispmg-filter-manual');
        if (selectPeriodo && inputManual) {
            selectPeriodo.onchange = () => {
                inputManual.style.display = selectPeriodo.value === 'manual' ? 'block' : 'none';
            };
        }

        const startBtn = sidebar.querySelector('#sispmg-btn-start-audit');
        if (startBtn) {
            startBtn.onclick = async () => {
                const tipoBusca = sidebar.querySelector('#sispmg-dashboard-tipo-busca').value;
                const filtros = {
                    tipo: sidebar.querySelector('#sispmg-filter-tipo').value,
                    periodo: sidebar.querySelector('#sispmg-filter-periodo').value,
                    manual: sidebar.querySelector('#sispmg-filter-manual').value.toUpperCase().trim(),
                    municipio: sidebar.querySelector('#sispmg-filter-municipio').value
                };

                sidebar.classList.remove('active');
                layout.classList.remove('filter-active');

                await this.fetchConveniosData(tipoBusca, filtros.municipio);
                this.startDeepAudit(filtros);
            };
        }
    }

    async startDeepAudit(filtros = { tipo: 'todos', periodo: 'todos', municipio: 'todos' }) {
        if (this.isLoading || this.conveniosData.length === 0) return;
        this.isLoading = true;
        
        let conveniosParaAuditar = this.conveniosData;
        
        if (filtros.municipio !== 'todos') {
            conveniosParaAuditar = this.conveniosData.filter(c => this.getMunicipioClean(c.CONCEDENTE) === filtros.municipio);
        }

        const total = conveniosParaAuditar.length;
        if (this.ui) this.ui.showLoader(`Iniciando auditoria: 0 de ${total} (0%)`);

        try {
            let count = 0;
            for (let conv of conveniosParaAuditar) {
                count++;
                const percent = Math.round((count / total) * 100);
                if (this.ui) this.ui.updateLoaderMessage(`Auditando convênios: ${count} de ${total} (${percent}%)`);

                try {
                    if (!conv.audit) {
                        const auditData = await this.performDeepAudit(conv.ID);
                        if (auditData) {
                            conv.audit = auditData;
                            const totalLiq = auditData.planoItens.reduce((sum, p) => sum + (parseFloat(p.valorExecutado) || 0), 0);
                            if (totalLiq > 0) conv.LIQUIDADO = totalLiq;
                        }
                    }
                    
                    if (conv.audit) {
                        conv.pendencias = this.analisarPendencias(conv.audit, filtros);
                    }
                } catch (e) {
                    console.error(`Erro ao auditar convênio ${conv.ID}:`, e);
                }

                if (count % 5 === 0 || count === total) {
                    this.applyFilters();
                    this.updateSummaryCards();
                }
            }
        } catch (error) {
            console.error("Erro durante auditoria profunda:", error);
        } finally {
            this.isLoading = false;
            if (this.ui) this.ui.hideLoader();
        }
    }

    // --- SISTEMA DE QUEUE EM SEGUNDO PLANO ---

    async processBackgroundQueue() {
        if (this.isQueueProcessing || this.backgroundAuditQueue.length === 0) return;
        this.isQueueProcessing = true;

        const initialSize = this.backgroundAuditQueue.length;
        console.log(`[Dashboard] Processamento em segundo plano iniciado: ${initialSize} itens na fila.`);
        this.updateBackgroundStatus(true, "Atualização de segundo plano: 0%");

        let processed = 0;
        while (this.backgroundAuditQueue.length > 0) {
            const convId = this.backgroundAuditQueue.shift();
            const conv = this.conveniosData.find(c => String(c.ID) === String(convId));

            if (conv && !conv.audit) {
                try {
                    const auditData = await this.performDeepAudit(convId);
                    if (auditData) {
                        conv.audit = auditData;
                        conv.pendencias = this.analisarPendencias(auditData);
                        
                        const totalLiq = auditData.planoItens.reduce((sum, p) => sum + (parseFloat(p.valorExecutado) || 0), 0);
                        if (totalLiq > 0) conv.LIQUIDADO = totalLiq;

                        const row = document.querySelector(`.sispmg-clickable-row[onclick*="'${convId}'"]`);
                        if (row) {
                            this.updateRowStatus(row, conv);
                            if (totalLiq > 0) {
                                const liqCell = row.querySelector('td:nth-child(7)');
                                if (liqCell) liqCell.innerText = totalLiq.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                            }
                        }
                    }
                } catch (e) {
                    console.error(`[Dashboard] Erro no background audit do convênio ${convId}:`, e);
                }
                processed++;
                const percent = Math.round((processed / initialSize) * 100);
                this.updateBackgroundStatus(true, `Atualização de segundo plano: ${percent}%`);
                await new Promise(r => setTimeout(r, 800));
            }
        }

        this.isQueueProcessing = false;
        this.updateBackgroundStatus(false);
        this.updateSummaryCards();
        console.log("[Dashboard] Processamento em segundo plano finalizado.");
    }

    updateRowStatus(row, conv) {
        const statusCell = row.cells[row.cells.length - 1];
        if (!statusCell) return;

        const hasAtraso = conv.pendencias?.some(p => p.tipo === 'atraso_liquidacao');
        const hasExcesso = conv.pendencias?.some(p => p.tipo === 'excesso_valor');

        const pendContainer = statusCell.querySelector('.sispmg-pendencias-container');
        if (pendContainer) {
            pendContainer.innerHTML = `
                <div class="sispmg-pendencia-slot">
                    ${hasAtraso ? '<i class="fas fa-clock" title="Atraso na Liquidação" style="color: #dc3545; font-size: 14px;"></i>' : ''}
                </div>
                <div class="sispmg-pendencia-slot">
                    ${hasExcesso ? '<i class="fas fa-exclamation-triangle" title="Excesso de Valor" style="color: #dc3545; font-size: 14px;"></i>' : ''}
                </div>
            `;
        }
    }

    async performDeepAudit(convId, ignoreCache = false) {
        const cached = this.auditCache[String(convId)];
        if (!ignoreCache && cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
            console.log(`[Dashboard] Usando cache para convênio ${convId}.`);
            return cached.data;
        }

        const res = await fetch(`https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/convenio/view?id=${convId}`);
        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        let planoItens = [];
        try {
            const token = getCookie('tokiuz');
            const planoResponse = await sendMessageToBackground('fetchConvenioPlano', { convenioId: convId, token });
            if (planoResponse && planoResponse.success && planoResponse.data && planoResponse.data.planos) {
                planoItens = planoResponse.data.planos.map(p => ({
                    naturezaId: p.NATUREZA_ID,
                    naturezaItem: p.NATUREZA_ITEM,
                    nome: `${p.ITEM} - ${p.NATUREZA_ITEM}`,
                    valorEstimado: parseFloat(p.VALOR) || 0,
                    valorExecutado: 0
                }));
            }
        } catch (errApi) { console.error(`Erro API Plano ${convId}:`, errApi); }

        const cronogramas = [];
        const processedIds = new Set();
        const cronoLinks = doc.querySelectorAll('a.item.flex-linha');
        
        cronoLinks.forEach(linkRow => {
            let detalheIdMatch = linkRow.getAttribute('onclick')?.match(/detalheCronograma-(\d+)/);
            if (!detalheIdMatch) return;
            const detalheId = detalheIdMatch[1];
            if (processedIds.has(detalheId)) return;
            processedIds.add(detalheId);

            const mesEl = linkRow.querySelector('.ne');
            if (!mesEl || mesEl.tagName.toLowerCase() === 'tr') return;
            const mesTexto = mesEl.innerText.replace(/[\n\r]/g, '').replace(/(\d+)\s+anexos?/, '').trim();
            if (!/^[A-Za-z]{3}\s\d{4}$/.test(mesTexto) && !mesTexto.includes('202')) return;

            let valorPrev = 0, valorExec = 0, prazoLimite = '-', dataLiquidado = '-', status = 'Aguardando execução';
            const spans = linkRow.querySelectorAll('span.flex-coluna');
            spans.forEach(span => {
                const fullText = span.textContent.trim();
                const labelDiv = span.querySelector('div.tc.menor');
                if (labelDiv) {
                    const label = labelDiv.textContent.trim();
                    const match = fullText.match(/R\$\s*([\d\.,]+)/);
                    if (label === 'Valor' && match) valorPrev = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
                    else if (label === 'Executado' && match) valorExec = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
                    else if (label === 'Prazo limite') prazoLimite = fullText.replace('Prazo limite', '').trim();
                }
                const dtElement = span.querySelector('dl.ic dt');
                if (dtElement) dataLiquidado = dtElement.textContent.trim();
            });

            if (spans.length > 0) {
                const lastSpan = spans[spans.length - 1];
                const iconNode = lastSpan.querySelector('span.ic, dl.ic');
                if (iconNode) {
                    if (iconNode.hasAttribute('title')) status = iconNode.getAttribute('title').trim();
                    else {
                        if (iconNode.classList.contains('senha')) status = 'Liquidado';
                        else if (iconNode.classList.contains('erro')) status = 'Liquidado fora do prazo';
                        else if (iconNode.classList.contains('aberto')) status = 'Aguardando execução';
                    }
                }
            }

            cronogramas.push({ mesTexto, valorPrevisto: valorPrev, valorExecutado: valorExec, prazoLimite, dataLiquidado, status });
        });

        // Nova lógica de extração de valores executados por natureza
        // 1. Criar mapa de Natureza (Nome -> Código) a partir de datalists e selects na página
        const normalize = s => (s || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, ' ');
        const natureIdMap = new Map();
        
        // Coleta de datalists (formato: "ID - NOME")
        doc.querySelectorAll('#natureza option').forEach(opt => {
            const text = (opt.textContent || opt.innerText || '').trim();
            if (text.includes(' - ')) {
                const parts = text.split(' - ');
                const val = parts[0].trim();
                const name = parts.slice(1).join(' - ').trim();
                if (val && name) natureIdMap.set(normalize(name), val);
            }
        });

        // Coleta de selects (formato: value=ID, text=NOME)
        doc.querySelectorAll('select[name^="NATUREZA_ID"] option').forEach(opt => {
            const val = opt.getAttribute('value');
            const name = (opt.textContent || opt.innerText || '').trim();
            if (val && name && !val.includes('{')) {
                natureIdMap.set(normalize(name), val);
            }
        });

        // 2. Coletar e somar todos os valores de todas as tabelas 't1' que contêm naturezas
        const execucoesPorNatureza = new Map(); // Pode ser ID ou Nome Normalizado
        doc.querySelectorAll('table.t1').forEach(table => {
            const tableText = (table.textContent || '').toUpperCase();
            if (!tableText.includes('NATUREZA')) return;

            table.querySelectorAll('tbody tr').forEach(tr => {
                if (tr.querySelector('th') || tr.classList.contains('ci') || tr.classList.contains('ne')) return;
                const tds = tr.querySelectorAll('td');
                if (tds.length >= 6) {
                    const natNomeRaw = (tds[0].textContent || '').trim();
                    if (!natNomeRaw) return;

                    const valTotalStr = (tds[5].textContent || '').trim();
                    const valUnitStr = (tds[3].textContent || '').trim();
                    
                    let itemValorExec = parseFloat(valTotalStr.replace(/\./g, '').replace(',', '.')) || 0;
                    if (itemValorExec === 0) {
                        itemValorExec = parseFloat(valUnitStr.replace(/\./g, '').replace(',', '.')) || 0;
                    }

                    if (itemValorExec > 0) {
                        const normName = normalize(natNomeRaw);
                        const code = natureIdMap.get(normName);
                        
                        // Aglutina pelo nome normalizado
                        execucoesPorNatureza.set(normName, (execucoesPorNatureza.get(normName) || 0) + itemValorExec);
                        
                        // Se encontramos um ID, aglutina pelo ID também
                        if (code) {
                            const codeKey = String(code);
                            execucoesPorNatureza.set(codeKey, (execucoesPorNatureza.get(codeKey) || 0) + itemValorExec);
                        }
                    }
                }
            });
        });

        // 3. Atualizar planoItens com os valores aglutinados
        planoItens.forEach(p => {
            const codeKey = p.naturezaId ? String(p.naturezaId) : null;
            const nameKey = normalize(p.naturezaItem);
            const nameFromNomeKey = normalize(p.nome.split(' - ').slice(1).join(' - '));
            
            // Tenta match por ID, depois por nome da natureza vindo da API, depois por nome processado
            let valor = 0;
            if (codeKey && execucoesPorNatureza.has(codeKey)) {
                valor = execucoesPorNatureza.get(codeKey);
            } else if (nameKey && execucoesPorNatureza.has(nameKey)) {
                valor = execucoesPorNatureza.get(nameKey);
            } else if (nameFromNomeKey && execucoesPorNatureza.has(nameFromNomeKey)) {
                valor = execucoesPorNatureza.get(nameFromNomeKey);
            } else {
                // Tenta um match parcial nos nomes como último recurso
                for (let [key, val] of execucoesPorNatureza.entries()) {
                    if (isNaN(key)) { // Se a chave for um nome e não um ID
                        if (key.includes(nameKey) || nameKey.includes(key) || key.includes(nameFromNomeKey) || nameFromNomeKey.includes(key)) {
                            valor = val;
                            break;
                        }
                    }
                }
            }
            p.valorExecutado = valor;
        });

        const historico = [];
        doc.querySelectorAll('#historico .item').forEach(row => {
            const dataEl = row.querySelector('.tc');
            if (dataEl) {
                const data = dataEl.innerText.trim();
                let log = row.innerText.replace(data, '').trim().replace(/\n\s*\n/g, '<br>').replace(/\n/g, ' ');
                if (log) historico.push({ data, log });
            }
        });

        const auditResult = { cronogramas, planoItens, historico, lastUpdate: new Date().toLocaleString() };
        this.auditCache[String(convId)] = { data: auditResult, timestamp: Date.now() };
        await this.savePersistentCache();
        return auditResult;
    }

    analisarPendencias(audit, filtros = { tipo: 'todos', periodo: 'todos', manual: '' }) {
        const pendencias = [];
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const mesAtual = hoje.getMonth();
        let filtroMes = null, filtroAno = null;

        if (filtros.periodo === 'ano_atual') filtroAno = anoAtual;
        else if (filtros.periodo === 'mes_anterior') {
            const d = new Date(anoAtual, mesAtual - 1, 1);
            filtroMes = d.getMonth(); filtroAno = d.getFullYear();
        } else if (filtros.periodo === 'mes_atual') {
            filtroMes = mesAtual; filtroAno = anoAtual;
        } else if (filtros.periodo === 'manual' && filtros.manual) {
            const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
            const e = filtros.manual.toUpperCase().replace(/[\/\s-]/g, '');
            const mT = e.match(/^([A-Z]{3})(\d{4})$/), mN = e.match(/^(\d{1,2})(\d{4})$/);
            if (mT) { filtroMes = meses.indexOf(mT[1]); filtroAno = parseInt(mT[2]); }
            else if (mN) { filtroMes = parseInt(mN[1]) - 1; filtroAno = parseInt(mN[2]); }
        }

        const isNoPeriodo = (mesTexto) => {
            if (filtros.periodo === 'todos') return true;
            const p = mesTexto?.split(' '); if (!p || p.length !== 2) return false;
            const mMap = { 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };
            const m = mMap[p[0]], a = parseInt(p[1]);
            return (filtroAno === null || a === filtroAno) && (filtroMes === null || m === filtroMes);
        };

        if (filtros.tipo === 'todos' || filtros.tipo === 'excesso_valor') {
            audit.cronogramas.forEach(c => {
                if (isNoPeriodo(c.mesTexto) && c.valorExecutado > c.valorPrevisto + 0.01) pendencias.push({ tipo: 'excesso_valor', msg: `Excesso em ${c.mesTexto}` });
            });
            audit.planoItens.forEach(p => {
                if (p.valorExecutado > p.valorEstimado + 0.01) pendencias.push({ tipo: 'excesso_valor', msg: `Excesso na natureza: ${p.nome}` });
            });
        }
        if (filtros.tipo === 'todos' || filtros.tipo === 'atraso_liquidacao') {
            audit.cronogramas.forEach(c => {
                if (isNoPeriodo(c.mesTexto) && c.status !== 'Liquidado' && c.status !== 'Liquidado fora do prazo') {
                    if (c.prazoLimite && c.prazoLimite !== '-') {
                        const pt = c.prazoLimite.split('/');
                        if (new Date(pt[2], pt[1] - 1, pt[0]) < hoje) pendencias.push({ tipo: 'atraso_liquidacao', msg: `Atraso em ${c.mesTexto}` });
                    }
                }
            });
        }
        return pendencias;
    }

    async fetchConveniosData(tipo = 'ativos', municipioFiltro = 'todos') {
        if (this.isLoading) return;
        this.isLoading = true;
        if (this.ui) this.ui.showLoader(tipo === 'todos' ? 'Extraindo dados de todos os concedentes...' : 'Carregando meus convênios...');
        try {
            if (tipo === 'ativos') {
                const pesquisa = JSON.stringify({ preposto: "", numeroConvenio: "", numeroFace: "", todasUnidades: "", unidade: "", status: "", dtInicio1: null, dtInicio2: null, dtFim1: null, dtFim2: null });
                const res = await fetch(`https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/convenio/meus-convenios?pesquisa=${encodeURIComponent(pesquisa)}`);
                const data = await res.json();
                if (data?.convenios) {
                    this.conveniosData = data.convenios.map(c => {
                        const cached = this.auditCache[String(c.ID)];
                        let audit = null, liq = parseFloat(c.LIQUIDADO) || 0;
                        if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
                            audit = cached.data;
                            const totalLiq = audit.planoItens.reduce((sum, p) => sum + (parseFloat(p.valorExecutado) || 0), 0);
                            if (totalLiq > 0) liq = totalLiq;
                        }
                        return { ...c, LIQUIDADO: liq, audit, pendencias: audit ? this.analisarPendencias(audit) : [] };
                    });
                } else throw new Error("Estrutura inválida.");
            } else {
                this.conveniosData = await this.fetchAllConveniosFromConcedentes(municipioFiltro);
            }
            this.activeFilters = {}; this.applyFilters();
            this.backgroundAuditQueue = this.filteredData.filter(c => !c.audit && this.getStatusLabel(c) === 'Vigente').map(c => c.ID);
            this.processBackgroundQueue();
        } catch (error) {
            console.error("Erro Dashboard:", error);
            alert("Erro ao carregar dados.");
        } finally {
            this.isLoading = false; if (this.ui) this.ui.hideLoader();
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
                        let cod = lIdM ? lIdM[1] : '';
                        let face = '', val = '0', uni = '-', vig = '-', st = 'S';
                        item.querySelectorAll('.flex-coluna').forEach(col => {
                            const lblEl = col.querySelector('.tc.menor'), lbl = lblEl?.innerText.trim() || '', v = col.innerText.replace(lbl, '').trim();
                            if (lbl === 'Código' || lbl.includes('N°')) { if (!cod) cod = v.replace(/\D/g, ''); }
                            else if (lbl === 'Nº face') face = v;
                            else if (lbl === 'Valor' || lbl === 'Valor R$') val = v;
                            else if (lbl === 'Unidade') uni = v;
                            else if (lbl === 'Término') vig = v;
                            if (!lblEl && col.innerText.trim()) {
                                const t = col.innerText.trim().toLowerCase();
                                if (t.includes('finalizado') || t.includes('cancelado') || t.includes('inativo')) st = 'N';
                            }
                        });
                        if (!cod) continue;
                        try {
                            const cached = this.auditCache[String(cod)];
                            let audit = null, liq = 0;
                            if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
                                audit = cached.data;
                                liq = audit.planoItens.reduce((sum, p) => sum + (parseFloat(p.valorExecutado) || 0), 0);
                            }
                            const resJ = await fetch(`https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/convenio/get-convenio-detalhes?id=${cod}`);
                            const dj = await resJ.json();
                            if (dj.success && dj.convenio) {
                                const conv = dj.convenio;
                                resultados.push({
                                    ID: conv.ID || conv.id || cod, NUMERO_FACE: conv.NUMERO_FACE || conv.numero_face || face || '-', CONCEDENTE: nReal, UNI_NOME_PRINCIPAL: conv.UNI_NOME_PRINCIPAL || conv.unidade_responsavel || uni || '-', DTFINAL: conv.DTFINAL || conv.dt_fim || vig || '-',
                                    VALOR_ESTIMADO: parseFloat(conv.VALOR_ESTIMADO || conv.valor_estimado) || parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0,
                                    LIQUIDADO: liq || parseFloat(conv.LIQUIDADO || conv.liquidado || conv.VALOR_LIQUIDADO || conv.valor_liquidado || conv.TOTAL_LIQUIDADO) || 0,
                                    ATIVO: conv.ATIVO || conv.ativo || st, VENCIDO: conv.VENCIDO || conv.vencido || (vig !== '-' && new Date(vig.split('/').reverse().join('-')) < new Date() ? '1' : '0'), 
                                    audit, pendencias: audit ? this.analisarPendencias(audit) : []
                                });
                            } else {
                                resultados.push({ ID: cod, NUMERO_FACE: face || '-', CONCEDENTE: nReal, UNI_NOME_PRINCIPAL: uni, DTFINAL: vig, VALOR_ESTIMADO: parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0, LIQUIDADO: liq, ATIVO: st, VENCIDO: vig !== '-' && new Date(vig.split('/').reverse().join('-')) < new Date() ? '1' : '0', audit, pendencias: audit ? this.analisarPendencias(audit) : [] });
                            }
                        } catch (e) { console.error(e); }
                        await new Promise(r => setTimeout(r, 100));
                    }
                }
            } catch (e) { console.error(e); }
            await new Promise(r => setTimeout(r, 150));
        }
        return resultados;
    }

    updateSummaryCards() {
        const data = this.filteredData.length > 0 ? this.filteredData : this.conveniosData;
        if (!data || data.length === 0) return;
        const totalEst = data.reduce((acc, conv) => acc + (parseFloat(conv.VALOR_ESTIMADO) || 0), 0);
        const totalLiq = data.reduce((acc, conv) => acc + (parseFloat(conv.LIQUIDADO) || 0), 0);
        const ativos = data.filter(conv => this.getStatusLabel(conv) === 'Vigente').length;
        const elTotal = document.getElementById('dash-total-convenios'), elEst = document.getElementById('dash-valor-total'), elLiq = document.getElementById('dash-valor-liquidado'), elAtivos = document.getElementById('dash-convenios-ativos');
        if (elTotal) elTotal.innerText = data.length;
        if (elEst) elEst.innerText = totalEst.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        if (elLiq) elLiq.innerText = totalLiq.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        if (elAtivos) elAtivos.innerText = ativos;
    }

    async loadAuditData(convId) {
        this.activeConvId = convId;
        const conv = this.conveniosData.find(c => String(c.ID) === String(convId));
        if (!conv) return;
        const qIndex = this.backgroundAuditQueue.indexOf(convId);
        if (qIndex !== -1) this.backgroundAuditQueue.splice(qIndex, 1);
        const cached = this.auditCache[String(convId)];
        if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
            conv.audit = cached.data;
            conv.pendencias = this.analisarPendencias(conv.audit);
            this.renderAuditSidebar(conv); 
            return; 
        }
        if (this.ui) this.ui.showLoader(`Buscando detalhes do convênio ${convId}...`);
        try {
            const auditData = await this.performDeepAudit(convId);
            if (auditData) {
                conv.audit = auditData;
                conv.pendencias = this.analisarPendencias(auditData);
                const totalLiq = auditData.planoItens.reduce((sum, p) => sum + (parseFloat(p.valorExecutado) || 0), 0);
                if (totalLiq > 0) conv.LIQUIDADO = totalLiq;
                this.renderAuditSidebar(conv);
                this.updateSummaryCards();
            }
        } catch (e) { console.error(e); alert("Erro ao buscar detalhes."); } finally { if (this.ui) this.ui.hideLoader(); }
    }

    renderAuditSidebar(conv) {
        const audit = conv.audit, layout = document.getElementById('sispmg-dashboard-layout'), sidebar = document.getElementById('sispmg-dashboard-sidebar');
        if (!layout || !sidebar) return;
        layout.classList.remove('filter-active'); layout.classList.add('audit-active');
        sidebar.innerHTML = `
            <h2 style="color: #574e2d; font-size: 20px; border-bottom: 2px solid #b3a368; padding-bottom: 10px; margin-top: 0; margin-bottom: 15px; overflow: visible !important;">
                Convênio ${conv.ID} - ${this.getMunicipioClean(conv.CONCEDENTE)}
            </h2>
            <div style="flex-grow: 1; overflow-y: auto; padding-right: 10px;">
                <div style="margin-top: 5px;">
                    <h3 style="font-size: 16px; color: #333;"><i class="fas fa-list-check"></i> Plano de Trabalho (Naturezas)</h3>
                    <div class="sispmg-dashboard-table-container">
                        <table class="sispmg-dashboard-table" style="min-width: 100%;">
                            <thead><tr><th style="text-align: left;">Item / Natureza</th><th style="text-align: right;">Previsto (R$)</th><th style="text-align: right;">Executado (R$)</th><th style="text-align: center;">%</th><th style="text-align: center;">Progresso</th></tr></thead>
                            <tbody>${audit.planoItens.length > 0 ? audit.planoItens.map(p => {
                                const prog = p.valorEstimado > 0 ? ((p.valorExecutado / p.valorEstimado) * 100).toFixed(1) : 0, isE = parseFloat(prog) > 100, isC = parseFloat(prog) >= 100;
                                let corP = isE ? '#dc3545' : (isC ? '#b3a368' : '#28a745'), corT = p.valorExecutado > 0 ? (isE ? '#dc3545' : '#155724') : '#666';
                                return `<tr><td>${p.nome}</td><td style="text-align: right;">${p.valorEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="text-align: right; font-weight: 600; color: ${corT};">${p.valorExecutado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="text-align: center; font-weight: 600; color: ${corT};">${prog}%</td><td style="text-align: center;"><div style="background: #eee; width: 60px; border-radius: 4px; overflow: hidden; height: 10px; display: inline-block; vertical-align: middle;"><div style="background: ${corP}; height: 100%; width: ${prog > 100 ? 100 : prog}%;"></div></div></td></tr>`;
                            }).join('') : '<tr><td colspan="5" style="text-align: center;">Nenhum registro no plano.</td></tr>'}</tbody>
                            ${audit.planoItens.length > 0 ? `<tfoot><tr style="background: #fbf8f5; font-weight: 700; border-top: 2px solid #dcd3c5;"><td style="text-align: right;">Total:</td><td style="text-align: right;">${audit.planoItens.reduce((a, b) => a + b.valorEstimado, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="text-align: right; color: #155724;">${audit.planoItens.reduce((a, b) => a + b.valorExecutado, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="text-align: center; color: #000;">${audit.planoItens.reduce((a, b) => a + b.valorEstimado, 0) > 0 ? ((audit.planoItens.reduce((a, b) => a + b.valorExecutado, 0) / audit.planoItens.reduce((a, b) => a + b.valorEstimado, 0)) * 100).toFixed(1) + '%' : '0%'}</td><td></td></tr></tfoot>` : ''}
                        </table>
                    </div>
                </div>
                <div style="margin-top: 25px;">
                    <h3 style="font-size: 16px; color: #333;"><i class="fas fa-calendar-alt"></i> Cronograma Mensal</h3>
                    <div class="sispmg-dashboard-table-container">
                        <table class="sispmg-dashboard-table" style="min-width: 100%;">
                            <thead><tr><th style="text-align: left;">Mês</th><th style="text-align: right;">Previsto (R$)</th><th style="text-align: right;">Executado (R$)</th><th style="text-align: center;">%</th><th style="text-align: center;">Progresso</th><th style="text-align: left;">Prazo Limite</th><th style="text-align: left;">Data Liq.</th><th style="text-align: center;">Status</th></tr></thead>
                            <tbody>${audit.cronogramas.length > 0 ? audit.cronogramas.map(c => {
                                const pC = c.valorPrevisto > 0 ? ((c.valorExecutado / c.valorPrevisto) * 100).toFixed(1) : (c.valorExecutado > 0 ? 100 : 0), isCE = c.valorExecutado > c.valorPrevisto, isCC = parseFloat(pC) >= 100, corC = c.valorExecutado > 0 ? (isCE ? '#dc3545' : '#155724') : 'inherit', corPC = isCE ? '#dc3545' : (isCC ? '#b3a368' : '#28a745');
                                return `<tr><td style="white-space: nowrap;">${c.mesTexto || "-"}</td><td style="text-align: right;">${(c.valorPrevisto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="text-align: right; font-weight: 600; color: ${corC};">${(c.valorExecutado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="text-align: center; font-weight: 600; color: ${corC};">${pC}%</td><td style="text-align: center;"><div style="background: #eee; width: 60px; border-radius: 4px; overflow: hidden; height: 10px; display: inline-block; vertical-align: middle;"><div style="background: ${corPC}; height: 100%; width: ${parseFloat(pC) > 100 ? 100 : pC}%;"></div></div></td><td>${c.prazoLimite || "-"}</td><td>${c.dataLiquidado || "-"}</td><td style="text-align: center;"><span class="sispmg-status-badge ${c.status === 'Liquidado' ? 'sispmg-status-vigente' : 'sispmg-status-outros'}">${c.status || "Pendente"}</span></td></tr>`;
                            }).join('') : '<tr><td colspan="8" style="text-align: center;">Nenhum registro extraído.</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
                <div style="margin-top: 25px; margin-bottom: 20px;">
                    <h3 style="font-size: 16px; color: #333;"><i class="fas fa-history"></i> Histórico de Alterações</h3>
                    <div style="background: #fff; border: 1px solid #dcd3c5; border-radius: 6px; padding: 10px; font-size: 12px; max-height: 250px; overflow-y: auto;">
                        ${audit.historico.length > 0 ? audit.historico.map(h => `<div style="margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px;"><strong style="color: #b3a368;">${h.data}</strong><br>${h.log}</div>`).join('') : 'Nenhum histórico registrado.'}
                    </div>
                </div>
            </div>
        `;
        sidebar.classList.add('active'); this.renderDashboard(true);
    }

    getMunicipioClean(concedente) {
        if (!concedente) return "-"; let nome = concedente;
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
        else if (colId === 'vigencia') values = [...new Set(this.conveniosData.map(c => this.formatDate(c.DTFINAL)))];
        else if (colId === 'id') values = [...new Set(this.conveniosData.map(c => c.ID))];
        else if (colId === 'numero_face') values = [...new Set(this.conveniosData.map(c => c.NUMERO_FACE || "-"))];
        values.sort(); const selected = this.activeFilters[colId] || [];
        dropdown.innerHTML = `<div class="sispmg-filter-search"><input type="text" placeholder="Pesquisar..." id="search-${colId}"></div><div class="sispmg-filter-list" id="list-${colId}">${values.map(val => `<label class="sispmg-filter-item"><input type="checkbox" value="${val}" ${selected.includes(val) ? 'checked' : ''}><span>${val}</span></label>`).join('')}</div><div class="sispmg-filter-actions"><button class="sispmg-filter-btn sispmg-filter-btn-clear">Limpar</button><button class="sispmg-filter-btn sispmg-filter-btn-apply">Aplicar</button></div>`;
        document.getElementById('sispmg-plus-container').appendChild(dropdown); this.positionDropdown(trigger, dropdown);
        dropdown.onclick = (e) => e.stopPropagation();
        const searchInput = dropdown.querySelector(`#search-${colId}`); searchInput.oninput = () => { const term = searchInput.value.toLowerCase(); dropdown.querySelectorAll('.sispmg-filter-item').forEach(item => { const text = item.querySelector('span').innerText.toLowerCase(); item.style.display = text.includes(term) ? 'flex' : 'none'; }); };
        dropdown.querySelector('.sispmg-filter-btn-apply').onclick = () => { const checked = Array.from(dropdown.querySelectorAll('input[type="checkbox"]:checked')).map(i => i.value); if (checked.length > 0) { this.activeFilters[colId] = checked; trigger.classList.add('active'); } else { delete this.activeFilters[colId]; trigger.classList.remove('active'); } this.applyFilters(); this.closeAllFilterDropdowns(); };
        dropdown.querySelector('.sispmg-filter-btn-clear').onclick = () => { delete this.activeFilters[colId]; trigger.classList.remove('active'); this.applyFilters(); this.closeAllFilterDropdowns(); };
    }

    positionDropdown(trigger, dropdown) { const rect = trigger.getBoundingClientRect(); dropdown.style.top = `${rect.bottom + 5}px`; dropdown.style.left = `${rect.left - 200}px`; }
    closeAllFilterDropdowns(exceptTrigger = null) { document.querySelectorAll('.sispmg-filter-dropdown').forEach(d => { if (!exceptTrigger || !d.id.includes(exceptTrigger.closest('th').dataset.col)) d.classList.remove('show'); }); }
    cleanUnidade(unidade) { if (!unidade) return "-"; let nome = unidade; nome = nome.replace(/24\s*CIA\s*PM\s*IND\s*815\s*RPM/i, '24 CIA PM IND'); nome = nome.replace(/\s*\/15\s*RPM/gi, '').trim(); return nome; }
    sortConvenios(data) { const priority = { 'EM15RPM': 1, '19 BPM': 2, '44 BPM': 3, '70 BPM': 4, '24 CIA PM IND': 5 }; return data.sort((a, b) => { const uniA = this.cleanUnidade(a.UNI_NOME_PRINCIPAL), uniB = this.cleanUnidade(b.UNI_NOME_PRINCIPAL); const pA = priority[uniA] || 999, pB = priority[uniB] || 999; if (pA !== pB) return pA - pB; const munA = this.getMunicipioClean(a.CONCEDENTE), munB = this.getMunicipioClean(b.CONCEDENTE); const munComp = munA.localeCompare(munB, 'pt-BR'); if (munComp !== 0) return munComp; return (parseInt(a.ID) || 0) - (parseInt(b.ID) || 0); }); }
    applyFilters() {
        let filtered = this.conveniosData.filter(conv => { for (const colId in this.activeFilters) { const selected = this.activeFilters[colId]; let val = ""; if (colId === 'municipio') val = this.getMunicipioClean(conv.CONCEDENTE); else if (colId === 'unidade') val = this.cleanUnidade(conv.UNI_NOME_PRINCIPAL); else if (colId === 'status') val = this.getStatusLabel(conv); else if (colId === 'vigencia') val = this.formatDate(conv.DTFINAL); else if (colId === 'id') val = conv.ID; else if (colId === 'numero_face') val = conv.NUMERO_FACE || "-"; if (!selected.includes(val)) return false; } return true; });
        this.filteredData = this.sortConvenios(filtered); this.renderDashboard(true);
    }

    renderDashboard(isFiltered = false) {
        const tbody = document.getElementById('sispmg-dashboard-tbody'); if (!tbody) return;
        let dataToRender = isFiltered ? this.filteredData : this.sortConvenios([...this.conveniosData]);
        if (dataToRender.length === 0) { tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 40px;">Nenhum convênio encontrado.</td></tr>`; ['dash-total-convenios','dash-valor-total','dash-valor-liquidado','dash-convenios-ativos'].forEach(id => document.getElementById(id).innerText = id.includes('total') ? '0' : '0,00'); return; }
        document.getElementById('dash-total-convenios').innerText = dataToRender.length;
        document.getElementById('dash-valor-total').innerText = dataToRender.reduce((acc, conv) => acc + (parseFloat(conv.VALOR_ESTIMADO) || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        document.getElementById('dash-valor-liquidado').innerText = dataToRender.reduce((acc, conv) => acc + (parseFloat(conv.LIQUIDADO) || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        document.getElementById('dash-convenios-ativos').innerText = dataToRender.filter(conv => conv.ATIVO === 'S' && conv.VENCIDO === '0').length;
        tbody.innerHTML = dataToRender.map(conv => {
            const statusLabel = this.getStatusLabel(conv), isAudited = conv.ID === this.activeConvId;
            const vEstimado = parseFloat(conv.VALOR_ESTIMADO) || 0, vLiquidado = parseFloat(conv.LIQUIDADO) || 0, prog = vEstimado > 0 ? ((vLiquidado / vEstimado) * 100).toFixed(1) : 0, isE = parseFloat(prog) > 100, isC = parseFloat(prog) >= 100;
            let corP = isE ? '#dc3545' : (isC ? '#b3a368' : '#28a745'), corT = vLiquidado > 0 ? (isE ? '#dc3545' : '#155724') : '#666';
            const hasAtraso = conv.pendencias?.some(p => p.tipo === 'atraso_liquidacao'), hasExcesso = conv.pendencias?.some(p => p.tipo === 'excesso_valor');
            return `<tr class="sispmg-clickable-row ${isAudited ? 'sispmg-row-audited' : ''}" onclick="window.SisPMG_SirconvDashboard.loadAuditData('${conv.ID}')"><td><strong>${conv.ID}</strong></td><td class="sispmg-hide-on-audit">${conv.NUMERO_FACE || '-'}</td><td>${this.getMunicipioClean(conv.CONCEDENTE)}</td><td>${this.cleanUnidade(conv.UNI_NOME_PRINCIPAL)}</td><td class="sispmg-hide-on-audit">${this.formatDate(conv.DTFINAL)}</td><td class="sispmg-hide-on-audit" style="text-align: right;">${vEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td class="sispmg-hide-on-audit" style="text-align: right; font-weight: 600; color: ${corT};">${vLiquidado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td class="sispmg-hide-on-audit" style="text-align: center; font-weight: 600; color: ${corT};">${prog}%</td><td class="sispmg-hide-on-audit" style="text-align: center;"><div style="background: #eee; width: 60px; border-radius: 4px; overflow: hidden; height: 10px; display: inline-block; vertical-align: middle;"><div style="background: ${corP}; height: 100%; width: ${prog > 100 ? 100 : prog}%;"></div></div></td><td style="text-align: center; white-space: nowrap;"><div style="display: flex; align-items: center; justify-content: center; gap: 5px;"><div class="sispmg-status-badge-slot"><span class="sispmg-status-badge ${statusLabel === 'Vigente' ? 'sispmg-status-vigente' : 'sispmg-status-outros'}">${statusLabel}</span></div><div class="sispmg-pendencias-container"><div class="sispmg-pendencia-slot">${hasAtraso ? '<i class="fas fa-clock" title="Atraso na Liquidação" style="color: #dc3545; font-size: 14px;"></i>' : ''}</div><div class="sispmg-pendencia-slot">${hasExcesso ? '<i class="fas fa-exclamation-triangle" title="Excesso de Valor" style="color: #dc3545; font-size: 14px;"></i>' : ''}</div></div></div></td></tr>`;
        }).join(''); window.SisPMG_SirconvDashboard = this;
    }

    formatDate(dateStr) { if (!dateStr) return '-'; try { const parts = dateStr.split(' ')[0].split('-'); return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr; } catch (e) { return dateStr; } }
}
