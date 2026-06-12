/**
   * Geradores de Dados para Autopreenchimento (Dev)
   * Estes podem ser simples ou mais complexos, retornando valores para campos específicos.
   */
  var geradoresAutoPreenchimentoDev = {
    dataDentroDoMesRelatorio: function() {
      if (typeof ano === 'undefined' || typeof mes === 'undefined') {
        console.warn("Variáveis globais 'ano' e 'mes' não definidas para gerar data.");
        return new Date().toISOString().split("T")[0];
      }

      const anoRelatorio = parseInt(ano);
      const mesNumero = converteMesParaNumero(mes) -1;

      if (isNaN(anoRelatorio) || isNaN(mesNumero) || mesNumero < 0 || mesNumero > 11) {
        console.warn("Valores inválidos para ano/mês do relatório:", ano, mes);
        return new Date().toISOString().split("T")[0];
      }

      const ultimoDiaDoMes = new Date(anoRelatorio, mesNumero + 1, 0).getDate();
      const diaAleatorio = Math.floor(Math.random() * ultimoDiaDoMes) + 1;
      
      try {
        return new Date(anoRelatorio, mesNumero, diaAleatorio).toISOString().split("T")[0];
      } catch (e) {
        console.error("Erro ao gerar data dentro do mês do relatório:", e);
        return new Date(anoRelatorio, mesNumero, 1).toISOString().split("T")[0];
      }
    },
    placaViatura: function() {
      const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const placasPadraoAntigo = ["HMA1234", "GZW5678", "PXA0987", "OWK3456", "MQV7890", "NBY6789", "KJU1230", "LPO4567"];
      const placasMercosul = ["BRA2E19", "QBC8D55", "RTY7F33", "UIO5G99", "PSA1B22", "MER6O54", "SUL4A00", "NOV8P27"];
      const todasPlacas = [...placasPadraoAntigo, ...placasMercosul];
      if (Math.random() > 0.15) {
        return todasPlacas[Math.floor(Math.random() * todasPlacas.length)];
      }
      if (Math.random() > 0.3) {
        return `${letras[Math.floor(Math.random() * 26)]}${letras[Math.floor(Math.random() * 26)]}${letras[Math.floor(Math.random() * 26)]}${Math.floor(Math.random() * 10)}${letras[Math.floor(Math.random() * 26)]}${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 10)}`;
      }
      return `${letras[Math.floor(Math.random() * 26)]}${letras[Math.floor(Math.random() * 26)]}${letras[Math.floor(Math.random() * 26)]}${String(Math.floor(Math.random() * 9000) + 1000)}`;
    },
    prefixoViatura: function() { return String(Math.floor(Math.random() * (99999 - 10000) + 10000)); },
    odometroViatura: function() { return String(Math.floor(Math.random() * (700000 - 5000) + 5000)); },
    _calcularDigitoVerificadorPM: function(numeroBase) {
      const numero = String(numeroBase).replace(/\D/g, "");
      if (numero.length === 0) return null;
      let soma = 0;
      let peso = 2;
      for (let i = numero.length - 1; i >= 0; i--) {
        let digito = parseInt(numero.charAt(i), 10);
        let produto = digito * peso;
        if (produto > 9) {
          produto = Math.floor(produto / 10) + (produto % 10);
        }
        soma += produto;
        peso = peso === 2 ? 1 : 2;
      }
      const resto = soma % 10;
      return resto === 0 ? 0 : 10 - resto;
    },
    numeroPMValido: function() {
      const numeroBase = String(Math.floor(Math.random() * (999999 - 100000) + 100000));
      const dv = geradoresAutoPreenchimentoDev._calcularDigitoVerificadorPM(numeroBase);
      if (dv === null) return "1453208";
      return numeroBase + dv;
    },
    quantidade: function(min = 1, max = 20, casasDecimais = 2) {
      const valor = Math.random() * (max - min) + min;
      return typeof formatarNumero === 'function' ? formatarNumero(valor, "decimal", casasDecimais) : valor.toFixed(casasDecimais).replace('.', ',');
    },
    valorMonetario: function(min = 5, max = 500, casasDecimais = 2) {
      const valor = Math.random() * (max - min) + min;
      return typeof formatarNumero === 'function' ? formatarNumero(valor, "moeda", casasDecimais) : "R$ " + valor.toFixed(casasDecimais).replace('.', ',');
    },
    quantidadeCombustivel: function() { return geradoresAutoPreenchimentoDev.quantidade(15, 65, 3); },
    valorTotalCombustivel: function() { return geradoresAutoPreenchimentoDev.valorMonetario(70, 400); },
    descricaoServicoManutencao: function() {
      const descricoes = ["TROCA DE OLEO E FILTROS", "ALINHAMENTO E BALANCEAMENTO", "REVISAO DOS FREIOS DIANTEIROS", "TROCA DE PNEUS (PAR DIANTEIRO)", "MANUTENCAO PREVENTIVA 50.000KM", "TROCA DE PASTILHAS E DISCOS DE FREIO", "REVISAO SISTEMA ELETRICO GERAL", "MANUTENCAO SISTEMA DE AR CONDICIONADO", "REPARO SUSPENSAO TRASEIRA ESQUERDA", "LIMPEZA E REGULAGEM BICOS INJETORES", "TROCA CORREIA DENTADA E TENSOR", "REVISAO SISTEMA DE ARREFECIMENTO"];
      return descricoes[Math.floor(Math.random() * descricoes.length)];
    },
    valorServicoManutencao: function() { return geradoresAutoPreenchimentoDev.valorMonetario(40, 1500); },
    notaFiscalAleatoria: function() { return String(Math.floor(Math.random() * (9999999 - 1000000) + 1000000)); },
    observacaoGenerica: function() {
      const obs = ["SERVICO REALIZADO CONFORME ORCAMENTO APROVADO.", "MATERIAL ENTREGUE EM PERFEITAS CONDICOES E CONFERIDO.", "NECESSIDADE URGENTE PARA CONTINUIDADE DO SERVICO.", "CONFERIDO E APROVADO PELO GESTOR DO CONTRATO.", "PARA USO IMEDIATO NA SECAO ADMINISTRATIVA.", "ACOMPANHA GARANTIA DO FORNECEDOR.", "PAGAMENTO EFETUADO VIA RECURSOS DO CONVENIO.", "ITEM SOLICITADO EM BOLETIM INTERNO."];
      return obs[Math.floor(Math.random() * obs.length)];
    },
    mesReferenciaFormatoYYYYMM: function() {
      if (typeof ano === 'undefined' || typeof mes === 'undefined') {
        console.warn("Variáveis globais 'ano' e 'mes' não definidas para gerar mês de referência.");
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
      const anoRelatorio = parseInt(ano);
      const mesNumeroRelatorio = converteMesParaNumero(mes);
      return `${anoRelatorio}-${String(mesNumeroRelatorio).padStart(2, "0")}`;
    },
    fornecedorServico: function() {
      const fornecedores = ["CEMIG DISTRIBUICAO S/A", "COPASA MG", "TELEMAR NORTE LESTE S/A", "OI MOVEL S/A", "AUTO PECAS AVENIDA LTDA", "OFICINA DO ZE REPAROS GERAIS", "LIMPADORA BRILHO TOTAL", "ALUGUEL DE IMOVEIS CENTRAL LTDA", "PAPELARIA ESCOLAR E ESCRITORIO", "MANUTENCAO PREDIAL RAPIDA", "POSTO DE COMBUSTIVEL CENTRAL", "BORRACHARIA AGUIA"];
      return fornecedores[Math.floor(Math.random() * fornecedores.length)];
    },
    consumoNumerico: function(min = 5, max = 450) { return String(Math.floor(Math.random() * (max - min) + min)); },
    enderecoPredioPublico: function() {
      const tipos = ["DELEGACIA DE POLICIA CIVIL", "POSTO POLICIAL MILITAR RODOVIARIO", "SEDE DA 123ª CIA PM IND", "DESTACAMENTO PM DE BELA VISTA", "ESCOLA ESTADUAL PROFESSOR ASTOLFO", "UNIDADE BASICA DE SAUDE CENTRAL", "PREFEITURA MUNICIPAL DE HORIZONTES", "CAMARA DE VEREADORES", "FORUM DA COMARCA", "SECRETARIA MUNICIPAL DE EDUCACAO"];
      const ruas = ["RUA DAS MARGARIDAS", "AVENIDA BRASIL", "PRACA DA BANDEIRA", "RUA JOAO PINHEIRO", "AVENIDA AFONSO PENA", "RUA DOS CARVALHOS", "RUA SETE DE SETEMBRO", "AVENIDA GOVERNADOR VALADARES"];
      const numeros = [String(Math.floor(Math.random()*1500)+1), "S/N", String(Math.floor(Math.random()*200)+10) + " FUNDOS", `LOTE ${Math.floor(Math.random()*20)+1} QUADRA ${Math.floor(Math.random()*10)+1}`];
      return `${tipos[Math.floor(Math.random() * tipos.length)]} - ${ruas[Math.floor(Math.random() * ruas.length)]}, ${numeros[Math.floor(Math.random() * numeros.length)]}`;
    },
    medidorEnergiaAgua: function() { return `INST${String(Math.floor(Math.random() * 90000000) + 10000000).padStart(8,'0')}${Math.random() > 0.5 ? 'A' : 'B'}`; },
    descricaoItemMaterial: function(isItem99 = false) {
      const descricoesNormais = ["CANETA ESFEROGRAFICA AZUL (CAIXA COM 50 UNIDADES)", "PAPEL SULFITE A4 BRANCO 75G (RESMA COM 500 FOLHAS)", "TONER COMPATIVEL PARA IMPRESSORA LASERJET MODELO XYZ123 PRETO", "LAMPADA LED BULBO E27 9W BRANCO FRIO BIVOLT", "DESINFETANTE CONCENTRADO EUCALIPTO 5 LITROS", "ALCOOL EM GEL 70% 500ML COM PUMP", "MASCARA DESCARTAVEL TRIPLA CAMADA (CAIXA COM 50)", "COPO DESCARTAVEL 200ML (PACOTE COM 100)", "SABAO EM PO PROFISSIONAL 5KG", "PILHA ALCALINA AA (PACOTE COM 4)"];
      const descricoesItem99 = ["PECA DE REPOSICAO ESPECIFICA PARA DRONE DE VIGILANCIA MODELO XPTO-V2", "SERVICO DE CONSULTORIA TECNICA EM SEGURANCA DA INFORMACAO (10 HORAS)", "MATERIAL GRAFICO PERSONALIZADO PARA CAMPANHA DE CONSCIENTIZACAO (URGENTE)", "ADAPTADOR CUSTOMIZADO PARA EQUIPAMENTO DE RADIOCOMUNICACAO DIGITAL", "LICENCA DE USO ANUAL DE SOFTWARE DE MAPEAMENTO GEORREFERENCIADO AVANCADO", "CONTRATACAO DE SERVICO DE TRADUCAO JURAMENTADA DE DOCUMENTOS OFICIAIS", "AQUISICAO DE LIVRO TECNICO RARO SOBRE CRIPTOGRAFIA QUANTICA", "DESENVOLVimento DE PLANILHA CUSTOMIZADA PARA CONTROLE DE EFETIVO", "RECARGA DE TONER ESPECIFICO PARA PLOTTER", "MANUTENCAO CORRETIVA EM EQUIPAMENTO DE CFTV"];
      const lista = isItem99 ? descricoesItem99 : descricoesNormais;
      return lista[Math.floor(Math.random() * lista.length)];
    },
    valorContaServico: function() { return geradoresAutoPreenchimentoDev.valorMonetario(25, 750); }
  };

  /**
   * Configuração de Autopreenchimento por Tipo de Formulário (Dev)
   */
  var configAutocompletarDev = {
    abastecimento: {
      campos: [
        { id: "tipo", opcoesFixas: ["ABASTECIMENTO - TIPO: GASOLINA", "ABASTECIMENTO - TIPO: OLEO DIESEL", "ABASTECIMENTO - TIPO: ALCOOL"] },
        { id: "data", gerador: "dataDentroDoMesRelatorio" },
        { id: "notaFiscal", gerador: "notaFiscalAleatoria" },
        { id: "placa", gerador: "placaViatura" },
        { id: "prefixo", gerador: "prefixoViatura" },
        { id: "odometro", gerador: "odometroViatura" },
        { id: "motorista", gerador: "numeroPMValido" },
        { id: "quantidade", gerador: "quantidadeCombustivel" },
        { id: "valorTotal", gerador: "valorTotalCombustivel" }
      ]
    },
    manutencao: {
      campos: [
        { id: "data", gerador: "dataDentroDoMesRelatorio" },
        { id: "notaFiscal", gerador: "notaFiscalAleatoria" },
        { id: "placa", gerador: "placaViatura" },
        { id: "prefixo", gerador: "prefixoViatura" },
        { id: "odometro", gerador: "odometroViatura" },
        { id: "responsavel", gerador: "numeroPMValido" },
        { id: "descricao", gerador: "descricaoServicoManutencao" },
        { id: "quantidade", valorFixo: (typeof formatarNumero === 'function' ? formatarNumero("1", "decimal", 2) : "1,00") },
        { id: "valorTotal", gerador: "valorServicoManutencao" }
      ]
    },
    material: {
      campos: [
        { id: "codigoItem", gerador: "codigoItemMaterial" },
        { id: "descricao", gerador: "descricaoItemMaterial" },
        { id: "data", gerador: "dataDentroDoMesRelatorio" },
        { id: "despesa", tipo: "select" },
        { id: "unidade", tipo: "select" },
        { id: "notaFiscal", gerador: "notaFiscalAleatoria" },
        { id: "observacao", gerador: "observacaoGenerica" },
        { id: "quantidade", gerador: "quantidade" },
        { id: "valorTotal", gerador: "valorMonetario" },
        { id: "tipo", tipo: "select", opcoesFixas: ["VEICULO LEVE", "VEICULO MEDIO", "VEICULO PESADO"] },
        { id: "placa", gerador: "placaViatura" },
        { id: "prefixo", gerador: "prefixoViatura" },
        { id: "odometro", gerador: "odometroViatura" },
        { id: "responsavel", gerador: "numeroPMValido" },
        { id: "motorista", gerador: "numeroPMValido" }
      ]
    },
    "O33903913": {
      campos: [
        { id: "data", gerador: "dataDentroDoMesRelatorio" },
        { id: "mesRef", gerador: "mesReferenciaFormatoYYYYMM" },
        { id: "responsavel", gerador: "numeroPMValido" },
        { id: "fornecedor", valorFixo: "COPASA MG" },
        { id: "observacao", gerador: "observacaoGenerica" },
        { id: "consumo", gerador: "consumoNumerico" },
        { id: "valorTotal", gerador: "valorContaServico" },
        { id: "endereco", tipo: "select" },
        { id: "medidor-O33903913", gerador: "medidorEnergiaAgua"}
      ]
    },
    "O33903912": {
      campos: [
        { id: "data", gerador: "dataDentroDoMesRelatorio" },
        { id: "mesRef", gerador: "mesReferenciaFormatoYYYYMM" },
        { id: "responsavel", gerador: "numeroPMValido" },
        { id: "fornecedor", valorFixo: "CEMIG DISTRIBUICAO S/A" },
        { id: "observacao", gerador: "observacaoGenerica" },
        { id: "consumo", gerador: "consumoNumerico" },
        { id: "valorTotal", gerador: "valorContaServico" },
        { id: "endereco", tipo: "select" },
        { id: "medidor-O33903912", gerador: "medidorEnergiaAgua" }
      ]
    },
    "O33903914": {
      campos: [
         { id: "data", gerador: "dataDentroDoMesRelatorio" },
         { id: "mesRef", gerador: "mesReferenciaFormatoYYYYMM" },
         { id: "responsavel", gerador: "numeroPMValido" },
         { id: "fornecedor", valorFixo: "OI S/A" },
         { id: "observacao", gerador: "observacaoGenerica" },
         { id: "quantidade", valorFixo: (typeof formatarNumero === 'function' ? formatarNumero("1", "decimal", 2) : "1,00") },
         { id: "valorTotal", gerador: "valorContaServico" },
         { id: "endereco", tipo: "select" }
      ]
    },
     "O33904004a": {
        campos: [
            { id: "data", gerador: "dataDentroDoMesRelatorio" },
            { id: "mesRef", gerador: "mesReferenciaFormatoYYYYMM" },
            { id: "responsavel", gerador: "numeroPMValido" },
            { id: "fornecedor", gerador: "fornecedorServico" },
            { id: "observacao", gerador: "observacaoGenerica" },
            { id: "consumo", gerador: "consumoNumerico" },
            { id: "valorTotal", gerador: "valorContaServico" },
            { id: "endereco", tipo: "select" }
        ]
    },
     "O33904004b": {
        campos: [
            { id: "data", gerador: "dataDentroDoMesRelatorio" },
            { id: "mesRef", gerador: "mesReferenciaFormatoYYYYMM" },
            { id: "responsavel", gerador: "numeroPMValido" },
            { id: "fornecedor", gerador: "fornecedorServico" },
            { id: "observacao", gerador: "observacaoGenerica" },
            { id: "consumo", gerador: "consumoNumerico" },
            { id: "valorTotal", gerador: "valorContaServico" },
            { id: "endereco", tipo: "select" }
        ]
    },
    "O33903920": {
      campos: [
        { id: "data", gerador: "dataDentroDoMesRelatorio" },
        { id: "responsavel", gerador: "numeroPMValido" },
        { id: "fornecedor", gerador: "fornecedorServico" },
        { id: "observacao", gerador: "observacaoGenerica" },
        { id: "quantidade", valorFixo: (typeof formatarNumero === 'function' ? formatarNumero("1", "decimal", 2) : "1,00") },
        { id: "valorTotal", gerador: "valorMonetario" },
        { id: "endereco", tipo: "select" }
      ]
    },
    "O44905214": {
        campos: [
            { id: "data", gerador: "dataDentroDoMesRelatorio" },
            { id: "notaFiscal", gerador: "notaFiscalAleatoria" },
            { id: "descricao", gerador: "descricaoItemMaterial" },
            { id: "observacao", gerador: "observacaoGenerica" },
            { id: "quantidade", gerador: "quantidade" },
            { id: "valorTotal", gerador: "valorMonetario" },
            { id: "endereco", tipo: "select" }
        ]
    }
  };

  function adicionarBotaoAutocompletarDev(tipoFormularioReal) {
    if (typeof nUser !== 'undefined' && nUser === "1453208") {
        const modalHeader = document.querySelector("#modal-base .modal-header");
        if (!modalHeader) return;

        // Remove botões antigos para evitar duplicação
        modalHeader.querySelectorAll('.dev-buttons-container').forEach(el => el.remove());

        // Cria um contêiner para os botões de desenvolvedor
        const devButtonsContainer = document.createElement("div");
        devButtonsContainer.className = 'dev-buttons-container';
        devButtonsContainer.style.position = 'absolute';
        devButtonsContainer.style.right = '10px';
        devButtonsContainer.style.display = 'flex';
        devButtonsContainer.style.gap = '5px';

        // Botão "Completar" padrão
        const btnAutocompletar = document.createElement("button");
        btnAutocompletar.type = "button";
        btnAutocompletar.className = "btn-autocompletar btn-warning";
        btnAutocompletar.innerHTML = '<i class="fas fa-magic" style="margin-right: 5px;"></i> Completar';
        btnAutocompletar.title = "Autocompletar Formulário";
        btnAutocompletar.onclick = function() { preencherFormularioComDadosGerados(tipoFormularioReal); };
        devButtonsContainer.appendChild(btnAutocompletar);

        // Adiciona botões específicos para o formulário de material
        if (tipoFormularioReal === 'material') {
            const btn3023 = document.createElement("button");
            btn3023.type = "button";
            btn3023.className = "btn-autocompletar-3023 btn-info";
            btn3023.textContent = '3023';
            btn3023.title = "Completar com ED 3023";
            btn3023.onclick = function() { preencherFormularioComDadosGerados(tipoFormularioReal, '3023'); };
            devButtonsContainer.appendChild(btn3023);

            const btn3026 = document.createElement("button");
            btn3026.type = "button";
            btn3026.className = "btn-autocompletar-3026 btn-info";
            btn3026.textContent = '3026';
            btn3026.title = "Completar com ED 3026";
            btn3026.onclick = function() { preencherFormularioComDadosGerados(tipoFormularioReal, '3026'); };
            devButtonsContainer.appendChild(btn3026);
        }

        modalHeader.appendChild(devButtonsContainer);

    } else {
        const btnExistente = document.querySelector("#modal-base .modal-header .dev-buttons-container");
        if (btnExistente) btnExistente.remove();
    }
  }

  async function preencherFormularioComDadosGerados(tipoFormularioReal, despesaForcada = null) {
    const form = document.getElementById("form-dinamico");
    if (!form) return;

    let configParaPreencher = configAutocompletarDev[tipoFormularioReal];
    const isItem99Global = tipoFormularioReal === 'material' && form.querySelector('#codigoItem')?.value?.startsWith('ITEM 99');

    if (!configParaPreencher && tipoFormularioReal.startsWith('O')) {
        console.warn(`Configuração de autopreenchimento específica para ${tipoFormularioReal} não encontrada. Tentando preenchimento genérico.`);
        const configOriginalDoForm = obterConfigOutrosItens(tipoFormularioReal);
        if (configOriginalDoForm && configOriginalDoForm.camposEspecificos) {
            configParaPreencher = { campos: [] };
            configOriginalDoForm.camposEspecificos.forEach(campoOriginal => {
                let campoParaAutofill = { id: campoOriginal.id, tipo: campoOriginal.tipo };
                if (geradoresAutoPreenchimentoDev[campoOriginal.id]) campoParaAutofill.gerador = campoOriginal.id;
                else if (campoOriginal.tipo === "date") campoParaAutofill.gerador = "dataDentroDoMesRelatorio";
                else if (campoOriginal.tipo === "month") campoParaAutofill.gerador = "mesReferenciaFormatoYYYYMM";
                else if (campoOriginal.id === "responsavel" || campoOriginal.id === "motorista") campoParaAutofill.gerador = "numeroPMValido";
                else if (campoOriginal.id === "fornecedor") campoParaAutofill.gerador = "fornecedorServico";
                else if (campoOriginal.id === "consumo" || (campoOriginal.id === "quantidade" && !campoOriginal.disabled && campoOriginal.tipo !== 'select')) campoParaAutofill.gerador = "consumoNumerico";
                else if (campoOriginal.id === "valorUnitario" || campoOriginal.id === "valorTotal") campoParaAutofill.gerador = "valorMonetario";
                else if (campoOriginal.id === "endereco" && campoOriginal.tipo === 'select') campoParaAutofill.tipo = "select";
                else if (campoOriginal.id.startsWith("medidor-")) campoParaAutofill.gerador = "medidorEnergiaAgua";
                else if (campoOriginal.tipo === "select" && campoOriginal.opcoes && campoOriginal.opcoes.length > 0) campoParaAutofill.opcoesFixas = campoOriginal.opcoes.map(o => o.value);
                else if (campoOriginal.id === "quantidade" && campoOriginal.disabled) campoParaAutofill.valorFixo = campoOriginal.valor;
                configParaPreencher.campos.push(campoParaAutofill);
            });
        }
    }

    if (!configParaPreencher || !configParaPreencher.campos) {
        console.warn("Configuração de autopreenchimento inválida para:", tipoFormularioReal);
        mostrarDialogo("Aviso", "Autocompletar não pôde determinar os campos para este formulário.");
        return;
    }

    const obterValorGerado = (campoConf, input) => {
        if (campoConf.valorFixo !== undefined) return campoConf.valorFixo;
        if (campoConf.opcoesFixas && campoConf.opcoesFixas.length > 0) return campoConf.opcoesFixas[Math.floor(Math.random() * campoConf.opcoesFixas.length)];
        if (campoConf.gerador && typeof geradoresAutoPreenchimentoDev[campoConf.gerador] === 'function') {
            let arg1 = tipoFormularioReal, arg2 = isItem99Global;
            if (campoConf.id.startsWith("medidor-")) arg1 = campoConf.id.includes("O33903913") ? "AGUA" : "ENERGIA";
            else if (campoConf.id === "codigoItem" || campoConf.id === "descricao") arg1 = isItem99Global;
            const geradorFn = geradoresAutoPreenchimentoDev[campoConf.gerador];
            return geradorFn.length > 0 ? geradorFn(arg1, arg2) : geradorFn();
        }
        if (input.tagName === 'SELECT' && campoConf.tipo === 'select') {
            const options = Array.from(input.options).filter(opt => opt.value && opt.text.toLowerCase() !== "selecione...");
            if (options.length > 0) return options[Math.floor(Math.random() * options.length)].value;
            if (input.options.length > 1 && input.options[1]?.value) return input.options[1].value;
        }
        return undefined;
    };

    const camposDinamicosIds = ['placa', 'prefixo', 'odometro', 'responsavel', 'motorista', 'tipo'];
    
    // 1. Fill static fields
    configParaPreencher.campos.forEach(campoConf => {
        if (camposDinamicosIds.includes(campoConf.id) && tipoFormularioReal === 'material') return; // Skip dynamic fields for now
        if (campoConf.id === 'despesa' && tipoFormularioReal === 'material') return; // Skip despesa for now

        const input = form.querySelector(`#${campoConf.id}`);
        if (input && ($(input).is(':visible') || campoConf.id === 'codigoItem') && !input.disabled) {
            if (input.type === 'file') return;
            const valorGerado = obterValorGerado(campoConf, input);
            if (valorGerado !== undefined) {
                input.value = valorGerado;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                if (input.tagName === 'SELECT' || ['data', 'mesRef', 'endereco'].includes(campoConf.id)) {
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }
    });

    // 2. Set despesa and trigger change to create dynamic fields
    const despesaSelect = form.querySelector("#despesa");
    if (despesaSelect && tipoFormularioReal === 'material') {
        let valorDespesa;
        if (despesaForcada) {
            const opcaoAlvo = Array.from(despesaSelect.options).find(opt => opt.value.trim().startsWith(despesaForcada));
            if (opcaoAlvo) valorDespesa = opcaoAlvo.value;
        } else {
            const campoConf = configParaPreencher.campos.find(c => c.id === 'despesa');
            if (campoConf) valorDespesa = obterValorGerado(campoConf, despesaSelect);
        }

        if (valorDespesa) {
            despesaSelect.value = valorDespesa;
            $(despesaSelect).trigger('change');
        }
    }

    // 3. Fill dynamic fields
    await new Promise(resolve => setTimeout(resolve, 50)); // Short delay for DOM update

    configParaPreencher.campos.forEach(campoConf => {
        if (!camposDinamicosIds.includes(campoConf.id)) return;

        const input = form.querySelector(`#${campoConf.id}`);
        if (input && $(input).is(':visible') && !input.disabled) {
            const valorGerado = obterValorGerado(campoConf, input);
            if (valorGerado !== undefined) {
                input.value = valorGerado;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    });

    // 4. Final calculations and validation
    calcularTotalFormulario();
    $(form).find("input:visible:not(:disabled), select:visible:not(:disabled), textarea:visible:not(:disabled)").trigger('blur');
  }
