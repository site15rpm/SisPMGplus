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
                    { name: 'texto', type: 'string | number', description: 'O texto ou número que será preenchido no campo.', optional: false },
                    { name: 'verificar', type: 'boolean', description: 'Se `true` (padrão), o sistema lê a tela logo após digitar para garantir que o texto foi inserido no terminal com sucesso. Evita perdas por lentidão da rede ou travamentos do Host.', optional: true }
                ],
                examples: [
                    { description: 'Digitação comum com verificação de segurança (recomendado).', code: "digitar('MINAS GERAIS');" },
                    { description: 'Digitação cega: insere sem verificar. Útil para campos de senha ocultos (asteriscos) ou campos de tempo real que reagem a cada tecla.', code: "digitar('Senha123', false);" },
                    { description: 'Digitando uma variável numérica.', code: "const valorFinal = 150.50;\ndigitar(valorFinal);" }
                ]
            },
            { 
                type: 'teclar', title: 'teclar(nomeTecla, [repeticoes])', category: 'Ações de Terminal', icon: 'fa-solid fa-hand-pointer', 
                description: 'Simula o acionamento de teclas de controle (TAB, setas) e teclas de atenção (ENTER, PFs, PAs) que enviam dados ao servidor Mainframe.',
                args: [
                    { name: 'nomeTecla', type: 'string', description: "Nome mapeado da tecla: 'ENTER', 'TAB', 'BACKTAB', 'LIMPAR', 'ESCAPE', 'SUBIR', 'DESCER', 'DIREITA', 'ESQUERDA', 'HOME', 'END', 'PF1' a 'PF24', 'PA1' a 'PA3', 'BACKSPACE'.", optional: false },
                    { name: 'repeticoes', type: 'string | number', description: "Número de vezes para acionar a tecla. Pode ser um número (ex: 3) ou string de multiplicador (ex: 'x3').", optional: true }
                ],
                examples: [
                    { description: 'Confirmar uma tela submetendo os dados ao mainframe.', code: "teclar('ENTER');" },
                    { description: 'Pular 4 campos preenchíveis para frente.', code: "teclar('TAB', 4);" },
                    { description: 'Voltar 2 campos preenchíveis usando o multiplicador x.', code: "teclar('BACKTAB', 'x2');" },
                    { description: 'Disparar uma macro do sistema no F12.', code: "teclar('PF12');" },
                    { description: 'Limpar 10 caracteres para trás.', code: "teclar('BACKSPACE', 10);" }
                ]
            },
            { 
                type: 'limparCampo', title: 'limparCampo([tamanhoMaximo])', category: 'Ações de Terminal', icon: 'fa-solid fa-eraser', 
                description: 'Apaga completamente o conteúdo do campo editável onde o cursor está posicionado no momento, enviando sucessivos Backspaces.',
                args: [
                    { name: 'tamanhoMaximo', type: 'number', description: 'Quantidade máxima de apagues enviados. O padrão é 60 (suficiente para limpar a maioria dos campos).', optional: true }
                ],
                examples: [
                    { description: 'Limpeza padrão antes de preencher um novo valor.', code: "limparCampo();\ndigitar('NOVO VALOR');" },
                    { description: 'Limpando um campo longo (ex: observações).', code: "limparCampo(100);" }
                ]
            },
            { 
                type: 'clicar', title: 'clicar(linha, coluna)', category: 'Ações de Terminal', icon: 'fa-solid fa-computer-mouse', 
                description: 'Movimenta o cursor instantaneamente e emite um evento de Clique do Mouse em uma coordenada (Linha, Coluna) exata do mainframe.',
                args: [
                    { name: 'linha', type: 'number', description: 'O número da linha alvo (1 a 24).', optional: false },
                    { name: 'coluna', type: 'number', description: 'O número da coluna alvo (1 a 80).', optional: false }
                ],
                examples: [
                    { description: 'Clicar num botão de opção desenhado na Linha 15, Coluna 50.', code: "clicar(15, 50);" }
                ]
            },
            { 
                type: 'colar', title: 'colar()', category: 'Ações de Terminal', icon: 'fa-solid fa-paste', 
                description: 'Lê o texto da área de transferência (Ctrl+V) do seu computador e o digita automaticamente na posição atual do cursor no terminal.',
                examples: [
                    { description: 'Colar conteúdo copiado de outro sistema ou planilha.', code: "colar();" }
                ]
            },
            { 
                type: 'copiar', title: 'copiar([L1, C1, L2, C2])', category: 'Ações de Terminal', icon: 'fa-solid fa-copy', 
                description: 'Extrai o texto da tela do terminal e o coloca na sua área de transferência (Clipboard). Pode copiar a tela toda, uma linha ou um bloco específico.',
                args: [
                    { name: 'L1', type: 'number', description: 'Linha Inicial.', optional: true },
                    { name: 'C1', type: 'number', description: 'Coluna Inicial.', optional: true },
                    { name: 'L2', type: 'number', description: 'Linha Final.', optional: true },
                    { name: 'C2', type: 'number', description: 'Coluna Final.', optional: true }
                ],
                examples: [
                    { description: 'Copiar a tela inteira para o seu Ctrl+V.', code: "copiar();" },
                    { description: 'Copiar apenas a Linha 10.', code: "copiar(10);" },
                    { description: 'Copiar um bloco retangular (L5C10 até L8C50).', code: "copiar(5, 10, 8, 50);" }
                ]
            },
            { 
                type: 'getCoordsFromClick', title: 'getCoordsFromClick()', category: 'Ações de Terminal', icon: 'fa-solid fa-crosshairs', 
                description: 'Modo interativo: Pede para o usuário clicar em um ponto do terminal e exibe as coordenadas (Linha e Coluna) em uma notificação.',
                examples: [
                    { description: 'Ajudar o desenvolvedor a descobrir coordenadas.', code: "await getCoordsFromClick();" }
                ]
            },
            { 
                type: 'waitForMouseClick', title: 'waitForMouseClick([timeout])', category: 'Ações de Terminal', icon: 'fa-solid fa-arrow-pointer', 
                description: 'Pausa a rotina e aguarda até que o usuário clique em qualquer lugar do terminal. Retorna { x, y }.',
                args: [{ name: 'timeout', type: 'number', description: 'Tempo máximo em milissegundos (padrão 15s).', optional: true }],
                examples: [
                    { description: 'Esperar interação do usuário.', code: "const pos = await waitForMouseClick();\nif (pos) debug('Clicou em:', pos);" }
                ]
            },
            { 
                type: 'obterPosicaoCursor', title: 'obterPosicaoCursor()', category: 'Ações de Terminal', icon: 'fa-solid fa-location-crosshairs', 
                description: 'Retorna um objeto contendo as coordenadas atuais de onde o cursor (marcador) está posicionado.',
                examples: [
                    { description: 'Verificar onde o cursor parou após uma ação.', code: "const pos = obterPosicaoCursor();\ndebug('Estou na Linha ' + pos.y + ' e Coluna ' + pos.x);" }
                ]
            },

            // ================= CATEGORIA: LEITURA E VERIFICAÇÃO =================
            { 
                type: 'localizarTexto', title: 'localizarTexto(alvo, [opcoes])', category: 'Leitura e Verificação', icon: 'fa-solid fa-magnifying-glass',
                description: 'Pausa a rotina até que o texto, expressão regular (RegExp), ou um array de opções apareça na tela. É a base da inteligência do robô para lidar com lentidões.',
                args: [
                    { name: 'alvo', type: 'string | RegExp | Array', description: 'O que procurar. Pode ser texto exato, Regex (`/SUCESSO/i`) ou lista de textos (`["SALVO", "ERRO"]`).', optional: false },
                    { name: 'opcoes', type: 'object', description: 'Configurações de busca.', optional: true }
                ],
                options: [
                    { name: 'esperar', type: 'number', default: '5', description: 'Segundos para aguardar. Se `0`, apenas verifica se o texto está lá AGORA e devolve true/false.' },
                    { name: 'modo', type: 'string', default: "'todos'", description: "Para arrays: `'todos'` (exige todos os termos) ou `'qualquer'` (devolve o primeiro que aparecer)." },
                    { name: 'lancarErro', type: 'boolean', default: 'false', description: 'Interrompe a rotina com erro crítico se não achar o alvo no tempo previsto.' },
                    { name: 'caseSensitive', type: 'boolean', default: 'false', description: 'Diferencia maiúsculas e minúsculas.' },
                    { name: 'area', type: 'object', default: 'null', description: "Restringe a busca: `{ linha: 24 }`, `{ linhaInicial: 1, linhaFinal: 10 }`, ou `{ apenasCamposDigitaveis: true }`." },
                    { name: 'dialogoFalha', type: 'boolean | string', default: 'false', description: 'Exibe uma pergunta ao usuário se deve continuar ou parar caso o texto não apareça.' }
                ],
                examples: [
                    { description: 'Aguardar 10s por uma confirmação de salvamento.', code: "localizarTexto('DADOS ATUALIZADOS', { esperar: 10, lancarErro: true });" },
                    { description: 'Verificar se há erro na linha 24 sem pausar a rotina.', code: "if (localizarTexto('INVALIDO', { esperar: 0, area: { linha: 24 } })) {\n    exibirNotificacao('Erro detectado!', false);\n}" },
                    { description: 'Aguardar por múltiplas telas possíveis (Menu ou Erro).', code: "const res = await localizarTexto(['MENU PRINCIPAL', 'ACESSO NEGADO'], { modo: 'qualquer' });\nif (res === 'MENU PRINCIPAL') {\n    teclar('PF1');\n} else {\n    fechar();\n}" },
                    { description: 'Buscar por padrão de números usando Expressão Regular.', code: "const achou = await localizarTexto(/PROTOCOLO:\\s*\\d+/i);\nif (achou) debug('Protocolo detectado na tela.');" }
                ]
            },
            { 
                type: 'esperarTextoSumir', title: 'esperarTextoSumir(alvo, [opcoes])', category: 'Leitura e Verificação', icon: 'fa-solid fa-eye-slash',
                description: 'Pausa a rotina enquanto o texto ALVO estiver visível. Útil para esperar mensagens de "Processando..." sumirem.',
                args: [
                    { name: 'alvo', type: 'string | RegExp', description: 'Texto que indica que o sistema ainda está ocupado.', optional: false },
                    { name: 'opcoes', type: 'object', description: 'Configurações.', optional: true }
                ],
                options: [
                    { name: 'esperar', type: 'number', default: '15', description: 'Tempo máximo de espera em segundos.' },
                    { name: 'caseSensitive', type: 'boolean', default: 'false', description: 'Diferencia maiúsculas/minúsculas.' }
                ],
                examples: [
                    { description: 'Esperar o mainframe processar uma consulta pesada.', code: "teclar('ENTER');\nesperarTextoSumir('AGUARDE PROCESSAMENTO...', { esperar: 30 });\n// Agora a tela de resultados deve estar livre" }
                ]
            },
            {
                type: 'posicionar', title: 'posicionar(rotulo, [opcoes])', category: 'Leitura e Verificação', icon: 'fa-solid fa-crosshairs',
                description: 'Busca um texto (rótulo) na tela e clica automaticamente no campo de digitação associado (antes, depois, acima ou abaixo).',
                args: [
                    { name: 'rotulo', type: 'string', description: 'O texto fixo que serve de guia (ex: "CPF:").', optional: false },
                    { name: 'opcoes', type: 'object', description: 'Opções direcionais.', optional: true }
                ],
                options: [
                    { name: 'direcao', type: 'string', default: "'depois'", description: "Onde o campo está: `'depois'`, `'antes'`, `'acima'` ou `'abaixo'`." },
                    { name: 'offset', type: 'number', default: '0', description: 'Quantos TABs extras dar após encontrar o campo inicial.' },
                    { name: 'caseSensitive', type: 'boolean', default: 'false', description: 'Respeita maiúsculas no rótulo.' }
                ],
                examples: [
                    { description: 'Posicionar e digitar após um rótulo.', code: "posicionar('MasPM:');\ndigitar('1234567');" },
                    { description: 'Marcar um campo que vem ANTES do texto.', code: "posicionar('CONFIRMO OS DADOS', { direcao: 'antes' });\ndigitar('X');" },
                    { description: 'Preencher coluna de valor abaixo do cabeçalho da tabela.', code: "posicionar('VLR TOTAL', { direcao: 'abaixo' });\ndigitar('100,00');" }
                ]
            },
            {
                type: 'obterTexto', title: 'obterTexto([L1, C1, L2, C2])', category: 'Leitura e Verificação', icon: 'fa-solid fa-file-alt',
                description: 'Captura o texto de uma área do terminal para uma variável. Pode ler a tela toda, uma linha ou um bloco.',
                args: [
                    { name: 'L1', type: 'number', description: 'Linha Inicial.', optional: true },
                    { name: 'C1', type: 'number', description: 'Coluna Inicial.', optional: true },
                    { name: 'L2', type: 'number', description: 'Linha Final.', optional: true },
                    { name: 'C2', type: 'number', description: 'Coluna Final.', optional: true }
                ],
                examples: [
                    { description: 'Capturar toda a tela atual.', code: "const tela = obterTexto();\ndebug(tela);" },
                    { description: 'Ler o número do protocolo gerado no rodapé.', code: "const prot = obterTexto(24, 70, 24, 80).trim();\nexibirNotificacao('Protocolo: ' + prot);" },
                    { description: 'Ler uma linha inteira específica.', code: "const linha5 = obterTexto(5);" }
                ]
            },
            {
                type: 'obterTextoLinha', title: 'obterTextoLinha([numero])', category: 'Leitura e Verificação', icon: 'fa-solid fa-ruler-horizontal',
                description: 'Captura o texto de uma linha completa. Se não informar o número, captura a linha onde o cursor está.',
                args: [{ name: 'numero', type: 'number', description: 'Número da linha (1 a 24).', optional: true }],
                examples: [
                    { description: 'Ler o conteúdo da linha onde o cursor parou.', code: "const texto = obterTextoLinha();\ndebug('Texto na posição do cursor:', texto);" }
                ]
            },
            {
                type: 'lerTela', title: 'lerTela([exibirInstrucoes])', category: 'Leitura e Verificação', icon: 'fa-solid fa-crop-simple',
                description: 'Interativo: Pede para o usuário clicar no início e no fim de uma área para capturá-la. Retorna { text, coords }.',
                examples: [
                    { description: 'Capturar área escolhida pelo usuário.', code: "const res = await lerTela();\nif (res) debug('Texto selecionado:', res.text);" }
                ]
            },
            {
                type: 'obterCamposDigitaveis', title: 'obterCamposDigitaveis()', category: 'Leitura e Verificação', icon: 'fa-solid fa-list-check',
                description: 'Escaneia a tela e retorna uma lista de todos os campos que permitem digitação, com suas posições e conteúdos atuais.',
                examples: [
                    { description: 'Contar quantos campos existem na tela.', code: "const campos = obterCamposDigitaveis();\ndebug('Existem ' + campos.length + ' campos preenchíveis.');" }
                ]
            },

            // ================= CATEGORIA: CONTROLE DE FLUXO =================
            { 
                type: 'verificarSempre', title: 'verificarSempre([alvo], callback)', category: 'Controle de Fluxo', icon: 'fa-solid fa-eye',
                description: 'Cria um gatilho automático que roda após cada ENTER ou PF. Se o texto ALVO aparecer, executa a função informada. Ótimo para lidar com telas de erro ou avisos que aparecem aleatoriamente.',
                args: [
                    { name: 'alvo', type: 'string | Array | RegExp', description: 'O texto que ativa o gatilho.', optional: true },
                    { name: 'callback', type: 'function', description: 'Função que será executada. Recebe o texto encontrado como argumento.', optional: false }
                ],
                examples: [
                    { description: 'Lidar com tela de confirmação que aparece às vezes.', code: "verificarSempre('CONFIRMA INCLUSAO?', () => {\n    teclar('PF5');\n    exibirNotificacao('Confirmação automática realizada!');\n});\n\n// Agora qualquer ENTER que cair nessa tela será resolvido sozinho." },
                    { description: 'Hook genérico para logar todas as telas na linha 24.', code: "verificarSempre(() => {\n    const msg = obterTexto(24);\n    if (msg.trim()) debug('Mensagem de Rodapé:', msg);\n});" }
                ]
            },
            { 
                type: 'executarRotina', title: 'executarRotina(nome)', category: 'Controle de Fluxo', icon: 'fa-solid fa-play',
                description: 'Executa uma sub-rotina salva dentro da rotina atual. Permite modularizar seu código chamando tarefas comuns.',
                args: [{ name: 'nome', type: 'string', description: 'O nome da rotina (ex: "Utilitarios/Login").', optional: false }],
                examples: [
                    { description: 'Chamar uma rotina de login antes de iniciar o processo.', code: "await executarRotina('Geral/Login_SIAD');\ndigitar('123'); // Continua após o login" }
                ]
            },
            { 
                type: 'autoExecutar', title: 'autoExecutar(alvo, [opcoes])', category: 'Controle de Fluxo', icon: 'fa-solid fa-bolt-lightning',
                description: 'Define um gatilho de execução automática para a rotina. Quando o texto ALVO for detectado na tela (durante a navegação manual ou ociosa), o sistema sugere ou inicia esta rotina.',
                args: [
                    { name: 'alvo', type: 'string', description: 'O texto que deve estar na tela para ativar.', optional: false },
                    { name: 'opcoes', type: 'object', description: 'Ex: `{ on: "ENTER" }`.', optional: true }
                ],
                examples: [
                    { description: 'Tornar a rotina "inteligente": ela sabe quando deve rodar.', code: "// Coloque isso na primeira linha da sua rotina:\nautoExecutar('CONSULTA DE VEICULOS');" }
                ]
            },
            { 
                type: 'esperar', title: 'esperar([segundos])', category: 'Controle de Fluxo', icon: 'fa-regular fa-clock',
                description: 'Pausa a execução por um tempo fixo.',
                args: [{ name: 'segundos', type: 'number', description: 'Tempo em segundos (aceita decimais como 0.5).', optional: true }],
                examples: [
                    { description: 'Pausa forçada de 3 segundos.', code: "esperar(3);" }
                ]
            },
            { 
                type: 'velocidade', title: 'velocidade(segundos)', category: 'Controle de Fluxo', icon: 'fa-solid fa-gauge-high',
                description: 'Define o intervalo padrão de espera entre cada ação do robô (teclar, clicar). Valor padrão é 0.25 (250ms).',
                args: [{ name: 'segundos', type: 'number', description: 'Novo intervalo em segundos.', optional: false }],
                examples: [
                    { description: 'Deixar a rotina mais lenta e segura.', code: "velocidade(1.0);" },
                    { description: 'Velocidade máxima (sem pausas).', code: "velocidade(0);" }
                ]
            },
            { 
                type: 'waitForTerminalReady', title: 'waitForTerminalReady([timeout])', category: 'Controle de Fluxo', icon: 'fa-solid fa-spinner',
                description: 'Aguardar até que o terminal pare de receber dados da rede por um tempo determinado.',
                args: [{ name: 'timeout', type: 'number', description: 'Milissegundos de silêncio para considerar pronto.', optional: true }],
                examples: [
                    { description: 'Garantir sincronismo total.', code: "await waitForTerminalReady(500);" }
                ]
            },

            // ================= CATEGORIA: MODAIS E INTERFACE =================
            { 
                type: 'exibirNotificacao', title: 'exibirNotificacao(msg, [sucesso], [tempo])', category: 'Modais e Interface', icon: 'fa-solid fa-bell',
                description: 'Exibe um balão informativo no canto da tela.',
                args: [
                    { name: 'msg', type: 'string', description: 'Texto da mensagem.', optional: false },
                    { name: 'sucesso', type: 'boolean', description: '`true` para verde (sucesso), `false` para vermelho (erro). Omitido = azul (info).', optional: true },
                    { name: 'tempo', type: 'number', description: 'Segundos que o balão fica visível.', optional: true }
                ],
                examples: [
                    { description: 'Notificação de sucesso duradoura.', code: "exibirNotificacao('Processo finalizado!', true, 10);" },
                    { description: 'Aviso de erro crítico.', code: "exibirNotificacao('Falha ao obter dados!', false);" }
                ]
            },
            { 
                type: 'selecionarEmTabela', title: 'selecionarEmTabela(titulo, msg, colunas, dados, renderFn)', category: 'Modais e Interface', icon: 'fa-solid fa-table-list',
                description: 'Abre uma tabela para o usuário escolher um item. Retorna o objeto selecionado.',
                args: [
                    { name: 'titulo', type: 'string', description: 'Título do modal.', optional: false },
                    { name: 'msg', type: 'string', description: 'Texto explicativo.', optional: false },
                    { name: 'colunas', type: 'array', description: 'Títulos das colunas.', optional: false },
                    { name: 'dados', type: 'array', description: 'Lista de objetos.', optional: false },
                    { name: 'renderFn', type: 'function', description: 'Função (item) => `<td>...</td>` para cada linha.', optional: false }
                ],
                examples: [
                    { 
                        description: 'Escolher um item de uma lista.', 
                        code: "const itens = [{id: 1, nome: 'Caneta'}, {id: 2, nome: 'Papel'}];\nconst sel = await selecionarEmTabela('Materiais', 'Selecione um item:', ['ID', 'Nome'], itens, i => `<td>${i.id}</td><td>${i.nome}</td>`);\nif (sel) debug('Selecionou: ' + sel.nome);" 
                    }
                ]
            },
            { 
                type: 'solicitarEntrada', title: 'solicitarEntrada(titulo, msg, [placeholder])', category: 'Modais e Interface', icon: 'fa-solid fa-keyboard',
                description: 'Exibe uma caixa de diálogo pedindo um texto ao usuário.',
                args: [
                    { name: 'titulo', type: 'string', description: 'Título da janela.', optional: false },
                    { name: 'msg', type: 'string', description: 'A pergunta.', optional: false },
                    { name: 'placeholder', type: 'string', description: 'Dica dentro do campo.', optional: true }
                ],
                examples: [
                    { description: 'Pedir número de lote.', code: "const lote = await solicitarEntrada('Início', 'Informe o lote:');" }
                ]
            },
            { 
                type: 'criarModal', title: 'criarModal(config)', category: 'Modais e Interface', icon: 'fa-solid fa-window-maximize',
                description: 'Cria um formulário complexo com múltiplos campos e botões.',
                args: [{ name: 'config', type: 'object', description: 'Configuração (title, elements, buttons).', optional: false }],
                examples: [
                    { 
                        description: 'Modal com input e checkbox.', 
                        code: "const res = await criarModal({\n  title: 'Dados',\n  elements: [\n    { type: 'input', id: 'cpf', label: 'CPF:' },\n    { type: 'checkbox', id: 'urgente', label: 'Urgente?' }\n  ],\n  buttons: [\n    { text: 'Ok', action: 'confirm' },\n    { text: 'Sair', action: 'cancel' }\n  ]\n});\nif (res && res.action === 'confirm') debug(res.formData);" 
                    }
                ]
            },

            // ================= CATEGORIA: PLANILHAS GOOGLE =================
            { 
                type: 'lerPlanilha', title: 'lerPlanilha(id, [aba], [query])', category: 'Planilhas Google', icon: 'fa-solid fa-file-excel',
                description: 'Lê dados de uma Planilha Google e retorna como uma matriz 2D (Array de Arrays).',
                args: [
                    { name: 'id', type: 'string', description: 'O ID longo da planilha (na URL).', optional: false },
                    { name: 'aba', type: 'string', description: 'Nome da página.', optional: true },
                    { name: 'query', type: 'string', description: 'Consulta SQL (ex: `SELECT * WHERE A > 10`).', optional: true }
                ],
                examples: [
                    { description: 'Ler planilha simples.', code: "const matriz = await lerPlanilha('ID_PLANILHA');\ndebug(matriz[1][0]); // Linha 2, Coluna A" }
                ]
            },
            { 
                type: 'lerPlanilhaObjetos', title: 'lerPlanilhaObjetos(id, [aba], [query])', category: 'Planilhas Google', icon: 'fa-solid fa-boxes-stacked',
                description: 'Lê a planilha e transforma cada linha em um objeto JavaScript, usando a primeira linha como nomes das propriedades.',
                args: [
                    { name: 'id', type: 'string', description: 'ID da Planilha.', optional: false },
                    { name: 'aba', type: 'string', description: 'Nome da página.', optional: true }
                ],
                examples: [
                    { description: 'Usar dados estruturados.', code: "const dados = await lerPlanilhaObjetos('ID');\nfor (const item of dados) {\n    debug('Nome: ' + item.NOME_COLUNA);\n}" }
                ]
            },
            { 
                type: 'processarPlanilha', title: 'processarPlanilha(matriz, callback, [ignorarCabecalho])', category: 'Planilhas Google', icon: 'fa-solid fa-arrows-spin',
                description: 'Percorre uma matriz de dados linha a linha, executando uma função para cada uma. Possui tratamento de erros e pausa.',
                args: [
                    { name: 'matriz', type: 'array', description: 'Os dados obtidos por lerPlanilha.', optional: false },
                    { name: 'callback', type: 'function', description: 'A função (linha, index) => { ... }.', optional: false }
                ],
                examples: [
                    { description: 'Processar lote de dados.', code: "const db = await lerPlanilha('ID');\nawait processarPlanilha(db, (linha) => {\n    digitar(linha[0]);\n    teclar('ENTER');\n});" }
                ]
            },
            { 
                type: 'enviarParaPlanilha', title: 'enviarParaPlanilha(idScript, aba, dados)', category: 'Planilhas Google', icon: 'fa-solid fa-cloud-arrow-up',
                description: 'Envia dados do terminal para salvar em uma Planilha Google (Requer Google Apps Script).',
                args: [
                    { name: 'idScript', type: 'string', description: 'ID de implantação do script.', optional: false },
                    { name: 'aba', type: 'string', description: 'Página de destino.', optional: false },
                    { name: 'dados', type: 'array', description: 'Matriz 2D [[col1, col2]].', optional: false }
                ],
                examples: [
                    { description: 'Salvar log em nuvem.', code: "enviarParaPlanilha('ID_SCRIPT', 'LOGS', [[new Date(), 'Sucesso']]);" }
                ]
            },

            // ================= CATEGORIA: TRATAMENTO DE DADOS =================
            { 
                type: 'agruparDados', title: 'agruparDados(lista, chave)', category: 'Tratamento de Dados', icon: 'fa-solid fa-layer-group',
                description: 'Agrupa uma lista de objetos baseada em um campo comum.',
                examples: [
                    { description: 'Agrupar pessoas por cidade.', code: "const lista = [{nome:'A', city:'BH'}, {nome:'B', city:'BH'}, {nome:'C', city:'SP'}];\nconst grupos = agruparDados(lista, 'city');\ndebug(grupos['BH'].length); // 2" }
                ]
            },
            { 
                type: 'formatarData', title: 'formatarData(data, [formato])', category: 'Tratamento de Dados', icon: 'fa-solid fa-calendar-days',
                description: 'Converte datas para padrões comuns (ex: DDMMAAAA para o SIAD).',
                args: [
                    { name: 'data', type: 'string | Date', description: 'Data original.', optional: false },
                    { name: 'formato', type: 'string', default: "'DDMMAAAA'", description: "'DDMMAAAA', 'DD/MM/AAAA' ou 'YYYY-MM-DD'." }
                ],
                examples: [
                    { description: 'Formatar para o SIAD.', code: "const d = formatarData('2025-12-31'); // '31122025'" }
                ]
            },
            { 
                type: 'converterMoeda', title: 'converterMoeda(texto)', category: 'Tratamento de Dados', icon: 'fa-solid fa-brazilian-real-sign',
                description: 'Converte "R$ 1.500,00" em um número decimal (1500.0).',
                examples: [
                    { description: 'Somar valores da tela.', code: "const val = converterMoeda(obterTexto(10, 20, 10, 30));\nif (val > 1000) debug('Valor alto!');" }
                ]
            },
            { 
                type: 'extrairNumeros', title: 'extrairNumeros(texto)', category: 'Tratamento de Dados', icon: 'fa-solid fa-arrow-up-1-9',
                description: 'Remove tudo o que não for número de uma string.',
                examples: [
                    { description: 'Limpar máscara de CPF.', code: "const cpfLimpo = extrairNumeros('123.456.789-00'); // '12345678900'" }
                ]
            },
            { 
                type: 'extrairCPF', title: 'extrairCPF(texto)', category: 'Tratamento de Dados', icon: 'fa-solid fa-id-card',
                description: 'Procura o primeiro CPF (formato xxx.xxx.xxx-xx) em um texto.',
                examples: [
                    { description: 'Achar CPF na tela.', code: "const cpf = extrairCPF(obterTexto());" }
                ]
            },
            { 
                type: 'extrairData', title: 'extrairData(texto)', category: 'Tratamento de Dados', icon: 'fa-solid fa-calendar-check',
                description: 'Procura a primeira data (dd/mm/aaaa) em um texto.',
                examples: [
                    { description: 'Achar data na tela.', code: "const dt = extrairData(obterTexto());" }
                ]
            },
            { 
                type: 'extrairProtocolo', title: 'extrairProtocolo(texto)', category: 'Tratamento de Dados', icon: 'fa-solid fa-hashtag',
                description: 'Procura por "Protocolo: XXXXXX" e retorna o número.',
                examples: [
                    { description: 'Capturar protocolo SIAD.', code: "const p = extrairProtocolo(obterTexto());" }
                ]
            },

            // ================= CATEGORIA: ARQUIVOS (LOCAL) =================
            { 
                type: 'getDirectoryHandle', title: 'getDirectoryHandle([forceNew])', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-folder-open',
                description: 'Solicita ao usuário a seleção de um diretório de trabalho no sistema de arquivos local.',
                args: [{ name: 'forceNew', type: 'boolean', description: 'Se true, obriga a escolha de um novo diretório.', optional: true }],
                examples: [
                    { description: 'Garantir acesso a pasta.', code: "await getDirectoryHandle();" }
                ]
            },
            { 
                type: 'criarArquivo', title: 'criarArquivo(caminho, conteudo)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-floppy-disk',
                description: 'Salva um texto em um arquivo na sua máquina.',
                args: [
                    { name: 'caminho', type: 'string', description: 'Nome do arquivo (ex: "logs.txt").', optional: false },
                    { name: 'conteudo', type: 'string', description: 'Texto a gravar.', optional: false }
                ],
                examples: [
                    { description: 'Salvar log de erro.', code: "criarArquivo('erros.txt', 'Erro na linha 10');" }
                ]
            },
            { 
                type: 'lerArquivo', title: 'lerArquivo(caminho)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-file-lines',
                description: 'Lê o conteúdo de um arquivo da sua máquina.',
                args: [{ name: 'caminho', type: 'string', description: 'Nome do arquivo.', optional: false }],
                examples: [
                    { description: 'Ler lista de CPFs.', code: "const txt = await lerArquivo('cpfs.txt');" }
                ]
            },
            { 
                type: 'anexarNoArquivo', title: 'anexarNoArquivo(caminho, conteudo)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-file-circle-plus',
                description: 'Adiciona texto ao final de um arquivo já existente.',
                examples: [
                    { description: 'Adicionar nova linha ao log.', code: "anexarNoArquivo('log.txt', '\\nNova ação em ' + new Date());" }
                ]
            },
            { 
                type: 'excluirArquivo', title: 'excluirArquivo(caminho)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-file-circle-xmark',
                description: 'Deleta um arquivo do diretório selecionado.',
                examples: [
                    { description: 'Remover arquivo temporário.', code: "excluirArquivo('temp.txt');" }
                ]
            },
            { 
                type: 'processarLinhas', title: 'processarLinhas(arquivo, callback)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-file-csv',
                description: 'Lê um arquivo e executa uma função para cada linha.',
                args: [
                    { name: 'arquivo', type: 'string', description: 'Nome do arquivo local.', optional: false },
                    { name: 'callback', type: 'function', description: 'Função (linha, index) => { ... }.', optional: false }
                ],
                examples: [
                    { description: 'Processar TXT linha por linha.', code: "await processarLinhas('dados.txt', (linha) => {\n    digitar(linha);\n    teclar('ENTER');\n});" }
                ]
            },

            // ================= CATEGORIA: LOGIN E SEGURANÇA =================
            { 
                type: 'forgetPassword', title: 'forgetPassword()', category: 'Login e Segurança', icon: 'fa-solid fa-key',
                description: 'Apaga a senha salva para o sistema atual do armazenamento local.',
                examples: [
                    { description: 'Limpar senha por segurança.', code: "await forgetPassword();" }
                ]
            },
            { 
                type: 'forgetUser', title: 'forgetUser()', category: 'Login e Segurança', icon: 'fa-solid fa-user-slash',
                description: 'Apaga todos os dados do usuário logado (Logout).',
                examples: [
                    { description: 'Forçar logout.', code: "await forgetUser();" }
                ]
            },
            { 
                type: 'redirectToLogin', title: 'redirectToLogin()', category: 'Login e Segurança', icon: 'fa-solid fa-right-to-bracket',
                description: 'Redireciona o navegador para a página de login da Intranet.',
                examples: [
                    { description: 'Reiniciar sessão.', code: "redirectToLogin();" }
                ]
            },

            // ================= CATEGORIA: INTER-ABAS =================
            { 
                type: 'executarRotinaEm', title: 'executarRotinaEm(rotina, [alias], [sistema], [parametros])', category: 'Inter-Abas', icon: 'fa-solid fa-network-wired',
                description: 'Ordena que outra aba de terminal execute um código. Permite enviar variáveis (objetos, arrays) para o escopo da rotina de destino.',
                args: [
                    { name: 'rotina', type: 'string', description: 'Nome da rotina ou código JS direto.', optional: false },
                    { name: 'alias', type: 'string', description: 'Nome identificador da aba.', optional: true },
                    { name: 'sistema', type: 'string', description: 'Qual sistema logar na nova aba (ADAB, SIAD, etc).', optional: true },
                    { name: 'parametros', type: 'object', description: 'Objeto com variáveis que serão injetadas globalmente na rotina executada.', optional: true }
                ],
                examples: [
                    { description: 'Executar consulta em aba paralela.', code: "const res = await executarRotinaEm('Consultar_Dados', 'AUX_1', 'SIAD');\ndebug('A aba auxiliar retornou:', res);" },
                    { description: 'Enviar um array de dados para processamento remoto.', code: "const materiais = [{cod: '123'}, {cod: '456'}];\nawait executarRotinaEm('Processar_Fila', 'ABA_DESTINO', 'SIAD', { materiaisRequisicao: materiais });" }
                ]
            },
            { 
                type: 'retornar', title: 'retornar(valor)', category: 'Inter-Abas', icon: 'fa-solid fa-reply-all',
                description: 'Envia um dado de volta para a aba "mãe" que solicitou a execução remota.',
                examples: [
                    { description: 'Enviar resultado de busca.', code: "const prot = obterTexto(10, 10, 10, 20);\nretornar(prot);" }
                ]
            },
            { 
                type: 'fechar', title: 'fechar([alias])', category: 'Inter-Abas', icon: 'fa-solid fa-xmark',
                description: 'Fecha a aba atual ou uma aba auxiliar específica.',
                examples: [
                    { description: 'Fechar a própria aba após terminar.', code: "fechar();" },
                    { description: 'Fechar aba auxiliar remotamente.', code: "fechar('AUX_1');" }
                ]
            },

            // ================= CATEGORIA: UTILITÁRIOS =================
            { 
                type: 'debug', title: 'debug(...dados)', category: 'Utilitários', icon: 'fa-solid fa-bug',
                description: 'Exibe dados no console de depuração flutuante do terminal.',
                examples: [
                    { description: 'Verificar conteúdo de objeto.', code: "const obj = { id: 1, status: 'OK' };\ndebug('Meus dados:', obj);" }
                ]
            },
            { 
                type: 'reloadPage', title: 'reloadPage()', category: 'Utilitários', icon: 'fa-solid fa-rotate',
                description: 'Recarrega a aba do terminal forçando o bypass de alertas de "Sair do Site".',
                examples: [
                    { description: 'Reiniciar terminal blindado.', code: "reloadPage();" }
                ]
            },
            { 
                type: 'getCookie', title: 'getCookie(nome)', category: 'Utilitários', icon: 'fa-solid fa-cookie',
                description: 'Recupera o valor de um cookie do navegador pelo nome.',
                args: [{ name: 'nome', type: 'string', description: 'Nome do cookie.', optional: false }],
                examples: [
                    { description: 'Obter token de sessão.', code: "const token = getCookie('tokiuz');" }
                ]
            },
            { 
                type: 'decodeJwt', title: 'decodeJwt(token)', category: 'Utilitários', icon: 'fa-solid fa-user-gear',
                description: 'Decodifica o payload de um token JWT e retorna um objeto.',
                args: [{ name: 'token', type: 'string', description: 'String do token.', optional: false }],
                examples: [
                    { description: 'Ler dados do PM logado.', code: "const info = decodeJwt(getCookie('tokiuz'));\ndebug(info.n); // Nome" }
                ]
            },
            { 
                type: 'startDebugSpy', title: 'startDebugSpy()', category: 'Utilitários', icon: 'fa-solid fa-user-secret',
                description: 'Ativa o espião de teclas no console do navegador (F12) para depuração de sequências Hex.',
                examples: [
                    { description: 'Ativar espionagem.', code: "startDebugSpy();" }
                ]
            },
            { 
                type: 'stopDebugSpy', title: 'stopDebugSpy()', category: 'Utilitários', icon: 'fa-solid fa-user-check',
                description: 'Desativa o espião de teclas.',
                examples: [
                    { description: 'Parar espionagem.', code: "stopDebugSpy();" }
                ]
            },
            { 
                type: 'obterDadosUsuario', title: 'obterDadosUsuario()', category: 'Utilitários', icon: 'fa-solid fa-id-card-clip',
                description: 'Retorna informações do Policial logado (MasPM, Nome, Unidade).',
                examples: [
                    { description: 'Usar nome do PM logado.', code: "const pm = await obterDadosUsuario();\nexibirNotificacao('Olá, ' + pm.nomeCompleto);" }
                ]
            }
        ];
    }
}