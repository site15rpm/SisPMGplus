function obterConfigFormularioManutencao() {
  return {
    descricaoModal: "MAO DE OBRA - SERVICO DE MANUTENCAO DE VIATURA",
    campos: [
      { id: "data", label: "Data do Serviço", tipo: "date" },
      { id: "notaFiscal", label: "Nº Nota Fiscal", tipo: "text" },
      { id: "placa", label: "Placa VTR", tipo: "text" },
      { id: "prefixo", label: "Prefixo VTR", tipo: "text" },
      { id: "odometro", label: "Odômetro", tipo: "text" },
      { id: "responsavel", label: "Nº PM Responsável", tipo: "text" },
      { id: "descricao", label: "Descrição do Serviço", tipo: "text", fullWidth: true },
      { id: "quantidade", label: "Quantidade", tipo: "text", disabled: true, valor: "1,00" },
      { id: "valorTotal", label: "Valor Total do Serviço (R$)", tipo: "text", placeholder: "0,00" }
    ]
  };
}

async function atualizarTotaisInfoManutencao() {
  const qtdManutencao = $(".manutencao-table tbody tr").toArray()
    .reduce((sum, row) => sum + formatarNumero($(row).find(".quantidade-item").text(), "numero"), 0);
  const valorManutencao = $(".manutencao-table tbody tr").toArray()
    .reduce((sum, row) => sum + formatarNumero($(row).find(".subtotal-item").text(), "numero"), 0);

  $(".manutencao-info .total-quantidade").text(formatarNumero(qtdManutencao));
  $(".manutencao-info .total-valor").text(formatarNumero(valorManutencao, "moeda"));
}

async function inserirRegistroManutencao(dados) {
  try {
    const container = document.querySelector(".manutencao-container");
     if (container) {
        container.style.display = "block";
        const table = container.querySelector(".manutencao-table");
        if (table) table.style.display = "block";
    }
    const row = criarLinhaRegistroManutencao(dados);
    const tbody = $(".manutencao-table tbody");
    tbody.append(row);
    if (typeof ordenarTabelaManutencaoDOM === 'function') ordenarTabelaManutencaoDOM();
    await atualizarTotaisInfoManutencao();
    return true;
  } catch (error) {
    console.error("Erro ao inserir registro de manutenção:", error);
    mostrarDialogo("Erro", "Não foi possível inserir o registro de manutenção");
    return false;
  }
}

async function processarSubmissaoManutencao(dadosForm, linhaEditadaId) {
  try {
    const dadosRegistro = {
      ...dadosForm,
      codigoItem: "000025593", 
      quantidade: "1,00",
      descricao: dadosForm.descricao,
      despesa: '3918 - REPAROS DE VEICULOS',
      unidade: '00001 - 1,00 UNIDADE'
    };

    if (linhaEditadaId) {
      const linhaEditada = document.getElementById(linhaEditadaId);
      if (linhaEditada) {
        $(linhaEditada).find(".data-item").text(dadosRegistro.data);
        $(linhaEditada).find(".placa-item").text(dadosRegistro.placa);
        $(linhaEditada).find(".prefixo-item").text(dadosRegistro.prefixo);
        $(linhaEditada).find(".odometro-item").text(dadosRegistro.odometro);
        $(linhaEditada).find(".responsavel-item").text(dadosRegistro.responsavel);
        $(linhaEditada).find(".descricao-item").text(dadosRegistro.descricao);
        $(linhaEditada).find(".quantidade-item").text(formatarNumero(dadosRegistro.quantidade, "decimal"));
        $(linhaEditada).find(".valorUnitario-item").text(formatarNumero(dadosRegistro.valorUnitario, "moeda"));
        $(linhaEditada).find(".subtotal-item").text(formatarNumero(dadosRegistro.subtotal, "moeda"));
        $(linhaEditada).find(".notaFiscal-item").text(dadosRegistro.notaFiscal);
      }
      if (typeof ordenarTabelaManutencaoDOM === 'function') ordenarTabelaManutencaoDOM();
    } else {
      await inserirRegistroManutencao(dadosRegistro);
    }
    await atualizarTotaisInfoManutencao();
    await sincronizarTabelaPrincipalManutencao();
    fecharModal();
    if (typeof window.salvarBackupLocal === 'function') window.salvarBackupLocal();
  } catch (error) {
    console.error("Erro ao processar submissão de manutenção:", error);
    mostrarDialogo("Erro", "Erro ao processar formulário de manutenção");
  }
}

async function editarRegistroManutencao(row) {
    if (!row) return;
    if (!row.id) row.id = "linha-manutencao-" + Date.now();
    
    const $row = $(row);
    const descricaoManutencao = $row.find(".descricao-item").text().trim();
    const $principalRow = encontrarDadosPrincipaisPorDescricao(descricaoManutencao, true);

    if ($principalRow && $principalRow.length > 0) {
        const despesaPrincipal = $principalRow.find('.despesa-item').text();
        
        if (despesaPrincipal && (despesaPrincipal.includes("3023") || despesaPrincipal.includes("3026"))) {
            const dadosPrincipais = await extrairDadosLinhaMaterial($principalRow[0]);
            
            if (!$principalRow[0].id) {
                $principalRow[0].id = "linha-principal-" + Math.random().toString(36).substr(2, 9);
            }
            dadosPrincipais.linhaId = $principalRow[0].id;

            const dadosManutencao = {
                data: $row.find(".data-item").text(),
                placa: $row.find(".placa-item").text(),
                prefixo: $row.find(".prefixo-item").text(),
                odometro: $row.find(".odometro-item").text(),
                responsavel: $row.find(".responsavel-item").text(),
                notaFiscal: $row.find(".notaFiscal-item").text(),
            };
            
            const dadosCompletos = { ...dadosPrincipais, ...dadosManutencao, isEditing: true };
            
            await abrirFormularioMaterial(dadosCompletos, dadosCompletos.isItem99);
            
            const form = document.getElementById("form-dinamico");
            if (form) {
                form.setAttribute("data-linha-edicao", dadosPrincipais.linhaId);
            }
            return;
        }
    }

    const dadosFormularioServico = {
        data: $row.find(".data-item").text(),
        placa: $row.find(".placa-item").text(),
        prefixo: $row.find(".prefixo-item").text(),
        odometro: $row.find(".odometro-item").text(),
        responsavel: $row.find(".responsavel-item").text(),
        descricao: descricaoManutencao,
        valorTotal: formatarNumero($row.find(".subtotal-item").text(), "decimal"),
        notaFiscal: $row.find(".notaFiscal-item").text()
    };
    
    await abrirFormularioManutencao(dadosFormularioServico);
    
    const form = document.getElementById("form-dinamico");
    if (form) {
        form.setAttribute("data-linha-edicao", row.id);
    }
}


function criarLinhaRegistroManutencao(dados) {
  const row = document.createElement("tr");
  if (!row.id) row.id = "linha-manutencao-dynamic-" + Date.now();
  const tbody = document.querySelector(".manutencao-table tbody");
  const sequencial = tbody ? tbody.children.length + 1 : 1;
  const colunas = [
    { classe: "numero-item", valor: sequencial },
    { classe: "data-item", valor: dados.data },
    { classe: "placa-item", valor: dados.placa },
    { classe: "prefixo-item", valor: dados.prefixo },
    { classe: "odometro-item", valor: dados.odometro },
    { classe: "responsavel-item", valor: dados.responsavel },
    { classe: "descricao-item", valor: dados.descricao },
    { classe: "quantidade-item", valor: formatarNumero(dados.quantidade || "1,00", "decimal") },
    { classe: "valorUnitario-item", valor: formatarNumero(dados.valorUnitario, "moeda") },
    { classe: "subtotal-item", valor: formatarNumero(dados.subtotal, "moeda") },
    { classe: "notaFiscal-item", valor: dados.notaFiscal }
  ];
  row.innerHTML = colunas.map(col => `<td class="${col.classe}">${col.valor}</td>`).join("");
  row.innerHTML += `
    <td class="acao-item" style="display: table-cell;">
      <button type="button" class="btn-editar btn-warning" title="Editar"><i class="fas fa-edit"></i></button>
      <button type="button" class="btn-excluir btn-danger" title="Excluir"><i class="fas fa-trash"></i></button>
    </td>`;
    
  $(row).attr('data-codigo', dados.codigoItem || dados.codigo || '000025593');
  $(row).attr('data-despesa', dados.despesa || '3918 - REPAROS DE VEICULOS');
  $(row).attr('data-unidade', dados.unidade || '00001 - 1,00 UNIDADE');

  row.querySelector(".btn-editar").addEventListener("click", () => editarRegistroManutencao(row));
  row.querySelector(".btn-excluir").addEventListener("click", async () => {
    const confirmado = await confirmarExclusao("Deseja realmente excluir esta manutenção?");
    if (confirmado) {
      row.remove();
      await atualizarTotaisInfoManutencao();
      await sincronizarTabelaPrincipalManutencao();
      atualizarVisibilidadeContainers();
      if (typeof window.salvarBackupLocal === 'function') window.salvarBackupLocal();
    }
  });
  return row;
}

async function sincronizarTabelaPrincipalManutencao() {
    const infoPrincipalMap = new Map();
    $('.principal-table tbody tr').each(function() {
        const $row = $(this);
        const despesa = $row.find('.despesa-item').text();
        if (despesa.includes("3023") || despesa.includes("3918")) {
            const descricao = $row.find('.descricao-item').text().trim();
            infoPrincipalMap.set(descricao, {
                codigo: $row.find('.codigo-item').text(),
                despesa: despesa,
                unidade: $row.find('.unidade-item').text()
            });
        }
    });

    const registrosManutencao = Array.from(document.querySelectorAll(".manutencao-table tbody tr"));
    const chaveMaoDeObra = "MAO DE OBRA - SERVICO DE MANUTENCAO DE VIATURA";
    const prefixoMaoDeObra = "MAO DE OBRA - SERVICO DE ";

    const grupos = registrosManutencao.reduce((acc, row) => {
        const $row = $(row);
        const descricao = $row.find('.descricao-item').text().trim();
        const isMaoDeObra = descricao.startsWith(prefixoMaoDeObra);
        const chaveGrupo = isMaoDeObra ? chaveMaoDeObra : descricao;

        if (!acc[chaveGrupo]) {
            const infoExistente = infoPrincipalMap.get(chaveGrupo);
            
            if (infoExistente) {
                acc[chaveGrupo] = {
                    rows: [],
                    codigo: infoExistente.codigo,
                    despesa: infoExistente.despesa,
                    unidade: infoExistente.unidade
                };
            } else {
                acc[chaveGrupo] = {
                    rows: [],
                    codigo: $row.attr('data-codigo') || '000025593',
                    despesa: $row.attr('data-despesa') || '3918 - REPAROS DE VEICULOS',
                    unidade: $row.attr('data-unidade') || '00001 - 1,00 UNIDADE'
                };
            }
        }
        acc[chaveGrupo].rows.push(row);
        return acc;
    }, {});

    $('.principal-table tbody tr').each(function() {
        const despesaRow = $(this).find('.despesa-item').text();
        if (despesaRow.includes("3023") || despesaRow.includes("3918")) {
            $(this).remove();
        }
    });

    for (const chave in grupos) {
        const grupo = grupos[chave];
        const { totalQuantidade, totalSubtotal, dataMaisRecente, observacoes } = agregarDadosGrupo(grupo.rows);
        const valorUnitarioMedio = totalSubtotal / (totalQuantidade || 1);

        const dadosParaTabelaPrincipal = {
            codigo: grupo.codigo,
            descricao: chave,
            despesa: grupo.despesa,
            unidade: grupo.unidade,
            data: dataMaisRecente,
            quantidade: totalQuantidade,
            valorUnitario: valorUnitarioMedio,
            subtotal: totalSubtotal,
            observacao: observacoes,
            source: 'manutencao'
        };
        await criarOuAtualizarLinhaPrincipal(chave, dadosParaTabelaPrincipal);
    }
    
    await calcularTotalTabela();
}


async function preencherTabelaManutencao(dados) {
  $(".manutencao-container .filtro-tabela").val("");
  if (!dados?.length) {
    $(".manutencao-table tbody").empty();
    await atualizarTotaisInfoManutencao();
    return;
  }
  const tbody = $(".manutencao-table tbody");
  tbody.empty();
  for (const registro of dados) {
    const row = criarLinhaRegistroManutencao(registro);
    tbody.append(row);
  }
  if (typeof ordenarTabelaManutencaoDOM === 'function') ordenarTabelaManutencaoDOM();
  await atualizarTotaisInfoManutencao();
}

async function abrirFormularioManutencao(dados = null) {
  const config = obterConfigFormularioManutencao();
  await abrirFormularioModal("manutencao", config, dados, config.descricaoModal);
  
  const form = document.getElementById("form-dinamico");
  const descInput = form?.querySelector("#descricao");

  if (descInput) {
    const prefixo = "MAO DE OBRA - SERVICO DE ";
    const valorInicialSemPrefixo = dados?.descricao ? dados.descricao.replace(prefixo, '') : "";
    
    descInput.value = prefixo + valorInicialSemPrefixo;

    $(descInput).data('lastValue', descInput.value);
    
    $(descInput).off('.prefixo');

    $(descInput).on('input.prefixo', function() {
      if (!this.value.startsWith(prefixo)) {
        this.value = $(this).data('lastValue');
      } else {
        $(this).data('lastValue', this.value);
      }
    });

    $(descInput).on('keydown.prefixo', function(e) {
      if ( (e.key === 'Backspace' && this.selectionStart <= prefixo.length) || (e.key === 'Delete' && this.selectionStart < prefixo.length) ) {
        e.preventDefault();
      }
    });

    const reposicionarCursor = (e) => {
        const input = e.target;
        if (input.selectionStart < prefixo.length) {
            input.setSelectionRange(prefixo.length, Math.max(prefixo.length, input.selectionEnd));
        }
    };
    $(descInput).on('focus.prefixo click.prefixo keyup.prefixo', reposicionarCursor);

    descInput.setSelectionRange(descInput.value.length, descInput.value.length);
  }
}
