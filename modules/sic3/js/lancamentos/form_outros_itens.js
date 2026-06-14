var configBaseOutrosItens = {
  SERVICO: {
    descricao: "SERVICOS",
    campos: [
      { id: "data", label: "Data do Serviço", tipo: "date" },
      { id: "responsavel", label: "Responsável (Nº PM)", tipo: "text" },
      { id: "fornecedor", label: "Fornecedor", tipo: "text", fullWidth: true  },
      { id: "observacao", label: "Observação", tipo: "text", fullWidth: true },
      { id: "quantidade", label: "Quantidade", tipo: "text", disabled: true, valor: "1,00" },
      { id: "valorTotal", label: "Valor Total (R$)", tipo: "text", placeholder: "0,00" }
    ]
  },
  MATERIAL_PERM: {
    descricao: "MATERIAIS PERMANENTES",
    campos: [
      { id: "data", label: "Data do Recebimento", tipo: "date" },
      { id: "notaFiscal", label: "Nº da Nota Fiscal", tipo: "text" },
      { id: "descricao", label: "Descrição do Material", tipo: "text", fullWidth: true },
      { id: "observacao", label: "Observação", tipo: "text", fullWidth: true },
      { id: "quantidade", label: "Quantidade", tipo: "text", placeholder: "0,00" },
      { id: "valorTotal", label: "Valor Total (R$)", tipo: "text", placeholder: "0,00" }
    ]
  }
};

function obterConfigOutrosItens(tipo) {
  const mesReferenciaAtual = `${ano}-${mNumerico(mes)}`;
  const tiposConfig = {
    O33903913: {
      codigo: "O33903913", descricao: "TARIFA DE AGUA E ESGOTO", despesa: "3913 - TARIFA DE AGUA E ESGOTO", unidade: "00001 - 1,00 UNIDADE",
      camposEspecificos: [
        { id: "data", label: "Data do Recebimento", tipo: "date" },
        { id: "mesRef", label: "Mês de Referência", tipo: "month", disabled: true, valor: mesReferenciaAtual },
        { id: "responsavel", label: "Responsável (Nº PM)", tipo: "text" },
        { id: "fornecedor", label: "Fornecedor", tipo: "text" },
        { id: "observacao", label: "Observação", tipo: "text", fullWidth: true },
        { id: "consumo", label: "Consumo (m³)", tipo: "text", placeholder: "00" },
        { id: "valorTotal", label: "Valor Total (R$)", tipo: "text", placeholder: "0,00" }
      ]
    },
    O33903912: {
      codigo: "O33903912", descricao: "TARIFA DE ENERGIA ELETRICA", despesa: "3912 - TARIFA DE ENERGIA ELETRICA", unidade: "00001 - 1,00 UNIDADE",
      camposEspecificos: [
        { id: "data", label: "Data do Recebimento", tipo: "date" },
        { id: "mesRef", label: "Mês de Referência", tipo: "month", disabled: true, valor: mesReferenciaAtual },
        { id: "responsavel", label: "Responsável (Nº PM)", tipo: "text" },
        { id: "fornecedor", label: "Fornecedor", tipo: "text" },
        { id: "observacao", label: "Observação", tipo: "text", fullWidth: true },
        { id: "consumo", label: "Consumo (kWh)", tipo: "text", placeholder: "00" },
        { id: "valorTotal", label: "Valor Total (R$)", tipo: "text", placeholder: "0,00" }
      ]
    },
    O33903914: {
      codigo: "O33903914", descricao: "SERVICO DE TELEFONIA (TELEFONE FIXO)", despesa: "3914 - SERVICO DE TELEFONIA", unidade: "00001 - 1,00 SERVICO",
      camposEspecificos: [
        { id: "data", label: "Data do Recebimento", tipo: "date" },
        { id: "mesRef", label: "Mês de Referência", tipo: "month", disabled: true, valor: mesReferenciaAtual },
        { id: "telefone", label: "Nº Telefone (com DDD)", tipo: "text" },
        { id: "responsavel", label: "Responsável (Nº PM)", tipo: "text" },
        { id: "fornecedor", label: "Fornecedor", tipo: "text" },
        { id: "observacao", label: "Observação", tipo: "text", fullWidth: false },
        { id: "quantidade", label: "Quantidade", tipo: "text", disabled: true, valor: "1,00" },
        { id: "valorTotal", label: "Valor Total (R$)", tipo: "text", placeholder: "0,00" }
      ]
    },
    O33904004a: {
      codigo: "O33904004", descricao: "SERVICO DE TELEFONIA (TELEFONE MÓVEL)", despesa: "4004 - SERVICO DE TELECOMUNICACAO", unidade: "00001 - 1,00 SERVICO",
      camposEspecificos: [
        { id: "data", label: "Data do Recebimento", tipo: "date" },
        { id: "mesRef", label: "Mês de Referência", tipo: "month", disabled: true, valor: mesReferenciaAtual },
        { id: "telefone", label: "Nº Telefone (com DDD)", tipo: "text" },
        { id: "responsavel", label: "Responsável (Nº PM)", tipo: "text" },
        { id: "fornecedor", label: "Fornecedor", tipo: "text" },
        { id: "observacao", label: "Observação", tipo: "text", fullWidth: false },
        { id: "quantidade", label: "Quantidade", tipo: "text", disabled: true, valor: "1,00" },
        { id: "valorTotal", label: "Valor Total (R$)", tipo: "text", placeholder: "0,00" }
      ]
    },
    O33904004b: {
      codigo: "O33904004", descricao: "SERVICO DE TELECOMUNICACAO (INTERNET)", despesa: "4004 - SERVICO DE TELECOMUNICACAO", unidade: "00001 - 1,00 SERVICO",
      camposEspecificos: [
        { id: "data", label: "Data do Recebimento", tipo: "date" },
        { id: "mesRef", label: "Mês de Referência", tipo: "month", disabled: true, valor: mesReferenciaAtual },
        { id: "responsavel", label: "Responsável (Nº PM)", tipo: "text" },
        { id: "fornecedor", label: "Fornecedor", tipo: "text" },
        { id: "observacao", label: "Observação", tipo: "text", fullWidth: false },
        { id: "consumo", label: "Velocidade (Mega)", tipo: "text", placeholder: "000" },
        { id: "valorTotal", label: "Valor Total (R$)", tipo: "text", placeholder: "0,00" }
      ]
    }
  };
  [
    ["O33903961", "SERVICOS DE CONSERVACAO E LIMPEZA", "3961 - SERVICOS DE CONSERVACAO E LIMPEZA"],
    ["O33903702", "LOCACAO DE SERVICOS DE APOIO ADMINISTRATIVO", "3702 - LOCACAO DE SERVICOS ADMINISTRATIVOS"],
    ["O33903701", "LOCACAO DE SERVICOS DE CONSERVACAO E LIMPEZA", "3701 - LOCACAO DE SERVICOS DE CONSERVACAO"],
    ["O33903611", "LOCACAO DE BENS IMOVEIS - PESSOA FISICA", "3611 - LOCACAO DE BENS IMOVEIS"],
    ["O33903920", "LOCACAO DE BENS IMOVEIS - PESSOA JURIDICA", "3920 - LOCACAO DE BENS IMOVEIS"],
    ["O33903919", "LOCACAO DE MAQUINAS E EQUIPAMENTOS", "3919 - LOCACAO DE MAQUINAS E EQUIPAMENTOS"],
    ["O33903922", "REPAROS DE BENS IMOVEIS", "3922 - REPAROS DE BENS IMOVEIS"]
  ].forEach(([codigo, descricao, despesa]) => {
    tiposConfig[codigo] = { ...configBaseOutrosItens.SERVICO, codigo, descricao, despesa, unidade: "00001 - 1,00 SERVICO", camposEspecificos: configBaseOutrosItens.SERVICO.campos };
  });
  [
    ["O44905214", "MOBILIARIO", "5214 - MOBILIARIO"],
    ["O44905207", "EQUIPAMENTOS DE INFORMATICA", "5207 - EQUIPAMENTOS DE INFORMATICA"],
    ["O44905220", "EQUIPAMENTOS DE SEGURANCA ELETRONICA", "5220 - EQUIPAMENTOS DE SEGURANCA ELETRONICA"],
    ["O44905203", "ARMAMENTO E EQUIPAMENTO DE USO POLICIAL", "5203 - ARMAMENTO E EQUIPAMENTO POLICIAL"],
    ["O44905112", "MATERIAL PARA OBRAS - BENS NAO PATRIMONIAVEIS", "5112 - MATERIAL PARA OBRAS - NAO PATRIMONIAVEIS"],
    ["O44905110", "MATERIAL PARA OBRAS - PATRIMONIAVEIS", "5110 - MATERIAL PARA OBRAS - PATRIMONIAVEIS"]
  ].forEach(([codigo, descricao, despesa]) => {
    tiposConfig[codigo] = { ...configBaseOutrosItens.MATERIAL_PERM, codigo, descricao, despesa, unidade: "00001 - 1,00 UNIDADE", camposEspecificos: configBaseOutrosItens.MATERIAL_PERM.campos };
  });
   Object.values(tiposConfig).forEach(config => {
    if (config.campos && config.camposEspecificos) {
        const campoIds = new Set(config.camposEspecificos.map(c => c.id));
        config.campos.forEach(baseCampo => {
            if (!campoIds.has(baseCampo.id)) {
                config.camposEspecificos.push(baseCampo);
            }
        });
        delete config.campos;
    } else if (config.campos && !config.camposEspecificos) {
        config.camposEspecificos = config.campos;
        delete config.campos;
    }
  });
  return tiposConfig[tipo] || null;
}

async function configurarEventosFormularioOutros() {
  $(document).on("click", ".principal-table .btn-editar", async (e) => {
    const row = $(e.currentTarget).closest("tr");
    let codigo = row.find(".codigo-item").text().trim();
    if (!codigo.startsWith("O")) return;

    if (codigo === "O33904004") {
      const descricao = row.find(".descricao-item").text().trim().toUpperCase();
      if (descricao.includes("INTERNET")) {
        codigo = "O33904004b";
      } else {
        codigo = "O33904004a";
      }
    }

    try {
      const dados = extrairDadosLinhaOutrosItens(row[0]);
      if (!row[0].id) row[0].id = "linha-item-" + Date.now();
      dados.linhaId = row[0].id;

      await abrirFormularioOutrosItens(codigo, dados);

      const form = document.getElementById("form-dinamico");
      if (form && row[0]?.id) {
        form.setAttribute("data-linha-edicao", row[0].id);
      }
    } catch (error) {
      console.error("Erro ao editar item:", error);
      mostrarDialogo("Erro", "Não foi possível editar este item");
    }
  });

  $(document).on("click", ".principal-table .btn-excluir", async (e) => {
    const row = $(e.currentTarget).closest("tr");
    const codigo = row.find(".codigo-item").text().trim();
    if (!codigo.startsWith("O")) return;

    const confirmado = await confirmarExclusao("Deseja realmente excluir este item?");
    if (confirmado) {
      row.remove();
      atualizarNumeracaoLinhas();
      calcularTotalTabela();
      atualizarVisibilidadeContainers();
      if (typeof window.salvarBackupLocal === 'function') window.salvarBackupLocal();
    }
  });
}

async function abrirFormularioOutrosItens(tipo, dados = null) {
  const config = obterConfigOutrosItens(tipo);
  if (!config) {
    mostrarDialogo("Erro", "Tipo de item não encontrado");
    return;
  }
  await abrirFormularioModal(tipo, config, dados, `LANÇAMENTO - ${config.descricao}`);
}

function extrairDadosLinhaOutrosItens(row) {
  if (!row) return {};
  const dados = {
    codigo: row.querySelector(".codigo-item")?.textContent || "",
    despesa: row.querySelector(".despesa-item")?.textContent || "",
    unidade: row.querySelector(".unidade-item")?.textContent || "",
    data: row.querySelector(".data-item")?.textContent || "",
  };

  const descricaoCompleta = row.querySelector(".descricao-item")?.textContent || "";
  const descLinhas = descricaoCompleta.split("\n");
  dados.descricao = descLinhas.find(l => !l.startsWith("Desc.:") && !l.startsWith("End.:")) || descLinhas[0] || "";
  descLinhas.forEach(linha => {
    if (linha.startsWith("Desc.:")) dados.descricaoInput = linha.replace("Desc.: ", "").trim();
    else if (linha.startsWith("End.:")) dados.endereco = linha.replace("End.: ", "").trim();
  });
   if (!dados.descricaoInput && dados.descricao && obterConfigOutrosItens(dados.codigo)?.descricao !== dados.descricao) {
      dados.descricaoInput = dados.descricao;
  }

  const observacaoCompleta = row.querySelector(".observacao-item")?.textContent || "";
  const obsLinhas = observacaoCompleta.split("\n");
  obsLinhas.forEach(linha => {
    if (linha.startsWith("Recb.:")) dados.dataRecebimento = linha.replace("Recb.: ", "").trim();
    else if (linha.startsWith("Forn.:")) dados.fornecedor = linha.replace("Forn.: ", "").trim();
    else if (linha.startsWith("Med.:")) dados.medidor = linha.replace("Med.: ", "").trim();
    else if (linha.startsWith("Resp.:")) dados.responsavel = linha.replace("Resp.: ", "").trim();
    else if (linha.startsWith("NFnº.:")) dados.notaFiscal = linha.replace("NFnº.: ", "").trim();
    else if (linha.startsWith("Tel.:")) dados.telefone = linha.replace("Tel.: ", "").trim();
    else if (linha.startsWith("Obs.:")) dados.observacao = linha.replace("Obs.: ", "").trim();
  });

  let codigoParaConfig = dados.codigo;
  if (codigoParaConfig === "O33904004") {
    if (descricaoCompleta.toUpperCase().includes("INTERNET")) {
      codigoParaConfig = "O33904004b";
    } else {
      codigoParaConfig = "O33904004a";
    }
  }
  const configItem = obterConfigOutrosItens(codigoParaConfig);
  if (configItem) {
      const hasMesRef = configItem.camposEspecificos.some(c => c.id === 'mesRef');
      if (hasMesRef) {
          if (dados.data && dados.data.length >= 7) {
            dados.mesRef = dados.data.substring(0, 7);
          } else {
            dados.mesRef = '';
          }
          dados.data = dados.dataRecebimento || dados.data;
      }
      if (configItem.camposEspecificos.some(c => c.id === 'consumo')) {
          dados.consumo = row.querySelector(".quantidade-item")?.textContent || "";
          dados.valorTotal = row.querySelector(".subtotal-item")?.textContent || "";
      } else if (configItem.camposEspecificos.some(c => c.id === 'quantidade' && c.disabled)) {
          dados.quantidade = row.querySelector(".quantidade-item")?.textContent || "1,00";
          dados.valorTotal = row.querySelector(".subtotal-item")?.textContent || "";
      } else {
          dados.quantidade = row.querySelector(".quantidade-item")?.textContent || "";
          dados.valorTotal = row.querySelector(".subtotal-item")?.textContent || "";
      }
  }
   dados.descricao = dados.descricaoInput || "";
  return dados;
}

async function processarSubmissaoOutrosItens(tipo, config, dadosForm, linhaEditadaId) {
  try {
    const dadosBase = {
      tipo: tipo,
      codigo: config.codigo,
      despesa: config.despesa,
      unidade: config.unidade,
      descricaoInput: dadosForm.descricao?.trim() || "",
      data: dadosForm.data,
      mesRef: dadosForm.mesRef || "",
      endereco: dadosForm.endereco || "",
      notaFiscal: dadosForm.notaFiscal || "",
      fornecedor: dadosForm.fornecedor || "",
      medidor: dadosForm["medidor-O33903912"] || dadosForm["medidor-O33903913"] || "",
      telefone: dadosForm.telefone || "",
      observacaoInput: dadosForm.observacao?.trim() || "",
      responsavel: dadosForm.responsavel || "",
      subtotal: dadosForm.subtotal,
      quantidade: dadosForm.consumo || dadosForm.quantidade,
      valorUnitario: dadosForm.valorUnitario
    };

    let descCompletaParaTabela = config.descricao;
    if (dadosBase.descricaoInput) descCompletaParaTabela += `\nDesc.: ${dadosBase.descricaoInput}`;
    if (dadosBase.endereco) descCompletaParaTabela += `\nEnd.: ${dadosBase.endereco}`;
    dadosBase.descricaoParaTabela = descCompletaParaTabela;

    const dataParaValidacao = dadosBase.mesRef ? dadosBase.mesRef + "-01" : dadosBase.data;
    if (!validarDuplicidadeEndereco({ ...dadosBase, data: dataParaValidacao, endereco: dadosBase.endereco, telefone: dadosBase.telefone }, linhaEditadaId, true)) {
        return;
    }

    const observacoesParaTabela = [];
    let dataParaTabela = dadosBase.data;
    if (dadosBase.mesRef) {
      observacoesParaTabela.push(`Recb.: ${dadosBase.data}`);
      const [anoRef, mesRefNum] = dadosBase.mesRef.split("-");
      const ultimoDia = new Date(anoRef, parseInt(mesRefNum, 10), 0).getDate();
      dataParaTabela = `${anoRef}-${mesRefNum}-${String(ultimoDia).padStart(2, '0')}`;
    }
    if (dadosBase.notaFiscal) observacoesParaTabela.push(`NFnº.: ${dadosBase.notaFiscal}`);
    if (dadosBase.medidor) observacoesParaTabela.push(`Med.: ${dadosBase.medidor}`);
    if (dadosBase.telefone) observacoesParaTabela.push(`Tel.: ${dadosBase.telefone}`);
    if (dadosBase.fornecedor) observacoesParaTabela.push(`Forn.: ${dadosBase.fornecedor}`);
    if (dadosBase.responsavel) observacoesParaTabela.push(`Resp.: ${dadosBase.responsavel}`);
    if (dadosBase.observacaoInput) observacoesParaTabela.push(`Obs.: ${dadosBase.observacaoInput}`);
    dadosBase.observacaoParaTabela = observacoesParaTabela.filter(obs => obs && obs.split(":")[1]?.trim()).join("\n");

    const dadosLinhaTabela = {
        codigo: dadosBase.codigo,
        descricao: dadosBase.descricaoParaTabela,
        despesa: dadosBase.despesa,
        unidade: dadosBase.unidade,
        data: dataParaTabela,
        quantidade: dadosBase.quantidade,
        valorUnitario: dadosBase.valorUnitario,
        subtotal: dadosBase.subtotal,
        observacao: dadosBase.observacaoParaTabela
    };

    if (linhaEditadaId) {
      const linhaEditada = document.getElementById(linhaEditadaId);
      if (linhaEditada) {
        $(linhaEditada).find(".codigo-item").text(dadosLinhaTabela.codigo);
        $(linhaEditada).find(".descricao-item").text(dadosLinhaTabela.descricao);
        $(linhaEditada).find(".despesa-item").text(dadosLinhaTabela.despesa);
        $(linhaEditada).find(".unidade-item").text(dadosLinhaTabela.unidade);
        $(linhaEditada).find(".data-item").text(dadosLinhaTabela.data);
        $(linhaEditada).find(".quantidade-item").text(formatarNumero(dadosLinhaTabela.quantidade));
        $(linhaEditada).find(".valorUnitario-item").text(formatarNumero(dadosLinhaTabela.valorUnitario, "moeda"));
        $(linhaEditada).find(".subtotal-item").text(dadosLinhaTabela.subtotal);
        $(linhaEditada).find(".observacao-item").text(dadosLinhaTabela.observacao);
      }
      calcularTotalTabela();
    } else {
      await inserirLinhaTabela(dadosLinhaTabela);
    }

    if (typeof termosDeBuscaGlobal !== 'undefined') {
        termosDeBuscaGlobal.clear();
    }
    
    fecharModal();
    if (typeof window.salvarBackupLocal === 'function') window.salvarBackupLocal();
  } catch (error) {
    console.error("Erro ao processar submissão de outros itens:", error);
    mostrarDialogo("Erro", "Erro ao processar formulário de outros itens");
  }
}
