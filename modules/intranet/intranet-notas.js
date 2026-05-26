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
        const getSelectedText = (id) => {
            const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
            return el && el.options[el.selectedIndex] && el.value !== "" 
                ? el.options[el.selectedIndex].text.replace(/\s+/g, ' ').trim() 
                : '';
        };

        const avaliacaoSelecionada = getSelectedText('formularioPrincipal:j_id188');

        const metadata = {
            unidade: getSelectedText('formularioPrincipal:j_id166'),
            ano: getSelectedText('formularioPrincipal:j_id171'),
            turma: getSelectedText('formularioPrincipal:select_turmas'),
            disciplina: getSelectedText('formularioPrincipal:select_diario_classe'),
            avaliacao: avaliacaoSelecionada
        };

        const table = document.querySelector('#formularioPrincipal\\:pnl_tabela_resultado table.t1');
        if (!table || !avaliacaoSelecionada) return { ...metadata, alunos: [] };

        // Extrai os cabeçalhos das colunas
        const headers = Array.from(table.querySelectorAll('thead tr th, tbody tr:first-child th')).map(th => {
            const span = th.querySelector('span.elip');
            return (span ? span.textContent : th.textContent).replace(/\s+/g, ' ').trim();
        });

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
            console.warn('SisPMG+: Não foi possível mapear a coluna da tabela para a avaliação:', avaliacaoSelecionada);
            return { ...metadata, alunos: [] };
        }

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

        return { ...metadata, alunos };
    }


    async saveToStorage(dados) {
        return await sendMessageToBackground('setStorage', {
            'sispmg_intranet_notas_data': dados,
            'sispmg_terminal_routine': 'public/(SIEP_Notas)',
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

