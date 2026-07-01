// Arquivo: modules/intranet/intranet-notas.js
// Módulo para extração de notas da Intranet e envio para o Terminal.

import { sendMessageToBackground } from '../../common/utils.js';

export class IntranetNotasModule {
    constructor(config) {
        this.config = config;
        this.iconSVG_28 = config.iconSVG_28;
        this.pollingInterval = null;
    }

    init() {
        console.log('SisPMG+: Módulo de Notas iniciado.');
        this.startPolling();
    }

    startPolling() {
        this.pollingInterval = setInterval(() => {
            const container = document.getElementById('formularioPrincipal:pnl_avaliacoes');
            if (container && !document.getElementById('sispmg-btn-enviar-notas')) {
                this.injectButton(container);
            }
        }, 1000);
    }

    injectButton(container) {
        const btn = document.createElement('a');
        btn.id = 'sispmg-btn-enviar-notas';
        btn.href = 'javascript:void(0)';
        btn.title = 'Enviar notas para o Terminal';
        btn.style.marginLeft = '10px';
        btn.style.display = 'inline-block';
        btn.style.verticalAlign = 'middle';
        btn.innerHTML = this.iconSVG_28;

        btn.addEventListener('click', () => this.handleButtonClick());
        
        container.appendChild(btn);
    }

    async handleButtonClick() {
        const data = this.extractData();
        
        if (!data.avaliacao) {
            alert('SisPMG+: Por favor, selecione uma Avaliação antes de enviar.');
            return;
        }

        if (!data.alunos || data.alunos.length === 0) {
            alert('SisPMG+: Nenhuma nota encontrada para a avaliação selecionada.');
            return;
        }

        try {
            await this.saveToStorage(data);
            window.open('https://terminal.policiamilitar.mg.gov.br/', '_blank');
        } catch (error) {
            console.error('SisPMG+: Erro ao salvar dados para o terminal.', error);
            alert('SisPMG+: Ocorreu um erro ao preparar o envio das notas.');
        }
    }

    extractData() {
        const obterSelectPorContexto = (idOriginal, textoLabel, indexPosicional) => {
            const container = document.getElementById('formularioPrincipal') || document.body;

            // 1. Tenta encontrar pelo ID original ou Name original
            if (idOriginal) {
                let el = document.getElementById(idOriginal) || container.querySelector(`[name="${idOriginal}"]`);
                if (el && el.tagName === 'SELECT') {
                    console.log(`SisPMG+ [Notas-Resolução]: Select "${textoLabel}" resolvido por ID original: "${idOriginal}"`);
                    return el;
                }
            }

            // 2. Tenta encontrar pelo texto do Label associado (filtrando elementos que estejam dentro de modais)
            const cleanLabel = textoLabel.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/:/g, "").trim();
            const labels = Array.from(container.querySelectorAll('label, td, th, span'))
                .filter(el => !el.closest('.rich-modalpanel') && !el.closest('[id*="modal"]'));

            for (const l of labels) {
                const text = l.textContent.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/:/g, "").trim();
                if (text === cleanLabel || text.startsWith(cleanLabel)) {
                    if (l.tagName === 'LABEL' && l.getAttribute('for')) {
                        const target = document.getElementById(l.getAttribute('for'));
                        if (target && target.tagName === 'SELECT') {
                            console.log(`SisPMG+ [Notas-Resolução]: Select "${textoLabel}" resolvido por elemento Label 'for'`);
                            return target;
                        }
                    }
                    const parent = l.parentElement;
                    if (parent) {
                        const sel = parent.querySelector('select');
                        if (sel) {
                            console.log(`SisPMG+ [Notas-Resolução]: Select "${textoLabel}" resolvido como descendente do pai do label`);
                            return sel;
                        }
                        let next = parent.nextElementSibling;
                        while (next) {
                            const s = next.querySelector('select') || (next.tagName === 'SELECT' ? next : null);
                            if (s) {
                                console.log(`SisPMG+ [Notas-Resolução]: Select "${textoLabel}" resolvido em elemento irmão do pai do label`);
                                return s;
                            }
                            next = next.nextElementSibling;
                        }
                    }
                    let nextEl = l.nextElementSibling;
                    while (nextEl) {
                        const s = nextEl.querySelector('select') || (nextEl.tagName === 'SELECT' ? nextEl : null);
                        if (s) {
                            console.log(`SisPMG+ [Notas-Resolução]: Select "${textoLabel}" resolvido em irmão do label`);
                            return s;
                        }
                        nextEl = nextEl.nextElementSibling;
                    }
                }
            }

            // 3. Fallback Posicional (busca todos os selects visíveis do formulário principal, ignorando modais)
            const selects = Array.from(container.querySelectorAll('select'))
                .filter(el => !el.closest('.rich-modalpanel') && !el.closest('[id*="modal"]'));
            if (selects.length > indexPosicional) {
                console.log(`SisPMG+ [Notas-Resolução]: Select "${textoLabel}" resolvido por Fallback Posicional (Index: ${indexPosicional})`);
                return selects[indexPosicional];
            }

            console.warn(`SisPMG+ [Notas-Erro]: Falha ao tentar resolver o Select "${textoLabel}"`);
            return null;
        };

        const getSelectedTextFromElement = (el) => {
            return el && el.options && el.options[el.selectedIndex] && el.value !== ""
                ? el.options[el.selectedIndex].text.replace(/\s+/g, ' ').trim()
                : '';
        };

        const selectUnidade = obterSelectPorContexto('', 'Unidade', 0);
        const selectAno = obterSelectPorContexto('', 'Ano', 1);
        const selectTurma = obterSelectPorContexto('formularioPrincipal:select_turmas', 'Turma', 2);
        const selectDisciplina = obterSelectPorContexto('formularioPrincipal:select_diario_classe', 'Componente curricular', 3);
        const selectAvaliacao = obterSelectPorContexto('', 'Avaliação', 4);

        const avaliacaoSelecionada = getSelectedTextFromElement(selectAvaliacao);

        const metadata = {
            unidade: getSelectedTextFromElement(selectUnidade),
            ano: getSelectedTextFromElement(selectAno),
            turma: getSelectedTextFromElement(selectTurma),
            disciplina: getSelectedTextFromElement(selectDisciplina),
            avaliacao: avaliacaoSelecionada
        };

        console.log("SisPMG+ [Notas-Metadados]: Metadados extraídos:", metadata);

        const table = document.querySelector('#formularioPrincipal\\:pnl_tabela_resultado table.t1');
        if (!table) {
            console.warn("SisPMG+ [Notas-Tabela]: Tabela de resultado de notas ('#formularioPrincipal:pnl_tabela_resultado table.t1') não encontrada.");
            return { ...metadata, alunos: [] };
        }
        if (!avaliacaoSelecionada) {
            console.warn("SisPMG+ [Notas-Avaliação]: Nenhuma avaliação selecionada no formulário.");
            return { ...metadata, alunos: [] };
        }

        // Extrai os cabeçalhos das colunas
        const headers = Array.from(table.querySelectorAll('thead tr th, tbody tr:first-child th')).map(th => {
            const span = th.querySelector('span.elip');
            return (span ? span.textContent : th.textContent).replace(/\s+/g, ' ').trim();
        });

        console.log("SisPMG+ [Notas-Headers]: Cabeçalhos da tabela identificados:", headers);

        // Tenta encontrar a coluna correspondente à avaliação
        // A lógica de "match" precisa ser robusta, pois o nome no select pode ser "Prova 7.00 pts [2ª chamada]" 
        // e na tabela ser apenas "2ª chamada".
        let colIndex = -1;
        
        // 1. Busca exata
        colIndex = headers.indexOf(avaliacaoSelecionada);

        // 2. Busca parcial se não encontrar (ex: "Prova 7.00 pts" dentro de "Prova 7.00 pts [2ª chamada]")
        if (colIndex === -1) {
            // Tenta encontrar qual header da tabela está contido ou contém parte do texto da avaliação
            // Frequentemente o SIGE remove o texto entre colchetes na tabela
            const cleanAvaliacao = avaliacaoSelecionada.split('[')[0].trim();
            const suffix = avaliacaoSelecionada.includes('[') ? avaliacaoSelecionada.match(/\[(.*?)\]/)[1].trim() : '';

            for (let i = 4; i < headers.length; i++) {
                if (headers[i] === cleanAvaliacao && !suffix) {
                    colIndex = i;
                    break;
                }
                if (suffix && headers[i].toLowerCase().includes(suffix.toLowerCase())) {
                    colIndex = i;
                    break;
                }
            }
        }

        if (colIndex === -1) {
            console.error('SisPMG+ [Notas-Mapeamento]: Não foi possível mapear a coluna da tabela para a avaliação:', avaliacaoSelecionada, { headers });
            return { ...metadata, alunos: [] };
        }

        console.log(`SisPMG+ [Notas-Mapeamento]: Avaliação mapeada com sucesso para a coluna índice ${colIndex} ("${headers[colIndex]}")`);

        const alunos = [];
        const rows = Array.from(table.querySelectorAll('tbody tr')).slice(1);
        
        rows.forEach(row => {
            const cells = row.cells;
            if (cells.length <= colIndex) return;

            const pm = cells[1]?.textContent.trim();
            const nome = cells[3]?.textContent.replace(/\s+/g, ' ').trim();
            
            if (pm && pm.match(/^\d+$/)) {
                const input = cells[colIndex].querySelector('input.tam-data');
                const nota = input ? input.value.trim() : cells[colIndex].textContent.trim();
                
                // Só adiciona se houver nota ou se for importante enviar vazio
                alunos.push({ pm, nome, nota });
            }
        });

        console.log(`SisPMG+ [Notas-Extração]: Total de ${alunos.length} notas de alunos extraídos.`);
        return { ...metadata, alunos };
    }


    async saveToStorage(dados) {
        return await sendMessageToBackground('setStorage', {
            'sispmg_intranet_notas_data': dados,
            'sispmg_terminal_routine': 'SIEP_Notas',
            'sispmg_terminal_param': 'intranetData'
        });
    }

    destroy() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        const btn = document.getElementById('sispmg-btn-enviar-notas');
        if (btn) btn.remove();
    }
}

