// Funções e lógica para o dashboard de convênios SIRCONV
import { sendMessageToBackground, getCookie } from '../../common/utils.js';

export class SirconvDashboardModule {
    constructor(config) {
        this.config = config;
        this.ui = window.SisPMG_UI;
        this.conveniosData = [];
        this.filteredData = [];
        this.activeFilters = {}; // { columnId: [selectedValues] }
        this.isLoading = false;
        this.activeConvId = null;
        console.log("SirconvDashboardModule: Instância da UI recebida:", this.ui);
    }

    init() {
        if (this.ui) {
            this.ui.registerModule({ name: 'SIRCONV Dashboard', instance: this });
            console.log("SirconvDashboardModule: Módulo registrado na UI.");
        } else {
            console.error("SirconvDashboardModule: A instância da UI não foi encontrada. O módulo não será registrado.");
        }
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
                        <h2>Dashboard de Convênios SIRCONV</h2>
                        <div class="sispmg-dashboard-actions" style="display: flex; align-items: center;">
                            <button id="sispmg-dashboard-refresh" class="sispmg-dashboard-btn sispmg-dashboard-btn-primary">
                                <i class="fas fa-sync-alt"></i> Atualizar Dados
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
                                    <th data-col="id">
                                        <div class="sispmg-th-content">ID <i class="fas fa-filter sispmg-filter-trigger"></i></div>
                                    </th>
                                    <th data-col="numero_face" class="sispmg-hide-on-audit">
                                        <div class="sispmg-th-content">Nº Face <i class="fas fa-filter sispmg-filter-trigger"></i></div>
                                    </th>
                                    <th data-col="municipio">
                                        <div class="sispmg-th-content">Município <i class="fas fa-filter sispmg-filter-trigger"></i></div>
                                    </th>
                                    <th data-col="unidade">
                                        <div class="sispmg-th-content">Unidade Responsável <i class="fas fa-filter sispmg-filter-trigger"></i></div>
                                    </th>
                                    <th data-col="vigencia" class="sispmg-hide-on-audit">
                                        <div class="sispmg-th-content">Vigência (Fim) <i class="fas fa-filter sispmg-filter-trigger"></i></div>
                                    </th>
                                    <th class="sispmg-hide-on-audit">Valor Estimado (R$)</th>
                                    <th class="sispmg-hide-on-audit">Valor Liquidado (R$)</th>
                                    <th data-col="status">
                                        <div class="sispmg-th-content">Status <i class="fas fa-filter sispmg-filter-trigger"></i></div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody id="sispmg-dashboard-tbody">
                                <tr>
                                    <td colspan="8" style="text-align: center; padding: 40px;">
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
                if (layout && layout.classList.contains('audit-active')) {
                    sidebar.classList.remove('active');
                    layout.classList.remove('audit-active');
                    // Remover seleção da linha ao fechar sidebar
                    this.activeConvId = null;
                    this.renderDashboard(true);
                } else {
                    this.closeAllFilterDropdowns();
                    overlay.remove();
                    document.body.style.overflow = '';
                }
            };
        }

        const refreshBtn = modalContainer.querySelector('#sispmg-dashboard-refresh');
        if (refreshBtn) {
            refreshBtn.onclick = () => this.fetchConveniosData(); // Mudado de fetchDeepAudit
        }

        // Adicionar eventos de clique nos ícones de filtro
        const filterTriggers = modalContainer.querySelectorAll('.sispmg-filter-trigger');
        filterTriggers.forEach(trigger => {
            trigger.onclick = (e) => {
                e.stopPropagation();
                const th = trigger.closest('th');
                const colId = th.dataset.col;
                this.toggleFilterDropdown(trigger, colId);
            };
        });

        // Fechar dropdowns ao clicar no layout
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                this.closeAllFilterDropdowns();
            }
        };
        modalContainer.onclick = () => this.closeAllFilterDropdowns();

        // Carregamento automático da lista básica ao abrir
        this.fetchConveniosData();
    }

    async fetchConveniosData() {
        if (this.isLoading) return;
        this.isLoading = true;
        
        if (this.ui) this.ui.showLoader('Carregando dados básicos...');

        try {
            console.log("Buscando lista de convênios via API...");
            
            const pesquisa = JSON.stringify({
                preposto: "", numeroConvenio: "", numeroFace: "", todasUnidades: "", unidade: "",
                status: "", dtInicio1: null, dtInicio2: null, dtFim1: null, dtFim2: null
            });
            
            const url = `https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/convenio/meus-convenios?pesquisa=${encodeURIComponent(pesquisa)}`;
            
            const response = await fetch(url);
            const data = await response.json();

            if (data && data.convenios) {
                this.conveniosData = data.convenios.map(c => ({ ...c, audit: null }));
                this.activeFilters = {}; 
                this.applyFilters();
            } else {
                throw new Error("Estrutura de dados inválida.");
            }

        } catch (error) {
            console.error("Erro ao carregar Dashboard via API:", error);
            alert("Erro ao carregar os dados. Verifique se você está logado na Intranet.");
        } finally {
            this.isLoading = false;
            if (this.ui) this.ui.hideLoader();
        }
    }

    async loadAuditData(convId) {
        this.activeConvId = convId;

        const conv = this.conveniosData.find(c => c.ID === convId);
        if (!conv) return;

        // Se já tem os dados (cache), apenas abre a sidebar
        if (conv.audit) {
            this.renderAuditSidebar(conv);
            return;
        }

        if (this.ui) this.ui.showLoader(`Buscando detalhes do convênio ${conv.NUMERO_FACE || convId}...`);
        
        try {
            const res = await fetch(`https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/convenio/view?id=${convId}`);
            const html = await res.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // 1. Extração do Plano de Trabalho via API JSON
            let planoItens = [];
            try {
                const token = getCookie('tokiuz');
                const planoResponse = await sendMessageToBackground('fetchConvenioPlano', { convenioId: conv.ID, token });
                if (planoResponse && planoResponse.success && planoResponse.data && planoResponse.data.planos) {
                    planoItens = planoResponse.data.planos.map(p => ({
                        naturezaId: p.NATUREZA_ID, // ID interno para linkar com o cronograma se necessário
                        nome: `${p.ITEM} - ${p.NATUREZA_ITEM}`,
                        valorEstimado: parseFloat(p.VALOR) || 0,
                        valorExecutado: 0 // Será calculado a partir do cronograma
                    }));
                }
            } catch (errApi) {
                console.error(`Erro ao buscar Plano via API para ID ${conv.ID}:`, errApi);
            }

            // 2. Extrair Detalhamento Mensal (Cronograma) e calcular executado por natureza
            const cronogramas = [];
            const processedIds = new Set();
            
            const cronoLinks = doc.querySelectorAll('a.item.flex-linha');
            
            cronoLinks.forEach(linkRow => {
                let detalheIdMatch = linkRow.getAttribute('onclick')?.match(/detalheCronograma-(\d+)/);
                if (!detalheIdMatch || !detalheIdMatch[1]) return;
                const detalheId = detalheIdMatch[1];
                
                // Evitar processar tags 'a' duplicadas devido a HTML mal formatado
                if (processedIds.has(detalheId)) return;
                processedIds.add(detalheId);

                const mesEl = linkRow.querySelector('.ne');
                if (!mesEl || mesEl.tagName.toLowerCase() === 'tr') return; // ignora as tr.ci.ne capturadas erroneamente

                const mesTexto = mesEl.innerText.replace(/[\n\r]/g, '').replace(/(\d+)\s+anexos?/, '').trim();
                
                // Filtro extra de segurança para ignorar textos que definitivamente não são meses
                if (!/^[A-Za-z]{3}\s\d{4}$/.test(mesTexto) && !mesTexto.includes('202')) {
                    return;
                }
                
                let valorPrev = 0;
                let valorExec = 0;
                let prazoLimite = '-';
                let dataLiquidado = '-';
                let status = 'Aguardando execução';

                // Buscar spans dentro do linkRow
                const spans = linkRow.querySelectorAll('span.flex-coluna');
                spans.forEach(span => {
                    const fullText = span.textContent.trim();
                    
                    const labelDiv = span.querySelector('div.tc.menor');
                    if (labelDiv) {
                        const label = labelDiv.textContent.trim();
                        const match = fullText.match(/R\$\s*([\d\.,]+)/);
                        if (label === 'Valor' && match) {
                            valorPrev = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
                        } else if (label === 'Executado' && match) {
                            valorExec = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
                        } else if (label === 'Prazo limite') {
                            prazoLimite = fullText.replace('Prazo limite', '').trim();
                        }
                    }

                    // Tentar achar a data de liquidação (dt dentro de dl.ic)
                    const dtElement = span.querySelector('dl.ic dt');
                    if (dtElement) {
                        dataLiquidado = dtElement.textContent.trim();
                    }
                });

                // Extrair Status rigorosamente
                // Geralmente o status fica no último span flex-coluna
                if (spans.length > 0) {
                    const lastSpan = spans[spans.length - 1];
                    const iconNode = lastSpan.querySelector('span.ic, dl.ic');
                    if (iconNode) {
                        if (iconNode.hasAttribute('title')) {
                            status = iconNode.getAttribute('title').trim();
                        } else {
                            // Tentar inferir pelo nome da classe
                            if (iconNode.classList.contains('senha')) status = 'Liquidado';
                            else if (iconNode.classList.contains('erro')) status = 'Liquidado fora do prazo';
                            else if (iconNode.classList.contains('aberto')) status = 'Aguardando execução';
                        }
                    }
                }

                cronogramas.push({
                    mesTexto,
                    valorPrevisto: valorPrev,
                    valorExecutado: valorExec,
                    prazoLimite,
                    dataLiquidado,
                    status
                });

                // Extrair execuções da tabela real (table.t1) do mês correspondente
                const divDetalheCentral = doc.getElementById(`detalheCronograma-${detalheId}`);
                if (divDetalheCentral) {
                    const t1Tables = divDetalheCentral.querySelectorAll('table.t1');
                    let tableExec = null;
                    t1Tables.forEach(t => {
                        const firstTh = t.querySelector('th');
                        if (firstTh && firstTh.innerText.includes('Natureza')) {
                            tableExec = t;
                        }
                    });

                    if (tableExec) {
                        const trs = tableExec.querySelectorAll('tbody tr');
                        trs.forEach(tr => {
                            if (tr.querySelector('th')) return; // ignora header
                            if (tr.classList.contains('ci') || tr.classList.contains('ne')) return; // ignora linhas de total

                            const tds = tr.querySelectorAll('td');
                            if (tds.length >= 6) {
                                const natNome = tds[0].innerText.trim();
                                const itemValorExecStr = tds[5].innerText.trim(); // Coluna "Total"
                                
                                let itemValorExec = parseFloat(itemValorExecStr.replace(/\./g, '').replace(',', '.'));
                                
                                if (natNome && !isNaN(itemValorExec) && itemValorExec > 0) {
                                    // Função robusta de match de palavras com normalização
                                    const normalizeString = str => str.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                    const words1 = normalizeString(natNome).match(/\w{4,}/g) || [];
                                    
                                    const planoMatch = planoItens.find(p => {
                                        const pName = normalizeString(p.nome);
                                        const words2 = pName.match(/\w{4,}/g) || [];
                                        
                                        // Regra especial para TELEFONIA x TELECOMUNICACAO (bug clássico de legado)
                                        const isTelecom = words1.includes('TELEFONIA') && words2.includes('TELECOMUNICACAO');
                                        
                                        // Se houver intersecção de palavras maiores que 4 letras (exceto SERVICO/TARIFA) ou a regra especial
                                        const matchWords = words1.filter(w => !['SERVICO', 'TARIFA', 'MATERIAL', 'ARTIGOS'].includes(w));
                                        return isTelecom || matchWords.some(w => words2.includes(w));
                                    });

                                    if (planoMatch) {
                                        planoMatch.valorExecutado += itemValorExec;
                                    }
                                }
                            }
                        });
                    }
                }
            });

            // 3. Extrair Histórico de Alterações
            const historico = [];
            const histRows = doc.querySelectorAll('#historico .item');
            histRows.forEach(row => {
                const dataEl = row.querySelector('.tc');
                if (dataEl) {
                     const data = dataEl.innerText.trim();
                     let log = row.innerText.replace(data, '').trim();
                     log = log.replace(/\n\s*\n/g, '<br>').replace(/\n/g, ' ');
                     if (log) historico.push({ data, log });
                }
            });

            conv.audit = {
                cronogramas,
                planoItens,
                historico,
                lastUpdate: new Date().toLocaleString()
            };

            this.renderAuditSidebar(conv);

        } catch (e) {
            console.error(`Erro ao carregar detalhes do ID ${convId}:`, e);
            alert("Erro ao buscar detalhes profundos deste convênio.");
        } finally {
            if (this.ui) this.ui.hideLoader();
        }
    }

    renderAuditSidebar(conv) {
        const audit = conv.audit;
        const layout = document.getElementById('sispmg-dashboard-layout');
        const sidebar = document.getElementById('sispmg-dashboard-sidebar');
        
        if (!layout || !sidebar) return;

        layout.classList.add('audit-active');

        sidebar.innerHTML = `
            <h2 style="color: #574e2d; font-size: 20px; border-bottom: 2px solid #b3a368; padding-bottom: 10px; margin-top: 0; margin-bottom: 15px;">
                ${conv.ID} - ${this.getMunicipioClean(conv.CONCEDENTE)}
            </h2>
            
            <div style="flex-grow: 1; overflow-y: auto; padding-right: 10px;">
                <div style="margin-top: 5px;">
                    <h3 style="font-size: 16px; color: #333;"><i class="fas fa-list-check"></i> Plano de Trabalho (Naturezas)</h3>
                    <table class="sispmg-dashboard-table" style="min-width: 100%;">
                        <thead>
                            <tr>
                                <th>Item / Natureza</th>
                                <th style="text-align: right;">Previsto (R$)</th>
                                <th style="text-align: right;">Executado (R$)</th>
                                <th style="text-align: center;">Progresso</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${audit.planoItens.length > 0 ? audit.planoItens.map(p => {
                                const progresso = p.valorEstimado > 0 ? ((p.valorExecutado / p.valorEstimado) * 100).toFixed(1) : 0;
                                const isConcluido = progresso >= 100;
                                return `
                                <tr>
                                    <td>${p.nome}</td>
                                    <td style="text-align: right;">${p.valorEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td style="text-align: right; font-weight: 600; color: ${p.valorExecutado > 0 ? '#155724' : '#666'};">${p.valorExecutado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td style="text-align: center;">
                                        <div style="background: #eee; width: 100%; border-radius: 4px; overflow: hidden; height: 12px; position: relative;">
                                            <div style="background: ${isConcluido ? '#b3a368' : '#28a745'}; height: 100%; width: ${progresso > 100 ? 100 : progresso}%;"></div>
                                        </div>
                                        <small style="font-size: 10px;">${progresso}%</small>
                                    </td>
                                </tr>
                            `}).join('') : '<tr><td colspan="4" style="text-align: center;">Nenhum registro no plano.</td></tr>'}
                        </tbody>
                        ${audit.planoItens.length > 0 ? `
                        <tfoot>
                            <tr style="background: #fbf8f5; font-weight: 700; border-top: 2px solid #dcd3c5;">
                                <td style="text-align: right;">Total:</td>
                                <td style="text-align: right;">${audit.planoItens.reduce((a, b) => a + b.valorEstimado, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                <td style="text-align: right; color: #155724;">${audit.planoItens.reduce((a, b) => a + b.valorExecutado, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                <td style="text-align: center;">
                                    ${audit.planoItens.reduce((a, b) => a + b.valorEstimado, 0) > 0 ? 
                                        ((audit.planoItens.reduce((a, b) => a + b.valorExecutado, 0) / audit.planoItens.reduce((a, b) => a + b.valorEstimado, 0)) * 100).toFixed(1) + '%' 
                                        : '0%'}
                                </td>
                            </tr>
                        </tfoot>` : ''}
                    </table>
                </div>

                <div style="margin-top: 25px;">
                    <h3 style="font-size: 16px; color: #333;"><i class="fas fa-calendar-alt"></i> Cronograma Mensal</h3>
                    <table class="sispmg-dashboard-table" style="min-width: 100%;">
                        <thead>
                            <tr>
                                <th>Mês</th>
                                <th style="text-align: right;">Previsto (R$)</th>
                                <th style="text-align: right;">Executado (R$)</th>
                                <th>Prazo Limite</th>
                                <th>Data Liq.</th>
                                <th style="text-align: center;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${audit.cronogramas.length > 0 ? audit.cronogramas.map(c => {
                                return `
                                <tr>
                                    <td style="white-space: nowrap;">${c.mesTexto || "-"}</td>
                                    <td style="text-align: right;">${(c.valorPrevisto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td style="text-align: right; font-weight: 600; color: ${c.valorExecutado > 0 ? '#155724' : 'inherit'};">${(c.valorExecutado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td>${c.prazoLimite || "-"}</td>
                                    <td>${c.dataLiquidado || "-"}</td>
                                    <td style="text-align: center;"><span class="sispmg-status-badge ${c.status === 'Liquidado' ? 'sispmg-status-vigente' : 'sispmg-status-outros'}">${c.status || "Pendente"}</span></td>
                                </tr>
                                `;
                            }).join('') : '<tr><td colspan="6" style="text-align: center;">Nenhum registro de cronograma extraído.</td></tr>'}
                        </tbody>
                    </table>
                </div>

                <div style="margin-top: 25px; margin-bottom: 20px;">
                    <h3 style="font-size: 16px; color: #333;"><i class="fas fa-history"></i> Histórico de Alterações</h3>
                    <div style="background: #fbf8f5; border: 1px solid #dcd3c5; border-radius: 6px; padding: 10px; font-size: 12px; max-height: 250px; overflow-y: auto;">
                        ${audit.historico.length > 0 ? audit.historico.map(h => `
                            <div style="margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px;">
                                <strong style="color: #b3a368;">${h.data}</strong><br>${h.log}
                            </div>
                        `).join('') : 'Nenhum histórico registrado.'}
                    </div>
                </div>
            </div>
        `;

        sidebar.classList.add('active');

        // Renderiza botões da tabela para refletir que o cache está ativo
        this.renderDashboard(true);
    }

    getMunicipioClean(concedente) {
        if (!concedente) return "-";
        let nome = concedente;
        const prefixos = [
            /^PREFEITURA\s+MUNICIAP?AL\s+DE\s+/i,
            /^PREFEITURA\s+MUNICIPAL\s+DE\s+/i,
            /^PREFEITURA\s+MUNICIPAL\s+/i,
            /^PREFEITURA\s+DE\s+/i,
            /^MUNICIPIO\s+DE\s+/i,
            /^P\.\s*M\.\s*DE\s+/i,
            /^PM\s+/i
        ];
        for (const pref of prefixos) {
            if (pref.test(nome)) {
                nome = nome.replace(pref, '');
                break;
            }
        }
        nome = nome.replace(/Ã‡/g, 'Ç').replace(/Ã\“/g, 'Ó').replace(/Ã\*/g, 'Ó').replace(/Ã\‰/g, 'É').replace(/Ãƒ/g, 'Ã').replace(/Ã\…/g, 'Ã').replace(/Ã\•/g, 'Õ').replace(/Ã\š/g, 'Ú').replace(/Ã\*/g, 'Ú').replace(/Ã\?/g, 'Í').replace(/Â/g, '').replace(/\s+/g, ' ').trim();
        return nome;
    }

    getStatusLabel(conv) {
        const isVigente = conv.ATIVO === 'S' && conv.VENCIDO === '0';
        return isVigente ? 'Vigente' : (conv.ATIVO === 'N' ? 'Inativo' : 'Vencido');
    }

    toggleFilterDropdown(trigger, colId) {
        this.closeAllFilterDropdowns(trigger);
        let dropdown = document.getElementById(`filter-dropdown-${colId}`);
        if (dropdown) {
            dropdown.classList.toggle('show');
            if (dropdown.classList.contains('show')) this.positionDropdown(trigger, dropdown);
            return;
        }
        dropdown = document.createElement('div');
        dropdown.id = `filter-dropdown-${colId}`;
        dropdown.className = 'sispmg-filter-dropdown show';
        let values = [];
        if (colId === 'municipio') values = [...new Set(this.conveniosData.map(c => this.getMunicipioClean(c.CONCEDENTE)))];
        else if (colId === 'unidade') values = [...new Set(this.conveniosData.map(c => this.cleanUnidade(c.UNI_NOME_PRINCIPAL)))];
        else if (colId === 'status') values = ['Vigente', 'Vencido', 'Inativo'];
        else if (colId === 'vigencia') values = [...new Set(this.conveniosData.map(c => this.formatDate(c.DTFINAL)))];
        else if (colId === 'id') values = [...new Set(this.conveniosData.map(c => c.ID))];
        else if (colId === 'numero_face') values = [...new Set(this.conveniosData.map(c => c.NUMERO_FACE || "-"))];
        values.sort();
        const selected = this.activeFilters[colId] || [];
        dropdown.innerHTML = `
            <div class="sispmg-filter-search"><input type="text" placeholder="Pesquisar..." id="search-${colId}"></div>
            <div class="sispmg-filter-list" id="list-${colId}">
                ${values.map(val => `<label class="sispmg-filter-item"><input type="checkbox" value="${val}" ${selected.includes(val) ? 'checked' : ''}><span>${val}</span></label>`).join('')}
            </div>
            <div class="sispmg-filter-actions">
                <button class="sispmg-filter-btn sispmg-filter-btn-clear">Limpar</button>
                <button class="sispmg-filter-btn sispmg-filter-btn-apply">Aplicar</button>
            </div>
        `;
        document.getElementById('sispmg-plus-container').appendChild(dropdown);
        this.positionDropdown(trigger, dropdown);
        dropdown.onclick = (e) => e.stopPropagation();
        const searchInput = dropdown.querySelector(`#search-${colId}`);
        searchInput.oninput = () => {
            const term = searchInput.value.toLowerCase();
            dropdown.querySelectorAll('.sispmg-filter-item').forEach(item => {
                const text = item.querySelector('span').innerText.toLowerCase();
                item.style.display = text.includes(term) ? 'flex' : 'none';
            });
        };
        dropdown.querySelector('.sispmg-filter-btn-apply').onclick = () => {
            const checked = Array.from(dropdown.querySelectorAll('input[type="checkbox"]:checked')).map(i => i.value);
            if (checked.length > 0) { this.activeFilters[colId] = checked; trigger.classList.add('active'); }
            else { delete this.activeFilters[colId]; trigger.classList.remove('active'); }
            this.applyFilters();
            this.closeAllFilterDropdowns();
        };
        dropdown.querySelector('.sispmg-filter-btn-clear').onclick = () => {
            delete this.activeFilters[colId];
            trigger.classList.remove('active');
            this.applyFilters();
            this.closeAllFilterDropdowns();
        };
    }

    positionDropdown(trigger, dropdown) {
        const rect = trigger.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + 5}px`;
        dropdown.style.left = `${rect.left - 200}px`; 
    }

    closeAllFilterDropdowns(exceptTrigger = null) {
        document.querySelectorAll('.sispmg-filter-dropdown').forEach(d => {
            if (!exceptTrigger || !d.id.includes(exceptTrigger.closest('th').dataset.col)) d.classList.remove('show');
        });
    }

    cleanUnidade(unidade) {
        if (!unidade) return "-";
        let nome = unidade;
        nome = nome.replace(/24\s*CIA\s*PM\s*IND\s*815\s*RPM/i, '24 CIA PM IND');
        nome = nome.replace(/\s*\/15\s*RPM/gi, '').trim();
        return nome;
    }

    sortConvenios(data) {
        const priority = { 'EM15RPM': 1, '19 BPM': 2, '44 BPM': 3, '70 BPM': 4, '24 CIA PM IND': 5 };
        return data.sort((a, b) => {
            const uniA = this.cleanUnidade(a.UNI_NOME_PRINCIPAL), uniB = this.cleanUnidade(b.UNI_NOME_PRINCIPAL);
            const pA = priority[uniA] || 999, pB = priority[uniB] || 999;
            if (pA !== pB) return pA - pB;
            const munA = this.getMunicipioClean(a.CONCEDENTE), munB = this.getMunicipioClean(b.CONCEDENTE);
            const munComp = munA.localeCompare(munB, 'pt-BR');
            if (munComp !== 0) return munComp;
            return (parseInt(a.ID) || 0) - (parseInt(b.ID) || 0);
        });
    }

    applyFilters() {
        let filtered = this.conveniosData.filter(conv => {
            for (const colId in this.activeFilters) {
                const selected = this.activeFilters[colId];
                let val = "";
                if (colId === 'municipio') val = this.getMunicipioClean(conv.CONCEDENTE);
                else if (colId === 'unidade') val = this.cleanUnidade(conv.UNI_NOME_PRINCIPAL);
                else if (colId === 'status') val = this.getStatusLabel(conv);
                else if (colId === 'vigencia') val = this.formatDate(conv.DTFINAL);
                else if (colId === 'id') val = conv.ID;
                else if (colId === 'numero_face') val = conv.NUMERO_FACE || "-";
                if (!selected.includes(val)) return false;
            }
            return true;
        });
        this.filteredData = this.sortConvenios(filtered);
        this.renderDashboard(true);
    }

    renderDashboard(isFiltered = false) {
        const tbody = document.getElementById('sispmg-dashboard-tbody');
        if (!tbody) return;
        let dataToRender = isFiltered ? this.filteredData : this.sortConvenios([...this.conveniosData]);
        if (dataToRender.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 40px;">Nenhum convênio encontrado.</td></tr>`;
            ['dash-total-convenios','dash-valor-total','dash-valor-liquidado','dash-convenios-ativos'].forEach(id => document.getElementById(id).innerText = id.includes('total') ? '0' : '0,00');
            return;
        }
        document.getElementById('dash-total-convenios').innerText = dataToRender.length;
        document.getElementById('dash-valor-total').innerText = dataToRender.reduce((acc, conv) => acc + (parseFloat(conv.VALOR_ESTIMADO) || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        document.getElementById('dash-valor-liquidado').innerText = dataToRender.reduce((acc, conv) => acc + (parseFloat(conv.LIQUIDADO) || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        document.getElementById('dash-convenios-ativos').innerText = dataToRender.filter(conv => conv.ATIVO === 'S' && conv.VENCIDO === '0').length;

        tbody.innerHTML = dataToRender.map(conv => {
            const statusLabel = this.getStatusLabel(conv);
            const isAudited = conv.ID === this.activeConvId;
            return `
                <tr class="sispmg-clickable-row ${isAudited ? 'sispmg-row-audited' : ''}" 
                    onclick="window.SisPMG_SirconvDashboard.loadAuditData('${conv.ID}')">
                    <td><strong>${conv.ID}</strong></td>
                    <td class="sispmg-hide-on-audit">${conv.NUMERO_FACE || '-'}</td>
                    <td>${this.getMunicipioClean(conv.CONCEDENTE)}</td>
                    <td>${this.cleanUnidade(conv.UNI_NOME_PRINCIPAL)}</td>
                    <td class="sispmg-hide-on-audit">${this.formatDate(conv.DTFINAL)}</td>
                    <td class="sispmg-hide-on-audit" style="text-align: right;">${(parseFloat(conv.VALOR_ESTIMADO) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td class="sispmg-hide-on-audit" style="text-align: right;">${(parseFloat(conv.LIQUIDADO) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td style="text-align: center;"><span class="sispmg-status-badge ${statusLabel === 'Vigente' ? 'sispmg-status-vigente' : 'sispmg-status-outros'}">${statusLabel}</span></td>
                </tr>
            `;
        }).join('');
        // Exportar instância para o escopo global para o botão de ação
        window.SisPMG_SirconvDashboard = this;
    }

    formatDate(dateStr) {
        if (!dateStr) return '-';
        try {
            const parts = dateStr.split(' ')[0].split('-');
            return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
        } catch (e) { return dateStr; }
    }
}
