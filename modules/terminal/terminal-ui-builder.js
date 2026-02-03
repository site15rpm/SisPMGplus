// Arquivo: modules/terminal/terminal-ui-builder.js
// Módulo para construir la interfaz del asistente de código, documentar funciones e insertar ejemplos.

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
            <div class="builder-columns">
                <div class="builder-list-column">
                    <input type="text" id="builder-search-input" placeholder="Pesquisar função..." class="modal-text-input">
                    <div id="builder-list-container"></div>
                </div>
                <div class="builder-details-column">
                    <div id="builder-details-content">
                         <div class="builder-placeholder">
                            <i class="fa-solid fa-book-open"></i>
                            <p>Selecione uma função à esquerda para ver os detalhes, argumentos e exemplos.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        const assistantModal = this.context.createModal('Assistente de Código', modalHTML, null, 
            [{ text: 'Fechar', className: 'rotina-modal-cancel-btn', action: m => this.context.closeModalAndFocus(m) }],
            { modalClass: 'ui-builder-main-modal', stack: true }
        );

        this.renderFeatureList();

        const searchInput = assistantModal.querySelector('#builder-search-input');
        searchInput.addEventListener('input', () => this.renderFeatureList(searchInput.value));
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
            const order = ['Interação com a Tela', 'Configuração e Controle', 'Interfaces de Usuário (Modais)', 'Arquivos (Sistema Local)', 'Extração de Dados', 'Integrações Externas', 'Informações do Usuário', 'Estruturas de Código'];
            return (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b));
        });

        if (sortedCategories.length === 0) {
            listContainer.innerHTML = '<div class="builder-list-item-static">Nenhuma função encontrada.</div>';
            return;
        }

        for (const category of sortedCategories) {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'ui-builder-section';
            categoryDiv.innerHTML = `<h4>${category}</h4>`;
            
            groupedFeatures[category].sort((a, b) => a.title.localeCompare(b.title)).forEach(feature => {
                const btn = document.createElement('button');
                btn.className = 'builder-list-item';
                btn.innerHTML = `<i class="fa-fw ${feature.icon}"></i> <span>${feature.title.split('(')[0]}</span>`;
                
                btn.onclick = () => {
                    document.querySelectorAll('.builder-list-item').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
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
                <div class="feature-section">
                    <h5>Argumentos</h5>
                    <ul class="feature-args-list">
                        ${feature.args.map(arg => `
                            <li>
                                <strong>${arg.name}</strong> 
                                <span class="arg-type">${arg.type}</span>
                                ${arg.optional ? '<span class="arg-optional">opcional</span>' : ''}
                                <p>${arg.description}</p>
                            </li>
                        `).join('')}
                    </ul>
                </div>`;
        }
        
        let optionsHTML = '';
        if (feature.options && feature.options.length > 0) {
            optionsHTML = `
                <div class="feature-section">
                    <h5>Opções (para o objeto <code>${feature.args.find(a => a.name.includes('opco'))?.name || 'opcoes'}</code>)</h5>
                    <ul class="feature-options-list">
                        ${feature.options.map(opt => `
                            <li>
                                <strong>${opt.name}</strong>
                                <span class="arg-type">${opt.type}</span>
                                <span class="arg-default">(padrão: ${opt.default})</span>
                                <p>${opt.description}</p>
                            </li>
                        `).join('')}
                    </ul>
                </div>`;
        }

        let examplesHTML = '';
        if (feature.examples && feature.examples.length > 0) {
            examplesHTML = `
                <div class="feature-section">
                    <h5>Exemplos</h5>
                    <div class="feature-examples">
                        ${feature.examples.map((ex, index) => `
                            <div class="example-item">
                                <p>${ex.description}</p>
                                <pre class="code-example">${this.context.escapeHtml(ex.code.trim())}</pre>
                                <button class="insert-example-btn" data-example-index="${index}">Inserir Exemplo</button>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
        }

        detailsContainer.innerHTML = `
            <div class="feature-details">
                <div class="feature-header">
                    <i class="fa-fw ${feature.icon}"></i>
                    <h4>${feature.title}</h4>
                </div>
                <p class="feature-description">${feature.description}</p>
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
     * Retorna a lista completa de funções e snippets disponíveis no assistente.
     */
    getFeatures() {
        return [
            // Categoria: Configuração e Controle
            { 
                type: 'auto-executar', title: 'autoExecutar(texto, opcoes)', category: 'Configuração e Controle', icon: 'fa-solid fa-robot',
                description: 'Define um gatilho para executar a rotina automaticamente. Quando o `texto` especificado é detectado em qualquer lugar da tela, a rotina inicia. Após a execução, a rotina fica em espera até que o usuário pressione a tecla definida em `on` (padrão: ENTER).',
                args: [
                    { name: 'texto', type: 'string', description: 'O texto que, ao aparecer na tela, acionará a rotina.', optional: false },
                    { name: 'opcoes', type: 'object', description: 'Configurações para o gatilho de reativação.', optional: true }
                ],
                options: [
                    { name: 'on', type: 'string', default: "'ENTER'", description: "A tecla que reativará o gatilho após a execução. Pode ser `'ENTER'` ou `'ANY_KEY'` para qualquer tecla." }
                ],
                examples: [
                    { description: 'Executar a rotina sempre que "NOVO REGISTRO" aparecer. A rotina será reativada após o usuário pressionar ENTER.', code: 'autoExecutar("NOVO REGISTRO");' },
                    { description: 'Executar quando "CONSULTA" for detectado e reativar com qualquer tecla.', code: 'autoExecutar("CONSULTA", { on: \'ANY_KEY\' });' }
                ]
            },
            { 
                type: 'velocidade', title: 'velocidade(segundos)', category: 'Configuração e Controle', icon: 'fa-solid fa-gauge-high',
                description: 'Altera o intervalo de tempo padrão (em segundos) entre cada comando da rotina. Útil para ajustar a velocidade de execução em telas mais lentas ou rápidas.',
                args: [{ name: 'segundos', type: 'number', description: 'O tempo de espera em segundos. Use decimais para frações (ex: 0.5).', optional: false }],
                examples: [
                    { description: 'Definir a rotina para executar com um intervalo de meio segundo entre cada passo.', code: 'velocidade(0.5);' },
                    { description: 'Executar os comandos o mais rápido possível (sem delay).', code: 'velocidade(0);' }
                ]
            },
            { 
                type: 'esperar', title: 'esperar(segundos)', category: 'Configuração e Controle', icon: 'fa-solid fa-clock',
                description: 'Pausa a execução da rotina pelo número de segundos especificado.',
                args: [{ name: 'segundos', type: 'number', description: 'O tempo de espera em segundos.', optional: true }],
                examples: [
                    { description: 'Fazer uma pausa de 3 segundos.', code: 'esperar(3);' },
                    { description: 'Fazer uma pausa padrão (definida por `velocidade()`).', code: 'esperar();' }
                ]
            },
             { 
                type: 'executar-rotina', title: 'executarRotina(nomeDaRotina)', category: 'Configuração e Controle', icon: 'fa-solid fa-diagram-project',
                description: 'Chama e executa outra rotina salva. Permite modularizar e reutilizar código.',
                args: [{ name: 'nomeDaRotina', type: 'string', description: 'O nome completo da rotina a ser executada, incluindo o caminho da pasta (ex: "pasta/minha_sub_rotina").', optional: false }],
                examples: [{ description: 'Executar uma rotina chamada "Limpar_Cache" que está salva na pasta "utilidades".', code: 'executarRotina("utilidades/Limpar_Cache");' }]
            },
            { 
                type: 'show-notification', title: 'exibirNotificacao(mensagem, sucesso, duracao)', category: 'Interfaces de Usuário (Modais)', icon: 'fa-solid fa-bell',
                description: 'Exibe uma notificação temporária no canto da tela.',
                args: [
                    { name: 'mensagem', type: 'string', description: 'O texto a ser exibido.', optional: false },
                    { name: 'sucesso', type: 'boolean', description: 'Se `true`, a notificação será verde (sucesso). Se `false`, será vermelha (erro). Padrão `true`.', optional: true },
                    { name: 'duracao', type: 'number', description: 'Tempo em segundos que a notificação ficará visível. Padrão `2`.', optional: true }
                ],
                examples: [
                    { description: 'Exibir uma mensagem de sucesso.', code: 'exibirNotificacao("Processo concluído!");' },
                    { description: 'Exibir uma mensagem de erro que dura 5 segundos.', code: 'exibirNotificacao("Falha ao salvar.", false, 5);' }
                ]
            },
            
            // Categoria: Estruturas de Código
            { 
                type: 'if-else', title: 'if / else', category: 'Estruturas de Código', icon: 'fa-solid fa-code-branch',
                description: 'Executa um bloco de código se uma condição for verdadeira, e outro bloco (opcional) se for falsa. A função `localizarTexto` é comumente usada como condição.',
                examples: [
                    { description: 'Executar uma ação somente se um texto específico estiver na tela.', code: 'if (localizarTexto("SUCESSO", { esperar: 0 })) {\n    exibirNotificacao("Operação bem-sucedida!");\n}' },
                    { description: 'Executar uma ação ou outra, dependendo do que está na tela.', code: 'if (localizarTexto("MENU PRINCIPAL", { esperar: 0 })) {\n    // Ações para o menu principal\n} else {\n    // Ações para outras telas\n    teclar("ESCAPE");\n}' }
                ]
            },
            { 
                type: 'try-catch', title: 'try / catch', category: 'Estruturas de Código', icon: 'fa-solid fa-triangle-exclamation',
                description: 'Tenta executar um bloco de código (`try`). Se ocorrer um erro (ex: `posicionar` não encontra um campo), executa o bloco `catch` em vez de parar a rotina.',
                examples: [
                    { description: 'Tentar posicionar em um campo opcional e, se não encontrar, apenas notificar sem parar a rotina.', code: 'try {\n    posicionar("CAMPO OPCIONAL:");\n    digitar("Valor Opcional");\n} catch (e) {\n    exibirNotificacao("Campo opcional não encontrado, continuando...");\n}' }
                ]
            },
            { 
                type: 'for-of-loop', title: 'for...of (Loop em Lista)', category: 'Estruturas de Código', icon: 'fa-solid fa-list-ol',
                description: 'Percorre todos os itens de uma lista (array) e executa um bloco de código para cada item.',
                examples: [
                    { description: 'Digitar uma lista de nomes, pressionando ENTER após cada um.', code: 'const nomes = ["CLERISTON", "JOAO", "MARIA"];\nfor (const nome of nomes) {\n    digitar(nome);\n    teclar("ENTER");\n    esperar(1);\n}' }
                ]
            },
            { 
                type: 'while-loop', title: 'while (Loop com Condição)', category: 'Estruturas de Código', icon: 'fa-solid fa-infinity',
                description: 'Repete um bloco de código enquanto uma condição for verdadeira. Cuidado para não criar loops infinitos.',
                examples: [
                    { description: 'Pressionar "DESCER" repetidamente enquanto o texto "Mais..." for visível na tela.', code: 'while (localizarTexto("Mais...", { esperar: 0 })) {\n    teclar("DESCER");\n    esperar(0.5);\n}' }
                ]
            },
            
            // Categoria: Interação com a Tela
            { 
                type: 'localizar-texto', title: 'localizarTexto(alvo, opcoes)', category: 'Interação com a Tela', icon: 'fa-solid fa-magnifying-glass',
                description: 'Função unificada para encontrar ou esperar por um ou mais textos/padrões (Regex) na tela. É uma das funções mais poderosas para controlar o fluxo da rotina.',
                args: [
                    { name: 'alvo', type: 'string | RegExp | array', description: 'O texto, padrão Regex, ou array de textos/Regex a ser procurado.', optional: false },
                    { name: 'opcoes', type: 'object', description: 'Um objeto com opções para customizar a busca.', optional: true }
                ],
                options: [
                    { name: 'esperar', type: 'number', default: '5', description: 'Tempo máximo em segundos para esperar pelo texto. Se for `0`, verifica apenas uma vez e retorna imediatamente.' },
                    { name: 'lancarErro', type: 'boolean', default: 'false', description: 'Se `true`, a rotina irá parar com um erro se o texto não for encontrado. Se `false`, apenas retornará `false`.' },
                    { name: 'caseSensitive', type: 'boolean', default: 'false', description: 'Se `true`, a busca diferenciará maiúsculas de minúsculas.' },
                    { name: 'area', type: 'object', default: 'null', description: 'Restringe a busca a uma área específica da tela (veja exemplos).' },
                    { name: 'dialogoFalha', type: 'boolean | string', default: 'false', description: 'Se `true`, exibe um diálogo de confirmação se o texto não for encontrado. Pode ser uma string com uma mensagem customizada.' }
                ],
                examples: [
                    { description: 'Verificar se um texto existe (para usar em um `if`).', code: 'if (localizarTexto("Sucesso", { esperar: 0 })) {\n    exibirNotificacao("Encontrado!");\n}' },
                    { description: 'Esperar até 10 segundos por um texto. Se não encontrar, a rotina para com um erro.', code: 'localizarTexto("Comando concluído", { esperar: 10, lancarErro: true });' },
                    { description: 'Esperar por um número de protocolo usando Regex, sem parar a rotina se falhar.', code: 'const achou = localizarTexto(/Protocolo: \\d+/, { esperar: 10, lancarErro: false });\nif (!achou) {\n    exibirNotificacao("Protocolo não localizado!", false);\n}' },
                    { description: 'Procurar um texto apenas na linha 5.', code: 'localizarTexto("TOTAL", { area: { linha: 5 } });' },
                    { description: 'Mostrar um diálogo de confirmação se "MENU PRINCIPAL" não for encontrado na primeira linha.', code: 'localizarTexto("MENU PRINCIPAL", { area: { linha: 1 }, dialogoFalha: true });' }
                ]
            },
            {
                type: 'posicionar', title: 'posicionar(rotulo, opcoes)', category: 'Interação com a Tela', icon: 'fa-solid fa-crosshairs',
                description: 'Encontra um `rotulo` na tela, posiciona o cursor no campo de texto adjacente e, opcionalmente, move o cursor para outros campos.',
                args: [
                    { name: 'rotulo', type: 'string', description: 'O texto/rótulo que precede o campo de entrada desejado.', optional: false },
                    { name: 'opcoes', type: 'object', description: 'Um objeto com opções para customizar o posicionamento.', optional: true }
                ],
                options: [
                    { name: 'offset', type: 'number', default: '0', description: 'Número de campos para pular (usando TAB) após encontrar o campo inicial.' },
                    { name: 'direcao', type: 'string', default: "'apos'", description: "Onde procurar o campo em relação ao rótulo. Valores: `'apos'`, `'antes'`, `'acima'`, `'abaixo'`." },
                    { name: 'caseSensitive', type: 'boolean', default: 'false', description: 'Se `true`, a busca pelo rótulo diferenciará maiúsculas de minúsculas.' }
                ],
                examples: [
                    { description: 'Encontrar "NOME:" e posicionar no campo ao lado.', code: 'posicionar("NOME:");' },
                    { description: 'Encontrar "NOME:", pular 2 campos para a direita e parar.', code: 'posicionar("NOME:", { offset: 2 });' },
                    { description: 'Encontrar "TOTAL:" e buscar um campo editável na linha de cima, mais próximo da mesma coluna.', code: 'posicionar("TOTAL:", { direcao: \'acima\' });' }
                ]
            },
            { 
                type: 'teclar', title: 'teclar(nomeTecla)', category: 'Interação com a Tela', icon: 'fa-solid fa-keyboard', 
                description: 'Simula o pressionamento de uma tecla especial do terminal (ENTER, TAB, PF1, etc.).',
                args: [{ name: 'nomeTecla', type: 'string', description: "O nome da tecla a ser pressionada. Ex: 'ENTER', 'TAB', 'LIMPAR', 'SUBIR', 'PF1', etc.", optional: false }],
                examples: [{ description: 'Simular o pressionamento da tecla ENTER.', code: 'teclar("ENTER");' }]
            },
            { 
                type: 'digitar', title: 'digitar(texto, verificar)', category: 'Interação com a Tela', icon: 'fa-solid fa-font', 
                description: 'Envia uma sequência de texto para o terminal, como se estivesse sendo digitada.',
                args: [
                    { name: 'texto', type: 'string', description: 'O texto a ser digitado.', optional: false },
                    { name: 'verificar', type: 'boolean', description: 'Se `true` (padrão), a rotina verifica se o texto foi realmente inserido no campo, parando em caso de falha. Se `false`, apenas envia o texto sem verificação.', optional: true }
                ],
                examples: [
                    { description: 'Digitar um nome e verificar se foi inserido corretamente.', code: 'digitar("CLERISTON TAMEIRAO SILVA");' },
                    { description: 'Digitar uma senha sem verificação (mais rápido e seguro para senhas).', code: 'digitar("minhaSenha123", false);' }
                ]
            },
            { 
                type: 'clicar', title: 'clicar(linha, coluna)', category: 'Interação com a Tela', icon: 'fa-solid fa-hand-pointer', 
                description: 'Simula um clique do mouse nas coordenadas especificadas do terminal.',
                args: [
                    { name: 'linha', type: 'number', description: 'O número da linha (1 a 31).', optional: false },
                    { name: 'coluna', type: 'number', description: 'O número da coluna (1 a 80).', optional: false }
                ],
                examples: [{ description: 'Clicar na posição correspondente a PF12 (linha 22, coluna 76).', code: 'clicar(22, 76);' }]
            },
            {
                type: 'obterTexto', title: 'obterTexto(linha, coluna, linhaFinal, colunaFinal)', category: 'Interação com a Tela', icon: 'fa-solid fa-file-alt',
                description: 'Função versátil para capturar texto da tela. Pode ser usada de quatro formas diferentes para obter desde a tela inteira até um bloco específico.',
                args: [
                    { name: 'linha', type: 'number', description: 'O número da linha a ser lida.', optional: true },
                    { name: 'coluna', type: 'number', description: 'A coluna inicial da leitura.', optional: true },
                    { name: 'linhaFinal', type: 'number', description: 'A linha final para leitura em bloco.', optional: true },
                    { name: 'colunaFinal', type: 'number', description: 'A coluna final para leitura em bloco.', optional: true }
                ],
                examples: [
                    { description: 'Obter o texto da tela inteira.', code: 'const telaInteira = obterTexto();' },
                    { description: 'Obter o texto apenas da linha 10.', code: 'const linhaDez = obterTexto(10);' },
                    { description: 'Obter o texto da linha 10, começando da coluna 5.', code: 'const parteDaLinha = obterTexto(10, 5);' },
                    { description: 'Obter o texto de um bloco, da linha 5 à 8 e da coluna 10 à 40.', code: 'const bloco = obterTexto(5, 10, 8, 40);' }
                ]
            },
            { 
                type: 'ler-tela', title: 'lerTela()', category: 'Interação com a Tela', icon: 'fa-solid fa-highlighter', 
                description: 'Pausa a rotina e aguarda o usuário clicar em dois pontos da tela para definir uma área retangular. Retorna o texto contido nessa área.',
                examples: [
                    { description: 'Pedir ao usuário para selecionar uma área e salvar o texto em um arquivo.', code: 'const selecao = lerTela();\nif (selecao) {\n    criarArquivo("selecao.txt", selecao.text);\n}' }
                ]
            },
            {
                type: 'copiar', title: 'copiar(linha, coluna, linhaFinal, colunaFinal)', category: 'Interação com a Tela', icon: 'fa-solid fa-copy',
                description: 'Função versátil para copiar texto da tela para a área de transferência. Pode ser usada de quatro formas, similar a `obterTexto`.',
                args: [
                    { name: 'linha', type: 'number', description: 'O número da linha a ser copiada.', optional: true },
                    { name: 'coluna', type: 'number', description: 'A coluna inicial da cópia.', optional: true },
                    { name: 'linhaFinal', type: 'number', description: 'A linha final para cópia em bloco.', optional: true },
                    { name: 'colunaFinal', type: 'number', description: 'A coluna final para cópia em bloco.', optional: true }
                ],
                examples: [
                    { description: 'Copiar todo o conteúdo da tela.', code: 'copiar();' },
                    { description: 'Copiar apenas o conteúdo da linha 10.', code: 'copiar(10);' },
                    { description: 'Copiar um bloco de texto da linha 5 à 8, e da coluna 10 à 40.', code: 'copiar(5, 10, 8, 40);' }
                ]
            },
            { 
                type: 'colar', title: 'colar()', category: 'Interação com a Tela', icon: 'fa-solid fa-paste', 
                description: 'Cola o texto da área de transferência do sistema no terminal, na posição atual do cursor.',
                examples: [{ description: 'Colar um texto previamente copiado.', code: 'colar();' }]
            },
            {
                type: 'obterTextoLinha', title: 'obterTextoLinha(numeroLinha)', category: 'Interação com a Tela', icon: 'fa-solid fa-ruler-horizontal',
                description: 'Captura e retorna o texto de uma linha específica da tela para ser usado em uma variável. Se nenhum número de linha for fornecido, captura da linha atual do cursor.',
                args: [{ name: 'numeroLinha', type: 'number', description: 'O número da linha a ser lida (de 1 a 31).', optional: true }],
                examples: [
                    { description: 'Pegar o texto da linha 10 e armazenar em uma variável.', code: 'const texto = obterTextoLinha(10);' },
                    { description: 'Pegar o texto da linha onde o cursor está posicionado.', code: 'const textoCursor = obterTextoLinha();' }
                ]
            },
            { 
                type: 'obterPosicaoCursor', title: 'obterPosicaoCursor()', category: 'Interação com a Tela', icon: 'fa-solid fa-location-crosshairs',
                description: 'Retorna um objeto com as coordenadas atuais do cursor.',
                examples: [{ description: 'Obter e exibir a posição atual do cursor.', code: 'const pos = obterPosicaoCursor();\nexibirNotificacao(`Cursor em Linha ${pos.y}, Coluna ${pos.x}`);' }]
            },
            { 
                type: 'obter-campos-digitaveis', title: 'obterCamposDigitaveis()', category: 'Interação com a Tela', icon: 'fa-solid fa-list-check', 
                description: 'Analisa a tela e retorna uma lista de todos os campos de texto editáveis (desprotegidos), com suas coordenadas e conteúdo atual.',
                examples: [{ description: 'Listar todos os campos editáveis e seus conteúdos.', code: 'const campos = obterCamposDigitaveis();\nfor (const campo of campos) {\n    exibirNotificacao(`Campo na L${campo.linha} C${campo.coluna} contém: "${campo.texto}"`);\n}' }]
            },

            // Categoria: Extração de Dados
            {
                type: 'extrair-cpf', title: 'extrairCPF(texto)', category: 'Extração de Dados', icon: 'fa-solid fa-id-card',
                description: 'Localiza e retorna a primeira ocorrência de um CPF formatado (xxx.xxx.xxx-xx) encontrado no texto fornecido.',
                args: [{ name: 'texto', type: 'string', description: 'O texto onde a busca será realizada.', optional: false }],
                examples: [{ description: 'Ler a tela inteira e extrair o primeiro CPF que encontrar.', code: 'const tela = obterTexto();\nconst cpf = extrairCPF(tela);\nif (cpf) {\n    digitar(cpf);\n}' }]
            },
            {
                type: 'extrair-data', title: 'extrairData(texto)', category: 'Extração de Dados', icon: 'fa-solid fa-calendar-days',
                description: 'Localiza e retorna a primeira ocorrência de uma data formatada (dd/mm/aaaa) encontrada no texto fornecido.',
                args: [{ name: 'texto', type: 'string', description: 'O texto onde a busca será realizada.', optional: false }],
                examples: [{ description: 'Ler a tela inteira e extrair a primeira data que encontrar.', code: 'const tela = obterTexto();\nconst data = extrairData(tela);\nif (data) {\n    digitar(data);\n}' }]
            },
            {
                type: 'extrair-protocolo', title: 'extrairProtocolo(texto)', category: 'Extração de Dados', icon: 'fa-solid fa-hashtag',
                description: 'Localiza e retorna um número de protocolo que é precedido pela palavra "Protocolo:".',
                args: [{ name: 'texto', type: 'string', description: 'O texto onde a busca será realizada.', optional: false }],
                examples: [{ description: 'Ler a tela e extrair o número do protocolo.', code: 'const tela = obterTexto();\nconst protocolo = extrairProtocolo(tela);\nif (protocolo) {\n    exibirNotificacao("Protocolo encontrado: " + protocolo);\n}' }]
            },

            // Categoria: Arquivos (Sistema Local)
            { 
                type: 'processar-linhas', title: 'processarLinhas(arquivo, callback)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-file-csv',
                description: 'Lê um arquivo de texto ou CSV local e executa uma função (callback) para cada linha do arquivo, automatizando tarefas repetitivas.',
                args: [
                    { name: 'arquivo', type: 'string', description: 'O nome do arquivo a ser lido (ex: "dados.csv").', optional: false },
                    { name: 'callback', type: 'function', description: 'A função a ser executada para cada linha. Recebe `(linha, indice, todasAsLinhas)` como argumentos.', optional: false }
                ],
                examples: [{
                    description: 'Ler um arquivo CSV com "nome,id" em cada linha e preencher os campos correspondentes no terminal.',
                    code: 'processarLinhas("dados.csv", (linha, indice) => {\n    const [nome, id] = linha.split(\',\');\n    posicionar("Nome:");\n    digitar(nome);\n    posicionar("ID:");\n    digitar(id);\n    teclar("ENTER");\n    localizarTexto("Registro salvo");\n});'
                }]
            },
            { 
                type: 'ler-arquivo', title: 'lerArquivo(caminho)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-file-lines',
                description: 'Abre um seletor de diretório (se ainda não selecionado) e lê o conteúdo de um arquivo de texto.',
                args: [{ name: 'caminho', type: 'string', description: 'O nome do arquivo, incluindo subpastas se houver (ex: "relatorios/log.txt").', optional: false }],
                examples: [{ description: 'Ler o conteúdo de "meu_arquivo.txt" e digitá-lo no terminal.', code: 'const conteudo = lerArquivo("meu_arquivo.txt");\nif (conteudo) {\n    digitar(conteudo);\n}' }]
            },
            { 
                type: 'criar-arquivo', title: 'criarArquivo(caminho, conteudo)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-floppy-disk',
                description: 'Salva um texto em um arquivo local. Se o arquivo já existir, ele será sobrescrito.',
                args: [
                    { name: 'caminho', type: 'string', description: 'O nome do arquivo a ser salvo.', optional: false },
                    { name: 'conteudo', type: 'string', description: 'O texto a ser salvo no arquivo.', optional: false }
                ],
                examples: [{ description: 'Capturar o texto da tela inteira e salvá-lo em "captura.txt".', code: 'const tela = obterTexto();\ncriarArquivo("captura.txt", tela);' }]
            },
            { 
                type: 'anexar-arquivo', title: 'anexarNoArquivo(caminho, conteudo)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-file-circle-plus',
                description: 'Adiciona um novo conteúdo ao final de um arquivo existente. Se o arquivo não existir, ele será criado.',
                args: [
                    { name: 'caminho', type: 'string', description: 'O nome do arquivo.', optional: false },
                    { name: 'conteudo', type: 'string', description: 'O texto a ser adicionado.', optional: false }
                ],
                examples: [{ description: 'Adicionar a data e hora atuais a um arquivo de log.', code: 'const novaLinha = "\\n" + new Date().toLocaleString(\'pt-BR\');\nanexarNoArquivo("log.txt", novaLinha);' }]
            },
            { 
                type: 'excluir-arquivo', title: 'excluirArquivo(caminho)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-file-circle-xmark',
                description: 'Exclui um arquivo do diretório selecionado.',
                args: [{ name: 'caminho', type: 'string', description: 'O nome do arquivo a ser excluído.', optional: false }],
                examples: [{ description: 'Excluir um arquivo temporário.', code: 'excluirArquivo("arquivo_temporario.txt");' }]
            },
             { 
                type: 'criarModal', title: 'criarModal(configuracao)', category: 'Interfaces de Usuário (Modais)', icon: 'fa-solid fa-window-maximize',
                description: 'Cria um modal interativo para coletar dados do usuário no meio de uma rotina. A função retorna uma promessa que resolve com o resultado da interação.',
                args: [{ name: 'configuracao', type: 'object', description: 'Objeto de configuração do modal.', optional: false }],
                options: [
                    { name: 'title', type: 'string', default: "'Interação Necessária'", description: 'O título da janela modal.'},
                    { name: 'elements', type: 'array', default: '[]', description: 'Uma lista de objetos, cada um definindo um elemento da interface (input, select, checkbox, etc.).'},
                    { name: 'buttons', type: 'array', default: '[]', description: 'Uma lista de objetos para definir os botões de ação do modal.'},
                    { name: 'modalClass', type: 'string', default: "''", description: 'Classe CSS customizada para aplicar ao conteúdo do modal.' },
                    { name: 'style', type: 'object', default: '{}', description: 'Objeto com estilos CSS a serem aplicados inline ao modal.' }
                ],
                examples: [
                    {
                        description: 'Criar um modal pedindo um nome e uma opção, e depois usar os dados inseridos.',
                        code: `const resultado = criarModal({\n    title: 'Coleta de Dados',\n    elements: [\n        { type: 'title', text: 'Informações Adicionais' },\n        { type: 'text', text: 'Por favor, insira os dados abaixo:' },\n        { type: 'input', id: 'nome_usuario', label: 'Nome Completo:', defaultValue: 'Fulano' },\n        { type: 'select', id: 'setor', label: 'Setor:', options: [\n            { value: 'rh', text: 'Recursos Humanos' },\n            { value: 'ti', text: 'Tecnologia' }\n        ]},\n        { type: 'checkbox', id: 'urgente', label: 'Marcar como urgente', checked: true }\n    ],\n    buttons: [\n        { text: 'Cancelar', action: 'cancel' },\n        { text: 'Confirmar', action: 'confirm' }\n    ],\n    style: { backgroundColor: '#EFE6DD' }\n});\n\nif (resultado && resultado.action === 'confirm') {\n    posicionar("Nome:");\n    digitar(resultado.formData.nome_usuario);\n    posicionar("Setor:");\n    digitar(resultado.formData.setor);\n    if(resultado.formData.urgente){\n        posicionar("Urgente:");\n        digitar("SIM");\n    }\n}`
                    }
                ]
            },
            
            // Categoria: Integrações Externas
            { 
                type: 'enviar-planilha', title: 'enviarParaPlanilha(idScript, nomeAba, dados)', category: 'Integrações Externas', icon: 'fa-solid fa-sheet-plastic',
                description: 'Envia dados diretamente para uma Planilha Google. Requer um Google Apps Script publicado como API da web.',
                args: [
                    { name: 'idScript', type: 'string', description: 'O ID de implantação do seu script do Google Apps.', optional: false },
                    { name: 'nomeAba', type: 'string', description: 'O nome da aba (página) na planilha onde os dados serão inseridos.', optional: false },
                    { name: 'dados', type: 'array', description: 'Um array de arrays, onde cada array interno representa uma nova linha na planilha.', optional: false }
                ],
                examples: [{ description: 'Coletar dados da tela e enviá-los para uma aba chamada "Resultados".', code: `const nome = obterTexto(5);\nconst status = obterTexto(6);\nconst idScript = "SEU_ID_DE_IMPLANTACAO_AQUI";\n\nenviarParaPlanilha(idScript, "Resultados", [\n    [ new Date().toLocaleString(), nome, status ]\n]);\n\nexibirNotificacao("Dados enviados para a planilha!");` }]
            },

            // Categoria: Informações do Usuário
            { 
                type: 'obter-dados-usuario', title: 'obterDadosUsuario()', category: 'Informações do Usuário', icon: 'fa-solid fa-user',
                description: 'Retorna um objeto com as informações do usuário atualmente logado na Intranet (extraído do token).',
                examples: [{ description: 'Obter e exibir todos os dados do usuário logado.', code: `const usuario = obterDadosUsuario();
                if (usuario) {
                    let info = \`Nº PM: \${usuario.numeroPM}\\n\`;
                    info += \`Nome: \${usuario.nomeCompleto}\\n\`;
                    info += \`Posto/Grad: \${usuario.postoGraduacao}\\n\`;
                    info += \`Fração/Seção: \${usuario.fracaoSecao}\\n\`;
                    info += \`Região: \${usuario.regiao} (\${usuario.codigoRegiao})\\n\`;
                    info += \`Unidade Contábil: \${usuario.codigoUnidadeContabil}\\n\`;
                    info += \`Código Fração/Seção: \${usuario.codigoFracaoSecao}\\n\`;
                    info += \`Funções: \${usuario.funcoes}\`;
                    
                    criarModal({ title: 'Dados do Usuário', elements: [{ type: 'text', text: info.replace(/\\n/g, '<br>') }]});
                }` }]
            }
        ];
    }
}
