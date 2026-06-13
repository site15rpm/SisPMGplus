var dadosItem99Carregados = false;
var item99TempCounter = 0;
var todosElementosDespesa = [];
var todasUnidades = [];

function obterConfigFormularioMaterial(itemDetails = null) {
  const isItem99 = (itemDetails?.isItem99 === true) ||
    String(itemDetails?.codigoItem || '').startsWith("99") ||
    String(itemDetails?.codigoItem || '').startsWith("ITEM99P");
  const isEditing = itemDetails?.isEditing || false;

  const codigoItemValor = itemDetails?.codigoItem || "";
  const descricaoValor = itemDetails?.descricao || "";
  const despesaValor = itemDetails?.despesa || "";
  const unidadeValor = itemDetails?.unidade || "";

  let campos;

  if (isItem99) {
    const opcoesDespesa = todosElementosDespesa.map(d => ({
      value: d,
      label: d
    }));
    const opcoesUnidade = todasUnidades.map(u => ({
      value: u,
      label: u
    }));

    const camposBase99 = [{
      id: "descricao",
      label: "Descrição",
      tipo: "text",
      disabled: false,
      valor: descricaoValor,
      fullWidth: true
    }, {
      id: "codigoItem",
      label: "Código",
      tipo: "text",
      disabled: true,
      valor: codigoItemValor
    }, {
      id: "data",
      label: "Data do Recebimento",
      tipo: "date",
      valor: itemDetails?.data || ""
    }, {
      id: "despesa",
      label: "Elemento Despesa",
      tipo: "select",
      opcoes: opcoesDespesa,
      valor: despesaValor
    }, {
      id: "unidade",
      label: "Unidade de Distribuição",
      tipo: "select",
      opcoes: opcoesUnidade,
      valor: unidadeValor
    }];

    let camposDinamicos99 = [];
    const despesaCodigo99 = String(despesaValor).split(" - ")[0].trim();
    if (['3023', '3026'].includes(despesaCodigo99)) {
      camposDinamicos99 = despesaCodigo99 === '3023' ?
        [{
          id: "placa",
          label: "Placa",
          tipo: "text",
          valor: itemDetails?.placa || ""
        }, {
          id: "prefixo",
          label: "Prefixo VTR",
          tipo: "text",
          valor: itemDetails?.prefixo || ""
        }, {
          id: "odometro",
          label: "Odômetro",
          tipo: "text",
          valor: itemDetails?.odometro || ""
        }, {
          id: "responsavel",
          label: "Responsável (Nº PM)",
          tipo: "text",
          valor: itemDetails?.responsavel || ""
        }] :
        [ // 3026
          {
            id: "placa",
            label: "Placa",
            tipo: "text",
            valor: itemDetails?.placa || ""
          }, {
            id: "prefixo",
            label: "Prefixo VTR",
            tipo: "text",
            valor: itemDetails?.prefixo || ""
          }, {
            id: "odometro",
            label: "Odômetro",
            tipo: "text",
            valor: itemDetails?.odometro || ""
          }, {
            id: "motorista",
            label: "Motorista (Nº PM)",
            tipo: "text",
            valor: itemDetails?.motorista || ""
          }
        ];
    }

    const camposFinais99 = [{
      id: "notaFiscal",
      label: "Nº da Nota Fiscal",
      tipo: "text",
      valor: itemDetails?.notaFiscal || ""
    }, {
      id: "notaFiscalAnexo",
      label: isEditing ? "Substituir Anexo (Opcional)" : "Anexo da Nota Fiscal",
      tipo: "file",
      isRequired: !isEditing
    }, {
      id: "quantidade",
      label: "Quantidade",
      tipo: "text",
      placeholder: "0,00",
      valor: itemDetails?.quantidade || ""
    }, {
      id: "valorTotal",
      label: "Valor Total (R$)",
      tipo: "text",
      placeholder: "0,00",
      valor: itemDetails?.valorTotal || ""
    }];

    campos = [...camposBase99, ...camposDinamicos99, ...camposFinais99];

  } else {
    let opcoesDespesa = itemDetails?.opcoesDespesa ? [...itemDetails.opcoesDespesa] : [];
    if (despesaValor && !opcoesDespesa.some(o => o.value === despesaValor)) {
      opcoesDespesa.push({
        value: despesaValor,
        label: despesaValor
      });
    }

    let opcoesUnidade = itemDetails?.opcoesUnidade ? [...itemDetails.opcoesUnidade] : [];
    if (unidadeValor && !opcoesUnidade.some(o => o.value === unidadeValor)) {
      opcoesUnidade.push({
        value: unidadeValor,
        label: unidadeValor
      });
    }

    const camposBase = [{
      id: "descricao",
      label: "Descrição",
      tipo: "text",
      disabled: true,
      valor: descricaoValor,
      fullWidth: true
    }, {
      id: "codigoItem",
      label: "Código",
      tipo: "text",
      disabled: true,
      valor: codigoItemValor
    }, {
      id: "data",
      label: "Data do Recebimento",
      tipo: "date",
      valor: itemDetails?.data || ""
    }, {
      id: "despesa",
      label: "Elemento Despesa",
      tipo: "select",
      opcoes: opcoesDespesa,
      valor: despesaValor
    }, {
      id: "unidade",
      label: "Unidade de Distribuição",
      tipo: "select",
      opcoes: opcoesUnidade,
      valor: unidadeValor
    }];

    const camposFinais = [{
      id: "notaFiscal",
      label: "Nº da Nota Fiscal",
      tipo: "text",
      valor: itemDetails?.notaFiscal || ""
    }, {
      id: "observacao",
      label: "Observação",
      tipo: "text",
      valor: itemDetails?.observacao || "",
      fullWidth: true
    }, {
      id: "quantidade",
      label: "Quantidade",
      tipo: "text",
      placeholder: "0,00",
      valor: itemDetails?.quantidade || ""
    }, {
      id: "valorTotal",
      label: "Valor Total (R$)",
      tipo: "text",
      placeholder: "0,00",
      valor: itemDetails?.valorTotal || ""
    }];

    let camposDinamicos = [];
    const despesaCodigo = String(despesaValor).split(" - ")[0].trim();
    if (['3023', '3026'].includes(despesaCodigo)) {
      camposDinamicos = despesaCodigo === '3023' ?
        [{
          id: "placa",
          label: "Placa",
          tipo: "text",
          valor: itemDetails?.placa || ""
        }, {
          id: "prefixo",
          label: "Prefixo VTR",
          tipo: "text",
          valor: itemDetails?.prefixo || ""
        }, {
          id: "odometro",
          label: "Odômetro",
          tipo: "text",
          valor: itemDetails?.odometro || ""
        }, {
          id: "responsavel",
          label: "Responsável (Nº PM)",
          tipo: "text",
          valor: itemDetails?.responsavel || ""
        }] :
        [ // 3026
          {
            id: "placa",
            label: "Placa",
            tipo: "text",
            valor: itemDetails?.placa || ""
          }, {
            id: "prefixo",
            label: "Prefixo VTR",
            tipo: "text",
            valor: itemDetails?.prefixo || ""
          }, {
            id: "odometro",
            label: "Odômetro",
            tipo: "text",
            valor: itemDetails?.odometro || ""
          }, {
            id: "motorista",
            label: "Motorista (Nº PM)",
            tipo: "text",
            valor: itemDetails?.motorista || ""
          }
        ];
    }

    campos = [...camposBase, ...camposDinamicos, ...camposFinais];
  }

  return {
    descricaoModal: isItem99 ?
      (isEditing ? "Editar Item 99 (Outros)" : "Adicionar Item 99 (Outros)") :
      (isEditing ? "Editar Material de Consumo" : "Adicionar Material de Consumo"),
    campos: campos
  };
}

function configurarEventosFormularioMaterial() {
  $(document).on("click", ".principal-table .btn-editar", async (e) => {
    if (!isMaterialRow(e.currentTarget)) return;

    try {
      mostrarCarregamento();
      const rowElement = $(e.currentTarget).closest("tr")[0];
      const codigoItem = $(rowElement).find(".codigo-item").text().trim();
      const isItem99 = String(codigoItem).startsWith("99") || String(codigoItem).startsWith("ITEM99P");

      const dados = await extrairDadosLinhaMaterial(rowElement);
      if (!rowElement.id) {
        rowElement.id = "linha-material-" + Math.random().toString(36).substr(2, 9);
      }
      dados.linhaId = rowElement.id;

      await abrirFormularioMaterial(dados, isItem99);

      const form = document.getElementById("form-dinamico");
      if (form && rowElement?.id) {
        form.setAttribute("data-linha-edicao", rowElement.id);
      }
    } catch (error) {
      console.error("Erro ao editar item de material:", error);
      mostrarDialogo("Erro", "Não foi possível editar este item de material. Detalhes: " + error.message);
    } finally {
      ocultarCarregamento();
    }
  });

  $(document).on("click", ".principal-table .btn-excluir", async (e) => {
    if (!isMaterialRow(e.currentTarget)) return;

    const row = $(e.currentTarget).closest("tr");
    const confirmado = await confirmarExclusao("Deseja realmente excluir este material da lista principal?");

    if (confirmado) {
      row.remove();
      atualizarNumeracaoLinhas();
      calcularTotalTabela();
      atualizarVisibilidadeContainers();
    }
  });
}

function isMaterialRow(element) {
  const $row = $(element).closest("tr");
  const codigo = $row.find(".codigo-item").text().trim();
  if ($row.data('source') === 'abastecimento' || $row.data('source') === 'manutencao') {
    return false;
  }
  const nonMaterialPrefixes = ["O"];

  if (!codigo) return false;
  if (nonMaterialPrefixes.some(prefix => codigo.startsWith(prefix))) return false;
  return true;
}

async function extrairDadosLinhaMaterial(rowElement) {
  try {
    const codigoItem = $(rowElement).find(".codigo-item").text();
    const isItem99 = String(codigoItem).startsWith("99") || String(codigoItem).startsWith("ITEM99P");
    let itemDataFromSource = null;

    if (!isItem99) {
      if (!$.fn.DataTable.isDataTable('#dataTable') && typeof carregarPesquisaMaterial === 'function') {
        await carregarPesquisaMaterial();
      }
      if ($.fn.DataTable.isDataTable('#dataTable')) {
        const dtRow = $('#dataTable').DataTable().rows((idx, data) => data[0] === codigoItem).data();
        if (dtRow.length > 0) itemDataFromSource = dtRow[0];
      }
      if (!itemDataFromSource) {
        const secundarioData = await carregarDadosPlanilha({
          sheetId: window.idTBSecundaria || "1JSea5w5dmuxO2svSVqVpNft4NUsKDCeWv5i3Rv_wRUM",
          sheet: "dt-secundaria",
          query: `SELECT A,B,C,D WHERE A='${codigoItem}'`
        });
        if (secundarioData?.length > 0 && secundarioData[0].length >= 4) {
          itemDataFromSource = [secundarioData[0][0], secundarioData[0][1], secundarioData[0][2], secundarioData[0][3]];
        }
      }
    }

    const dadosParaForm = {
      codigoItem: codigoItem,
      descricao: $(rowElement).find(".descricao-item").text(),
      despesa: $(rowElement).find(".despesa-item").text(),
      unidade: $(rowElement).find(".unidade-item").text(),
      data: $(rowElement).find(".data-item").text(),
      quantidade: formatarNumero($(rowElement).find(".quantidade-item").text(), "decimal"),
      valorTotal: formatarNumero($(rowElement).find(".subtotal-item").text(), "decimal"),
      valorUnitario: formatarNumero($(rowElement).find(".valorUnitario-item").text(), "decimal"),
      isItem99: isItem99,
      isEditing: true,
      opcoesDespesa: [],
      opcoesUnidade: [],
      notaFiscal: "",
      observacao: ""
    };

    if (!isItem99 && itemDataFromSource) {
      dadosParaForm.opcoesDespesa = criarOpcoesCombobox(itemDataFromSource[2]).map(d => ({
        value: d,
        label: d
      }));
      dadosParaForm.opcoesUnidade = criarOpcoesCombobox(itemDataFromSource[3]).map(u => ({
        value: u,
        label: u
      }));
    }

    const observacaoCompleta = $(rowElement).find(".observacao-item").text();
    const obsLinhas = observacaoCompleta.split("\n");
    let obsEspecificaArray = [];

    obsLinhas.forEach(linha => {
      const trimmedLine = linha.trim();
      if (trimmedLine.startsWith("NFnº.:")) {
        dadosParaForm.notaFiscal = trimmedLine.replace("NFnº.:", "").trim();
      } else if (trimmedLine.startsWith("Placa:")) {
        dadosParaForm.placa = trimmedLine.replace("Placa:", "").trim();
      } else if (trimmedLine.startsWith("Prefixo:")) {
        dadosParaForm.prefixo = trimmedLine.replace("Prefixo:", "").trim();
      } else if (trimmedLine.startsWith("Odômetro:")) {
        dadosParaForm.odometro = trimmedLine.replace("Odômetro:", "").trim();
      } else if (trimmedLine.startsWith("Responsável:")) {
        dadosParaForm.responsavel = trimmedLine.replace("Responsável:", "").trim();
      } else if (trimmedLine.startsWith("Motorista:")) {
        dadosParaForm.motorista = trimmedLine.replace("Motorista:", "").trim();
      } else if (trimmedLine.startsWith("Obs.:")) {
        obsEspecificaArray.push(trimmedLine.replace("Obs.:", "").trim());
      } else if (trimmedLine !== "") {
        obsEspecificaArray.push(trimmedLine);
      }
    });

    dadosParaForm.observacao = obsEspecificaArray.join("\n").trim();
    return dadosParaForm;

  } catch (error) {
    console.error("Erro ao extrair dados da linha de material:", error);
    manipularErro(error, "extrairDadosLinhaMaterial");
    throw error;
  }
}

async function abrirFormularioMaterial(dados = null, isItem99 = false) {
  mostrarCarregamento();
  try {
    const isEditing = !!dados;
    if (isItem99 && !dadosItem99Carregados) {
      await carregarDadosParaItem99();
    }

    let itemDetailsForConfig = {
      ...(dados || {}),
      isItem99: isItem99,
      isEditing: isEditing
    };

    if (isItem99 && !isEditing) {
      item99TempCounter++;
    }

    const searchTermsString = isItem99 ? Array.from(termosDeBuscaGlobal).join('; ') : '';
    console.log('[abrirFormularioMaterial] Termos de busca para o novo Item 99:', searchTermsString);

    const config = obterConfigFormularioMaterial(itemDetailsForConfig);
    await abrirFormularioModal("material", config, itemDetailsForConfig, config.descricaoModal);

    const form = document.getElementById("form-dinamico");
    if (form) {
      // Armazena os termos capturados no formulário para uso posterior na submissão.
      if (isItem99) {
        form.dataset.searchTerms = searchTermsString;
      }
      if (dados?.isPortal) {
        form.dataset.source = 'portal';
      } else if (dados && !isItem99) {
        form.dataset.source = 'db';
      }

      if (dados?.linhaId) {
        form.setAttribute("data-linha-edicao", dados.linhaId);
      }
      form.setAttribute("data-original-descricao", dados?.descricao || "");
      $('#despesa', form).trigger('change');
    }
  } catch (error) {
    manipularErro(error, "abrirFormularioMaterial");
  } finally {
    ocultarCarregamento();
  }
}

async function atualizarRegistroSecundario(tabela, descricaoOriginal, novosDados) {
  const tabelaSelector = tabela === 'manutencao' ? '.manutencao-table' : '.abastecimento-table';
  const $tabela = $(tabelaSelector);
  let linhaEncontrada = false;

  $tabela.find('tbody tr').each(function() {
    const $linha = $(this);
    const descricaoLinha = tabela === 'manutencao' ?
      $linha.find('.descricao-item').text().trim() :
      $linha.find('.tipo-item').text().trim();

    if (descricaoLinha === descricaoOriginal) {
      if (tabela === 'manutencao') {
        $linha.find(".data-item").text(novosDados.data);
        $linha.find(".placa-item").text(novosDados.placa);
        $linha.find(".prefixo-item").text(novosDados.prefixo);
        $linha.find(".odometro-item").text(novosDados.odometro);
        $linha.find(".responsavel-item").text(novosDados.responsavel);
        $linha.find(".descricao-item").text(novosDados.descricao);
        $linha.find(".valorUnitario-item").text(formatarNumero(novosDados.valorUnitario, "moeda"));
        $linha.find(".subtotal-item").text(formatarNumero(novosDados.subtotal, "moeda"));
        $linha.find(".notaFiscal-item").text(novosDados.notaFiscal);
      } else { // abastecimento
        $linha.find(".data-item").text(novosDados.data);
        $linha.find(".placa-item").text(novosDados.placa);
        $linha.find(".prefixo-item").text(novosDados.prefixo);
        $linha.find(".odometro-item").text(novosDados.odometro);
        $linha.find(".motorista-item").text(novosDados.motorista);
        $linha.find(".tipo-item").text(novosDados.tipo);
        $linha.find(".quantidade-item").text(formatarNumero(novosDados.quantidade, "decimal"));
        $linha.find(".valorUnitario-item").text(formatarNumero(novosDados.valorUnitario, "moeda"));
        $linha.find(".subtotal-item").text(formatarNumero(novosDados.subtotal, "moeda"));
        $linha.find(".notaFiscal-item").text(novosDados.notaFiscal);
      }
      linhaEncontrada = true;
      return false;
    }
  });

  return linhaEncontrada;
}

async function processarSubmissaoMaterial(dadosForm, linhaEditadaId) {
  try {
    const form = document.getElementById("form-dinamico");
    const isItem99 = dadosForm.codigoItem.startsWith("99") || dadosForm.codigoItem.startsWith("ITEM99P");

    const elementosDespesaPermitidos = [
      '3003', '3004', '3005', '3007', '3008', '3010', '3012', '3015',
      '3016', '3017', '3019', '3020', '3021', '3022', '3023', '3025',
      '3026', '3027', '3032'
    ];

    const elementoDespesaAtualInfo = String(dadosForm.despesa).split(" - ");
    const elementoDespesaAtualCodigo = elementoDespesaAtualInfo[0].trim();

    if (!elementosDespesaPermitidos.includes(elementoDespesaAtualCodigo)) {
      mostrarDialogo(
        "Elemento de Despesa Inválido",
        `O elemento de despesa '${elementoDespesaAtualCodigo}' não pode ser utilizado neste convênio.<br><br>Por favor, selecione um elemento de despesa válido para prosseguir.`
      );
      return; // Impede o salvamento
    }

    if (dadosForm.codigoItem === "") {
      dadosForm.codigoItem = `ITEM99P${String(item99TempCounter).padStart(2, '0')}`;
    }

    const isNewItem99 = !linhaEditadaId && isItem99;
    const isDespesaEspecial = ['3023', '3026'].includes(elementoDespesaAtualCodigo);

    const anexoInput = form.querySelector('#notaFiscalAnexo');
    const file = anexoInput ? anexoInput.files[0] : null;
    if (isNewItem99 && !file) {
      mostrarDialogo("Erro de Validação", "O anexo da nota fiscal é obrigatório para um novo Item 99.");
      return;
    }
    const fileData = file ? await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve({
        base64Data: e.target.result.split(',')[1],
        mimeType: file.type
      });
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    }) : null;

    let observacoesArray = [];
    if (dadosForm.notaFiscal?.trim()) observacoesArray.push(`NFnº.: ${dadosForm.notaFiscal.trim()}`);

    if (isDespesaEspecial) {
      if (dadosForm.placa?.trim()) observacoesArray.push(`Placa: ${dadosForm.placa.trim()}`);
      if (dadosForm.prefixo?.trim()) observacoesArray.push(`Prefixo: ${dadosForm.prefixo.trim()}`);
      if (dadosForm.odometro?.trim()) observacoesArray.push(`Odômetro: ${dadosForm.odometro.trim()}`);
      if (dadosForm.responsavel?.trim()) observacoesArray.push(`Responsável: ${dadosForm.responsavel.trim()}`);
      if (dadosForm.motorista?.trim()) observacoesArray.push(`Motorista: ${dadosForm.motorista.trim()}`);
    }

    if (dadosForm.observacao?.trim()) observacoesArray.push(`Obs.: ${dadosForm.observacao.trim()}`);

    const dadosParaTabela = {
      codigo: dadosForm.codigoItem,
      descricao: dadosForm.descricao || "",
      despesa: dadosForm.despesa || "",
      unidade: dadosForm.unidade || "",
      data: dadosForm.data,
      quantidade: dadosForm.quantidade,
      valorUnitario: dadosForm.valorUnitario,
      subtotal: dadosForm.subtotal,
      observacao: observacoesArray.join("\n"),
      fileData: fileData
    };

    let linhaPrincipal;
    if (linhaEditadaId) {
      linhaPrincipal = document.getElementById(linhaEditadaId);
      if (linhaPrincipal) {
        $(linhaPrincipal).find(".codigo-item").text(dadosParaTabela.codigo);
        $(linhaPrincipal).find(".descricao-item").text(dadosParaTabela.descricao);
        $(linhaPrincipal).find(".despesa-item").text(dadosParaTabela.despesa);
        $(linhaPrincipal).find(".unidade-item").text(dadosParaTabela.unidade);
        $(linhaPrincipal).find(".data-item").text(dadosParaTabela.data);
        $(linhaPrincipal).find(".quantidade-item").text(formatarNumero(dadosParaTabela.quantidade, "decimal"));
        $(linhaPrincipal).find(".valorUnitario-item").text(formatarNumero(dadosParaTabela.valorUnitario, "moeda"));
        $(linhaPrincipal).find(".subtotal-item").text(dadosParaTabela.subtotal);
        $(linhaPrincipal).find(".observacao-item").text(dadosParaTabela.observacao);
      }
    } else {
      const newRowId = await inserirLinhaTabela(dadosParaTabela);
      linhaPrincipal = document.getElementById(newRowId);
    }

    const source = form.dataset.source;
    const isFromPortalOrDb = source === 'portal' || source === 'db';

    if (isFromPortalOrDb) {
      const despesaSelect = form.querySelector("#despesa");
      const unidadeSelect = form.querySelector("#unidade");

      const elementosDespesa = Array.from(despesaSelect.options).map(opt => opt.value).filter(v => v);
      const unidadesFornecimento = Array.from(unidadeSelect.options).map(opt => opt.value).filter(v => v);

      const itemParaSalvar = {
        codigo: dadosForm.codigoItem,
        especificacao: dadosForm.descricao,
        elementosDespesa: elementosDespesa,
        unidadesFornecimento: unidadesFornecimento
      };

      if (typeof itensParaSalvarNaPrimaria !== 'undefined') {
        itensParaSalvarNaPrimaria.push(itemParaSalvar);
      } else {
        console.error('[CLIENT] A variável global "itensParaSalvarNaPrimaria" não foi definida.');
      }
    }

    if (isItem99 && linhaPrincipal) {
      const isEditing = !!linhaEditadaId;
      const searchTermsFromForm = form.dataset.searchTerms || '';
      const itemInfo = {
        isNew: !isEditing
      };

      if (searchTermsFromForm) {
        itemInfo.searchTerms = searchTermsFromForm;
      }

      console.log('[processarSubmissaoMaterial] Setting data-item99-info:', JSON.stringify(itemInfo));
      $(linhaPrincipal).attr('data-item99-info', JSON.stringify(itemInfo));

      if (!isEditing) {
        $(linhaPrincipal).attr('data-item99-placeholder-id', linhaPrincipal.id);
      }
      if (fileData) {
        $(linhaPrincipal).attr('data-file-info', JSON.stringify(fileData));
      }
    }


    if (isDespesaEspecial) {
      const tabelaSecundaria = elementoDespesaAtualCodigo === '3023' ? 'manutencao' : 'abastecimento';
      const dadosParaSecundaria = {
        codigoItem: dadosForm.codigoItem,
        despesa: dadosForm.despesa,
        unidade: dadosForm.unidade,
        data: dadosForm.data,
        placa: dadosForm.placa || '',
        prefixo: dadosForm.prefixo || '',
        odometro: dadosForm.odometro || '',
        responsavel: dadosForm.responsavel || '',
        motorista: dadosForm.motorista || '',
        descricao: dadosForm.descricao,
        tipo: dadosForm.descricao,
        quantidade: dadosForm.quantidade,
        valorUnitario: dadosForm.valorUnitario,
        subtotal: dadosForm.subtotal,
        notaFiscal: dadosForm.notaFiscal || ''
      };

      if (linhaEditadaId) {
        const descricaoOriginal = form.getAttribute("data-original-descricao");
        await atualizarRegistroSecundario(tabelaSecundaria, descricaoOriginal, dadosParaSecundaria);
      } else {
        if (tabelaSecundaria === 'manutencao') {
          await inserirRegistroManutencao(dadosParaSecundaria);
        } else {
          await inserirRegistroAbastecimento(dadosParaSecundaria);
        }
      }

      if (tabelaSecundaria === 'manutencao') {
        await atualizarTotaisInfoManutencao();
        await sincronizarTabelaPrincipalManutencao();
      } else {
        await atualizarTotaisInfoAbastecimento();
        await sincronizarTabelaPrincipalAbastecimento();
      }
    }

    fecharModal();

    if (typeof termosDeBuscaGlobal !== 'undefined') {
      termosDeBuscaGlobal.clear();
    }

  } catch (error) {
    console.error("Erro ao processar submissão de material:", error);
    mostrarDialogo("Erro", "Erro ao processar formulário de material.");
  }
}

async function carregarDadosParaItem99() {
  if (dadosItem99Carregados) return;

  todosElementosDespesa = [
    "3003 - UTENSILIOS PARA COPA, REFEITORIO E COZINHA",
    "3004 - MATERIAL GRAFICO E IMPRESSOS",
    "3005 - MATERIAL PARA ESCRITORIO",
    "3007 - MATERIAL DE ENSINO",
    "3008 - PRODUTOS ALIMENTICIOS",
    "3010 - MATERIAL MEDICO E HOSPITALAR",
    "3012 - MEDICAMENTOS",
    "3015 - MATERIAL FOTOGRAFICO, CINEMATOGRAFICO E DE COMUNICACAO",
    "3016 - MATERIAL DE INFORMATICA",
    "3017 - ARTIGOS PARA LIMPEZA E HIGIENE",
    "3019 - MATERIAL P/ MANUT. E REPAROS DE IMOVEIS DE PROPRIEDADE DA ADM. PUBLICA",
    "3020 - MATERIAL ELETRICO",
    "3021 - MATERIAL P/ MANUT. E REPAROS DE BENS DE DOMINIO PUB. OU DE TERCEIROS",
    "3022 - FERRAMENTAS, FERRAGENS E UTENSILIOS",
    "3023 - MATERIAL PARA MANUTENCAO DE VEICULOS AUTOMOTORES",
    "3025 - MATERIAL DE SEGURANCA, APETRECHOS OPERACIONAIS E POLICIAIS",
    "3026 - COMBUSTIVEIS E LUBRIFICANTES PARA VEICULOS AUTOMOTORES",
    "3027 - COMBUSTIVEIS E LUBRIFICANTES P/ EQUIP. E OUTROS MAT. PERMANENTES",
    "3032 - MATERIAL CIVICO E EDUCATIVO"
  ];

  todasUnidades = [
    "00001 - 1,00 UNIDADE",
    "00037 - 1,00 LITRO"
  ];

  dadosItem99Carregados = true;
  return Promise.resolve();
}
