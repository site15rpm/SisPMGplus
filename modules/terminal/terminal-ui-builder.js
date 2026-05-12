// Arquivo: modules/terminal/terminal-ui-builder.js
// Módulo para construir a interface do assistente de código, documentar funções e inserir exemplos.

export class UiBuilder {
    constructor(context, cmInstance) {
        this.context = context;
        this.cmInstance = cmInstance;
        this.features = this.getFeatures();
    }

    /**
     * Insere o texto fornecido no editor CodeMirror na posição atual do cursor.
     * @param {string} textToInsert O trecho de código a ser inserido.
     */
    insertCode(textToInsert) {
        if (typeof textToInsert !== 'string') {
            console.error("Tentativa de inserir tipo de dado inválido no editor:", textToInsert);
            return;
        }
        this.cmInstance.replaceSelection(textToInsert);
        this.cmInstance.focus();
    }

    /**
     * Cria e exibe o modal principal do assistente de código.
     */
    open() {
        const modalHTML = `
            <div class="builder-columns" style="display: flex; height: 60vh; gap: 15px;">
                <div class="builder-list-column" style="flex: 1; display: flex; flex-direction: column; border-right: 1px solid #ddd; padding-right: 15px;">
                    <input type="text" id="builder-search-input" placeholder="Pesquisar função..." class="modal-text-input" style="margin-bottom: 10px; width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                    <div id="builder-list-container" style="flex: 1; overflow-y: auto;"></div>
                </div>
                <div class="builder-details-column" style="flex: 2; overflow-y: auto; padding-left: 5px;">
                    <div id="builder-details-content">
                         <div class="builder-placeholder" style="color: #888; text-align: center; margin-top: 50px;">
                            <i class="fa-solid fa-book-open" style="font-size: 40px; margin-bottom: 15px;"></i>
                            <p>Selecione uma função à esquerda para ver os detalhes, argumentos e exemplos completos.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        const assistantModal = this.context.createModal('Catálogo de Funções (Assistente)', modalHTML, null, 
            [{ text: 'Fechar', className: 'rotina-modal-cancel-btn', action: m => this.context.closeModalAndFocus(m) }],
            { modalClass: 'ui-builder-main-modal', stack: true, width: '80%' }
        );

        this.renderFeatureList();

        const searchInput = assistantModal.querySelector('#builder-search-input');
        searchInput.addEventListener('input', () => this.renderFeatureList(searchInput.value));
        setTimeout(() => searchInput.focus(), 100);
    }

    /**
     * Renderiza a lista de funções na coluna esquerda, com base no termo de pesquisa.
     * @param {string} searchTerm O termo para filtrar a lista.
     */
    renderFeatureList(searchTerm = '') {
        const listContainer = document.getElementById('builder-list-container');
        if (!listContainer) return;

        listContainer.innerHTML = '';
        const lowerCaseSearchTerm = searchTerm.toLowerCase();

        const groupedFeatures = this.features.reduce((acc, feature) => {
            const matchesSearch = !searchTerm || 
                                  feature.title.toLowerCase().includes(lowerCaseSearchTerm) ||
                                  feature.description.toLowerCase().includes(lowerCaseSearchTerm);
            if (matchesSearch) {
                acc[feature.category] = acc[feature.category] || [];
                acc[feature.category].push(feature);
            }
            return acc;
        }, {});

        const sortedCategories = Object.keys(groupedFeatures).sort((a, b) => {
            const order = ['Ações de Terminal', 'Leitura e Verificação', 'Controle de Fluxo', 'Modais e Interface', 'Planilhas Google', 'Tratamento de Dados', 'Inter-Abas', 'Utilitários'];
            return (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b));
        });

        if (sortedCategories.length === 0) {
            listContainer.innerHTML = '<div style="color: #666; font-size: 13px; text-align: center; margin-top: 20px;">Nenhuma função encontrada.</div>';
            return;
        }

        for (const category of sortedCategories) {
            const categoryDiv = document.createElement('div');
            categoryDiv.style.marginBottom = '15px';
            categoryDiv.innerHTML = `<h4 style="font-size: 12px; color: #666; text-transform: uppercase; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 5px;">${category}</h4>`;
            
            groupedFeatures[category].sort((a, b) => a.title.localeCompare(b.title)).forEach(feature => {
                const btn = document.createElement('button');
                btn.className = 'builder-list-item';
                btn.style.cssText = 'display: block; width: 100%; text-align: left; padding: 8px; background: none; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; transition: background 0.2s;';
                btn.innerHTML = `<i class="fa-fw ${feature.icon}" style="color: #0056b3; margin-right: 5px;"></i> <span>${feature.title.split('(')[0]}</span>`;
                
                // Hover effect
                btn.onmouseover = () => btn.style.backgroundColor = '#f0f4f8';
                btn.onmouseout = () => { if (!btn.classList.contains('active')) btn.style.backgroundColor = 'transparent'; };

                btn.onclick = () => {
                    document.querySelectorAll('.builder-list-item').forEach(b => {
                        b.classList.remove('active');
                        b.style.backgroundColor = 'transparent';
                        b.style.fontWeight = 'normal';
                    });
                    btn.classList.add('active');
                    btn.style.backgroundColor = '#e2eef9';
                    btn.style.fontWeight = 'bold';
                    this.renderFeatureDetails(feature);
                };
                categoryDiv.appendChild(btn);
            });
            listContainer.appendChild(categoryDiv);
        }
    }
    
    /**
     * Renderiza os detalhes da função selecionada na coluna direita.
     * @param {object} feature O objeto da função selecionada.
     */
    renderFeatureDetails(feature) {
        const detailsContainer = document.getElementById('builder-details-content');
        if (!detailsContainer) return;

        let argsHTML = '';
        if (feature.args && feature.args.length > 0) {
            argsHTML = `
                <div style="margin-top: 15px;">
                    <h5 style="color: #333; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Parâmetros</h5>
                    <ul style="list-style: none; padding: 0; margin: 10px 0;">
                        ${feature.args.map(arg => `
                            <li style="margin-bottom: 8px; font-size: 13px; background: #f9f9f9; padding: 8px; border-radius: 4px; border-left: 3px solid #0056b3;">
                                <strong style="color: #0056b3;">${arg.name}</strong> 
                                <span style="color: #d63384; font-family: monospace; font-size: 12px; margin-left: 5px;">{${arg.type}}</span>
                                ${arg.optional ? '<span style="background: #e2e3e5; font-size: 10px; padding: 2px 5px; border-radius: 3px; margin-left: 5px;">opcional</span>' : '<span style="background: #f8d7da; color: #842029; font-size: 10px; padding: 2px 5px; border-radius: 3px; margin-left: 5px;">obrigatório</span>'}
                                <div style="color: #555; margin-top: 4px;">${arg.description}</div>
                            </li>
                        `).join('')}
                    </ul>
                </div>`;
        }
        
        let optionsHTML = '';
        if (feature.options && feature.options.length > 0) {
            optionsHTML = `
                <div style="margin-top: 15px;">
                    <h5 style="color: #333; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Opções do Objeto <code>{opcoes}</code></h5>
                    <ul style="list-style: none; padding: 0; margin: 10px 0;">
                        ${feature.options.map(opt => `
                            <li style="margin-bottom: 8px; font-size: 13px; background: #fffdf2; padding: 8px; border-radius: 4px; border-left: 3px solid #ffc107;">
                                <strong style="color: #856404;">${opt.name}</strong>
                                <span style="color: #d63384; font-family: monospace; font-size: 12px; margin-left: 5px;">{${opt.type}}</span>
                                <span style="color: #666; font-size: 11px; margin-left: 5px;">(Padrão: ${opt.default})</span>
                                <div style="color: #555; margin-top: 4px;">${opt.description}</div>
                            </li>
                        `).join('')}
                    </ul>
                </div>`;
        }

        let examplesHTML = '';
        if (feature.examples && feature.examples.length > 0) {
            examplesHTML = `
                <div style="margin-top: 20px;">
                    <h5 style="color: #333; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Exemplos de Uso</h5>
                    <div style="margin-top: 10px;">
                        ${feature.examples.map((ex, index) => `
                            <div style="margin-bottom: 15px; border: 1px solid #e1e4e8; border-radius: 5px; overflow: hidden;">
                                <div style="background: #f6f8fa; padding: 8px 12px; border-bottom: 1px solid #e1e4e8; display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-size: 13px; color: #24292e;">${ex.description}</span>
                                    <button class="insert-example-btn" data-example-index="${index}" style="background: #28a745; color: #fff; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;"><i class="fa-solid fa-plus"></i> Inserir</button>
                                </div>
                                <pre style="margin: 0; padding: 12px; background: #282c34; color: #abb2bf; font-family: 'Courier New', Courier, monospace; font-size: 13px; overflow-x: auto;"><code>${this.context.escapeHtml(ex.code.trim())}</code></pre>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
        }

        detailsContainer.innerHTML = `
            <div style="padding-bottom: 20px;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <i class="fa-fw ${feature.icon}" style="font-size: 24px; color: #0056b3;"></i>
                    <h3 style="margin: 0; color: #333; font-size: 20px;">${feature.title}</h3>
                </div>
                <p style="font-size: 14px; color: #444; line-height: 1.5; background: #e9ecef; padding: 10px; border-radius: 4px;">${feature.description}</p>
                ${argsHTML}
                ${optionsHTML}
                ${examplesHTML}
            </div>
        `;

        detailsContainer.querySelectorAll('.insert-example-btn').forEach(btn => {
            btn.onclick = () => {
                const index = parseInt(btn.dataset.exampleIndex, 10);
                const codeToInsert = feature.examples[index].code;
                this.insertCode(`\n${codeToInsert}\n`);
                // Encontrar e fechar o modal
                const assistantModal = document.querySelector('.ui-builder-main-modal').closest('.rotina-modal-backdrop');
                if (assistantModal) this.context.closeModalAndFocus(assistantModal);
            };
        });
    }

    /**
     * Retorna a lista completa de funções, com TODOS os parâmetros, opções e múltiplos exemplos.
     */
    getFeatures() {
        return [
            // ================= CATEGORIA: AÇÕES DE TERMINAL =================
            { 
                type: 'digitar', title: 'digitar(texto, [verificar])', category: 'Ações de Terminal', icon: 'fa-regular fa-keyboard', 
                description: 'Envia uma string de texto para o terminal, simulando digitação na posição atual do cursor.',
                args: [
                    { name: 'texto', type: 'string | number', description: 'O texto que será preenchido no campo.', optional: false },
                    { name: 'verificar', type: 'boolean', description: 'Se `true` (padrão), o sistema lê a tela logo após digitar para garantir que o texto foi inserido no terminal com sucesso. Evita perdas por lentidão da rede.', optional: true }
                ],
                examples: [
                    { description: 'Digitação comum com verificação de segurança (recomendado).', code: "digitar('MINAS GERAIS');" },
                    { description: 'Digitação cega: insere sem verificar. Útil para campos de senha ocultos (asteriscos) que falhariam na verificação de tela.', code: "digitar('Senha123', false);" },
                    { description: 'Digitando uma variável numérica.', code: "const valorFinal = 150.50;\ndigitar(valorFinal);" }
                ]
            },
            { 
                type: 'teclar', title: 'teclar(nomeTecla, [repeticoes])', category: 'Ações de Terminal', icon: 'fa-solid fa-hand-pointer', 
                description: 'Simula o acionamento de teclas de controle (TAB, BACKSPACE, setas) e teclas de atenção (ENTER, PFs, PAs) que enviam dados ao servidor.',
                args: [
                    { name: 'nomeTecla', type: 'string', description: "Nome mapeado da tecla: 'ENTER', 'TAB', 'BACKTAB', 'LIMPAR', 'ESCAPE', 'SUBIR', 'DESCER', 'DIREITA', 'ESQUERDA', 'HOME', 'END', 'PF1' a 'PF24', 'PA1' a 'PA3'.", optional: false },
                    { name: 'repeticoes', type: 'string | number', description: "Número de vezes para acionar a tecla repetidamente.", optional: true }
                ],
                examples: [
                    { description: 'Confirmar uma tela submetendo os dados ao mainframe.', code: "teclar('ENTER');" },
                    { description: 'Pular 4 campos preenchíveis para frente.', code: "teclar('TAB', 4);\n// Ou alternativamente:\nteclar('TAB', 'x4');" },
                    { description: 'Voltar 2 campos preenchíveis para trás e apagar seus conteúdos.', code: "teclar('BACKTAB', 2);\nlimparCampo();" },
                    { description: 'Disparar uma macro do sistema no F12.', code: "teclar('PF12');" }
                ]
            },
            { 
                type: 'limparCampo', title: 'limparCampo([tamanhoMaximo])', category: 'Ações de Terminal', icon: 'fa-solid fa-eraser', 
                description: 'Apaga completamente o conteúdo do campo editável onde o cursor está posicionado no momento.',
                args: [
                    { name: 'tamanhoMaximo', type: 'number', description: 'Quantidade de acionamentos de "BACKSPACE" enviados. O padrão é 60 (suficiente para limpar a maioria dos campos inteiros).', optional: true }
                ],
                examples: [
                    { description: 'Limpeza padrão antes de preencher um novo valor para evitar lixo residual do texto anterior.', code: "limparCampo();\ndigitar('NOVO VALOR');" },
                    { description: 'Limpando um campo excepcionalmente longo (ex: observações de 100 caracteres).', code: "limparCampo(100);\ndigitar('Observação completa...');" }
                ]
            },
            { 
                type: 'clicar', title: 'clicar(linha, coluna)', category: 'Ações de Terminal', icon: 'fa-solid fa-computer-mouse', 
                description: 'Movimenta o cursor instantaneamente e emite um evento de Clique do Mouse em uma coordenada (X,Y) exata do mainframe. Útil quando o sistema desenha "botões" em texto.',
                args: [
                    { name: 'linha', type: 'number', description: 'O número da linha alvo (y). Valores de 1 a 24.', optional: false },
                    { name: 'coluna', type: 'number', description: 'O número da coluna alvo (x). Valores de 1 a 80.', optional: false }
                ],
                examples: [
                    { description: 'Clicar num botão de opção desenhado na Linha 15, Coluna 50.', code: "clicar(15, 50);" }
                ]
            },

            // ================= CATEGORIA: LEITURA E VERIFICAÇÃO =================
            { 
                type: 'localizarTexto', title: 'localizarTexto(alvo, [opcoes])', category: 'Leitura e Verificação', icon: 'fa-solid fa-magnifying-glass',
                description: 'Função âncora da automação. Trava a execução da rotina até que o texto, expressão regular (RegExp), ou um array de textos apareça na tela do mainframe. Controla todo o fluxo assíncrono perante lentidões de rede.',
                args: [
                    { name: 'alvo', type: 'string | RegExp | Array', description: 'O texto que indica que a tela carregou. Pode ser uma string exata, uma regra Regex (`/INCLUSAO.*SUCESSO/i`), ou uma lista de opções (`["SUCESSO", "ERRO"]`).', optional: false },
                    { name: 'opcoes', type: 'object', description: 'Objeto de configurações de inteligência da busca.', optional: true }
                ],
                options: [
                    { name: 'esperar', type: 'number', default: '5', description: 'Timeout em segundos. Se for `0`, a função não trava a rotina: apenas olha a tela instantaneamente e devolve um booleano.' },
                    { name: 'modo', type: 'string', default: "'todos'", description: "Para arrays: `'todos'` exige que todas as palavras estejam na tela ao mesmo tempo. `'qualquer'` encerra a espera assim que a PRIMEIRA palavra da lista aparecer (e retorna qual apareceu)." },
                    { name: 'lancarErro', type: 'boolean', default: 'false', description: 'Se `true`, encerra a rotina com falha (vermelho) se o tempo limite estourar sem achar o alvo.' },
                    { name: 'caseSensitive', type: 'boolean', default: 'false', description: 'Se `true`, exige que maiúsculas e minúsculas sejam idênticas.' },
                    { name: 'dialogoFalha', type: 'boolean | string', default: 'false', description: 'Pausa a rotina e exibe um alerta perguntando ao humano se deseja forçar a continuação ou abortar.' },
                    { name: 'area', type: 'object', default: 'null', description: "Restringe a área de leitura: `{linha: 24}`, `{linhaInicial: 1, linhaFinal: 5}`, ou `{apenasCamposDigitaveis: true}`." }
                ],
                examples: [
                    { description: 'Básico: Esperar até 5 segundos o menu principal abrir. Continua silenciosamente mesmo se falhar.', code: "localizarTexto('M E N U', { esperar: 5 });" },
                    { description: 'Estrito: Esperar até 10s pelo sucesso. Se a rede cair e não aparecer, quebra a rotina com erro.', code: "localizarTexto('Atualizado com Sucesso', { esperar: 10, lancarErro: true });" },
                    { description: 'Verificação instantânea (IF): Olha para a linha 24 e desvia o fluxo.', code: "if (localizarTexto('Senha Incorreta', { esperar: 0, area: { linha: 24 } })) {\n    exibirNotificacao('Revise sua senha!', false);\n    fechar();\n}" },
                    { description: 'Modo Qualquer (Switch/Case Múltiplo): Aguarda qual tela o SIAD vai exibir e reage.', code: "const resposta = localizarTexto(['CONCLUIDO', 'FALHA', 'DUPLICIDADE'], { esperar: 5, modo: 'qualquer' });\n\nif (resposta === 'CONCLUIDO') {\n    teclar('PF5');\n} else if (resposta === 'FALHA') {\n    teclar('F2');\n}" },
                    { description: 'Busca via Expressão Regular (Regex) buscando padrão flexível.', code: "localizarTexto(/PROTOCOLO:\\s*\\d{6}/i, { esperar: 5 });" }
                ]
            },
            { 
                type: 'esperarTextoSumir', title: 'esperarTextoSumir(alvo, [opcoes])', category: 'Leitura e Verificação', icon: 'fa-solid fa-eye-slash',
                description: 'Inverso do localizar. Interrompe a rotina enquanto o texto ALVO estiver presente na tela. Ótimo para lidar com indicadores de "Processando" ou "Carregando" do mainframe.',
                args: [
                    { name: 'alvo', type: 'string | RegExp', description: 'A string que indica bloqueio/carregamento.', optional: false },
                    { name: 'opcoes', type: 'object', description: 'Configurações.', optional: true }
                ],
                options: [
                    { name: 'esperar', type: 'number', default: '15', description: 'Timeout máximo aguardando a tela destravar.' },
                    { name: 'caseSensitive', type: 'boolean', default: 'false', description: 'Diferencia maiúsculas e minúsculas.' }
                ],
                examples: [
                    { description: 'Aguardar o fim de uma consulta massiva.', code: "teclar('ENTER');\nesperarTextoSumir('PROCESSANDO CONSULTA...', { esperar: 30 });\n\n// A partir daqui, a tela está liberada\nlocalizarTexto('RESULTADOS', { lancarErro: true });" }
                ]
            },
            {
                type: 'posicionar', title: 'posicionar(rotulo, [opcoes])', category: 'Leitura e Verificação', icon: 'fa-solid fa-crosshairs',
                description: 'Escanêia a tela em busca de um rótulo visual (ex: "CPF:") e, de forma inteligente, calcula e clica automaticamente no campo de digitação (underline) correspondente.',
                args: [
                    { name: 'rotulo', type: 'string', description: 'A palavra-chave impressa na tela que serve de guia.', optional: false },
                    { name: 'opcoes', type: 'object', description: 'Instruções direcionais.', optional: true }
                ],
                options: [
                    { name: 'direcao', type: 'string', default: "'apos'", description: "Onde o campo se encontra em relação ao rótulo. Valores aceitos: `'apos'` (ou `'depois'`), `'antes'`, `'acima'`, `'abaixo'`." },
                    { name: 'offset', type: 'number', default: '0', description: 'Se o rótulo cobrir múltiplos campos em série, o offset simula N apertos da tecla TAB após localizar o primeiro campo.' },
                    { name: 'caseSensitive', type: 'boolean', default: 'false', description: 'Valida maiúsculas no rótulo.' }
                ],
                examples: [
                    { description: 'Cenário padrão: O campo sublinhado está logo após os dois pontos.', code: "posicionar('Nome Completo:');\ndigitar('CARLOS SILVA');" },
                    { description: 'O campo sublinhado (checkbox) vem antes do texto na tela.', code: "posicionar('Material de Consumo', { direcao: 'antes' });\ndigitar('X');" },
                    { description: 'Tabela: O Rótulo é o cabeçalho, os campos estão nas linhas abaixo.', code: "posicionar('VLR.UNIT', { direcao: 'abaixo' });\ndigitar('1500,00');" },
                    { description: 'Pular para o terceiro campo adjacente a um rótulo longo.', code: "posicionar('Dados Bancários:', { offset: 2 });\n// Caiu na conta, pulando Banco e Agência" }
                ]
            },
            {
                type: 'obterTexto', title: 'obterTexto(L1, C1, L2, C2)', category: 'Leitura e Verificação', icon: 'fa-solid fa-file-alt',
                description: 'Suga o conteúdo textual de uma área geométrica desenhada no terminal. Extremamente vital para capturar números de documentos, senhas, protocolos gerados ou mensagens de erro para uso em variáveis JavaScript.',
                args: [
                    { name: 'L1', type: 'number', description: 'Linha Inicial.', optional: true },
                    { name: 'C1', type: 'number', description: 'Coluna Inicial.', optional: true },
                    { name: 'L2', type: 'number', description: 'Linha Final.', optional: true },
                    { name: 'C2', type: 'number', description: 'Coluna Final.', optional: true }
                ],
                examples: [
                    { description: 'Captura o número de Protocolo no topo da tela.', code: "// Obtém do Linha 2, Coluna 70 até a Coluna 80\nconst numeroDocumento = obterTexto(2, 70, 2, 80).trim();\ndebug('Documento SIAD Gerado:', numeroDocumento);" },
                    { description: 'Copia toda a barra de rodapé (Linha 24) para identificar erros complexos.', code: "const erroCompleto = obterTexto(24, 1, 24, 80);\nif (erroCompleto.includes('SALDO INSUFICIENTE')) {\n    exibirNotificacao(erroCompleto, false);\n}" },
                    { description: 'DUMP TOTAL: Passar zero argumentos extrai a tela cheia inteira.', code: "const tela = obterTexto();\nif (tela.match(/bloqueado/i)) fechar();" }
                ]
            },
            {
                type: 'lerTela', title: 'lerTela([exibirInstrucoes])', category: 'Leitura e Verificação', icon: 'fa-solid fa-crop-simple',
                description: 'Utilitário Interativo. Trava a rotina e pede ao humano para usar o mouse, clicando no início e no fim de um bloco da tela para copiá-lo magicamente.',
                args: [
                    { name: 'exibirInstrucoes', type: 'boolean', description: 'Se `true` (padrão), joga pop-ups na tela ensinando o usuário a clicar.', optional: true }
                ],
                examples: [
                    { description: 'Pedir para o usuário selecionar uma área e salvar o resultado.', code: "const resultado = await lerTela();\nif (resultado) {\n    debug('Texto da área:', resultado.text);\n    debug('Coordenadas capturadas:', resultado.coords);\n}" }
                ]
            },

            // ================= CATEGORIA: CONTROLE DE FLUXO =================
            { 
                type: 'verificarSempre', title: 'verificarSempre([alvo], [opcoes], callback)', category: 'Controle de Fluxo', icon: 'fa-solid fa-eye',
                description: 'Gatilho Automático Avançado (Hook). Você o declara no topo da rotina. A partir daquele momento, a cada `ENTER` ou `PF` que a rotina teclar, o sistema olhará o terminal de forma invisível em background. Se a tela bater com seu alvo, ele executa a função callback, corrigindo o fluxo "no voo" sem quebrar o laço principal.',
                args: [
                    { name: 'alvo', type: 'string | Array | RegExp', description: 'Texto que aciona a função (mesmo padrão do localizarTexto). Se for omitido, a função roda em TODOS os Enters.', optional: true },
                    { name: 'opcoes', type: 'object', description: '{ modo: "qualquer", area: ... }. Apenas para refinar a busca invisível.', optional: true },
                    { name: 'callback', type: 'function', description: 'O que o robô deve fazer quando o gatilho for ativado.', optional: false }
                ],
                examples: [
                    { description: 'Gatilho Condicional (O Melhor Cenário): Se a tela X surgir durante o loop, preenche.', code: "// Declare isso UMA VEZ FORA dos seus laços 'for' ou 'while'\nverificarSempre('Lote Nro.', () => {\n    // Se, ao dar um Enter, cair na tela de Lotes, preenchemos na hora!\n    digitar('01/2025');\n    teclar('TAB');\n    teclar('PF5');\n});\n\n// Seu loop cego de digitação (sem se preocupar com a tela extra)\nfor (const item of lista) {\n    digitar(item);\n    teclar('ENTER'); // O verificarSempre age sozinho aqui!\n}" },
                    { description: 'Gatilho Livre (Toda ação aciona): Validações customizadas pesadas.', code: "verificar(() => {\n    if (localizarTexto('SISTEMA INATIVO', {esperar: 0})) {\n        exibirNotificacao('Host Caiu!', false);\n        fechar();\n    }\n});" }
                ]
            },
            { 
                type: 'esperar', title: 'esperar([segundos])', category: 'Controle de Fluxo', icon: 'fa-regular fa-clock',
                description: 'Paralisa completamente a execução (Sleep/Delay) sem travar a interface do navegador.',
                args: [
                    { name: 'segundos', type: 'number', description: 'Tempo em segundos (aceita decimais). Se omitido, usa a `velocidade()` global estabelecida.', optional: true }
                ],
                examples: [
                    { description: 'Pausa explícita de 2 segundos e meio.', code: "esperar(2.5);" }
                ]
            },
            { 
                type: 'velocidade', title: 'velocidade(segundos)', category: 'Controle de Fluxo', icon: 'fa-solid fa-gauge-high',
                description: 'Altera o freio global entre as ações de `teclar()` e `clicar()`. Útil para acalmar o robô se o servidor Mainframe for antigo e estiver negando pacotes (Throttling).',
                args: [
                    { name: 'segundos', type: 'number', description: 'O novo tempo padrão entre ações.', optional: false }
                ],
                examples: [
                    { description: 'Deixa a rotina 500ms mais devagar para cada passo.', code: "velocidade(0.5);" }
                ]
            },

            // ================= CATEGORIA: MODAIS E INTERFACE =================
            { 
                type: 'exibirNotificacao', title: 'exibirNotificacao(msg, sucesso, [tempo])', category: 'Modais e Interface', icon: 'fa-solid fa-bell',
                description: 'Dispara um balão Toast (Toastr) flutuante informando o status da automação. Verde para OK, Vermelho para Erros.',
                args: [
                    { name: 'msg', type: 'string', description: 'O conteúdo textual.', optional: false },
                    { name: 'sucesso', type: 'boolean', description: 'Se `true` é Verde (Success), se `false` é Vermelho (Error). Se omitido, azul (Info).', optional: true },
                    { name: 'tempo', type: 'number', description: 'Quantos segundos na tela. Padrão: 5s.', optional: true }
                ],
                examples: [
                    { description: 'Aviso visual longo (10s) de sucesso.', code: "exibirNotificacao('Processamento do Lote Finalizado!', true, 10);" },
                    { description: 'Alerta rápido de falha de negócio.', code: "exibirNotificacao('O CNPJ não está cadastrado no SIAD.', false);" }
                ]
            },
            { 
                type: 'selecionarEmTabela', title: 'selecionarEmTabela(titulo, msg, colunas, dados, renderFn)', category: 'Modais e Interface', icon: 'fa-solid fa-table-list',
                description: 'Componente Premium! Abre uma tabela modal profissional na frente do terminal, equipada com barra de busca real-time. Quando o usuário clica em uma linha, a função devolve o objeto escolhido.',
                args: [
                    { name: 'titulo', type: 'string', description: 'Título cabeçalho do Modal.', optional: false },
                    { name: 'msg', type: 'string', description: 'Descrição instrucional acima da tabela.', optional: false },
                    { name: 'colunas', type: 'array', description: 'Um array de strings definindo o nome de cada <th>.', optional: false },
                    { name: 'dados', type: 'array', description: 'O Array de Objetos (banco de dados) que formará a lista.', optional: false },
                    { name: 'renderFn', type: 'function', description: 'Função de loop (map) `(item) => \`<td>${item.valor}</td>\`` que "pinta" as colunas.', optional: false }
                ],
                examples: [
                    { 
                        description: 'Exibir uma lista de Pessoas para o operador escolher quem processar.', 
                        code: "const pessoas = [{id: 1, nome: 'João', setor: 'RH'}, {id: 2, nome: 'Maria', setor: 'TI'}];\nconst headers = ['Matrícula', 'Nome Servidor', 'Departamento'];\n\nconst pessoaEscolhida = await selecionarEmTabela(\n    'Seleção de Pessoal',\n    'Filtre e clique em quem você quer desligar do sistema:',\n    headers,\n    pessoas,\n    (pessoa) => `<td>${pessoa.id}</td> <td>${pessoa.nome}</td> <td>${pessoa.setor}</td>`\n);\n\nif (pessoaEscolhida) {\n    digitar(pessoaEscolhida.id);\n}" 
                    }
                ]
            },
            { 
                type: 'solicitarEntrada', title: 'solicitarEntrada(titulo, mensagem, [placeholder])', category: 'Modais e Interface', icon: 'fa-solid fa-keyboard',
                description: 'Pausa a rotina e exibe uma caixa de diálogo limpa pedindo uma entrada textual ao humano.',
                args: [
                    { name: 'titulo', type: 'string', description: 'Título da janela.', optional: false },
                    { name: 'mensagem', type: 'string', description: 'A instrução (ex: "Qual a competência?").', optional: false },
                    { name: 'placeholder', type: 'string', description: 'Marca d\'água no input vazio.', optional: true }
                ],
                examples: [
                    { description: 'Pedir validação manual de data antes de rodar.', code: "const dataCorte = await solicitarEntrada('Auditoria', 'Informe o Mês/Ano (MM/AAAA):', 'Ex: 10/2025');\nif (dataCorte) {\n    digitar(dataCorte);\n} else {\n    exibirNotificacao('Ação cancelada', false);\n}" }
                ]
            },

            // ================= CATEGORIA: PLANILHAS GOOGLE =================
            { 
                type: 'lerPlanilha', title: 'lerPlanilha(idPlanilha, [aba], [query])', category: 'Planilhas Google', icon: 'fa-solid fa-file-excel',
                description: 'Consome a API nativa do Google Visualization para extrair uma Matriz Pura 2D de uma planilha do Drive de forma instantânea.',
                args: [
                    { name: 'idPlanilha', type: 'string', description: 'O ID complexo (hash) que fica na URL do Google Sheets.', optional: false },
                    { name: 'aba', type: 'string', description: 'Nome literal da aba. Se vazio, pega a aba principal (index 0).', optional: true },
                    { name: 'query', type: 'string', description: 'SQL-like syntax (ex: `SELECT A, B WHERE C = "PENDENTE"`). Filtra os dados no servidor do Google!', optional: true }
                ],
                examples: [
                    { description: 'Ler uma matriz bruta ignorando quem já foi pago.', code: "const matriz = await lerPlanilha('1vYll9...', 'Folha_Pagamento', 'SELECT * WHERE D != \"PAGO\"');\ndebug('Foram retornadas ' + matriz.length + ' linhas.');" }
                ]
            },
            { 
                type: 'lerPlanilhaObjetos', title: 'lerPlanilhaObjetos(idPlanilha, [aba], [query])', category: 'Planilhas Google', icon: 'fa-solid fa-boxes-stacked',
                description: 'Superior ao `lerPlanilha`. Ele assume automaticamente que a LINHA 1 contém os cabeçalhos. Ele transforma as colunas em propriedades JavaScript, retornando uma lista elegante de JSONs.',
                args: [
                    { name: 'idPlanilha', type: 'string', description: 'ID da Planilha.', optional: false },
                    { name: 'aba', type: 'string', description: 'Nome da aba.', optional: true },
                    { name: 'query', type: 'string', description: 'Consulta Google Visualization.', optional: true }
                ],
                examples: [
                    { description: 'Ler dados estruturados sem precisar usar índices numéricos `[0]` confidenciais.', code: "const notasFiscais = await lerPlanilhaObjetos('1vYll9...', 'Notas');\n// Se a planilha tem colunas 'Fornecedor' e 'Valor':\nfor (const nota of notasFiscais) {\n    debug(nota.Fornecedor + ' - R$ ' + nota.Valor);\n}" }
                ]
            },
            { 
                type: 'processarPlanilha', title: 'processarPlanilha(matriz, callback, [ignorarCabecalho])', category: 'Planilhas Google', icon: 'fa-solid fa-arrows-spin',
                description: 'Iterador (Loop) especializado. Pega uma matriz do `lerPlanilha` e joga linha a linha numa função protegida contra quebras. Se a automação de uma linha der erro, ele pergunta se deseja continuar para a próxima.',
                args: [
                    { name: 'matriz', type: 'array', description: 'Array 2D extraído do Google.', optional: false },
                    { name: 'callback', type: 'function', description: 'Função executada a cada volta `(linhaArray, index) => { ... }`.', optional: false },
                    { name: 'ignorarCabecalho', type: 'boolean', description: 'Pula o índice 0 (padrão: `true`).', optional: true }
                ],
                examples: [
                    { description: 'Preencher uma tela de cadastro para 500 usuários do Excel.', code: "const db = await lerPlanilha('ID');\nawait processarPlanilha(db, (linha) => {\n    // linha[0] = Cpf, linha[1] = Nome\n    digitar(linha[0]);\n    teclar('TAB');\n    digitar(linha[1]);\n    teclar('ENTER');\n});" }
                ]
            },
            { 
                type: 'enviarParaPlanilha', title: 'enviarParaPlanilha(urlWebApp, aba, matrizDados)', category: 'Planilhas Google', icon: 'fa-solid fa-cloud-arrow-up',
                description: 'Envia dados do sistema legado para gravar na nuvem, acionando um Google Apps Script (GAS) via método POST protegido.',
                args: [
                    { name: 'urlWebApp', type: 'string', description: 'O link de Publicação "App da Web" (`https://script.google.com/macros/s/.../exec`).', optional: false },
                    { name: 'aba', type: 'string', description: 'Nome da aba na qual injetar os dados.', optional: false },
                    { name: 'matrizDados', type: 'array', description: 'Pode ser uma matriz `[[1,2], [3,4]]` ou um Objeto JSON formatado para scripts avançados.', optional: false }
                ],
                examples: [
                    { description: 'Salvar o número do documento SIAD que a rotina capturou de volta no Drive.', code: "const protocolo = obterTexto(10,22,10,35).trim();\nconst JSON_Sincronia = [{\n    convenio: '12/2017',\n    documento: protocolo\n}];\n\nenviarParaPlanilha('https://script.google.com/macros/s/123/exec', 'obsgeral', JSON_Sincronia);\nexibirNotificacao('Salvo no Cloud!');" }
                ]
            },

            // ================= CATEGORIA: TRATAMENTO DE DADOS =================
            { 
                type: 'agruparDados', title: 'agruparDados(arrayObjetos, chaveAgrupadora)', category: 'Tratamento de Dados', icon: 'fa-solid fa-layer-group',
                description: 'Transforma uma lista reta de milhares de registros e cria "pastas" (grupos) indexadas por uma coluna mestre (ex: agrupar itens do carrinho pelo id do Convênio).',
                args: [
                    { name: 'arrayObjetos', type: 'array', description: 'Sua lista JSON gerada pelo `lerPlanilhaObjetos`.', optional: false },
                    { name: 'chaveAgrupadora', type: 'string', description: 'Nome da propriedade que repetida (ex: `municipio` ou `convenio`).', optional: false }
                ],
                examples: [
                    { description: 'Separando materiais de consumo por Mês para lançamentos em bloco.', code: "const dados = await lerPlanilhaObjetos('ID');\nconst lotesPorMes = agruparDados(dados, 'mes');\n\n// lotesPorMes['FEVEREIRO'] agora é uma matriz só com os itens de fevereiro.\ndebug('Temos ' + Object.keys(lotesPorMes).length + ' meses distintos.');" }
                ]
            },
            { 
                type: 'formatarData', title: 'formatarData(data, [formatoDestino])', category: 'Tratamento de Dados', icon: 'fa-solid fa-calendar-days',
                description: 'Canivete suíço para datas. Entende formatos sujos de banco (`YYYY-MM-DD`, `DD/MM/AAAA`) e converte para qualquer saída sem quebrar fusos horários.',
                args: [
                    { name: 'data', type: 'string | Date', description: 'A data crua ou o objeto Date.', optional: false },
                    { name: 'formatoDestino', type: 'string', description: "Padrões: `'DDMMAAAA'` (SIAD contínuo), `'DD/MM/AAAA'` ou `'YYYY-MM-DD'`. Padrão é SIAD.", optional: true }
                ],
                examples: [
                    { description: 'Converter Data ISO do Excel para o SIAD nativo.', code: "const dataExcel = '2025-10-15';\nconst d_siad = formatarData(dataExcel, 'DDMMAAAA'); // Vira '15102025'\ndigitar(d_siad);" }
                ]
            },
            { 
                type: 'converterMoeda', title: 'converterMoeda(textoMonetario)', category: 'Tratamento de Dados', icon: 'fa-solid fa-brazilian-real-sign',
                description: 'Recebe textos porcos como `R$ 1.500.456,88` extraídos da tela e os matematicamente converte em `1500456.88` Float perfeito para usar em calculadoras e `if (valor > 100)`.',
                args: [{ name: 'textoMonetario', type: 'string', description: 'String vindo da tela ou planilha.', optional: false }],
                examples: [
                    { description: 'Totalizar despesas capturadas via OCR do Terminal.', code: "const textoTela = obterTexto(5, 50, 5, 65); // 'R$ 1.200,50'\nconst floatReal = converterMoeda(textoTela);\nif (floatReal > 1000) exibirNotificacao('Valor alto!');" }
                ]
            },
            { 
                type: 'extrairNumeros', title: 'extrairNumeros(texto)', category: 'Tratamento de Dados', icon: 'fa-solid fa-arrow-up-1-9',
                description: 'Expurga letras, hífens, barras e espaços usando um Regex Global (\\D).',
                args: [{ name: 'texto', type: 'string', description: 'Texto misto.', optional: false }],
                examples: [
                    { description: 'Limpar máscara de CNPJ para digitar no terminal primitivo.', code: "const cnpjFormatado = '12.345.678/0001-99';\nconst cnpjLimpo = extrairNumeros(cnpjFormatado);\ndigitar(cnpjLimpo);" }
                ]
            },

            // ================= CATEGORIA: INTER-ABAS =================
            { 
                type: 'executarRotinaEm', title: 'executarRotinaEm(nomeRotina, [alias], [sistema])', category: 'Inter-Abas', icon: 'fa-solid fa-network-wired',
                description: 'Recurso Supremo de RPA Multi-Thread! Comanda que UMA ABA de terminal abra OUTRA ABA e ordene que ela execute uma rotina paralelamente. Suporta envio de códigos Custom.',
                args: [
                    { name: 'nomeRotina', type: 'string', description: 'Nome da sub-rotina a invocar ou uma String contendo código JavaScript cru dinâmico.', optional: false },
                    { name: 'alias', type: 'string', description: 'Apelido (ID) da aba alvo. Se nulo, abre uma NOVA GUI do terminal do zero.', optional: true },
                    { name: 'sistema', type: 'string', description: 'Qual sistema o mainframe deve logar auto na nova aba (ex: "ADAB", "SIAD").', optional: true }
                ],
                examples: [
                    { description: 'Abrir uma aba auxiliar para cadastrar um CNPJ sem perder a tela atual (Multi-Tasking).', code: "const idAba = 'CAD_CNPJ_01';\n\nconst macroDinamica = `\n    clicar(21, 25);\n    digitar('1259032');\n    teclar('ENTER', 2);\n    retornar(true);\n    fechar();\n`;\n\n// Espera a outra aba terminar o serviço e nos avisar!\nawait executarRotinaEm(macroDinamica, idAba, 'SIAD');\nexibirNotificacao('Cadastro finalizado pela aba auxiliar!');" }
                ]
            },
            { 
                type: 'retornar', title: 'retornar(valor)', category: 'Inter-Abas', icon: 'fa-solid fa-reply-all',
                description: 'Para rotinas que operam como "filhas" invocadas remotamente. Envia uma variável / JSON de volta para a aba "mãe" que a invocou.',
                args: [{ name: 'valor', type: 'any', description: 'Booleanos, Strings, Arrays ou Objetos que devem voltar no túnel bidirecional.', optional: false }],
                examples: [
                    { description: 'Rotina Mapeadora devolvendo os dados capturados para a matriz.', code: "const valorEncontrado = obterTexto(10, 10, 10, 20);\nretornar({\n    sucesso: true,\n    dado: valorEncontrado\n});" }
                ]
            },
            { 
                type: 'fechar', title: 'fechar([aliasDestino])', category: 'Inter-Abas', icon: 'fa-solid fa-xmark',
                description: 'Envia um comando nativo ao Chrome para fechar (destruir) a janela/aba especificada do navegador.',
                args: [{ name: 'aliasDestino', type: 'string', description: 'Se passar o ID de uma aba auxiliar, destrói ela remotamente. Se Vazio, aplica o Hara-Kiri (fecha a própria aba atual).', optional: true }],
                examples: [
                    { description: 'Rotina "Kamikaze" que encerra após concluir os envios ao banco.', code: "enviarParaPlanilha(...);\nexibirNotificacao('Adeus!');\nfechar();" }
                ]
            },

            // ================= CATEGORIA: UTILITÁRIOS =================
            { 
                type: 'debug', title: 'debug(...variaveis)', category: 'Utilitários', icon: 'fa-solid fa-bug',
                description: 'Invoca o painel flutuante de inspeção de variáveis do desenvolvedor. Ideal para "printar" objetos JSON que o `exibirNotificacao` não conseguiria ler direito.',
                args: [{ name: 'variaveis', type: 'any', description: 'Strings concatenadas, matrizes, objetos.', optional: false }],
                examples: [
                    { description: 'Dumping completo de um dicionário na tela.', code: "const config = { modo: 'hard', time: 50 };\ndebug('Análise de Execução - Passo 3:', config);" }
                ]
            },
            { 
                type: 'obterDadosUsuario', title: 'obterDadosUsuario()', category: 'Utilitários', icon: 'fa-solid fa-id-card-clip',
                description: 'Descriptografa o token JWT injetado no cookie (tokiuz) localmente. Permite descobrir que PM está rodando a rotina para salvar trilhas de auditoria.',
                args: [],
                examples: [
                    { description: 'Registrar quem executou a automação no Google Sheets.', code: "const pm = await obterDadosUsuario();\nconst pacote = [[pm.numeroPM, pm.nomeCompleto, 'EXECUCAO CONCLUIDA']];\n\nenviarParaPlanilha('URL', 'Auditoria', pacote);" }
                ]
            }
        ];
    }
}