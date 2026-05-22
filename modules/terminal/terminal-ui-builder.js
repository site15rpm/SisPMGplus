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
            const order = ['Ações de Terminal', 'Leitura e Verificação', 'Controle de Fluxo', 'Lógica e Repetição', 'Modais e Interface', 'Planilhas Google', 'Tratamento de Dados', 'Inter-Abas', 'Utilitários'];
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
     * Retorna a lista completa de funções, com TODOS os parâmetros, opções e múltiplos exemplos expandidos.
     */
    getFeatures() {
        return [
            // ================= CATEGORIA: AÇÕES DE TERMINAL =================
            { 
                type: 'digitar', title: 'digitar(texto, [verificar])', category: 'Ações de Terminal', icon: 'fa-regular fa-keyboard', 
                description: 'Envia uma string de texto para o terminal, simulando digitação na posição atual do cursor.',
                args: [
                    { name: 'texto', type: 'string | number', description: 'O texto ou número que será preenchido no campo.', optional: false },
                    { name: 'verificar', type: 'boolean', description: 'Se `true` (padrão), o sistema lê a tela logo após digitar para garantir que o texto foi inserido no terminal com sucesso.', optional: true }
                ],
                examples: [
                    { description: 'Simples: Digitação padrão com verificação de segurança (recomendado).', code: "digitar('MINAS GERAIS');" },
                    { description: 'Avançado: Digitação cega. Útil para senhas (asteriscos) ou campos dinâmicos onde a verificação de tela falharia.', code: "digitar('Senha123', false);" },
                    { description: 'Complexo: Formatando dados com preenchimento (padding) antes de digitar.', code: "const numero = 5;\n// Preenche com zeros à esquerda até ter 4 dígitos\nconst numeroFormatado = String(numero).padStart(4, '0');\ndigitar(numeroFormatado); // Digitará '0005'" }
                ]
            },
            { 
                type: 'teclar', title: 'teclar(nomeTecla, [repeticoes])', category: 'Ações de Terminal', icon: 'fa-solid fa-hand-pointer', 
                description: 'Simula o acionamento de teclas de controle e de atenção (ENTER, PFs, PAs).',
                args: [
                    { name: 'nomeTecla', type: 'string', description: "Nome mapeado da tecla: 'ENTER', 'TAB', 'BACKTAB', 'LIMPAR', 'ESCAPE', 'SUBIR', 'DESCER', 'DIREITA', 'ESQUERDA', 'HOME', 'END', 'PF1' a 'PF24', 'PA1' a 'PA3', 'BACKSPACE'.", optional: false },
                    { name: 'repeticoes', type: 'string | number', description: "Número de vezes para acionar a tecla.", optional: true }
                ],
                examples: [
                    { description: 'Simples: Confirmar uma tela.', code: "teclar('ENTER');" },
                    { description: 'Intermediário: Navegar por formulários repetindo a tecla TAB.', code: "teclar('TAB', 4);" },
                    { description: 'Complexo: Acionar teclas PF dinamicamente baseadas em uma variável.', code: "const opcaoDesejada = 5;\n// Vai montar 'PF5' dinamicamente\nteclar('PF' + opcaoDesejada);" }
                ]
            },
            { 
                type: 'limparCampo', title: 'limparCampo([tamanhoMaximo])', category: 'Ações de Terminal', icon: 'fa-solid fa-eraser', 
                description: 'Apaga completamente o conteúdo do campo editável onde o cursor está posicionado no momento, enviando sucessivos Backspaces.',
                args: [
                    { name: 'tamanhoMaximo', type: 'number', description: 'Quantidade máxima de apagues enviados. O padrão é 60.', optional: true }
                ],
                examples: [
                    { description: 'Simples: Limpar antes de preencher um novo valor.', code: "limparCampo();\ndigitar('NOVO VALOR');" },
                    { description: 'Avançado: Limpar um campo excepcionalmente grande (ex: observações).', code: "limparCampo(120);" }
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
                    { description: 'Simples: Clicar em um campo de entrada conhecido na tela.', code: "clicar(15, 50);" },
                    { description: 'Complexo: Calcular o clique com base em uma variável iterativa.', code: "for (let i = 0; i < 5; i++) {\n    // Clica na coluna 10, descendo uma linha por vez\n    clicar(10 + i, 10);\n    digitar('X');\n}" }
                ]
            },
            { 
                type: 'colar', title: 'colar()', category: 'Ações de Terminal', icon: 'fa-solid fa-paste', 
                description: 'Lê o texto da área de transferência (Ctrl+V) do seu computador e o digita automaticamente no terminal.',
                examples: [
                    { description: 'Simples: Inserir conteúdo copiado do Excel.', code: "colar();" },
                    { description: 'Avançado: Colar seguido de confirmação.', code: "posicionar('CPF:');\ncolar();\nteclar('ENTER');" }
                ]
            },
            { 
                type: 'copiar', title: 'copiar([L1, C1, L2, C2])', category: 'Ações de Terminal', icon: 'fa-solid fa-copy', 
                description: 'Extrai o texto da tela do terminal e o coloca na sua área de transferência do Windows/Mac (Clipboard).',
                args: [
                    { name: 'L1', type: 'number', description: 'Linha Inicial.', optional: true },
                    { name: 'C1', type: 'number', description: 'Coluna Inicial.', optional: true },
                    { name: 'L2', type: 'number', description: 'Linha Final.', optional: true },
                    { name: 'C2', type: 'number', description: 'Coluna Final.', optional: true }
                ],
                examples: [
                    { description: 'Simples: Copiar a tela toda.', code: "copiar();" },
                    { description: 'Intermediário: Copiar uma linha específica contendo o retorno.', code: "copiar(24);" },
                    { description: 'Complexo: Copiar apenas um pequeno trecho (bloco).', code: "copiar(5, 10, 5, 25);" }
                ]
            },
            { 
                type: 'getCoordsFromClick', title: 'getCoordsFromClick()', category: 'Ações de Terminal', icon: 'fa-solid fa-crosshairs', 
                description: 'Modo interativo: Pede para o desenvolvedor da rotina clicar em um ponto do terminal e exibe as coordenadas (Linha e Coluna). Usado para mapear telas.',
                examples: [
                    { description: 'Inspecionar a tela durante o desenvolvimento.', code: "await getCoordsFromClick();" }
                ]
            },
            { 
                type: 'waitForMouseClick', title: 'waitForMouseClick([timeout])', category: 'Ações de Terminal', icon: 'fa-solid fa-arrow-pointer', 
                description: 'Pausa a rotina e aguarda até que o usuário clique em qualquer lugar do terminal. Retorna um objeto com {x, y}.',
                args: [{ name: 'timeout', type: 'number', description: 'Tempo máximo em milissegundos (padrão 15000).', optional: true }],
                examples: [
                    { description: 'Simples: Pausar até o usuário agir.', code: "exibirNotificacao('Clique no campo que deseja preencher.', true);\nawait waitForMouseClick();\ndigitar('AUTO_PREENCHIDO');" },
                    { description: 'Complexo: Validar onde o usuário clicou.', code: "const pos = await waitForMouseClick();\nif (pos && pos.y === 24) {\n    debug('Usuário clicou no rodapé.');\n} else {\n    debug('Clique em: L' + pos.y + ' C' + pos.x);\n}" }
                ]
            },
            { 
                type: 'obterPosicaoCursor', title: 'obterPosicaoCursor()', category: 'Ações de Terminal', icon: 'fa-solid fa-location-crosshairs', 
                description: 'Retorna um objeto contendo as coordenadas atuais de onde o cursor (marcador piscante) está posicionado.',
                examples: [
                    { description: 'Simples: Logar a posição atual.', code: "const pos = obterPosicaoCursor();\ndebug('Estou na Linha ' + pos.y + ' e Coluna ' + pos.x);" },
                    { description: 'Complexo: Validar se o cursor parou no lugar certo antes de digitar.', code: "const pos = obterPosicaoCursor();\nif (pos.y === 10 && pos.x === 5) {\n    digitar('OK');\n} else {\n    exibirNotificacao('Cursor fora do lugar esperado!', false);\n}" }
                ]
            },

            // ================= CATEGORIA: LEITURA E VERIFICAÇÃO =================
            { 
                type: 'localizarTexto', title: 'localizarTexto(alvo, [opcoes])', category: 'Leitura e Verificação', icon: 'fa-solid fa-magnifying-glass',
                description: 'A base da inteligência do robô. Pausa a rotina até que o texto apareça na tela. Impede falhas de lentidão de rede.',
                args: [
                    { name: 'alvo', type: 'string | RegExp | Array', description: 'O que procurar. Texto exato, Regex (`/SUCESSO/i`) ou lista de textos (`["SALVO", "ERRO"]`).', optional: false },
                    { name: 'opcoes', type: 'object', description: 'Configurações de busca.', optional: true }
                ],
                options: [
                    { name: 'esperar', type: 'number', default: '5', description: 'Segundos para aguardar. Se `0`, apenas verifica instantaneamente (sem travar a rotina).' },
                    { name: 'modo', type: 'string', default: "'todos'", description: "Para arrays: `'todos'` (exige todos os termos na tela) ou `'qualquer'` (devolve o 1º que achar)." },
                    { name: 'lancarErro', type: 'boolean', default: 'false', description: 'Se `true`, encerra a rotina exibindo uma tela de erro caso o texto não seja encontrado no tempo limite.' },
                    { name: 'area', type: 'object', default: 'null', description: "Ex: `{ linha: 24 }`, `{ linhaInicial: 1, linhaFinal: 10 }`." },
                    { name: 'dialogoFalha', type: 'boolean | string', default: 'false', description: 'Apresenta um modal permitindo ao usuário decidir se quer continuar a execução apesar da falha.' }
                ],
                examples: [
                    { description: 'Simples: Aguardar tela carregar (essencial após teclar ENTER).', code: "teclar('ENTER');\n// A rotina pausa até a mensagem aparecer:\nawait localizarTexto('OPERACAO REALIZADA COM SUCESSO', { esperar: 10, lancarErro: true });" },
                    { description: 'Intermediário: Verificação condicional instantânea (esperar: 0).', code: "const telaDeErro = await localizarTexto('SISTEMA INDISPONIVEL', { esperar: 0 });\nif (telaDeErro) {\n    fechar(); // Aborta operação\n}" },
                    { description: 'Avançado: Mapeamento de múltiplos cenários (Switch).', code: "const estado = await localizarTexto(['TELA INICIAL', 'TELA SENHA', 'TELA BLOQUEIO'], { modo: 'qualquer', esperar: 5 });\n\nif (estado === 'TELA INICIAL') {\n    // Fazer algo...\n} else if (estado === 'TELA SENHA') {\n    // Fazer outra coisa...\n}" },
                    { description: 'Avançado: Validar múltiplos elementos (Modo Todos).', code: "const telaCorreta = await localizarTexto(['MATRICULA:', 'NOME:', 'CPF:'], { esperar: 0 });\nif (telaCorreta) {\n    debug('Estamos na tela de detalhes do servidor.');\n}" },
                    { description: 'Complexo: Expressão regular no rodapé.', code: "const erroNumerico = await localizarTexto(/ERRO COD: \\d{4}/, { esperar: 0, area: { linha: 24 } });\nif (erroNumerico) debug('Detectado código de erro.');" }
                ]
            },
            { 
                type: 'esperarTextoSumir', title: 'esperarTextoSumir(alvo, [opcoes])', category: 'Leitura e Verificação', icon: 'fa-solid fa-eye-slash',
                description: 'Pausa a rotina ENQUANTO o texto alvo estiver visível. Útil para lidar com mensagens de carregamento.',
                args: [
                    { name: 'alvo', type: 'string | RegExp', description: 'Texto que indica ocupação do sistema (Ex: "PROCESSANDO").', optional: false },
                    { name: 'opcoes', type: 'object', description: 'Configurações de timeout.', optional: true }
                ],
                options: [
                    { name: 'esperar', type: 'number', default: '15', description: 'Tempo máximo em segundos que o sistema tolerará esperar o texto sumir.' }
                ],
                examples: [
                    { description: 'Simples: Aguardar o término do processamento do Mainframe.', code: "teclar('ENTER');\nawait esperarTextoSumir('AGUARDE...', { esperar: 30 });\n// Continua as ações na tela nova" },
                    { description: 'Complexo: Ação baseada se a tela travou.', code: "const destravou = await esperarTextoSumir('CARREGANDO', { esperar: 5 });\nif (!destravou) {\n    exibirNotificacao('O sistema congelou na tela de carregamento.', false);\n}" }
                ]
            },
            {
                type: 'posicionar', title: 'posicionar(rotulo, [opcoes])', category: 'Leitura e Verificação', icon: 'fa-solid fa-crosshairs',
                description: 'Busca um texto estático na tela (rótulo) e move o cursor automaticamente para o campo de digitação associado a ele.',
                args: [
                    { name: 'rotulo', type: 'string', description: 'Texto guia (ex: "CPF:", "Matricula:").', optional: false },
                    { name: 'opcoes', type: 'object', description: 'Configurações de direção e deslocamento.', optional: true }
                ],
                options: [
                    { name: 'direcao', type: 'string', default: "'depois'", description: "Onde o input está em relação ao rótulo: `'depois'`, `'antes'`, `'acima'` ou `'abaixo'`." },
                    { name: 'offset', type: 'number', default: '0', description: 'Se houver mais de um input lado a lado, aplica X tabs extras (Ex: offset 1 vai para o 2º campo).' }
                ],
                examples: [
                    { description: 'Simples: Posicionar no campo que fica à direita do texto.', code: "posicionar('MasPM:');\ndigitar('1234567');" },
                    { description: 'Intermediário: Posicionar no campo que fica abaixo de um cabeçalho de tabela.', code: "posicionar('VALOR LIQUIDO', { direcao: 'abaixo' });\ndigitar('1500,00');" },
                    { description: 'Complexo: Preencher uma data que é dividida em 3 campos vizinhos (dia, mês, ano).', code: "posicionar('Data Nascimento:');\ndigitar('15');\nposicionar('Data Nascimento:', { offset: 1 });\ndigitar('08');\nposicionar('Data Nascimento:', { offset: 2 });\ndigitar('1990');" }
                ]
            },
            {
                type: 'obterTexto', title: 'obterTexto([L1, C1, L2, C2])', category: 'Leitura e Verificação', icon: 'fa-solid fa-file-alt',
                description: 'Lê o texto do terminal de forma programática para dentro de uma variável, permitindo que a rotina decida o que fazer baseada nos dados lidos.',
                args: [
                    { name: 'L1', type: 'number', description: 'Linha Inicial.', optional: true },
                    { name: 'C1', type: 'number', description: 'Coluna Inicial.', optional: true },
                    { name: 'L2', type: 'number', description: 'Linha Final.', optional: true },
                    { name: 'C2', type: 'number', description: 'Coluna Final.', optional: true }
                ],
                examples: [
                    { description: 'Simples: Armazenar a tela inteira e fazer verificações nela.', code: "const tela = obterTexto();\nif (tela.includes('FALHA DE COMUNICACAO')) {\n    fechar();\n}" },
                    { description: 'Intermediário: Ler um código que foi gerado em uma posição fixa da tela.', code: "const numeroProtocolo = obterTexto(24, 70, 24, 80).trim();\nexibirNotificacao('Salvo com sucesso! Prot: ' + numeroProtocolo);" },
                    { description: 'Complexo: Ler um bloco e extrair todas as linhas não vazias.', code: "const bloco = obterTexto(10, 1, 20, 80);\nconst linhas = bloco.split('\\n').filter(l => l.trim() !== '');\nlinhas.forEach(linha => debug('Item listado: ', linha));" }
                ]
            },
            {
                type: 'obterTextoLinha', title: 'obterTextoLinha([numero])', category: 'Leitura e Verificação', icon: 'fa-solid fa-ruler-horizontal',
                description: 'Captura todo o texto (80 colunas) de uma linha específica.',
                args: [{ name: 'numero', type: 'number', description: 'Número da linha (1 a 24). Se vazio, lê a linha do cursor.', optional: true }],
                examples: [
                    { description: 'Simples: Ler rodapé de sistema.', code: "const mensagem = obterTextoLinha(24);\nif (mensagem.includes('ERRO')) exibirNotificacao('Atenção: ' + mensagem, false);" },
                    { description: 'Avançado: Extrair fragmento específico de dentro da linha capturada (usando substring).', code: "const linhaAtual = obterTextoLinha(); // linha onde o cursor está\n// Extrai da coluna 10 até a 20 da string retornada\nconst nome = linhaAtual.substring(10, 20).trim();\ndebug('Nome extraído:', nome);" }
                ]
            },
            {
                type: 'lerTela', title: 'lerTela([exibirInstrucoes])', category: 'Leitura e Verificação', icon: 'fa-solid fa-crop-simple',
                description: 'Interativo: Trava a rotina, pede para o usuário clicar em 2 pontos (Início e Fim) criando um retângulo virtual e retorna o texto da área selecionada.',
                examples: [
                    { description: 'Simples: Deixar o usuário marcar a área de interesse.', code: "const selecao = await lerTela();\nif (selecao) {\n    debug('Área coletada:', selecao.text);\n    debug('Coordenadas usadas:', selecao.coords);\n}" }
                ]
            },
            {
                type: 'obterCamposDigitaveis', title: 'obterCamposDigitaveis()', category: 'Leitura e Verificação', icon: 'fa-solid fa-list-check',
                description: 'Lê o buffer de cores do terminal e retorna um array contendo todos os campos onde é possível digitar algo.',
                examples: [
                    { description: 'Simples: Descobrir quantos inputs tem na tela.', code: "const campos = obterCamposDigitaveis();\ndebug(`Existem ${campos.length} campos abertos para digitação.`);" },
                    { description: 'Complexo: Preencher todos os campos vazios de uma tela com a letra "X" (útil para testes ou marcações em lote).', code: "const campos = obterCamposDigitaveis();\nfor (const campo of campos) {\n    if (campo.texto.trim() === '') {\n        clicar(campo.linha, campo.coluna);\n        digitar('X');\n    }\n}" }
                ]
            },

            // ================= CATEGORIA: CONTROLE DE FLUXO =================
            { 
                type: 'verificarSempre', title: 'verificarSempre([alvo], callback)', category: 'Controle de Fluxo', icon: 'fa-solid fa-eye',
                description: 'Cria um "Hook" invisível. Toda vez que a rotina teclar ENTER/PFs, ele verifica a tela rapidamente. Se achar o ALVO, executa a sua função antes de continuar a rotina normal. Ótimo para fechar janelas pop-up do mainframe.',
                args: [
                    { name: 'alvo', type: 'string | Array | RegExp', description: 'Texto que ativa o gatilho. Se omitido, dispara em todas as telas.', optional: true },
                    { name: 'callback', type: 'function', description: 'Função executada. Pode conter `teclar()`, `digitar()`, etc.', optional: false }
                ],
                examples: [
                    { description: 'Simples: Fechar tela de confirmação aleatória que atrapalha o fluxo.', code: "verificarSempre('DESEJA REALMENTE CONTINUAR?', async () => {\n    // Se essa tela aparecer após qualquer ENTER que a rotina der,\n    // o robô automaticamente vai responder S e dar ENTER.\n    digitar('S');\n    teclar('ENTER');\n    exibirNotificacao('Aviso interceptado e confirmado.');\n});\n\n// A rotina continua seu fluxo normal...\nteclar('ENTER'); " },
                    { description: 'Complexo: Monitor genérico de Erros na linha 24.', code: "verificarSempre(async () => {\n    const textoRodape = obterTexto(24);\n    if (textoRodape.includes('INVALIDO')) {\n        exibirNotificacao('Erro Crítico detectado!', false);\n        // Toma uma atitude corretiva\n    }\n});" }
                ]
            },
            { 
                type: 'executarRotina', title: 'executarRotina(nome, [options])', category: 'Controle de Fluxo', icon: 'fa-solid fa-play',
                description: 'Permite chamar outras rotinas salvas no SisPMG. Modulariza seu código (crie rotinas de "Login" ou "Navegação" e chame-as dentro das rotinas principais).',
                args: [
                    { name: 'nome', type: 'string', description: 'O caminho/nome da rotina (ex: "Utilitarios/Entrar_SIAF").', optional: false },
                    { name: 'options', type: 'object', description: 'Objeto com opções: { parametros: {}, isAutoRun: bool, customCode: str }.', optional: true }
                ],
                examples: [
                    { description: 'Simples: Chamar rotina de preparação (sem parâmetros).', code: "await executarRotina('Configuracoes/Ir_Para_Menu_Principal');\n// O código principal continua aqui..." },
                    { description: 'Avançado: Chamar rotina enviando variáveis para ela processar.', code: "const dados = { cpf: '12345678900', obs: 'Urgente' };\nawait executarRotina('Public/Cadastro_Padrao', { parametros: dados });" },
                    { description: 'Retorno: Chamar sub-rotina e obter o resultado processado por ela.', code: "const resultado = await executarRotina('Public/Consultas/Obter_Dados');\ndebug('A sub-rotina retornou:', resultado);" }
                ]
            },
            { 
                type: 'retornar', title: 'retornar(valor)', category: 'Controle de Fluxo', icon: 'fa-solid fa-reply-all',
                description: 'Define qual dado será devolvido ao chamador quando esta rotina terminar. Funciona tanto para sub-rotinas locais canto para execuções remotas (Inter-Abas).',
                examples: [
                    { description: 'Simples: Devolver um status de execução ou objeto coletado.', code: "const textoColetado = obterTexto(10, 10, 10, 50).trim();\nretornar({\n    sucesso: true,\n    texto: textoColetado\n});" }
                ]
            },
            { 
                type: 'autoExecutar', title: 'autoExecutar(alvo, [opcoes])', category: 'Controle de Fluxo', icon: 'fa-solid fa-bolt-lightning',
                description: 'Define um gatilho para a rotina rodar sozinha no navegador do usuário quando ele cair em determinada tela do mainframe.',
                args: [
                    { name: 'alvo', type: 'string', description: 'O texto que, se detectado na tela, dispara a rotina.', optional: false },
                    { name: 'opcoes', type: 'object', description: 'Ex: `{ on: "PF12" }` indica qual tecla o usuário deve apertar para confirmar o gatilho.', optional: true }
                ],
                examples: [
                    { description: 'Simples: Executar logo que a tela carregar.', code: "// Coloque na 1ª linha da rotina:\nautoExecutar('SISTEMA DE VEICULOS - INCLUSAO');\n// O resto do script..." },
                    { description: 'Intermediário: Condicionar o início ao pressionamento de uma tecla.', code: "autoExecutar('CONSULTA DE MULTAS', { on: 'PF12' });" }
                ]
            },
            { 
                type: 'esperar', title: 'esperar([segundos])', category: 'Controle de Fluxo', icon: 'fa-regular fa-clock',
                description: 'Causa um "congelamento" (sleep) na execução da rotina pelo tempo estipulado.',
                args: [{ name: 'segundos', type: 'number', description: 'Tempo (ex: 2 ou 0.5). Se omitido, usa a velocidade padrão global.', optional: true }],
                examples: [
                    { description: 'Simples: Pausar 3 segundos para dar tempo ao usuário ler a tela.', code: "exibirNotificacao('Leia os dados antes de continuarmos...');\nesperar(3);\nteclar('ENTER');" },
                    { description: 'Avançado: Loop de espera condicional (usar localizarTexto é mais eficiente, mas isso ilustra a lógica).', code: "let tentativas = 0;\nwhile (tentativas < 5) {\n    if (obterTexto(24).includes('SUCESSO')) break;\n    esperar(1);\n    tentativas++;\n}" }
                ]
            },
            { 
                type: 'velocidade', title: 'velocidade(segundos)', category: 'Controle de Fluxo', icon: 'fa-solid fa-gauge-high',
                description: 'Altera o intervalo global de pausa que o sistema aplica automaticamente *entre* cada ação (teclar, clicar). O padrão original é 0.25s.',
                args: [{ name: 'segundos', type: 'number', description: 'Intervalo em segundos.', optional: false }],
                examples: [
                    { description: 'Simples: Deixar a rotina incrivelmente rápida (Modo Turbo).', code: "velocidade(0); // Remove todas as pausas artificiais" },
                    { description: 'Simples: Deixar a rotina conservadora e segura para redes lentas.', code: "velocidade(1.5);" }
                ]
            },
            { 
                type: 'waitForTerminalReady', title: 'waitForTerminalReady([timeout])', category: 'Controle de Fluxo', icon: 'fa-solid fa-spinner',
                description: 'Inspeciona o tráfego WebSocket do emulador e aguarda até que não haja mais dados sendo recebidos da rede Mainframe, indicando que a tela parou de "piscar" e está pronta.',
                args: [{ name: 'timeout', type: 'number', description: 'Limite máximo de espera. Padrão: 20000ms.', optional: true }],
                examples: [
                    { description: 'Simples: Garantir que o buffer foi pintado antes de ler algo.', code: "await waitForTerminalReady();\nconst text = obterTexto();" }
                ]
            },

            // ================= CATEGORIA: LÓGICA E REPETIÇÃO =================
            { 
                type: 'loop_enquanto', title: 'Loop: Repetir Enquanto...', category: 'Lógica e Repetição', icon: 'fa-solid fa-arrows-spin',
                description: 'Cria um loop que executa repetidamente enquanto uma condição for verdadeira. Útil para aguardar mensagens ou processar estados variáveis.',
                examples: [
                    { 
                        description: 'Repetir ENTER até que uma mensagem de sucesso apareça (com limite de 10 tentativas).',
                        code: "let encontrado = false;\nlet contador = 0;\nconst limite = 10;\n\nwhile (!encontrado && contador < limite) {\n    teclar('ENTER');\n    // Verifica se a mensagem apareceu (espera 1s em cada tentativa)\n    encontrado = await localizarTexto('OPERACAO REALIZADA', { esperar: 1 });\n    contador++;\n    \n    if (!encontrado) {\n        debug('Tentativa ' + contador + ' falhou. Tentando novamente...');\n        esperar(1);\n    }\n}\n\nif (encontrado) {\n    exibirNotificacao('Sucesso atingido!');\n} else {\n    exibirNotificacao('Limite de tentativas alcançado.', false);\n}"
                    }
                ]
            },
            { 
                type: 'loop_lista', title: 'Loop: Percorrer Lista (Array)', category: 'Lógica e Repetição', icon: 'fa-solid fa-list-ol',
                description: 'Executa um bloco de código para cada item de uma lista (Array). Ideal para processar MasPMs, CPFs ou códigos lidos de planilhas/arquivos.',
                examples: [
                    { 
                        description: 'Percorrer um array fixo de códigos e digitar um por um.',
                        code: "const listaCodigos = ['1001', '2005', '3009'];\n\nfor (const cod of listaCodigos) {\n    debug('Processando código: ' + cod);\n    \n    posicionar('CÓDIGO:');\n    limparCampo();\n    digitar(cod);\n    teclar('ENTER');\n    \n    // Aguarda confirmação antes de ir para o próximo\n    await localizarTexto('CADASTRADO', { esperar: 5, lancarErro: true });\n}"
                    }
                ]
            },
            { 
                type: 'condicional_if', title: 'Se / Caso contrário (If/Else)', category: 'Lógica e Repetição', icon: 'fa-solid fa-code-branch',
                description: 'Toma decisões baseadas no conteúdo da tela ou valores de variáveis.',
                examples: [
                    { 
                        description: 'Verificar se o sistema está em uma tela específica antes de agir.',
                        code: "if (await localizarTexto('MENU PRINCIPAL', { esperar: 0 })) {\n    digitar('1');\n    teclar('ENTER');\n} else if (await localizarTexto('ERRO DE SISTEMA', { esperar: 0 })) {\n    exibirNotificacao('Sistema com erro, abortando.', false);\n    return;\n} else {\n    teclar('PF3'); // Volta para tentar achar o menu\n}"
                    }
                ]
            },

            // ================= CATEGORIA: MODAIS E INTERFACE =================
            { 
                type: 'exibirNotificacao', title: 'exibirNotificacao(msg, [sucesso], [tempo])', category: 'Modais e Interface', icon: 'fa-solid fa-bell',
                description: 'Invoca um Toast (Notificação popup) superior na tela do navegador.',
                args: [
                    { name: 'msg', type: 'string', description: 'Texto exibido.', optional: false },
                    { name: 'sucesso', type: 'boolean', description: 'Verde para sucesso (`true`), Vermelho para erro (`false`).', optional: true },
                    { name: 'tempo', type: 'number', description: 'Duração em segundos. Padrão: 2s.', optional: true }
                ],
                examples: [
                    { description: 'Simples: Aviso comum (azul).', code: "exibirNotificacao('Iniciando varredura no sistema...');" },
                    { description: 'Simples: Aviso de Erro.', code: "exibirNotificacao('Registro não encontrado no SIAD.', false);" },
                    { description: 'Avançado: Aviso de Sucesso prolongado.', code: "exibirNotificacao('Todos os 500 registros processados!', true, 10);" }
                ]
            },
            { 
                type: 'selecionarEmTabela', title: 'selecionarEmTabela(titulo, msg, colunas, dados, renderFn)', category: 'Modais e Interface', icon: 'fa-solid fa-table-list',
                description: 'Abre um Modal interativo com uma tabela renderizada a partir de uma lista de objetos. O usuário clica na linha e o objeto é retornado à rotina. Possui barra de pesquisa embutida.',
                args: [
                    { name: 'titulo', type: 'string', description: 'Título da janela.', optional: false },
                    { name: 'msg', type: 'string', description: 'Texto descritivo auxiliar.', optional: false },
                    { name: 'colunas', type: 'array', description: 'Array de Strings com o nome do cabeçalho de cada coluna.', optional: false },
                    { name: 'dados', type: 'array', description: 'Array de Objetos (fontes de dados das linhas).', optional: false },
                    { name: 'renderFn', type: 'function', description: 'Função de callback que recebe (item, index) e deve retornar o HTML `<td>...</td>` de cada célula.', optional: false }
                ],
                examples: [
                    { description: 'Simples: Tabela estática.', code: "const opcoes = [{id: 1, desc: 'Aprovar'}, {id: 2, desc: 'Rejeitar'}];\nconst escolhido = await selecionarEmTabela(\n    'Ação Necessária', 'Escolha o destino do processo:',\n    ['Cód', 'Descrição'],\n    opcoes,\n    (item) => `<td>${item.id}</td><td>${item.desc}</td>`\n);\nif (escolhido) debug('Usuário escolheu:', escolhido.desc);" },
                    { description: 'Complexo: Tabela rica usando dados de planilha com badges HTML.', code: "const militares = [\n    { nro: '123', posto: 'SGT', apto: true },\n    { nro: '456', posto: 'CB', apto: false }\n];\nconst selecionado = await selecionarEmTabela(\n    'Seleção de Efetivo', 'Clique no militar para escalar:',\n    ['Número', 'Posto', 'Situação'],\n    militares,\n    (m) => `\n        <td>${m.nro}</td>\n        <td>${m.posto}</td>\n        <td><span style=\"color:${m.apto ? 'green' : 'red'}\">${m.apto ? 'Apto' : 'Inapto'}</span></td>\n    `\n);\nif (selecionado && selecionado.apto) {\n    digitar(selecionado.nro);\n}" }
                ]
            },
            { 
                type: 'solicitarEntrada', title: 'solicitarEntrada(titulo, msg, [placeholder])', category: 'Modais e Interface', icon: 'fa-solid fa-keyboard',
                description: 'Abre um pequeno Modal do tipo "Prompt" (Input Text) bloqueando a rotina até que o usuário digite algo e confirme ou cancele.',
                args: [
                    { name: 'titulo', type: 'string', description: 'Título superior da janela.', optional: false },
                    { name: 'msg', type: 'string', description: 'Instrução do que o usuário deve digitar.', optional: false },
                    { name: 'placeholder', type: 'string', description: 'Texto cinza de dica dentro do campo de texto.', optional: true }
                ],
                examples: [
                    { description: 'Simples: Capturar um ID.', code: "const idMilitar = await solicitarEntrada('Consultar Cadastro', 'Digite o Número PM:');\nif (idMilitar) {\n    digitar(idMilitar);\n    teclar('ENTER');\n}" },
                    { description: 'Complexo: Exigir validação antes de prosseguir.', code: "let placa = '';\nwhile (placa.length !== 7) {\n    placa = await solicitarEntrada('Atenção', 'Informe a Placa (Exatamente 7 letras/números):', 'Ex: ABC1D23');\n    if (placa === null) break; // Usuário clicou em cancelar\n    if (placa.length !== 7) exibirNotificacao('Placa Inválida!', false);\n}\nif (placa) digitar(placa.toUpperCase());" }
                ]
            },
            { 
                type: 'criarModal', title: 'criarModal(config)', category: 'Modais e Interface', icon: 'fa-solid fa-window-maximize',
                description: 'A Função Suprema de UI. Cria janelas de interface ricas e customizadas. Permite mesclar textos, inputs, selects, checkboxes e múltiplos botões de ação que devolvem um JSON com as respostas do usuário.',
                args: [{ name: 'config', type: 'object', description: 'Objeto central com toda a configuração visual e comportamental.', optional: false }],
                options: [
                    { name: 'title', type: 'string', default: "Interação Necessária", description: 'Título do Modal.' },
                    { name: 'elements', type: 'array', default: "[]", description: 'Lista de objetos descrevendo os campos: `{type: "input"|"select"|"checkbox"|"text", id: "chave_json", label: "Texto"}`.' },
                    { name: 'buttons', type: 'array', default: "[]", description: 'Lista de botões do rodapé: `{text: "Avançar", action: "confirm", className: "rotina-modal-save-btn"}`.' }
                ],
                examples: [
                    { description: 'Exemplo 1 (Simples): Modal de Aviso (Apenas informa algo e tem 1 botão).', code: "await criarModal({\n    title: 'Aviso Importante',\n    elements: [{ type: 'text', text: 'O sistema fará o processamento agora. Não toque no teclado.' }],\n    buttons: [{ text: 'Ciente, Iniciar', action: 'confirm', className: 'rotina-modal-save-btn' }]\n});\n// A rotina só continua quando o botão for clicado." },
                    
                    { description: 'Exemplo 2 (Intermediário): Modal de Confirmação (Sim / Não).', code: "const confirmacao = await criarModal({\n    title: 'Confirmar Exclusão',\n    elements: [{ type: 'text', text: 'Tem certeza que deseja apagar o registro selecionado?' }],\n    buttons: [\n        { text: 'Não / Cancelar', action: 'cancel', className: 'rotina-modal-cancel-btn' },\n        { text: 'Sim / Apagar', action: 'confirm', className: 'rotina-modal-delete-btn' }\n    ]\n});\n\nif (confirmacao && confirmacao.action === 'confirm') {\n    teclar('PF4'); // Comando fictício de excluir\n} else {\n    exibirNotificacao('Ação cancelada.');\n}" },
                    
                    { description: 'Exemplo 3 (Avançado): Formulário completo capturando vários dados (Input, Checkbox, Select).', code: "const form = await criarModal({\n    title: 'Configuração de Processamento',\n    elements: [\n        { type: 'input', id: 'lote', label: 'Número do Lote:', defaultValue: '1001' },\n        { type: 'select', id: 'prioridade', label: 'Nível de Prioridade:', options: [\n            { value: 'baixa', text: 'Normal (Execução em Background)' },\n            { value: 'alta', text: 'Urgente (Imediato)', selected: true }\n        ]},\n        { type: 'checkbox', id: 'gerarRelatorio', label: 'Gerar PDF ao final?', checked: true }\n    ],\n    buttons: [\n        { text: 'Sair', action: 'cancel', className: 'rotina-modal-cancel-btn' },\n        { text: 'Processar', action: 'confirm', className: 'rotina-modal-save-btn' }\n    ]\n});\n\nif (form && form.action === 'confirm') {\n    // O objeto formData devolve tudo baseado no 'id' de cada element\n    const dados = form.formData;\n    debug('Dados coletados:', dados);\n    \n    digitar(dados.lote);\n    if (dados.prioridade === 'alta') teclar('PF10');\n    // ...\n}" }
                ]
            },

            // ================= CATEGORIA: PLANILHAS GOOGLE =================
            { 
                type: 'lerPlanilha', title: 'lerPlanilha(id, [aba], [query])', category: 'Planilhas Google', icon: 'fa-solid fa-file-excel',
                description: 'Acessa uma Planilha do Google (Pública ou via Token de Serviço) e retorna seu conteúdo como uma Matriz 2D nativa [ [linha1], [linha2] ].',
                args: [
                    { name: 'id', type: 'string', description: 'O ID longo da planilha presente na URL.', optional: false },
                    { name: 'aba', type: 'string', description: 'Nome específico da página (Tab).', optional: true },
                    { name: 'query', type: 'string', description: 'Consulta Google Query Language (semelhante ao SQL). Útil para filtrar dados já no servidor.', optional: true }
                ],
                examples: [
                    { description: 'Simples: Ler toda a aba principal.', code: "const matriz = await lerPlanilha('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');\ndebug(matriz[1][0]); // Exibe a Coluna A da Linha 2" },
                    { description: 'Avançado: Trazer apenas linhas onde a Coluna C seja maior que 10.', code: "const dados = await lerPlanilha('ID_PLANILHA', 'Pagina1', 'SELECT * WHERE C > 10');" }
                ]
            },
            { 
                type: 'lerPlanilhaObjetos', title: 'lerPlanilhaObjetos(id, [aba], [query])', category: 'Planilhas Google', icon: 'fa-solid fa-boxes-stacked',
                description: 'Uma evolução do lerPlanilha. Ele considera a 1ª Linha como "Nomes das Variáveis" e devolve um Array de Objetos JSON facilitando muito a extração dos dados.',
                args: [
                    { name: 'id', type: 'string', description: 'ID da Planilha.', optional: false },
                    { name: 'aba', type: 'string', description: 'Nome da página.', optional: true }
                ],
                examples: [
                    { description: 'Simples: Transformar cabeçalhos em propriedades de objeto.', code: "const registros = await lerPlanilhaObjetos('ID_PLANILHA');\n// Se a coluna A tiver o título 'CPF' e a B 'NOME'\nfor (const reg of registros) {\n    debug(`Nome: ${reg.NOME} | Documento: ${reg.CPF}`);\n}" }
                ]
            },
            { 
                type: 'processarPlanilha', title: 'processarPlanilha(matriz, callback, [ignorarCabecalho])', category: 'Planilhas Google', icon: 'fa-solid fa-arrows-spin',
                description: 'Pega a Matriz 2D retornada pelas funções acima e percorre ela com segurança. Se der erro em uma linha, abre um Modal perguntando se o usuário quer Pausar, Pular ou Parar.',
                args: [
                    { name: 'matriz', type: 'array', description: 'Os dados crus.', optional: false },
                    { name: 'callback', type: 'function', description: 'A função (linha, index) => { ... } com a lógica de automação.', optional: false },
                    { name: 'ignorarCabecalho', type: 'boolean', description: 'Pula a linha 0 (padrão true).', optional: true }
                ],
                examples: [
                    { description: 'Simples: Integrar planilha com navegação de terminal.', code: "const db = await lerPlanilha('ID_PLANILHA');\nawait processarPlanilha(db, async (linha, index) => {\n    const matricula = linha[0]; // Coluna A\n    const valor = linha[1];     // Coluna B\n    \n    posicionar('Matricula:');\n    digitar(matricula);\n    teclar('ENTER');\n    // ... segue a lógica para cada linha\n});" }
                ]
            },
            { 
                type: 'enviarParaPlanilha', title: 'enviarParaPlanilha(idScript, aba, dados)', category: 'Planilhas Google', icon: 'fa-solid fa-cloud-arrow-up',
                description: 'Injeta dados de volta para o ecossistema Google. (Requer que você tenha publicado o script padrão do SisPMG+ na sua planilha).',
                args: [
                    { name: 'idScript', type: 'string', description: 'O ID de Implantação (Deployment ID) do Google Apps Script.', optional: false },
                    { name: 'aba', type: 'string', description: 'Nome da página que receberá os registros (Append).', optional: false },
                    { name: 'dados', type: 'array', description: 'Array de Arrays. Ex: `[ ["A1", "B1"], ["A2", "B2"] ]`.', optional: false }
                ],
                examples: [
                    { description: 'Simples: Adicionar 1 linha no fim da planilha.', code: "const hoje = new Date().toLocaleDateString();\nawait enviarParaPlanilha('ID_APPS_SCRIPT', 'Logs', [[hoje, 'Sucesso', 'Fim do Lote']]);" },
                    { description: 'Complexo: Acumular e enviar várias linhas de uma vez para melhor performance.', code: "let loteParaEnvio = [];\nfor (let i = 0; i < 5; i++) {\n    loteParaEnvio.push([i, 'Militar ' + i, 'OK']);\n}\nawait enviarParaPlanilha('ID_SCRIPT', 'Registros', loteParaEnvio);" }
                ]
            },

            // ================= CATEGORIA: TRATAMENTO DE DADOS =================
            { 
                type: 'agruparDados', title: 'agruparDados(lista, chave)', category: 'Tratamento de Dados', icon: 'fa-solid fa-layer-group',
                description: 'Recebe um array extenso de objetos e converte para um Dicionário categorizado por uma chave específica.',
                examples: [
                    { description: 'Agrupar processos por cidade para rodar em lotes.', code: "const listaObj = [\n    {nome:'João', city:'BH'}, {nome:'Maria', city:'BH'}, {nome:'Ana', city:'SP'}\n];\nconst grupos = agruparDados(listaObj, 'city');\n\n// grupos['BH'] terá 2 objetos. grupos['SP'] terá 1.\ndebug(`Processos em BH: ${grupos['BH'].length}`);" }
                ]
            },
            { 
                type: 'formatarData', title: 'formatarData(data, [formato])', category: 'Tratamento de Dados', icon: 'fa-solid fa-calendar-days',
                description: 'Converte diferentes formatos de data de entrada para o padrão estrito exigido pelo mainframe.',
                args: [
                    { name: 'data', type: 'string | Date', description: 'Data proveniente de planilhas ou sistemas web (Ex: "2024-12-01").', optional: false },
                    { name: 'formato', type: 'string', default: "'DDMMAAAA'", description: "Máscara de saída desejada ('DDMMAAAA', 'DD/MM/AAAA' ou 'YYYY-MM-DD')." }
                ],
                examples: [
                    { description: 'Simples: Formatar YYYY-MM-DD para terminal.', code: "const df = formatarData('2024-05-15'); // Devolve '15052024'\ndigitar(df);" },
                    { description: 'Avançado: Lidar com objeto Date do JS.', code: "const dataAtual = new Date();\nconst stringData = formatarData(dataAtual, 'DD/MM/AAAA');" }
                ]
            },
            { 
                type: 'converterMoeda', title: 'converterMoeda(texto)', category: 'Tratamento de Dados', icon: 'fa-solid fa-brazilian-real-sign',
                description: 'Transforma strings financeiras sujas ("R$ 1.500,00", "1.500,00", etc) em valores decimais reais do JS (1500.00) permitindo cálculos matemáticos.',
                examples: [
                    { description: 'Simples: Capturar da tela e calcular.', code: "const textoColetado = obterTexto(10, 5, 10, 20); // Pode vir 'R$ 5.340,99'\nconst valorDecimal = converterMoeda(textoColetado);\nconst dobro = valorDecimal * 2;\ndebug('O dobro é:', dobro);" }
                ]
            },
            { 
                type: 'extrairNumeros', title: 'extrairNumeros(texto)', category: 'Tratamento de Dados', icon: 'fa-solid fa-arrow-up-1-9',
                description: 'Varre uma string e elimina toda letra e caracter especial, devolvendo apenas números contíguos.',
                examples: [
                    { description: 'Limpar máscara de documentos.', code: "const placa = 'ABC-1234';\nconst numPlaca = extrairNumeros(placa); // '1234'" },
                    { description: 'Limpar máscara de CPF.', code: "const cpf = extrairNumeros('012.345.678-90'); // '01234567890'" }
                ]
            },
            { 
                type: 'extrairCPF', title: 'extrairCPF(texto)', category: 'Tratamento de Dados', icon: 'fa-solid fa-id-card',
                description: 'Usa Regex avançado para buscar na sujeira da tela o primeiro bloco de texto que se pareça com o formato XXX.XXX.XXX-XX.',
                examples: [
                    { description: 'Buscar sem se preocupar com as coordenadas.', code: "const telaBaguncada = obterTexto();\nconst cpfAchado = extrairCPF(telaBaguncada);\nif(cpfAchado) exibirNotificacao('Encontrei o dono: ' + cpfAchado);" }
                ]
            },
            { 
                type: 'extrairData', title: 'extrairData(texto)', category: 'Tratamento de Dados', icon: 'fa-solid fa-calendar-check',
                description: 'Procura ativamente por blocos no formato DD/MM/AAAA no meio de textos extensos.',
                examples: [
                    { description: 'Capturar data de nascimento do histórico.', code: "const historico = obterTexto(15, 1, 22, 80);\nconst dt = extrairData(historico);\nif(dt) debug('Data do fato:', dt);" }
                ]
            },
            { 
                type: 'extrairProtocolo', title: 'extrairProtocolo(texto)', category: 'Tratamento de Dados', icon: 'fa-solid fa-hashtag',
                description: 'Regex específico para buscar padrões como "Protocolo: XXXXXX" que o SIAD e outros geram na linha de comando.',
                examples: [
                    { description: 'Capturar protocolo SIAD.', code: "const rodape = obterTextoLinha(24);\nconst p = extrairProtocolo(rodape);\nif (p) debug('Número oficial guardado: ' + p);" }
                ]
            },

            // ================= CATEGORIA: ARQUIVOS (LOCAL) =================
            { 
                type: 'getDirectoryHandle', title: 'getDirectoryHandle([forceNew])', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-folder-open',
                description: 'Aciona a API do Navegador exigindo que o usuário conceda acesso de leitura e escrita a uma pasta física no seu computador.',
                args: [{ name: 'forceNew', type: 'boolean', description: 'Se `true`, força o navegador a pedir a pasta novamente ignorando o cache.', optional: true }],
                examples: [
                    { description: 'Simples: Solicitar acesso antes de um processo massivo.', code: "await getDirectoryHandle();\nexibirNotificacao('Acesso à pasta concedido.');" }
                ]
            },
            { 
                type: 'criarArquivo', title: 'criarArquivo(caminho, conteudo)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-floppy-disk',
                description: 'Cria (ou sobrescreve por completo) um arquivo de texto/CSV dentro da pasta autorizada pelo `getDirectoryHandle`.',
                args: [
                    { name: 'caminho', type: 'string', description: 'Nome do arquivo (ex: "relatorios/logs.txt"). Cria subpastas se necessário.', optional: false },
                    { name: 'conteudo', type: 'string', description: 'Todo o conteúdo do arquivo.', optional: false }
                ],
                examples: [
                    { description: 'Simples: Salvar um resultado da tela em TXT.', code: "const tela = obterTexto();\nawait criarArquivo('historico_terminal.txt', tela);" },
                    { description: 'Intermediário: Gerar arquivo CSV (separado por vírgula).', code: "const csv = 'Nome,Idade\\nJoão,30\\nMaria,25';\nawait criarArquivo('exportacao.csv', csv);" }
                ]
            },
            { 
                type: 'lerArquivo', title: 'lerArquivo(caminho)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-file-lines',
                description: 'Abre um arquivo da pasta autorizada e retorna todo o seu conteúdo na forma de string.',
                args: [{ name: 'caminho', type: 'string', description: 'Caminho relativo do arquivo (ex: "banco_dados.json").', optional: false }],
                examples: [
                    { description: 'Simples: Ler JSON salvo anteriormente.', code: "const str = await lerArquivo('config.json');\nif (str) {\n    const json = JSON.parse(str);\n    debug('Configurações lidas:', json);\n}" }
                ]
            },
            { 
                type: 'anexarNoArquivo', title: 'anexarNoArquivo(caminho, conteudo)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-file-circle-plus',
                description: 'Semelhante a criarArquivo, mas não apaga o que já existia. Útil para Logs de longa duração.',
                examples: [
                    { description: 'Adicionar nova linha no rodapé do arquivo.', code: "const data = new Date().toISOString();\nawait anexarNoArquivo('auditoria_log.txt', `\\n[${data}] Ação X concluída`);" }
                ]
            },
            { 
                type: 'excluirArquivo', title: 'excluirArquivo(caminho)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-file-circle-xmark',
                description: 'Remove fisicamente um arquivo da pasta selecionada.',
                examples: [
                    { description: 'Limpeza de arquivos temporários ao fim do processo.', code: "await excluirArquivo('cache_temporario.txt');" }
                ]
            },
            { 
                type: 'processarLinhas', title: 'processarLinhas(arquivo, callback)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-file-csv',
                description: 'Lê um arquivo de texto e executa uma automação para cada linha. Economiza processamento se comparado a tentar dar split() em arquivos de centenas de megabytes.',
                args: [
                    { name: 'arquivo', type: 'string', description: 'Nome do arquivo (ex: "matriculas_para_excluir.txt").', optional: false },
                    { name: 'callback', type: 'function', description: 'Função executada a cada volta do laço.', optional: false }
                ],
                examples: [
                    { description: 'Complexo: Ler lista de códigos, preencher e salvar comprovantes.', code: "await processarLinhas('lista.txt', async (linha, index) => {\n    if(linha.trim() === '') return; // pula vazias\n    \n    limparCampo(10);\n    digitar(linha);\n    teclar('ENTER');\n    await esperarTextoSumir('PROCESSANDO', { esperar: 5 });\n    \n    const protocolo = obterTextoLinha(24);\n    await anexarNoArquivo('resultados.txt', `${linha} => ${protocolo}\\n`);\n});" }
                ]
            },

            // ================= CATEGORIA: LOGIN E SEGURANÇA =================
            { 
                type: 'forgetPassword', title: 'forgetPassword()', category: 'Login e Segurança', icon: 'fa-solid fa-key',
                description: 'Aciona o comando interno que destrói a senha temporária do servidor atual mantida na memória local da extensão.',
                examples: [
                    { description: 'Garantir que ninguém use a aba após a rotina.', code: "await executarRotina('Rotina_Perigosa');\n// Apaga credenciais por precaução\nawait forgetPassword();\nfechar();" }
                ]
            },
            { 
                type: 'forgetUser', title: 'forgetUser()', category: 'Login e Segurança', icon: 'fa-solid fa-user-slash',
                description: 'Exclui permanentemente as credenciais, favoritos e preferências do Policial logado do cache da extensão.',
                examples: [
                    { description: 'Acionar logout forçado via script.', code: "const op = await criarModal({ title: 'Logout', elements: [{type: 'text', text:'Limpar cache de usuário?'}], buttons:[{text:'Ok', action:'confirm'}] });\nif (op && op.action === 'confirm') await forgetUser();" }
                ]
            },
            { 
                type: 'redirectToLogin', title: 'redirectToLogin()', category: 'Login e Segurança', icon: 'fa-solid fa-right-to-bracket',
                description: 'Comando de navegação que joga o navegador para a página de Login Unificado da Intranet PMMG.',
                examples: [
                    { description: 'Detectar token quebrado e forçar renovação.', code: "const valid = await localizarTexto('Sessao Expirada', {esperar:0});\nif(valid) redirectToLogin();" }
                ]
            },

            // ================= CATEGORIA: INTER-ABAS =================
            { 
                type: 'executarRotinaEm', title: 'executarRotinaEm(rotina, [alias], [sistema], [parametros])', category: 'Inter-Abas', icon: 'fa-solid fa-network-wired',
                description: 'Comunica-se com o Background Worker para abrir (ou reaproveitar) outra aba do Terminal SisPMG e mandá-la rodar um código remotamente.',
                args: [
                    { name: 'rotina', type: 'string', description: 'Nome da rotina pública/usuário, ou o próprio código JS direto (string literal).', optional: false },
                    { name: 'alias', type: 'string', description: 'Apelido (ID) da aba (Ex: "ABA_SIAD_CONSULTA"). Se omitido, o sistema cria um ID automático (T1, T2).', optional: true },
                    { name: 'sistema', type: 'string', description: 'Se for criar aba nova, informa qual sistema fazer Auto-Login (Ex: "SIAD", "SICI").', optional: true },
                    { name: 'parametros', type: 'object', description: 'Dicionário de dados que serão clonados e enviados para a aba remota.', optional: true }
                ],
                examples: [
                    { description: 'Simples: Executar uma consulta sem interface bloqueando a aba atual.', code: "const configAba = { idBusca: '9999' };\n// Chama e aguarda a aba remota terminar:\nconst resultado = await executarRotinaEm('Public/Consultas/BuscaProcesso', 'AUX_1', 'SIAD', configAba);\ndebug('A aba auxiliar retornou:', resultado);" },
                    { description: 'Complexo: Enviar código JS puro para rodar como Worker temporário em outro sistema.', code: "const scriptDinamico = `\n    // Este código rodará na ABA 2 (SICI)\n    digitar('PESQUISA'); teclar('ENTER');\n    const data = obterTexto();\n    retornar(data);\n`;\n\nconst retornoRemoto = await executarRotinaEm(scriptDinamico, 'WORKER_SICI', 'SICI');\nfechar('WORKER_SICI'); // Destrói o worker" }
                ]
            },
            { 
                type: 'fechar', title: 'fechar([alias])', category: 'Inter-Abas', icon: 'fa-solid fa-xmark',
                description: 'Instrui o navegador a fechar a aba do terminal. Pode fechar a si mesmo ou destruir workers auxiliares criados via alias.',
                examples: [
                    { description: 'Simples: Auto-destruição após finalizar um processo (útil em filas assíncronas).', code: "exibirNotificacao('Processo encerrado. Fechando aba...');\nfechar();" },
                    { description: 'Intermediário: Fechar a aba paralela quando já obteve o retorno.', code: "fechar('ABA_CONSULTA');" }
                ]
            },

            // ================= CATEGORIA: UTILITÁRIOS =================
            { 
                type: 'debug', title: 'debug(...dados)', category: 'Utilitários', icon: 'fa-solid fa-bug',
                description: 'Imprime mensagens ou objetos inspecionáveis em uma janela flutuante na interface. Ótimo para rastrear defeitos de variáveis nas suas rotinas complexas.',
                examples: [
                    { description: 'Simples: Print comum.', code: "debug('Rotina chegou no passo 3.');" },
                    { description: 'Avançado: Inspecionar o interior de um objeto/array.', code: "const dadosComplexos = [ {nome: 'A', id: 1}, {nome: 'B', id: 2} ];\ndebug('Olhe a estrutura:', dadosComplexos);" }
                ]
            },
            { 
                type: 'reloadPage', title: 'reloadPage()', category: 'Utilitários', icon: 'fa-solid fa-rotate',
                description: 'Força o navegador a dar um Refresh (F5) contornando o bloqueio de "As alterações não salvas serão perdidas" gerado pelo mainframe.',
                examples: [
                    { description: 'Resetar o sistema perante falha irreparável de comunicação.', code: "const falha = await localizarTexto('CONEXAO ENCERRADA', {esperar:0});\nif(falha) {\n   exibirNotificacao('Erro grave. Recarregando.', false);\n   reloadPage();\n}" }
                ]
            },
            { 
                type: 'getCookie', title: 'getCookie(nome)', category: 'Utilitários', icon: 'fa-solid fa-cookie',
                description: 'Busca o valor bruto de um cookie gravado na sessão da Intranet.',
                args: [{ name: 'nome', type: 'string', description: 'Chave do cookie.', optional: false }],
                examples: [
                    { description: 'Ler cookie de segurança.', code: "const rawToken = getCookie('tokiuz');\nif(!rawToken) debug('Usuário sem token ativo.');" }
                ]
            },
            { 
                type: 'decodeJwt', title: 'decodeJwt(token)', category: 'Utilitários', icon: 'fa-solid fa-user-gear',
                description: 'Converte a string ilegível de um Token JWT em um JSON estruturado contendo as permissões ou dados transportados.',
                args: [{ name: 'token', type: 'string', description: 'O retorno do getCookie.', optional: false }],
                examples: [
                    { description: 'Ler unidade de lotação do PM no Token.', code: "const tk = getCookie('tokiuz');\nconst info = decodeJwt(tk);\ndebug('Unidade Logada:', info.u);" }
                ]
            },
            { 
                type: 'startDebugSpy', title: 'startDebugSpy()', category: 'Utilitários', icon: 'fa-solid fa-user-secret',
                description: 'Ao rodar isso, o Terminal passará a imprimir no `F12` o código Hexadecimal exato das sequências ANSI/VT100 recebidas a cada tecla. Útil apenas para desenvolvedores mapearem atalhos exóticos.',
                examples: [
                    { description: 'Simples: Ligar monitoria profunda.', code: "startDebugSpy();\nexibirNotificacao('Aperte F12 para ver o tráfego de rede.');" }
                ]
            },
            { 
                type: 'stopDebugSpy', title: 'stopDebugSpy()', category: 'Utilitários', icon: 'fa-solid fa-user-check',
                description: 'Desliga o log intensivo do startDebugSpy.',
                examples: [
                    { description: 'Simples: Desligar.', code: "stopDebugSpy();" }
                ]
            },
            { 
                type: 'startDebugRotina', title: 'startDebugRotina()', category: 'Utilitários', icon: 'fa-solid fa-bug-slash',
                description: 'Ativa o depurador de linhas: cada comando executado na rotina será impresso no console (F12). Útil para entender onde a rotina está travando.',
                examples: [
                    { description: 'Ligar monitoria de execução.', code: "startDebugRotina();" }
                ]
            },
            { 
                type: 'stopDebugRotina', title: 'stopDebugRotina()', category: 'Utilitários', icon: 'fa-solid fa-check-double',
                description: 'Desliga o depurador de linhas da rotina.',
                examples: [
                    { description: 'Desligar.', code: "stopDebugRotina();" }
                ]
            },
            { 
                type: 'obterDadosUsuario', title: 'obterDadosUsuario()', category: 'Utilitários', icon: 'fa-solid fa-id-card-clip',
                description: 'Atalho limpo que embute a lógica do Cookie+JWT e devolve um Objeto formatado com `numeroPM`, `nomeCompleto`, `postoGraduacao`, `unidadeContabil`, etc.',
                examples: [
                    { description: 'Simples: Dar boas-vindas na rotina.', code: "const policial = await obterDadosUsuario();\nexibirNotificacao(`Rotina Iniciada por ${policial.postoGraduacao} ${policial.nomeCompleto}`, true);" },
                    { description: 'Avançado: Condicionar preenchimento baseado no usuário logado.', code: "const usr = await obterDadosUsuario();\ndigitar(usr.numeroPM); // Ex: Preenche o próprio MasPM\nteclar('ENTER');" }
                ]
            }
        ];
    }
}