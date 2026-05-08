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
            // Categoria: Interação com a Tela
            { 
                type: 'digitar', title: 'digitar(texto, verificar)', category: 'Interação com a Tela', icon: 'fa-solid fa-font', 
                description: 'Envia uma sequência de caracteres de texto para a posição atual do cursor no terminal.',
                args: [
                    { name: 'texto', type: 'string | number', description: 'O texto literal a ser preenchido.', optional: false },
                    { name: 'verificar', type: 'boolean', description: 'Se `true` (padrão), o sistema faz uma leitura pós-inserção garantindo que o texto foi de fato digitado, lançando um erro se não constar.', optional: true }
                ],
                examples: [
                    { description: 'Digitar um nome e deixar o sistema conferir se a digitação ocorreu com sucesso.', code: 'digitar("JOÃO DA SILVA");' },
                    { description: 'Digitar de forma veloz e "cega", sem verificação (ideal para senhas ou campos que ocultam o texto).', code: 'digitar("minhaSenhaSecreta", false);' }
                ]
            },
            { 
                type: 'teclar', title: 'teclar(nomeTecla, repeticoes)', category: 'Interação com a Tela', icon: 'fa-solid fa-keyboard', 
                description: 'Simula o acionamento de uma tecla especial de função ou mapeada no mainframe (ENTER, TAB, LIMPAR, PF1 a PF24, etc).',
                args: [
                    { name: 'nomeTecla', type: 'string', description: "Nome válido mapeado. Ex: 'ENTER', 'TAB', 'LIMPAR', 'ESCAPE', 'SUBIR', 'DESCER', 'DIREITA', 'ESQUERDA', 'HOME', 'PF1', etc.", optional: false },
                    { name: 'repeticoes', type: 'string | number', description: "Quantidade de vezes a repetir a tecla. Ex: 'x5' ou 5.", optional: true }
                ],
                examples: [
                    { description: 'Simular o pressionamento do ENTER.', code: 'teclar("ENTER");' },
                    { description: 'Simular 5 pressionamentos de TAB para pular vários campos.', code: 'teclar("TAB", "x5");' },
                    { description: 'Pressionar a tecla PF3.', code: 'teclar("PF3");' }
                ]
            },
            { 
                type: 'limpar-campo', title: 'limparCampo(tamanho)', category: 'Interação com a Tela', icon: 'fa-solid fa-eraser', 
                description: 'Apaga o conteúdo do campo onde o cursor está posicionado, enviando uma sequência de Backspaces.',
                args: [
                    { name: 'tamanho', type: 'number', description: 'Quantidade de caracteres a apagar (Backspaces). Padrão: 60.', optional: true }
                ],
                examples: [
                    { description: 'Limpar o campo atual antes de digitar um novo valor.', code: 'limparCampo();\ndigitar("Novo Valor");' }
                ]
            },
            { 
                type: 'clicar', title: 'clicar(linha, coluna)', category: 'Interação com a Tela', icon: 'fa-solid fa-hand-pointer', 
                description: 'Simula um clique físico do mouse numa coordenada específica da tela do terminal.',
                args: [
                    { name: 'linha', type: 'number', description: 'O número da linha alvo (1 a 24).', optional: false },
                    { name: 'coluna', type: 'number', description: 'O número da coluna alvo (1 a 80).', optional: false }
                ],
                examples: [{ description: 'Clicar na posição L10xC5.', code: 'clicar(10, 5);' }]
            },
            { 
                type: 'localizar-texto', title: 'localizarTexto(alvo, opcoes)', category: 'Interação com a Tela', icon: 'fa-solid fa-magnifying-glass',
                description: 'Aguarda até que um ou mais textos/padrões (Regex) apareçam na tela. Fundamental para controle de fluxo.',
                args: [
                    { name: 'alvo', type: 'string | RegExp | array', description: 'O texto, padrão Regex, ou array de textos a serem procurados.', optional: false },
                    { name: 'opcoes', type: 'object', description: 'Configurações de busca.', optional: true }
                ],
                options: [
                    { name: 'esperar', type: 'number', default: '5', description: 'Tempo máximo em segundos. Se `0`, verifica instantaneamente.' },
                    { name: 'lancarErro', type: 'boolean', default: 'false', description: 'Interrompe a rotina se não encontrar o texto.' },
                    { name: 'caseSensitive', type: 'boolean', default: 'false', description: 'Diferencia maiúsculas/minúsculas.' },
                    { name: 'area', type: 'object', default: 'null', description: 'Restringe a busca a `{linha}`, ou bloco `{linhaInicial, colunaInicial, linhaFinal, colunaFinal}`.' },
                    { name: 'area.apenasCamposDigitaveis', type: 'boolean', default: 'false', description: 'Busca apenas dentro de campos editáveis.' },
                    { name: 'dialogoFalha', type: 'boolean | string', default: 'false', description: 'Exibe popup de erro com opção de continuar.' }
                ],
                examples: [
                    { description: 'Esperar 10s por uma mensagem de sucesso.', code: 'localizarTexto("OPERACAO REALIZADA", { esperar: 10, lancarErro: true });' },
                    { description: 'Verificar se o cursor está na linha de erro.', code: 'if (localizarTexto("ERRO:", { esperar: 0, area: { linha: 24 } })) {\n    exibirNotificacao("Ocorreu um erro no sistema", false);\n}' }
                ]
            },
            { 
                type: 'localizar-qualquer-texto', title: 'localizarQualquerTexto(alvosArray, opcoes)', category: 'Interação com a Tela', icon: 'fa-solid fa-masks-theater',
                description: 'Aguarda que QUALQUER um dos textos da lista apareça na tela e retorna qual foi o encontrado.',
                args: [
                    { name: 'alvosArray', type: 'array', description: 'Lista de strings ou Regex para monitorar.', optional: false },
                    { name: 'opcoes', type: 'object', description: 'Mesmas opções do localizarTexto.', optional: true }
                ],
                examples: [
                    { description: 'Tratar diferentes respostas do sistema.', code: 'const res = localizarQualquerTexto(["CONCLUIDO", "FALHA", "DUPLICIDADE"]);\nif (res === "CONCLUIDO") {\n    teclar("ENTER");\n} else {\n    debug("Resultado inesperado:", res);\n}' }
                ]
            },
            { 
                type: 'esperar-texto-sumir', title: 'esperarTextoSumir(alvo, opcoes)', category: 'Interação com a Tela', icon: 'fa-solid fa-eye-slash',
                description: 'Pausa a rotina até que um texto ou padrão DESAPAREÇA da tela. Ideal para telas de "Processando...".',
                args: [
                    { name: 'alvo', type: 'string | RegExp', description: 'O texto que deve sumir.', optional: false },
                    { name: 'opcoes', type: 'object', description: 'Configurações de timeout.', optional: true }
                ],
                options: [
                    { name: 'esperar', type: 'number', default: '15', description: 'Tempo máximo de espera em segundos.' }
                ],
                examples: [
                    { description: 'Aguardar o fim de um processamento.', code: 'teclar("ENTER");\nesperarTextoSumir("AGUARDE...");\nlocalizarTexto("RESULTADO:");' }
                ]
            },
            {
                type: 'posicionar', title: 'posicionar(rotulo, opcoes)', category: 'Interação com a Tela', icon: 'fa-solid fa-crosshairs',
                description: 'Localiza um rótulo (texto fixo) e move o cursor para o campo editável associado.',
                args: [
                    { name: 'rotulo', type: 'string', description: 'O texto que serve de âncora.', optional: false },
                    { name: 'opcoes', type: 'object', description: 'Opções de navegação.', optional: true }
                ],
                options: [
                    { name: 'direcao', type: 'string', default: "'depois'", description: "Onde buscar o campo: `'depois'`, `'antes'`, `'acima'`, `'abaixo'`." },
                    { name: 'offset', type: 'number', default: '0', description: 'Número de TABs extras a pressionar após posicionar.' },
                    { name: 'caseSensitive', type: 'boolean', default: 'false', description: 'Diferencia maiúsculas no rótulo.' }
                ],
                examples: [
                    { description: 'Preencher o campo CPF.', code: 'posicionar("CPF:");\ndigitar("12345678901");' },
                    { description: 'Posicionar no campo que está ABAIXO do rótulo "Endereço".', code: 'posicionar("Endereço", { direcao: "abaixo" });' }
                ]
            },
            {
                type: 'obterTexto', title: 'obterTexto(L1, C1, L2, C2)', category: 'Interação com a Tela', icon: 'fa-solid fa-file-alt',
                description: 'Lê o conteúdo textual da tela. Pode ler a tela toda, uma linha ou um bloco.',
                args: [
                    { name: 'L1', type: 'number', description: 'Linha inicial.', optional: true },
                    { name: 'C1', type: 'number', description: 'Coluna inicial.', optional: true },
                    { name: 'L2', type: 'number', description: 'Linha final.', optional: true },
                    { name: 'C2', type: 'number', description: 'Coluna final.', optional: true }
                ],
                examples: [
                    { description: 'Ler a tela toda.', code: 'const tela = obterTexto();' },
                    { description: 'Ler apenas a linha 5.', code: 'const linha = obterTexto(5);' },
                    { description: 'Ler um campo específico (L5C10 até L5C20).', code: 'const valor = obterTexto(5, 10, 5, 20);' }
                ]
            },

            // Categoria: Interfaces de Usuário (Modais)
            { 
                type: 'criarModal', title: 'criarModal(config)', category: 'Interfaces de Usuário (Modais)', icon: 'fa-solid fa-window-maximize',
                description: 'Cria um formulário modal complexo para interação com o usuário.',
                args: [{ name: 'config', type: 'object', description: 'Objeto com title, elements e buttons.', optional: false }],
                examples: [
                    {
                        description: 'Modal de configuração simples.',
                        code: `const res = criarModal({\n    title: "Dados da Consulta",\n    elements: [\n        { type: "input", id: "cpf", label: "Digite o CPF:", defaultValue: "" },\n        { type: "checkbox", id: "completo", label: "Consulta Completa?", checked: true }\n    ],\n    buttons: [\n        { text: "Cancelar", action: "cancel" },\n        { text: "Iniciar", action: "confirm" }\n    ]\n});\n\nif (res && res.action === "confirm") {\n    debug("CPF digitado:", res.formData.cpf);\n}`
                    }
                ]
            },
            { 
                type: 'solicitar-entrada', title: 'solicitarEntrada(titulo, mensagem, placeholder)', category: 'Interfaces de Usuário (Modais)', icon: 'fa-solid fa-comment-dots',
                description: 'Exibe um prompt simples para o usuário digitar uma informação.',
                args: [
                    { name: 'titulo', type: 'string', description: 'Título do modal.', optional: false },
                    { name: 'mensagem', type: 'string', description: 'Texto de instrução.', optional: false },
                    { name: 'placeholder', type: 'string', description: 'Dica dentro do campo.', optional: true }
                ],
                examples: [
                    { description: 'Pedir um número de lote.', code: 'const lote = solicitarEntrada("Processamento", "Informe o número do lote:");\nif (lote) {\n    posicionar("Lote:");\n    digitar(lote);\n}' }
                ]
            },
            { 
                type: 'selecionar-em-tabela', title: 'selecionarEmTabela(titulo, desc, colunas, dados, renderFn)', category: 'Interfaces de Usuário (Modais)', icon: 'fa-solid fa-table-list',
                description: 'Exibe uma lista de itens em uma tabela para o usuário selecionar um deles clicando na linha.',
                args: [
                    { name: 'titulo', type: 'string', description: 'Título.', optional: false },
                    { name: 'desc', type: 'string', description: 'Descrição.', optional: false },
                    { name: 'colunas', type: 'array', description: 'Nomes das colunas (Ex: ["ID", "Nome"]).', optional: false },
                    { name: 'dados', type: 'array', description: 'Array de objetos com os dados.', optional: false },
                    { name: 'renderFn', type: 'function', description: 'Função que retorna as <td>s da linha.', optional: false }
                ],
                examples: [
                    { description: 'Selecionar um usuário de uma lista JSON.', code: 'const lista = [{id: 1, nome: "Admin"}, {id: 2, nome: "User"}];\nconst sel = selecionarEmTabela("Usuários", "Escolha um:", ["ID", "Nome"], lista, item => `<td>${item.id}</td><td>${item.nome}</td>`);\nif (sel) debug("Selecionado:", sel.nome);' }
                ]
            },

            // Categoria: Integrações Externas
            { 
                type: 'ler-planilha', title: 'lerPlanilha(id, aba, query)', category: 'Integrações Externas', icon: 'fa-solid fa-file-excel',
                description: 'Lê dados de uma Planilha Google pública. Retorna uma matriz 2D.',
                args: [
                    { name: 'id', type: 'string', description: 'ID da planilha na URL.', optional: false },
                    { name: 'aba', type: 'string', description: 'Nome da página.', optional: true },
                    { name: 'query', type: 'string', description: 'Consulta SQL-like.', optional: true }
                ],
                examples: [{ description: 'Ler planilha.', code: 'const matriz = lerPlanilha("ID_PLANILHA");' }]
            },
            { 
                type: 'ler-planilha-objetos', title: 'lerPlanilhaObjetos(id, aba, query)', category: 'Integrações Externas', icon: 'fa-solid fa-table-cells',
                description: 'Lê planilha e converte em Array de Objetos, usando a primeira linha como chaves das propriedades.',
                args: [{ name: 'id', type: 'string', description: 'ID da planilha.', optional: false }],
                examples: [{ description: 'Ler e usar dados JSON.', code: 'const itens = lerPlanilhaObjetos("ID_PLANILHA");\nfor(const item of itens) {\n    debug("Nome:", item.Nome);\n}' }]
            },
            { 
                type: 'processar-planilha', title: 'processarPlanilha(dados, callback, pularCabecalho)', category: 'Integrações Externas', icon: 'fa-solid fa-arrows-spin',
                description: 'Itera sobre os dados de uma planilha de forma facilitada.',
                args: [
                    { name: 'dados', type: 'array', description: 'A matriz de dados retornada por lerPlanilha.', optional: false },
                    { name: 'callback', type: 'function', description: 'Função (linha, indice) => {}.', optional: false }
                ],
                examples: [{ code: 'processarPlanilha(matriz, (linha) => {\n    digitar(linha[0]);\n    teclar("ENTER");\n});' }]
            },

            // Categoria: Arquivos (Sistema Local)
            { 
                type: 'criar-arquivo', title: 'criarArquivo(caminho, conteudo)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-floppy-disk',
                description: 'Grava um arquivo no diretório selecionado.',
                args: [
                    { name: 'caminho', type: 'string', description: 'Ex: "logs/hoje.txt"', optional: false },
                    { name: 'conteudo', type: 'string', description: 'Texto do arquivo.', optional: false }
                ],
                examples: [{ code: 'criarArquivo("resultado.txt", obterTexto());' }]
            },
            { 
                type: 'ler-arquivo', title: 'lerArquivo(caminho)', category: 'Arquivos (Sistema Local)', icon: 'fa-solid fa-file-import',
                description: 'Lê o conteúdo de um arquivo local.',
                args: [{ name: 'caminho', type: 'string', description: 'Caminho do arquivo.', optional: false }],
                examples: [{ code: 'const txt = lerArquivo("input.txt");' }]
            },

            // Categoria: Extração de Dados
            { 
                type: 'extrair-numeros', title: 'extrairNumeros(texto)', category: 'Extração de Dados', icon: 'fa-solid fa-arrow-up-1-9',
                description: 'Remove todos os caracteres que não sejam números.',
                args: [{ name: 'texto', type: 'string', description: 'Texto bruto.', optional: false }],
                examples: [{ code: 'const apenasNum = extrairNumeros("Lote: 123-ABC"); // "123"' }]
            },
            { 
                type: 'converter-moeda', title: 'converterMoeda(texto)', category: 'Extração de Dados', icon: 'fa-solid fa-brazilian-real-sign',
                description: 'Converte uma string de moeda (Ex: "R$ 1.250,50") em um número Float (1250.5).',
                args: [{ name: 'texto', type: 'string', description: 'String de valor.', optional: false }],
                examples: [{ code: 'const valor = converterMoeda(obterTexto(10, 20, 10, 30));' }]
            },
            { 
                type: 'formatar-data', title: 'formatarData(data, formato)', category: 'Extração de Dados', icon: 'fa-solid fa-calendar-check',
                description: 'Converte datas para formatos específicos.',
                args: [
                    { name: 'data', type: 'string | Date', description: 'Data original.', optional: false },
                    { name: 'formato', type: 'string', description: "'DDMMAAAA', 'DD/MM/AAAA' ou 'YYYY-MM-DD'.", optional: true }
                ],
                examples: [{ code: 'const d = formatarData("2023-12-31", "DD/MM/AAAA"); // "31/12/2023"' }]
            },

            // Categoria: Comunicação Avançada
            { 
                type: 'executar-em', title: 'executarRotinaEm(rotina, alias, sistema)', category: 'Comunicação Avançada', icon: 'fa-solid fa-network-wired',
                description: 'Executa código em outra aba. Permite automação multi-tarefa.',
                args: [
                    { name: 'rotina', type: 'string', description: 'Nome da rotina ou código JS.', optional: false },
                    { name: 'alias', type: 'string', description: 'Nome da aba (opcional).', optional: true }
                ],
                examples: [{ code: 'const res = executarRotinaEm("Consultar_Dados", "ABA_2");' }]
            },

            // Categoria: Utilitários
            { 
                type: 'debug', title: 'debug(...args)', category: 'Utilitários', icon: 'fa-solid fa-bug',
                description: 'Exibe informações no console de debug flutuante.',
                examples: [{ code: 'debug("Valor da variável X:", minhaVar);' }]
            },
            { 
                type: 'obter-dados-usuario', title: 'obterDadosUsuario()', category: 'Informações do Usuário', icon: 'fa-solid fa-user-shield',
                description: 'Retorna informações do militar logado (MasPM, Nome, Unidade, etc).',
                examples: [{ code: 'const pm = obterDadosUsuario();\nexibirNotificacao("Olá, " + pm.nomeCompleto);' }]
            }
        ];
    }
}
