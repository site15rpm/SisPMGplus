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

##### **1.2.2. Referência de Comandos (API)**

Estes são todos os comandos que você pode usar para escrever suas próprias rotinas no editor.

---
**Comandos de Interação Básica**
---

#### `digitar(texto, [verificar])`
Digita uma sequência de caracteres no terminal.

-   **Argumentos:**
    -   `texto` (String): O texto a ser digitado.
    -   `verificar` (Boolean, Opcional, Padrão: `true`): Se `true`, a rotina irá pausar e verificar se o texto digitado realmente apareceu na tela, lançando um erro se não encontrar. Se `false`, apenas digita sem verificação.

-   **Exemplo:**
    ```javascript
    // Digita o CPF e verifica se ele apareceu na tela
    digitar('123.456.789-00');

    // Digita uma senha, sem verificar (útil para campos que não mostram o texto)
    digitar('minhaSenhaSuperSecreta', false);
    ```

---

#### `teclar(nomeDaTecla)`
Simula o pressionamento de uma tecla especial.

-   **Argumentos:**
    -   `nomeDaTecla` (String): O nome da tecla a ser pressionada. O valor não é case-sensitive.
    -   **Valores Possíveis:** `'ENTER'`, `'F1'`, `'F2'`, `'F3'`, `'F4'`, `'F5'`, `'F6'`, `'F7'`, `'F8'`, `'F9'`, `'F10'`, `'F11'`, `'F12'`, `'TAB'`, `'BACKTAB'`, `'PAGEUP'`, `'PAGEDOWN'`, `'HOME'`, `'END'`, `'INSERT'`, `'DELETE'`.

-   **Exemplo:**
    ```javascript
    // Navega para o próximo campo e confirma
    teclar('TAB');
    teclar('ENTER');
    ```

---

#### `clicar(linha, coluna)`
Simula um clique de mouse em uma coordenada específica da tela do terminal.

-   **Argumentos:**
    -   `linha` (Number): O número da linha onde clicar (começando em 1).
    -   `coluna` (Number): O número da coluna onde clicar (começando em 1).

-   **Exemplo:**
    ```javascript
    // Clica na opção "2. Consultar" que está na linha 5, coluna 10
    clicar(5, 10);
    ```

---

#### `esperar(segundos)`
Pausa a execução da rotina por um determinado tempo.

-   **Argumentos:**
    -   `segundos` (Number, Opcional): O tempo em segundos para esperar. Pode ser um número decimal (ex: `0.5`). Se não for fornecido, usará a velocidade padrão da rotina (definida por `velocidade()`).

-   **Exemplo:**
    ```javascript
    // Espera 2.5 segundos para o sistema processar
    esperar(2.5);
    ```

---

#### `velocidade(segundos)`
Define a velocidade padrão de pausa entre os passos da rotina.

-   **Argumentos:**
    -   `segundos` (Number): O tempo de pausa padrão em segundos.

-   **Exemplo:**
    ```javascript
    // Define a rotina para ser mais lenta, esperando 1 segundo entre cada passo
    velocidade(1);
    digitar('texto'); // vai esperar 1s antes de digitar
    teclar('ENTER');  // vai esperar 1s antes de teclar
    ```

---
**Comandos de Leitura e Validação**
---

#### `localizarTexto(alvo, [opcoes])`
A função mais importante para controle de fluxo. Espera até que um texto (ou múltiplos textos) apareça na tela.

-   **Argumentos:**
    -   `alvo` (String | Array<String> | RegExp): O texto que a função deve procurar. Pode ser uma string simples, um array de strings (procurará por todas), ou uma Expressão Regular.
    -   `opcoes` (Object, Opcional): Um objeto para configurar o comportamento da busca.
        -   `esperar` (Number, Padrão: `5`): Tempo máximo em segundos para esperar pelo texto.
        -   `lancarErro` (Boolean, Padrão: `false`): Se `true`, a rotina para com um erro se o texto não for encontrado. Se `false`, a função apenas retorna `false`.
        -   `caseSensitive` (Boolean, Padrão: `false`): Se `true`, diferencia maiúsculas de minúsculas.
        -   `area` (Object, Padrão: `null`): Define uma área retangular para a busca (ex: `{linhaInicial: 10, colunaInicial: 5, linhaFinal: 15, colunaFinal: 40}`).
        -   `dialogoFalha` (Boolean | String, Padrão: `false`): Se `true`, exibe um popup perguntando se o usuário deseja parar ou continuar a rotina em caso de falha. Se for uma string, usa esse texto na mensagem do popup.

-   **Retorna:** `Boolean` - `true` se encontrou o texto, `false` caso contrário (a menos que `lancarErro` seja `true`).

-   **Exemplo:**
    ```javascript
    // Espera até 10 segundos pela tela de sucesso, e para a rotina se não encontrar
    localizarTexto('Operacao realizada com sucesso', { esperar: 10, lancarErro: true });

    // Verifica se a tela de login está presente (contém "Usuario" e "Senha")
    if (localizarTexto(['Usuario:', 'Senha:'])) {
      // Faz o login...
    }
    ```

---

#### `obterTexto(linhaInicial, [colunaInicial], [linhaFinal], [colunaFinal])`
Lê e retorna o texto de uma área específica da tela.

-   **Argumentos (Sobrecarga):**
    -   `obterTexto()`: Retorna o texto da tela inteira.
    -   `obterTexto(linha)`: Retorna o texto de uma linha específica.
    -   `obterTexto(linha, coluna)`: Retorna o texto de uma linha a partir de uma coluna.
    -   `obterTexto(linhaIni, colIni, linhaFim, colFim)`: Retorna o texto de uma área retangular.

-   **Retorna:** `String` - O texto extraído.

-   **Exemplo:**
    ```javascript
    // Pega o número de protocolo que está na linha 7, a partir da coluna 12
    const protocolo = obterTexto(7, 12);
    ```

---

#### `copiar(linhaInicial, [colunaInicial], [linhaFinal], [colunaFinal])`
Copia o texto de uma área da tela para a área de transferência do sistema. Usa a mesma lógica de argumentos do `obterTexto`.

-   **Exemplo:**
    ```javascript
    // Copia o conteúdo da linha 3 para o clipboard
    copiar(3);
    ```

---

#### `colar()`
Cola o conteúdo da área de transferência do sistema na posição atual do cursor no terminal.

-   **Exemplo:**
    ```javascript
    // Posiciona em um campo e cola um valor copiado de outro lugar
    posicionar('Nome:');
    colar();
    ```

---

#### `lerTela()`
Função interativa que permite ao usuário selecionar uma área da tela com dois cliques para extrair o texto.

-   **Retorna:** `Object` - Um objeto contendo o texto (`{text: '...'}`) ou `null` se a operação for cancelada.

-   **Exemplo:**
    ```javascript
    // Pede para o usuário selecionar uma área
    const selecao = lerTela();
    if (selecao) {
      digitar(selecao.text);
    }
    ```

---
**Comandos Avançados e de Navegação**
---

#### `posicionar(rotulo, [opcoes])`
Move o cursor para o campo de texto mais próximo de um "rótulo" (um texto fixo na tela). Essencial para navegar em formulários.

-   **Argumentos:**
    -   `rotulo` (String): O texto que serve como âncora.
    -   `opcoes` (Object, Opcional):
        -   `direcao` (String, Padrão: `'apos'`): Para onde ir a partir do rótulo. Valores: `'apos'`, `'antes'`, `'acima'`, `'abaixo'`.
        -   `offset` (Number, Padrão: `0`): Quantos 'TAB's adicionais pressionar após posicionar (apenas para `direcao` 'antes' ou 'apos').

-   **Exemplo:**
    ```javascript
    // Encontra o texto "CPF:" e posiciona o cursor no campo à frente dele
    posicionar('CPF:');
    digitar('111.222.333-44');

    // Encontra o texto "Nome:" e posiciona no campo de cima
    posicionar('Nome:', { direcao: 'acima' });
    ```

---

#### `processarLinhas(nomeArquivo, (linha, indice, todasAsLinhas) => { ... })`
Lê um arquivo do sistema de arquivos da extensão, linha por linha, e executa uma função de callback para cada linha.

-   **Argumentos:**
    -   `nomeArquivo` (String): O nome do arquivo a ser lido.
    -   `callback` (Function): A função a ser executada para cada linha. Ela recebe três argumentos:
        -   `linha` (String): O conteúdo da linha atual.
        -   `indice` (Number): O número da linha (começando em 0).
        -   `todasAsLinhas` (Array<String>): Um array com todas as linhas do arquivo.

-   **Exemplo:**
    ```javascript
    // Lê uma lista de CPFs do arquivo 'cpfs.txt' e consulta cada um
    processarLinhas('cpfs.txt', (cpf) => {
      posicionar('CPF:');
      digitar(cpf);
      teclar('F5');
      localizarTexto('Consulta concluida');
      // ... extrair dados ...
      teclar('F3'); // Volta para a tela de consulta
    });
    ```

---

#### `executarRotina(nomeDaRotina)`
Executa outra rotina salva, permitindo reutilizar e modularizar código.

-   **Argumentos:**
    -   `nomeDaRotina` (String): O nome completo (incluindo pastas, ex: `'Consultas/Consultar CPF'`) da rotina a ser executada.

-   **Exemplo:**
    ```javascript
    // Executa uma rotina de login antes de continuar
    executarRotina('Comuns/Login no Sistema');
    // Continua com as tarefas específicas desta rotina
    digitar('MINHA_TAREFA_ESPECIFICA');
    ```

---

#### `autoExecutar(textoDeGatilho)`
Define um "gatilho" para a rotina. A rotina será executada automaticamente assim que o `textoDeGatilho` for identificado em qualquer lugar da tela do terminal.

-   **Argumentos:**
    -   `textoDeGatilho` (String): O texto que, ao aparecer na tela, dispara a execução da rotina.

-   **Exemplo (Colocado no início de uma rotina):**
    ```javascript
    // Esta rotina irá rodar sozinha sempre que a tela principal do sistema aparecer
    autoExecutar('TELA PRINCIPAL DO SIAF');

    // O resto da rotina
    clicar(10, 15); // Clica na opção "Relatórios"
    // ...
    ```

---
**Comandos de Integração e Sistema de Arquivos**
---

#### `criarArquivo(nome, conteudo)`
Cria um arquivo de texto no sistema de arquivos virtual da extensão. Se o arquivo já existir, ele será **sobrescrito**.

---

#### `lerArquivo(nome)`
Lê e retorna o conteúdo de um arquivo de texto.

---

#### `anexarNoArquivo(nome, conteudo)`
Adiciona conteúdo ao final de um arquivo de texto. Se o arquivo não existir, ele será criado.

---

#### `excluirArquivo(nome)`
Exclui um arquivo do sistema de arquivos da extensão.

---

#### `enviarParaPlanilha(idDoScript, nomeDaAba, dados)`
Envia dados diretamente para uma Planilha Google. Requer a configuração prévia de um Google Apps Script.

-   **Argumentos:**
    -   `idDoScript` (String): O ID da publicação do seu Google Apps Script.
    -   `nomeDaAba` (String): O nome da aba na planilha que deve receber os dados.
    -   `dados` (Array<Array<String>>): Um array de arrays, onde cada array interno representa uma linha a ser inserida na planilha.

---

#### `obterDadosUsuario()`
Retorna um objeto com as informações do usuário atualmente logado na Intranet (extraídas do token).

-   **Retorna:** `Object` - Ex: `{ numeroPM: '1234567', nomeCompleto: 'NOME DO USUARIO', ... }`

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
