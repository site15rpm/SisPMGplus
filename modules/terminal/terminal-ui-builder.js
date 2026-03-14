// Arquivo: modules/terminal/terminal-ui-builder.js
// Módulo para construir la interfaz del asistente de código, documentar funções e inserir exemplos.

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
            const order = ['Interação com a Tela', 'Comunicação Avançada', 'Configuração e Controle', 'Interfaces de Usuário (Modais)', 'Arquivos (Sistema Local)', 'Extração de Dados', 'Integrações Externas', 'Informações do Usuário', 'Utilitários', 'Estruturas de Código'];
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
            // Categoria: Comunicação Avançada (Inter-Abas)
            {
                type: 'executar-aba', title: 'executarEmAba(aliasDestino, rotinaOuCodigo, sistema)', category: 'Comunicação Avançada', icon: 'fa-solid fa-network-wired',
                description: 'Envia um comando para outra aba (identificada pelo Alias, ex: "B", "C"). Pode executar uma rotina já salva ou injetar código puro dinamicamente. Se a aba de destino não existir, ela será criada e logada automaticamente. A rotina atual ficará pausada até receber o retorno.',
                args: [
                    { name: 'aliasDestino', type: 'string', description: 'A letra da aba de destino (ex: "B").', optional: false },
                    { name: 'rotinaOuCodigo', type: 'string', description: 'O caminho de uma rotina salva OU um bloco de código JavaScript válido e literal.', optional: false },
                    { name: 'sistema', type: 'string', description: 'A sigla do sistema para auto-login se a aba for criada agora (ex: "BPM", "SIRH"). Se omitido, ela herdará o sistema em que a aba atual está logada.', optional: true }
                ],
                examples: [
                    {
                        description: 'Execução Básica: Chamar uma rotina já salva na Aba B e aguardar seu término.',
                        code: 'exibirNotificacao("Chamando a Aba B...", true, 2);\nconst resultado = executarEmAba("B", "Utilitarios/Extrair_Dados");\nexibirNotificacao("Aba B terminou. Retorno: " + resultado);'
                    },
                    {
                        description: 'Injeção Dinâmica: Enviar código puro para a Aba B executar, forçando auto-login no BPM caso a aba B esteja fechada.',
                        code: 'const codigoRemoto = `\n    exibirNotificacao("Aba B: Iniciando captura...");\n    esperar(1);\n    const linhaDados = obterTextoLinha(5);\n    retornar(linhaDados);\n`;\n\nconst retornoDaAbaB = executarEmAba("B", codigoRemoto, "BPM");\ndebug("Capturado via Injeção na Aba B:", retornoDaAbaB);'
                    },
                    {
                        description: 'Comunicação em Cadeia (A -> B -> C): A Aba A aciona a B, que aciona a C. O resultado volta em cascata.',
                        code: '// Este bloco de código vai rodar na Aba B\nconst codigoAbaB = `\n    exibirNotificacao("Aba B acionada. Repassando comando para Aba C...");\n    \n    // O código que a Aba B mandará a Aba C executar\n    const codigoAbaC = "esperar(1); retornar(\\"Dados Ultrassecretos da Aba C\\");";\n    \n    // A Aba B chama a C e fica aguardando...\n    const respostaC = executarEmAba("C", codigoAbaC);\n    \n    // A Aba B devolve a resposta recebida da C, de volta para a A\n    retornar("Repassado por B: " + respostaC);\n`;\n\n// A Aba A inicia a cadeia chamando a Aba B\nexibirNotificacao("Aba A: Iniciando o efeito dominó...", true);\nconst resultadoFinal = executarEmAba("B", codigoAbaB);\n\n// O resultado final chega na Aba A e é exibido\ncriarModal({ title: "Cascata Concluída", elements: [{ type: "title", text: resultadoFinal }] });'
                    }
                ]
            },
            {
                type: 'retornar', title: 'retornar(valor)', category: 'Comunicação Avançada', icon: 'fa-solid fa-reply-all',
                description: 'Envia um dado (texto, número, array ou objeto) de volta para a aba que acionou esta rotina remotamente. É projetada para funcionar em conjunto com a função `executarEmAba()`.',
                args: [{ name: 'valor', type: 'any', description: 'O dado que será retornado para resolver a Promise na aba de origem.', optional: false }],
                examples: [
                    { description: 'Retornar um texto fixo atestando o sucesso da execução remota.', code: 'retornar("PROCESSO_CONCLUIDO_COM_SUCESSO");' },
                    { description: 'Capturar o texto de uma linha específica e retornar para a origem.', code: 'const numProtocolo = obterTextoLinha(5);\nretornar(numProtocolo);' }
                ]
            },

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
                description: 'Chama e executa localmente outra rotina salva na sua lista. Útil para modularizar e reutilizar blocos de código grandes.',
                args: [{ name: 'nomeDaRotina', type: 'string', description: 'O nome completo da rotina a ser executada, incluindo o caminho da pasta (ex: "pasta/minha_sub_rotina").', optional: false }],
                examples: [{ description: 'Executar uma rotina chamada "Limpar_Cache" que está salva na pasta "utilidades".', code: 'executarRotina("utilidades/Limpar_Cache");' }]
            },
            
            // Categoria: Interfaces de Usuário (Modais)
            { 
                type: 'show-notification', title: 'exibirNotificacao(mensagem, sucesso, duracao)', category: 'Interfaces de Usuário (Modais)', icon: 'fa-solid fa-bell',
                description: 'Exibe uma notificação flutuante e temporária no topo da tela.',
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
            { 
                type: 'criarModal', title: 'criarModal(configuracao)', category: 'Interfaces de Usuário (Modais)', icon: 'fa-solid fa-window-maximize',
                description: 'Cria um modal interativo para coletar dados do usuário no meio de uma rotina. A função pausa a execução e retorna uma promessa que resolve com os dados inseridos.',
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
                        description: 'Criar um modal pedindo um nome e um setor, e depois usar os dados inseridos na tela.',
                        code: `const resultado = criarModal({\n    title: 'Coleta de Dados',\n    elements: [\n        { type: 'title', text: 'Informações Adicionais' },\n        { type: 'text', text: 'Por favor, insira os dados abaixo:' },\n        { type: 'input', id: 'nome_usuario', label: 'Nome Completo:', defaultValue: 'Fulano' },\n        { type: 'select', id: 'setor', label: 'Setor:', options: [\n            { value: 'rh', text: 'Recursos Humanos' },\n            { value: 'ti', text: 'Tecnologia' }\n        ]},\n        { type: 'checkbox', id: 'urgente', label: 'Marcar como urgente', checked: true }\n    ],\n    buttons: [\n        { text: 'Cancelar', action: 'cancel' },\n        { text: 'Confirmar', action: 'confirm' }\n    ]\n});\n\nif (resultado && resultado.action === 'confirm') {\n    posicionar("Nome:");\n    digitar(resultado.formData.nome_usuario);\n    posicionar("Setor:");\n    digitar(resultado.formData.setor);\n    if(resultado.formData.urgente){\n        posicionar("Urgente:");\n        digitar("SIM");\n    }\n}`
                    }
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
                description: 'Repete um bloco de código enquanto uma condição for verdadeira. Cuidado para não criar loops infinitos sem uma pausa.',
                examples: [
                    { description: 'Pressionar "DESCER" repetidamente enquanto o texto "Mais..." for visível na tela.', code: 'while (localizarTexto("Mais...", { esperar: 0 })) {\n    teclar("DESCER");\n    esperar(0.5);\n}' }
                ]
            },
            
            // Categoria: Interação com a Tela
            { 
                type: 'localizar-texto', title: 'localizarTexto(alvo, opcoes)', category: 'Interação com a Tela', icon: 'fa-solid fa-magnifying-glass',
                description: 'Função unificada para encontrar ou esperar por um ou mais textos/padrões (Regex) na tela. É uma das funções mais poderosas para controlar o fluxo da automação.',
                args: [
                    { name: 'alvo', type: 'string | RegExp | array', description: 'O texto, padrão Regex, ou array de textos/Regex a ser procurado.', optional: false },
                    { name: 'opcoes', type: 'object', description: 'Um objeto com opções para customizar a busca.', optional: true }
                ],
                options: [
                    { name: 'esperar', type: 'number', default: '5', description: 'Tempo máximo em segundos para esperar pelo texto. Se for `0`, verifica apenas uma vez e retorna imediatamente o booleano.' },
                    { name: 'lancarErro', type: 'boolean', default: 'false', description: 'Se `true`, a rotina irá parar bruscamente com um erro se o texto não for encontrado.' },
                    { name: 'caseSensitive', type: 'boolean', default: 'false', description: 'Se `true`, a busca diferenciará letras maiúsculas de minúsculas.' },
                    { name: 'area', type: 'object', default: 'null', description: 'Restringe a busca a uma área específica da tela (veja exemplos).' },
                    { name: 'dialogoFalha', type: 'boolean | string', default: 'false', description: 'Se `true`, exibe um diálogo interativo permitindo que o usuário decida se continua a rotina ignorando a falha.' }
                ],
                examples: [
                    { description: 'Verificar imediatamente se um texto existe (ideal para laços `if`).', code: 'if (localizarTexto("Sucesso", { esperar: 0 })) {\n    exibirNotificacao("Encontrado!");\n}' },
                    { description: 'Esperar até 10 segundos por um texto. Se não encontrar, a rotina aborta com erro.', code: 'localizarTexto("Comando concluído", { esperar: 10, lancarErro: true });' },
                    { description: 'Esperar por um número de protocolo usando Regex, sem abortar a rotina se falhar.', code: 'const achou = localizarTexto(/Protocolo: \\d+/, { esperar: 10, lancarErro: false });\nif (!achou) {\n    exibirNotificacao("Protocolo não localizado!", false);\n}' },
                    { description: 'Procurar um texto apenas na linha 5.', code: 'localizarTexto("TOTAL", { area: { linha: 5 } });' },
                    { description: 'Mostrar um diálogo permitindo intervenção humana se "MENU PRINCIPAL" não for encontrado na primeira linha.', code: 'localizarTexto("MENU PRINCIPAL", { area: { linha: 1 }, dialogoFalha: true });' }
                ]
            },
            {
                type: 'posicionar', title: 'posicionar(rotulo, opcoes)', category: 'Interação com a Tela', icon: 'fa-solid fa-crosshairs',
                description: 'Procura um `rotulo` na tela, posiciona o cursor no campo de texto digitável adjacente e, opcionalmente, move o cursor via TAB.',
                args: [
                    { name: 'rotulo', type: 'string', description: 'O texto/rótulo que antecede o campo desejado.', optional: false },
                    { name: 'opcoes', type: 'object', description: 'Um objeto com opções para customizar o posicionamento.', optional: true }
                ],
                options: [
                    { name: 'offset', type: 'number', default: '0', description: 'Número de campos para pular (usando TAB) após encontrar o campo adjacente ao rótulo.' },
                    { name: 'direcao', type: 'string', default: "'apos'", description: "A relação de busca. Valores válidos: `'apos'`, `'antes'`, `'acima'`, `'abaixo'`." },
                    { name: 'caseSensitive', type: 'boolean', default: 'false', description: 'Se `true`, diferencia maiúsculas de minúsculas no rótulo.' }
                ],
                examples: [
                    { description: 'Encontrar o rótulo "NOME:" e deixar o cursor piscando no campo logo após ele.', code: 'posicionar("NOME:");' },
                    { description: 'Encontrar "NOME:", pular 2 campos usando TAB para a direita.', code: 'posicionar("NOME:", { offset: 2 });' },
                    { description: 'Encontrar o rótulo "TOTAL:" e buscar o campo editável mais próximo na linha logo acima.', code: 'posicionar("TOTAL:", { direcao: \'acima\' });' }
                ]
            },
            { 
                type: 'teclar', title: 'teclar(nomeTecla)', category: 'Interação com a Tela', icon: 'fa-solid fa-keyboard', 
                description: 'Simula o acionamento de uma tecla especial de função ou mapeada no mainframe (ENTER, TAB, LIMPAR, PF1 a PF24).',
                args: [{ name: 'nomeTecla', type: 'string', description: "Nome válido mapeado. Ex: 'ENTER', 'TAB', 'LIMPAR', 'ESCAPE', 'SUBIR', 'DESCER', 'DIREITA', 'ESQUERDA', 'HOME', 'PF1', etc.", optional: false }],
                examples: [
                    { description: 'Simular o pressionamento do ENTER.', code: 'teclar("ENTER");' },
                    { description: 'Simular um TAB para pular de campo.', code: 'teclar("TAB");' },
                    { description: 'Apagar o conteúdo da tela (simula a tecla Limpar / Ctrl+U).', code: 'teclar("LIMPAR");' }
                ]
            },
            { 
                type: 'digitar', title: 'digitar(texto, verificar)', category: 'Interação com a Tela', icon: 'fa-solid fa-font', 
                description: 'Envia uma sequência de caracteres de texto para a posição atual do cursor no terminal.',
                args: [
                    { name: 'texto', type: 'string', description: 'O texto literal a ser preenchido.', optional: false },
                    { name: 'verificar', type: 'boolean', description: 'Se `true` (padrão), o sistema faz uma leitura pós-inserção garantindo que o texto foi de fato digitado, lançando um erro se não constar.', optional: true }
                ],
                examples: [
                    { description: 'Digitar um nome e deixar o sistema conferir se a digitação ocorreu com sucesso.', code: 'digitar("JOÃO DA SILVA");' },
                    { description: 'Digitar de forma veloz e "cega", sem verificação (ideal para senhas, que não aparecem na tela, ou campos muito curtos).', code: 'digitar("minhaSenhaSecreta", false);' }
                ]
            },
            { 
                type: 'clicar', title: 'clicar(linha, coluna)', category: 'Interação com a Tela', icon: 'fa-solid fa-hand-pointer', 
                description: 'Envia um pulso para o terminal simulando um clique físico do botão esquerdo do mouse numa coordenada específica.',
                args: [
                    { name: 'linha', type: 'number', description: 'O número da linha alvo (1 a 31).', optional: false },
                    { name: 'coluna', type: 'number', description: 'O número da coluna alvo (1 a 80).', optional: false }
                ],
                examples: [{ description: 'Clicar no canto inferior direito, na mesma posição visual da tecla PF12 (L22, C76).', code: 'clicar(22, 76);' }]
            },
            {
                type: 'obterTexto', title: 'obterTexto(linha, coluna, linhaFinal, colunaFinal)', category: 'Interação com a Tela', icon: 'fa-solid fa-file-alt',
                description: 'Lê o buffer de vídeo do emulador e retorna o conteúdo textual puro da tela.',
                args: [
                    { name: 'linha', type: 'number', description: 'O número da linha a ser lida.', optional: true },
                    { name: 'coluna', type: 'number', description: 'A coluna inicial da leitura.', optional: true },
                    { name: 'linhaFinal', type: 'number', description: 'A linha final da caixa de leitura.', optional: true },
                    { name: 'colunaFinal', type: 'number', description: 'A coluna final da caixa de leitura.', optional: true }
                ],
                examples: [
                    { description: 'Extrair a matriz inteira de texto presente na tela atual.', code: 'const tela = obterTexto();' },
                    { description: 'Extrair o conteúdo estrito da linha 10.', code: 'const linhaDez = obterTexto(10);' },
                    { description: 'Extrair o texto da linha 10, começando a partir da coluna 5.', code: 'const parteDaLinha = obterTexto(10, 5);' },
                    { description: 'Extrair um bloco quadrangular cruzando das L5xC10 até L8xC40.', code: 'const bloco = obterTexto(5, 10, 8, 40);' }
                ]
            },
            { 
                type: 'ler-tela', title: 'lerTela()', category: 'Interação com a Tela', icon: 'fa-solid fa-highlighter', 
                description: 'Exibe instruções e pausa a rotina aguardando que o usuário selecione uma área retangular com o clique do mouse, capturando e devolvendo o texto destacado.',
                examples: [
                    { description: 'Pedir ao operador humano para desenhar o quadrado de seleção em cima do dado, salvando-o.', code: 'const selecao = lerTela();\nif (selecao) {\n    criarArquivo("copia_manual.txt", selecao.text);\n}' }
                ]
            },
            {
                type: 'copiar', title: 'copiar(linha, coluna, linhaFinal, colunaFinal)', category: 'Interação com a Tela', icon: 'fa-solid fa-copy',
                description: 'Lê dados da tela e os insere diretamente na Área de Transferência (Clipboard) do sistema operacional, prontos para um Ctrl+V.',
                args: [
                    { name: 'linha', type: 'number', description: 'O número da linha a ser copiada.', optional: true },
                    { name: 'coluna', type: 'number', description: 'A coluna inicial da cópia.', optional: true },
                    { name: 'linhaFinal', type: 'number', description: 'A linha final da cópia.', optional: true },
                    { name: 'colunaFinal', type: 'number', description: 'A coluna final da cópia.', optional: true }
                ],
                examples: [
                    { description: 'Mandar toda a visualização da tela para o seu Ctrl+V.', code: 'copiar();' },
                    { description: 'Copiar apenas o que estiver escrito na linha 10 para a área de transferência.', code: 'copiar(10);' }
                ]
            },
            { 
                type: 'colar', title: 'colar()', category: 'Interação com a Tela', icon: 'fa-solid fa-paste', 
                description: 'Faz a leitura da Área de Transferência do sistema operacional e digita aquele conteúdo direto na posição do cursor.',
                examples: [{ description: 'Esvaziar o conteúdo atual do clipboard na tela do mainframe.', code: 'colar();' }]
            },
            {
                type: 'obterTextoLinha', title: 'obterTextoLinha(numeroLinha)', category: 'Interação com a Tela', icon: 'fa-solid fa-ruler-horizontal',
                description: 'Um atalho simplificado para o `obterTexto` focado em capturar aspas integrais de uma única linha. Se chamada vazia, extrai a linha do cursor.',
                args: [{ name: 'numeroLinha', type: 'number', description: 'O número da linha desejada (de 1 a 31).', optional: true }],
                examples: [
                    { description: 'Capturar e armazenar o texto extenso da décima linha.', code: 'const conteudo = obterTextoLinha(10);' },
                    { description: 'Capturar toda a linha onde o marcador verde (cursor) estiver piscando.', code: 'const contexto = obterTextoLinha();' }
                ]
            },
            { 
                type: 'obterPosicaoCursor', title: 'obterPosicaoCursor()', category: 'Interação com a Tela', icon: 'fa-solid fa-location-crosshairs',
                description: 'Verifica no emulador xterm e retorna os eixos {x, y} de onde o cursor (underscore) encontra-se estacionado.',
                examples: [{ description: 'Notificar ao desenvolvedor as coordenadas X e Y.', code: 'const pos = obterPosicaoCursor();\nexibirNotificacao(`Você está em Linha ${pos.y}, Coluna ${pos.x}`);' }]
            },
            { 
                type: 'obter-campos-digitaveis', title: 'obterCamposDigitaveis()', category: 'Interação com a Tela', icon: 'fa-solid fa-list-check', 
                description: 'Inspeciona visualmente as cores das células na tela para retornar um Array contendo cada campo Input desprotegido, sua posição e os dados atuais nele grafados.',
                examples: [{ description: 'Encontrar dinamicamente todos os sub-blocos verdes ou brancos de edição da tela ativa.', code: 'const arrayDeCampos = obterCamposDigitaveis();\nfor (const input of arrayDeCampos) {\n    debug(`Campo detectado L${input.linha}xC${input.coluna} = "${input.texto}"`);\n}' }]
            },

            // Categoria: Extração de Dados
            {
                type: 'extrair-cpf', title: 'extrairCPF(texto)', category: 'Extração de Dados', icon: 'fa-solid fa-id-card',
                description: 'Filtro que recebe um texto robusto e isola o primeiro bloco que faça correspondência matemática com formato de CPF (xxx.xxx.xxx-xx).',
                args: [{ name: 'texto', type: 'string', description: 'A massa de texto bruta.', optional: false }],
                examples: [{ description: 'Bater o olho na tela toda, isolar o CPF e preenchê-lo em um campo.', code: 'const bufferTexto = obterTexto();\nconst cpf = extrairCPF(bufferTexto);\nif (cpf) {\n    digitar(cpf);\n}' }]
            },
            {
                type: 'extrair-data', title: 'extrairData(texto)', category: 'Extração de Dados', icon: 'fa-solid fa-calendar-days',
                description: 'Isola e retorna a primeira porção que se assimila a datas brasileiras curtas (dd/mm/aaaa).',
                args: [{ name: 'texto', type: 'string', description: 'O alvo da mineração textual.', optional: false }],
                examples: [{ description: 'Achar e inserir data extraída globalmente.', code: 'const tela = obterTexto();\nconst validade = extrairData(tela);\nif (validade) {\n    digitar(validade);\n}' }]
            },
            {
                type: 'extrair-protocolo', title: 'extrairProtocolo(texto)', category: 'Extração de Dados', icon: 'fa-solid fa-hashtag',
                description: 'Rotina de mineração clássica focada na string "Protocolo:" ou similares, isolando as credenciais numéricas aderidas.',
                args: [{ name: 'texto', type: 'string', description: 'A string alvo da mineração.', optional: false }],
                examples: [{ description: 'Rastrear a palavra Protocolo seguida de ID.', code: 'const tela = obterTexto();\nconst identificador = extrairProtocolo(tela);\nif (identificador) {\n    exibirNotificacao("Protocolo emitido: " + identificador);\n}' }]
            },

            // Categoria: Arquivos (Sistema Local)
            { 
                type: 'processar-linhas', title: 'processarLinhas(arquivo, callback)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-file-csv',
                description: 'Abre o manipulador de diretório para leitura estrita, importa as quebras textuais de arquivo e despacha iterativamente linha a linha para execução callback em lote.',
                args: [
                    { name: 'arquivo', type: 'string', description: 'Nome exato do arquivo com extensão a ser carregado da sua máquina.', optional: false },
                    { name: 'callback', type: 'function', description: 'Função engatilhada a cada registro isolado `(linhaConteudo, indexRow, arrayFull) => {}`.', optional: false }
                ],
                examples: [{
                    description: 'Abrir CSV local, fragmentar vírgulas em arrays de propriedades e automatizar repetições de tela cadastradas por linha.',
                    code: 'processarLinhas("boletins.csv", (linha, indice) => {\n    const [codigo, infracao] = linha.split(",");\n    posicionar("Código de Busca:");\n    digitar(codigo);\n    teclar("ENTER");\n    localizarTexto("Detalhes:");\n    posicionar("Despacho:");\n    digitar(infracao);\n    teclar("PF3");\n});'
                }]
            },
            { 
                type: 'ler-arquivo', title: 'lerArquivo(caminho)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-file-lines',
                description: 'Instância do File API, resgata a raiz texturizada completa do caminho físico indicado.',
                args: [{ name: 'caminho', type: 'string', description: 'Extensão relativa em arvore do File System nativo.', optional: false }],
                examples: [{ description: 'Buscar o modelo pré-formatado de preenchimento.', code: 'const payloadTxT = lerArquivo("formularios/matriz_descritiva.txt");\nif (payloadTxT) {\n    digitar(payloadTxT);\n}' }]
            },
            { 
                type: 'criar-arquivo', title: 'criarArquivo(caminho, conteudo)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-floppy-disk',
                description: 'Promove descida à API de arquivos em sua máquina, gerando novo blob texturizado de extensão explícita (sobrescrevendo homônimos).',
                args: [
                    { name: 'caminho', type: 'string', description: 'Nome descritivo e extensão de destino.', optional: false },
                    { name: 'conteudo', type: 'string', description: 'O Buffer massivo de bytes de texto a consolidar.', optional: false }
                ],
                examples: [{ description: 'Criar backup visual persistente.', code: 'const matrizRenderizada = obterTexto();\ncriarArquivo("Auditoria_Transacional.txt", matrizRenderizada);' }]
            },
            { 
                type: 'anexar-arquivo', title: 'anexarNoArquivo(caminho, conteudo)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-file-circle-plus',
                description: 'Ao invés de sobrescrever um Blob nativo existente, extrai, amalgama à nova cadeia literal textual e reescreve de forma combinada.',
                args: [
                    { name: 'caminho', type: 'string', description: 'Destino base já estabelecido ou novo.', optional: false },
                    { name: 'conteudo', type: 'string', description: 'Buffer textual cumulativo final.', optional: false }
                ],
                examples: [{ description: 'Consolidação periódica de Logs transacionais de operação rotineira.', code: 'const timeStamp = "\\n[" + new Date().toLocaleString() + "] ";\nanexarNoArquivo("registro_historico_lotes.log", timeStamp + "Baixado sucesso.");' }]
            },
            { 
                type: 'excluir-arquivo', title: 'excluirArquivo(caminho)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-file-circle-xmark',
                description: 'Exige credenciamento ao File System e deleta silenciosamente o alvo correspondente.',
                args: [{ name: 'caminho', type: 'string', description: 'Referência nomeada explícita.', optional: false }],
                examples: [{ description: 'Limpeza e descarte higiênico local de temporários de automação em massa.', code: 'excluirArquivo("memoria_temporaria_v1.txt");' }]
            },
            
            // Categoria: Integrações Externas
            { 
                type: 'enviar-planilha', title: 'enviarParaPlanilha(idScript, nomeAba, dados)', category: 'Integrações Externas', icon: 'fa-solid fa-sheet-plastic',
                description: 'Integração REST com Google AppScripts (Planilhas Google). Pousa matrizes JS em linhas bidimensionais diretas das pastas da G-Suite.',
                args: [
                    { name: 'idScript', type: 'string', description: 'ID API (Aba Implantações > Extensões do Google Script WebApp).', optional: false },
                    { name: 'nomeAba', type: 'string', description: 'Nome exato do sub-separador na planilha alvo (Página).', optional: false },
                    { name: 'dados', type: 'array', description: 'Matriz bidimensional (Array aninhado) mapeando as [Linhas e [Colunas]].', optional: false }
                ],
                examples: [{ description: 'Montar e postar metadados em nuvem remota corporativa de auditoria.', code: `const matricula_alvo = obterTexto(2, 5, 2, 12);\nconst status_op = obterTexto(2, 20, 2, 40);\n\nenviarParaPlanilha("SEU_MACRO_ID_HASH", "PainelGeral", [\n    [ new Date().toLocaleString(), matricula_alvo, status_op ]\n]);\n\nexibirNotificacao("Enviado para sincronia com o Google!");` }]
            },

            // Categoria: Utilitários
            {
                type: 'debug', title: 'debug(...dados)', category: 'Utilitários', icon: 'fa-solid fa-bug',
                description: 'Abre um painel de console flutuante nativo no topo da interface do terminal e exibe os dados passados em formato inspecionável. Ideal para verificar valores estruturados ou debuggar estados de variáveis sem travar e poluir tudo com `exibirNotificacao`.',
                args: [{ name: '...dados', type: 'any', description: 'Você pode passar qualquer quantidade de propriedades mescladas: string, número, array ou objetos puros.', optional: false }],
                examples: [
                    { description: 'Imprimir o valor transacional estático rastreado num loop.', code: 'const loteID = "L-3419";\ndebug("Lote interceptado na tela:", loteID);' },
                    { description: 'Exibir a estrutura bruta serializada de um objeto complexo retornado.', code: 'const meusDados = obterDadosUsuario();\ndebug("Perfil Policial Injetado no Contexto:", meusDados);' }
                ]
            },

            // Categoria: Informações do Usuário
            { 
                type: 'obter-dados-usuario', title: 'obterDadosUsuario()', category: 'Informações do Usuário', icon: 'fa-solid fa-user',
                description: 'Decodifica a chave orgânica JWT (Extrato de credenciais persistentes - Cookie "tokiuz") devolvendo num objeto descritivo para injetar no script comportamental atual o profile da autoridade PM conectada.',
                examples: [{ description: 'Coleta explícita e abertura dinâmica do modal com detalhamento militar formatado em DOM de apresentação.', code: `const poli = obterDadosUsuario();
                if (poli) {
                    let formatedBlock = \`MasPM: \${poli.numeroPM}\\n\`;
                    formatedBlock += \`Policial: \${poli.nomeCompleto}\\n\`;
                    formatedBlock += \`Hierarquia: \${poli.postoGraduacao}\\n\`;
                    formatedBlock += \`Alocação: \${poli.fracaoSecao} / \${poli.regiao}\\n\`;
                    
                    debug("Objeto Descripto", poli);
                    criarModal({ title: 'Diagnóstico Operador', elements: [{ type: 'text', text: formatedBlock.replace(/\\n/g, '<br>') }]});
                }` }]
            }
        ];
    }
}