# TerminalPMG+ - Manual de Instruções

Bem-vindo ao **TerminalPMG+**, a extensão que potencializa sua experiência com os sistemas da Polícia Militar de Minas Gerais.

Este documento serve como um guia para todas as funcionalidades e módulos disponíveis.

## Manutenção da Documentação

Este arquivo (`README.md`) está localizado na raiz do projeto. Para garantir que a documentação esteja **sempre atualizada**, é fundamental que cada desenvolvedor que adicionar ou modificar uma funcionalidade atualize a seção correspondente neste manual.

---

## Módulos Principais

A extensão é dividida nos seguintes módulos:

### 1. Terminal

Este módulo é o coração da extensão, transformando o terminal em uma poderosa plataforma de automação. Ele é dividido em duas grandes áreas: **Gerenciamento de Login** e **Rotinas (Automação)**.

---

#### 1.1. Gerenciamento de Login

A extensão automatiza completamente o processo de login no terminal.

-   **Login Automático:** Ao acessar a página do terminal, a extensão detecta a tela de login e exibe uma janela para seleção de sistema (SIRH, SICI, SIAD, etc.).
-   **Gerenciamento de Senha:**
    -   **Salvar Senha:** O usuário pode optar por salvar a senha do terminal. Se o fizer, nas próximas vezes o login será 100% automático. A senha é salva de forma segura no armazenamento local do navegador, associada ao seu número PM.
    -   **Senha Expirada:** A extensão detecta a tela de "Senha expirada", preenche o usuário e a senha antiga, e posiciona o cursor no campo "Nova senha", agilizando a troca. A senha antiga é automaticamente removida do armazenamento.
    -   **Senha Incorreta:** Se o login falhar por senha incorreta, a extensão remove a senha salva e pede que o usuário a digite novamente, evitando loops de erro.
-   **Acesso Manual:** O usuário sempre tem a opção de realizar o login manualmente, bypassando a automação.

---

#### 1.2. Rotinas (Automação e Scripts)

"Rotinas" são scripts que automatizam tarefas no terminal. A seguir, uma referência completa de todas as funcionalidades disponíveis.

##### **1.2.1. Funcionalidades Principais**

-   **Gravador de Rotinas:** A funcionalidade mais poderosa para iniciantes.
    -   Clique no botão **REC (Gravar)**.
    -   Execute as tarefas no terminal normalmente (cliques do mouse, digitação, teclas como Enter, F1, etc.).
    -   A extensão irá gravar todas as suas ações e traduzi-las em um script pronto para ser salvo e reutilizado.

-   **Editor de Rotinas:**
    -   Um editor de código completo integrado à extensão, com destaque de sintaxe, múltiplos temas, localizar/substituir, formatação automática e modo de tela cheia.

-   **Execução de Rotinas:**
    -   As rotinas salvas aparecem no menu da extensão e podem ser executadas com um clique.
    -   Durante a execução, um painel de controle aparece, permitindo **Pausar**, **Continuar** ou **Parar** a rotina a qualquer momento.

##### **1.2.2. Referência Completa de Comandos (API de Rotinas)**

Esta seção detalha todos os comandos disponíveis para a criação de rotinas. Note que, ao escrever no editor, você **não precisa** usar `await` antes desses comandos; o sistema os insere automaticamente.

---
**Comandos de Interação e Controle**
---

#### `digitar(texto, [verificar])`
Digita um texto no terminal.
-   **Argumentos:**
    -   `texto` (String | Number): O texto a ser digitado.
    -   `verificar` (Boolean, Padrão: `true`): Se `true`, aguarda 2-3 segundos para confirmar se o texto apareceu na tela (em campos editáveis). Lança erro se não encontrar.
-   **Exemplo:** `digitar('123456', false); // Digita sem verificar (ex: senhas)`

#### `teclar(nomeDaTecla, [repeticoes])`
Simula o pressionamento de teclas especiais.
-   **Argumentos:**
    -   `nomeDaTecla` (String): Nome da tecla (Ex: `'ENTER'`, `'TAB'`, `'BACKTAB'`, `'F1'` a `'F24'`, `'SUBIR'`, `'DESCER'`, `'PAGEUP'`, `'PAGEDOWN'`, `'HOME'`, `'END'`, `'ESCAPE'`).
    -   `repeticoes` (String | Number, Padrão: `'x1'`): Quantidade de vezes (Ex: `'x5'` ou `5`).
-   **Exemplo:** `teclar('TAB', 'x3'); // Pressiona TAB 3 vezes`

#### `clicar(linha, coluna)`
Simula um clique de mouse em coordenadas específicas.
-   **Argumentos:**
    -   `linha` (Number): Linha (1-base).
    -   `coluna` (Number): Coluna (1-base).
-   **Exemplo:** `clicar(10, 5);`

#### `esperar(segundos)`
Pausa a execução da rotina.
-   **Argumentos:**
    -   `segundos` (Number, Opcional): Tempo em segundos. Se omitido, usa a velocidade padrão.
-   **Exemplo:** `esperar(1.5);`

#### `velocidade(segundos)`
Define o atraso padrão entre os comandos da rotina.
-   **Argumentos:**
    -   `segundos` (Number): Tempo em segundos (Ex: `0.2`).
-   **Exemplo:** `velocidade(0.1); // Torna a rotina muito rápida`

#### `limparCampo([tamanho])`
Apaga o conteúdo do campo onde o cursor está posicionado.
-   **Argumentos:**
    -   `tamanho` (Number, Padrão: `60`): Quantidade de backspaces a enviar.
-   **Exemplo:** `limparCampo();`

#### `colar()`
Cola o conteúdo da área de transferência na posição atual do cursor.

---
**Comandos de Localização e Leitura**
---

#### `localizarTexto(alvo, [opcoes])`
Aguarda até que um texto ou padrão apareça na tela.
-   **Argumentos:**
    -   `alvo` (String | Array<String> | RegExp): O que procurar.
    -   `opcoes` (Object):
        -   `esperar` (Number, Padrão: `5`): Timeout em segundos.
        -   `lancarErro` (Boolean, Padrão: `false`): Interrompe se não encontrar.
        -   `caseSensitive` (Boolean, Padrão: `false`): Diferencia maiúsculas.
        -   `area` (Object): Restringe a busca a um retângulo `{linhaInicial, colunaInicial, linhaFinal, colunaFinal}` ou apenas uma `{linha}`.
        -   `area.apenasCamposDigitaveis` (Boolean): Busca apenas dentro de campos editáveis.
        -   `dialogoFalha` (Boolean | String): Exibe popup de confirmação em caso de erro.
-   **Retorno:** `Boolean` - `true` se encontrado.
-   **Exemplo:** `localizarTexto('SUCESSO', { esperar: 10, area: { linha: 24 } });`

#### `localizarQualquerTexto(alvosArray, [opcoes])`
Aguarda o primeiro texto de uma lista aparecer.
-   **Argumentos:**
    -   `alvosArray` (Array<String | RegExp>): Lista de alvos.
-   **Retorno:** O item do array que foi encontrado primeiro, ou `null`.
-   **Exemplo:** `const res = localizarQualquerTexto(['OK', 'ERRO']);`

#### `esperarTextoSumir(alvo, [options])`
Aguarda até que um texto desapareça da tela.
-   **Argumentos:**
    -   `alvo` (String | RegExp): Texto a aguardar sumir.
    -   `options.esperar` (Number, Padrão: `15`): Timeout.
-   **Retorno:** `Boolean` - `true` se sumiu.

#### `posicionar(rotulo, [opcoes])`
Localiza um texto e move o cursor para o campo próximo.
-   **Argumentos:**
    -   `rotulo` (String): Texto âncora.
    -   `opcoes.direcao` (String, Padrão: `'depois'`): `'antes'`, `'depois'`, `'acima'`, `'abaixo'`.
    -   `opcoes.offset` (Number): TABs adicionais (para antes/depois).
-   **Exemplo:** `posicionar('CPF:', { direcao: 'depois' });`

#### `obterTexto([L1], [C1], [L2], [C2])`
Lê texto da tela.
-   **Sobrecargas:**
    -   `obterTexto()`: Tela inteira.
    -   `obterTexto(Linha)`: Uma linha inteira.
    -   `obterTexto(L1, C1, L2, C2)`: Bloco específico.

#### `obterPosicaoCursor()`
Retorna `{ y, x }` do cursor.

#### `copiar([L1], [C1], [L2], [C2])`
Copia área da tela para o clipboard. Mesma lógica do `obterTexto`.

#### `lerTela([showModals])`
Inicia modo de captura de tela por clique.

---
**Comandos de Dados e Planilhas**
---

#### `lerPlanilha(sheetId, [nomeAba], [query])`
Lê dados de uma planilha Google pública.
-   **Retorno:** Matriz 2D de dados.

#### `lerPlanilhaObjetos(sheetId, [nomeAba], [query])`
Lê planilha e converte em Array de Objetos (usa 1ª linha como chaves).
-   **Exemplo:** `const usuarios = lerPlanilhaObjetos('ID'); console.log(usuarios[0].Nome);`

#### `enviarParaPlanilha(scriptId, nomeAba, dados)`
Envia dados para planilha via Google Apps Script.
-   **Argumentos:** `dados` deve ser um Array de Arrays (matriz).

#### `processarPlanilha(dados, callback, [pularCabecalho])`
Loop facilitado para matrizes de planilha.
-   **Exemplo:** `processarPlanilha(minhaPlanilha, (linha) => { digitar(linha[0]); });`

#### `agruparDados(arrayDeObjetos, chave)`
Utilitário para agrupar JSON por uma propriedade.

#### `formatarData(data, [formato])`
Converte datas para `'DDMMAAAA'`, `'DD/MM/AAAA'` ou `'YYYY-MM-DD'`.

#### `extrairCPF(texto)`, `extrairData(texto)`, `extrairProtocolo(texto)`, `extrairNumeros(texto)`, `converterMoeda(texto)`
Funções de extração de padrões e conversão de valores.

---
**Comandos de Arquivos e Modais**
---

#### `criarArquivo(caminho, conteudo)`, `lerArquivo(caminho)`, `anexarNoArquivo(caminho, conteudo)`, `excluirArquivo(caminho)`
Operações no sistema de arquivos local (diretório selecionado).

#### `criarModal(config)`
Cria um formulário modal complexo.
-   **Config:** `{ title, elements: [{ type, id, label, defaultValue, options... }], buttons: [{ text, action, className }] }`
-   **Retorno:** `{ action, formData: { id1: valor, id2: valor } }`

#### `solicitarEntrada(titulo, mensagem, [placeholder])`
Prompt simples para entrada de texto.

#### `selecionarEmTabela(titulo, desc, colunas, dados, renderRowFn)`
Modal com tabela selecionável. Retorna o objeto da linha clicada.

---
**Comandos de Sistema e Debug**
---

#### `executarRotina(caminho)`
Chama outra rotina salva.

#### `executarRotinaEm(rotina, [alias], [sistema])`
Executa código em outra aba (Inter-Abas). Abre nova aba se alias for nulo.

#### `retornar(valor)`
Define o valor de resposta para uma chamada `executarRotinaEm`.

#### `fechar([alias])`
Fecha a aba atual ou uma aba remota.

#### `debug(...args)`
Exibe informações no console de debug flutuante da rotina.

#### `obterDadosUsuario()`
Retorna `{ numeroPM, nomeCompleto, postoGraduacao, codigoRegiao, ... }`.

#### `autoExecutar(gatilho, [opcoes])`
Configura a rotina para disparar sozinha ao encontrar o texto de gatilho.
-   **Opções:** `{ on: 'ENTER' }` (Padrão: ENTER, ou 'ANY_KEY', 'F1', etc).

---
**1.2.3. Exemplos Práticos (Receitas)**
---

#### **Receita 1: Consultar Placa e Extrair Dados**

**Objetivo:** Criar uma rotina que consulta uma placa de veículo e copia o nome do modelo para a área de transferência.

```javascript
// Define uma velocidade mais humana para a automação
velocidade(0.5);

// Inicia na tela de consulta
posicionar('Placa:');
digitar('ABC-1234');
teclar('ENTER');

// Espera o resultado aparecer
localizarTexto('Dados do Veiculo', { lancarErro: true });

// Extrai o modelo (ex: o modelo está na linha 10, coluna 15, com 20 caracteres)
const modelo = obterTexto(10, 15, 10, 35); 

// Cria uma janela de notificação com o modelo extraído
criarModal('Modelo Encontrado', `O modelo é: ${modelo.trim()}`); 

// Copia o modelo para o clipboard
copiar(10, 15, 10, 35);
```

---

#### **Receita 2: Processar uma Lista de Pessoas**

**Objetivo:** Ler um arquivo `nomes.txt` e, para cada nome, digitá-lo no terminal, extrair o resultado e salvar em um arquivo de log.

**Arquivo `nomes.txt`:**
```
JOAO DA SILVA
MARIA PEREIRA
```

**Código da Rotina:**
```javascript
// Apaga o log antigo antes de começar
excluirArquivo('log_resultados.txt'); 

processarLinhas('nomes.txt', (nome) => {
  posicionar('Nome:');
  digitar(nome);
  teclar('ENTER');

  // Espera a tela de resultado
  localizarTexto('Resultado da Consulta', { lancarErro: true });

  // Pega o status, que está na linha 12
  const status = obterTexto(12).trim();

  // Salva o resultado no arquivo de log
  anexarNoArquivo('log_resultados.txt', `Nome: ${nome} | Status: ${status}\n`);

  // Volta para a tela de consulta para o próximo nome
  teclar('F3');
  localizarTexto('Digite o nome para consulta');
});

criarModal('Processo Finalizado', 'A consulta em lote foi concluída. Verifique o arquivo log_resultados.txt');
```


---

### 2. Intranet

Este módulo é um conjunto de recursos que adiciona novas funcionalidades e melhora a experiência de uso dos diversos sistemas da Intranet PMMG. Abaixo estão detalhadas as configurações de seus principais componentes.

---
#### 2.1. Lembrete de Aniversariantes

Este recurso exibe uma notificação amigável com a lista dos próximos aniversariantes. A seguir, um detalhamento da sua tela de configuração.

-   **Lembrar com antecedência de (dias):**
    -   **Descrição:** Define quantos dias no futuro a extensão deve olhar para encontrar aniversariantes.
    -   **Exemplo:** Se o valor for `7`, a extensão mostrará os aniversariantes de hoje e dos próximos 7 dias.

-   **Restringir à [Nome da Seção do Usuário]:**
    -   **Descrição:** Um checkbox que, se marcado, filtra a lista para mostrar apenas os militares que pertencem à mesma seção/departamento que o usuário logado.
    -   **Uso:** Útil para ver apenas os aniversariantes da sua equipe imediata.

-   **Incluir unidades subordinadas:**
    -   **Descrição:** Se marcado, ao selecionar uma unidade para monitorar, a extensão também buscará por aniversariantes em todas as unidades que estão hierarquicamente abaixo dela.

-   **Mostrar militares inativos:**
    -   **Descrição:** Se marcado, a lista de aniversariantes também incluirá militares da reserva e reformados.

-   **Pesquisar/Selecionar Unidades:**
    -   **Descrição:** Uma interface de duas colunas que permite ao usuário buscar e selecionar as unidades específicas que deseja monitorar. Você pode adicionar ou remover unidades da lista de monitoramento.

---
#### 2.2. Motor de Relatórios SICOR

Ferramenta de extração de dados do **Sistema de Controle de Ocorrências e Recursos (SICOR)**. Detalhamento da sua tela de configuração:

##### Seção: Configurações de Extração
-   **Data Inicial / Data Final:**
    -   **Descrição:** Define o período para a extração dos dados. A **Data Final** possui um botão de "cadeado":
        -   **Cadeado Fechado (Padrão):** A data final é travada para ser sempre o "dia anterior", ideal para relatórios diários automáticos.
        -   **Cadeado Aberto:** Permite que o usuário defina uma data final fixa manualmente.

-   **Unidade:**
    -   **Descrição:** Campo de seleção para a unidade base da extração.
    -   **Incluir unidades subordinadas:** Checkbox que, se marcado, estende a extração para todas as unidades filhas da unidade selecionada.

-   **Trazer envolvidos:**
    -   **Descrição:** Checkbox que, se marcado, inclui no resultado os dados detalhados de todas as pessoas envolvidas nas ocorrências. Se desmarcado, a extração é mais rápida, porém mais superficial.

-   **Período Baseado em:**
    -   **Descrição:** Define qual data o sistema deve usar para o filtro de período.
        -   `Fato`: Data em que a ocorrência aconteceu.
        -   `Instauração`: Data em que o registro foi criado no sistema.
        -   `Solução`: Data em que a ocorrência foi finalizada/solucionada.

##### Seção: Configurações de Automação
-   **Frequência de Agendamento:**
    -   **Descrição:** Configura a execução automática da extração.
        -   `Nunca`: Desativa o agendamento.
        -   `Diariamente`: Roda todo dia (geralmente de madrugada).
        -   `Semanalmente`: Permite escolher um dia da semana para a execução.
        -   `Mensalmente`: Roda no primeiro dia de cada mês, extraindo os dados do mês anterior completo.

-   **ID Script Google (Sinc. Nuvem):**
    -   **Descrição:** Campo para inserir o ID de um Google Apps Script. Se preenchido, os dados extraídos são enviados automaticamente para a sua Planilha Google.

-   **Manter cópia XLS nativo / Manter cópia CSV tratado:**
    -   **Descrição:** Checkboxes para escolher os formatos de arquivo a serem salvos no seu computador a cada extração.

-   **Filtrar Tipo Envolvido:**
    -   **Descrição:** Uma lista de checkboxes (`Vítima`, `Autor`, `Testemunha`, etc.) que permite filtrar quais tipos de envolvidos devem ser incluídos no arquivo CSV tratado.

---
#### 2.3. Motor de Relatórios de Unidades

Ferramenta focada na extração da **estrutura organizacional da PMMG**. Detalhamento da sua tela de configuração:

##### Seção: Configurações de Extração
-   **Código da Unidade (cUEOp):**
    -   **Descrição:** Campo para inserir o código da unidade "raiz" a partir da qual a extração deve começar.

-   **Exibir Código / Exibir Endereço:**
    -   **Descrição:** Checkboxes que definem se essas colunas devem ser incluídas no arquivo final.

-   **Apenas Unidade Principal:**
    -   **Descrição:** Se marcado, extrai apenas os dados da unidade cujo código foi informado. Se desmarcado, extrai a unidade informada e todas as suas subordinadas.

##### Seção: Configurações de Automação
-   **Frequência de Agendamento:**
    -   **Descrição:** Idêntico ao módulo SICOR, permite agendar as extrações em frequência diária, semanal ou mensal.

-   **ID Script Google (Sinc. Nuvem):**
    -   **Descrição:** Idêntico ao módulo SICOR. Se preenchido, envia os dados extraídos (a lista de unidades) para a sua Planilha Google.

-   **Manter cópia CSV nativa:**
    -   **Descrição:** Se marcado, salva um arquivo `.csv` com os resultados da extração no seu computador.

---
#### 2.4. Outras Melhorias

A extensão também conta com módulos para aprimorar outros sistemas, como o **PADM** (Processos Administrativos) e o **SIRCONV** (Sistema de Convênios), adicionando melhorias de usabilidade e pequenas automações em suas respectivas interfaces, que podem ser descobertas durante o uso.


---

### 3. Abastecimentos

Este módulo é uma ferramenta de ETL (Extração, Transformação e Carga) projetada para automatizar a coleta e unificação de dados de abastecimento de duas fontes distintas: **PRIME** e **POC (SGTA)**.

Toda a configuração é gerenciada através de uma página de "Configurações", acessível pelo ícone da extensão.

-   **Extração de Múltiplas Fontes:**
    -   O usuário pode ativar e fornecer as credenciais (login, senha, cliente) para cada sistema (PRIME e POC) de forma independente.
    -   A extensão então se conecta a ambos os sistemas em background para baixar os dados.

-   **Unificação de Dados:**
    -   O principal recurso do módulo é a capacidade de **transformar e unificar** os dados extraídos, que originalmente possuem formatos diferentes.
    -   Ele padroniza colunas (Placa, Modelo, Combustível, Quantidade, Valor, etc.) e as combina em um único conjunto de dados coeso.

-   **Formatos de Saída:**
    -   O usuário pode escolher quais arquivos deseja gerar:
        1.  **Nativo Excel:** Mantém os arquivos `.xlsx` ou `.xls` originais, baixados de cada plataforma.
        2.  **Unificado (CSV):** Gera um único arquivo `.csv` com todos os dados de ambas as fontes, já tratados e padronizados.
        3.  **Unificado (JSON):** Gera um arquivo `.json`, ideal para integração com outros sistemas de análise de dados.

-   **Automação e Agendamento:**
    -   **Extração Manual:** A qualquer momento, o usuário pode abrir a tela de configuração e disparar uma "Extração Agora", definindo um período específico.
    -   **Agendamento:** As extrações podem ser agendadas para rodar 100% em background, sem intervenção do usuário:
        -   **Diário:** Executa para um período definido (ex: últimos 7 dias).
        -   **Semanal:** Roda em um dia da semana específico.
        -   **Mensal:** Roda no primeiro dia do mês, coletando todos os dados do mês anterior.

-   **Sincronização com a Nuvem (Google Drive):**
    -   É possível configurar o envio automático do arquivo **CSV unificado** para uma Planilha Google.
    -   Para isso, basta ativar a opção e fornecer o ID de um Google Apps Script previamente publicado, transformando sua planilha em um banco de dados de abastecimentos sempre atualizado.

-   **Histórico e Monitoramento:**
    -   A página de configurações exibe um histórico detalhado de todas as execuções (manuais e agendadas), mostrando o status de cada passo: autenticação, download, unificação e sincronização. Isso facilita a identificação de qualquer falha no processo (ex: senha incorreta, sistema indisponível).

---
## Como Contribuir

Se você é um desenvolvedor, siga os seguintes passos para contribuir:
1. Clone o repositório.
2. Crie um novo branch para sua funcionalidade (`git checkout -b feature/sua-feature`).
3. Implemente a alteração.
4. **Atualize este arquivo `README.md` com a documentação da sua alteração.**
5. Crie um Pull Request.
