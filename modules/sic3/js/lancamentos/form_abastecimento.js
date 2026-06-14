function obterConfigFormularioAbastecimento() {
  return {
    descricaoModal: "ABASTECIMENTO DE VIATURA",
    campos: [
      { id: "tipo", label: "Tipo de Combustível", tipo: "select", opcoes: [ { value: "ABASTECIMENTO - TIPO: GASOLINA", label: "ABASTECIMENTO - TIPO: GASOLINA" }, { value: "ABASTECIMENTO - TIPO: OLEO DIESEL", label: "ABASTECIMENTO - TIPO: OLEO DIESEL" }, { value: "ABASTECIMENTO - TIPO: ALCOOL", label: "ABASTECIMENTO - TIPO: ALCOOL" } ], fullWidth: true },
      { id: "data", label: "Data do Abastecimento", tipo: "date" },
      { id: "hora", label: "Hora do Abastecimento", tipo: "time" },
      { id: "notaFiscal", label: "Nº Nota Fiscal", tipo: "text" },
      { id: "placa", label: "Placa", tipo: "text" },
      { id: "prefixo", label: "Prefixo VTR", tipo: "text" },
      { id: "odometro", label: "Odômetro", tipo: "text" },
      { id: "motorista", label: "Motorista (Nº PM)", tipo: "text" },
      { id: "quantidade", label: "Quantidade (Litros)", tipo: "text", placeholder: "0,00" },
      { id: "valorTotal", label: "Valor Total Pago (R$)", tipo: "text", placeholder: "0,00" }
    ]
  };
}

async function atualizarTotaisInfoAbastecimento() {
  const qtdAbastecimento = $(".abastecimento-table tbody tr").toArray()
    .reduce((sum, row) => sum + formatarNumero($(row).find(".quantidade-item").text(), "numero"), 0);
  const valorAbastecimento = $(".abastecimento-table tbody tr").toArray()
    .reduce((sum, row) => sum + formatarNumero($(row).find(".subtotal-item").text(), "numero"), 0);
  $(".abastecimento-info .total-quantidade").text(formatarNumero(qtdAbastecimento, "decimal"));
  $(".abastecimento-info .total-valor").text(formatarNumero(valorAbastecimento, "moeda"));
}

async function inserirRegistroAbastecimento(dados) {
  try {
    const container = document.querySelector(".abastecimento-container");
     if (container) {
        container.style.display = "block";
        const table = container.querySelector(".abastecimento-table");
        if (table) table.style.display = "block";
    }
    const row = criarLinhaRegistroAbastecimento(dados);
    const tbody = $(".abastecimento-table tbody");
    tbody.append(row);
    if (typeof ordenarTabelaAbastecimentoDOM === 'function') ordenarTabelaAbastecimentoDOM();
    await atualizarTotaisInfoAbastecimento();
    return true;
  } catch (error) {
    console.error("Erro ao inserir registro de abastecimento:", error);
    mostrarDialogo("Erro", "Não foi possível inserir o registro de abastecimento");
    return false;
  }
}

async function processarSubmissaoAbastecimento(dadosForm, linhaEditadaId) {
  try {
    const dadosRegistro = {
      ...dadosForm,
      despesa: '3026 - COMBUSTIVEIS E LUBRIFICANTES PARA VEICULOS AUTOMOTORES',
      unidade: '00037 - 1,00 LITRO'
    };

    if (linhaEditadaId) {
      const linhaEditada = document.getElementById(linhaEditadaId);
      if (linhaEditada) {
        $(linhaEditada).find(".data-item").text(dadosRegistro.data);
        $(linhaEditada).find(".hora-item").text(dadosRegistro.hora || "-");
        $(linhaEditada).find(".placa-item").text(dadosRegistro.placa);
        $(linhaEditada).find(".prefixo-item").text(dadosRegistro.prefixo);
        $(linhaEditada).find(".odometro-item").text(dadosRegistro.odometro);
        $(linhaEditada).find(".motorista-item").text(dadosRegistro.motorista);
        $(linhaEditada).find(".tipo-item").text(dadosRegistro.tipo);
        $(linhaEditada).find(".quantidade-item").text(formatarNumero(dadosRegistro.quantidade, "decimal"));
        $(linhaEditada).find(".valorUnitario-item").text(formatarNumero(dadosRegistro.valorUnitario, "moeda"));
        $(linhaEditada).find(".subtotal-item").text(formatarNumero(dadosRegistro.subtotal, "moeda"));
        $(linhaEditada).find(".notaFiscal-item").text(dadosRegistro.notaFiscal);
      }
      if (typeof ordenarTabelaAbastecimentoDOM === 'function') ordenarTabelaAbastecimentoDOM();
    } else {
      await inserirRegistroAbastecimento(dadosRegistro);
    }
    await atualizarTotaisInfoAbastecimento();
    await sincronizarTabelaPrincipalAbastecimento();
    fecharModal();
    if (typeof window.salvarBackupLocal === 'function') window.salvarBackupLocal();
  } catch (error) {
    console.error("Erro ao processar submissão de abastecimento:", error);
    mostrarDialogo("Erro", "Erro ao processar formulário de abastecimento");
  }
}

async function editarRegistroAbastecimento(row) {
    if (!row) return;
    if (!row.id) row.id = "linha-abastecimento-" + Date.now();
    
    const $row = $(row);
    const tipoCombustivel = $row.find(".tipo-item").text().trim();
    const chaveDescricao = tipoCombustivel;
    
    const combustiveisPrincipais = ["ABASTECIMENTO - TIPO: GASOLINA", "ABASTECIMENTO - TIPO: ALCOOL", "ABASTECIMENTO - TIPO: OLEO DIESEL"];
    const isCombustivelPrincipal = combustiveisPrincipais.includes(tipoCombustivel);
    
    const $principalRow = encontrarDadosPrincipaisPorDescricao(chaveDescricao, true);
    
    if (isCombustivelPrincipal) {
        await abrirFormularioAbastecimento({
            data: $row.find(".data-item").text(),
            hora: $row.find(".hora-item").text(),
            placa: $row.find(".placa-item").text(),
            prefixo: $row.find(".prefixo-item").text(),
            odometro: $row.find(".odometro-item").text(),
            motorista: $row.find(".motorista-item").text(),
            tipo: tipoCombustivel,
            quantidade: formatarNumero($row.find(".quantidade-item").text(), "decimal"),
            valorTotal: formatarNumero($row.find(".subtotal-item").text(), "decimal"),
            notaFiscal: $row.find(".notaFiscal-item").text()
        });
        const form = document.getElementById("form-dinamico");
        if (form) {
          form.setAttribute("data-linha-edicao", row.id);
        }
    } else {
        if ($principalRow) {
            const dadosPrincipais = await extrairDadosLinhaMaterial($principalRow[0]);
             if (!$principalRow[0].id) {
                 $principalRow[0].id = "linha-principal-" + Math.random().toString(36).substr(2, 9);
             }
            dadosPrincipais.linhaId = $principalRow[0].id;

            const dadosAbastecimento = {
                data: $row.find(".data-item").text(),
                placa: $row.find(".placa-item").text(),
                prefixo: $row.find(".prefixo-item").text(),
                odometro: $row.find(".odometro-item").text(),
                motorista: $row.find(".motorista-item").text(),
                notaFiscal: $row.find(".notaFiscal-item").text()
            };
            
            const dadosCompletos = { ...dadosPrincipais, ...dadosAbastecimento, isEditing: true };
            await abrirFormularioMaterial(dadosCompletos, dadosCompletos.isItem99);
            
            const form = document.getElementById("form-dinamico");
            if (form) {
                form.setAttribute("data-linha-edicao", dadosPrincipais.linhaId);
            }
        }
    }
}


function criarLinhaRegistroAbastecimento(dados) {
  const row = document.createElement("tr");
   if (!row.id) row.id = "linha-abastecimento-dynamic-" + Date.now();
  const tbody = document.querySelector(".abastecimento-table tbody");
  const sequencial = tbody ? tbody.children.length + 1 : 1;
  const colunas = [
    { classe: "numero-item", valor: sequencial },
    { classe: "data-item", valor: dados.data },
    { classe: "hora-item", valor: dados.hora || "-" },
    { classe: "placa-item", valor: dados.placa },
    { classe: "prefixo-item", valor: dados.prefixo },
    { classe: "odometro-item", valor: dados.odometro },
    { classe: "motorista-item", valor: dados.motorista },
    { classe: "tipo-item", valor: dados.tipo },
    { classe: "quantidade-item", valor: formatarNumero(dados.quantidade, "decimal") },
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

  const codigoPorTipo = {
    "ABASTECIMENTO - TIPO: GASOLINA": "000715298",
    "ABASTECIMENTO - TIPO: ALCOOL": "000715301",
    "ABASTECIMENTO - TIPO: OLEO DIESEL": "001325876"
  };

  $(row).attr('data-codigo', dados.codigoItem || dados.codigo || codigoPorTipo[dados.tipo] || 'O33903026');
  $(row).attr('data-despesa', dados.despesa || '3026 - COMBUSTIVEIS E LUBRIFICANTES PARA VEICULOS AUTOMOTORES');
  $(row).attr('data-unidade', dados.unidade || '00037 - 1,00 LITRO');

  row.querySelector(".btn-editar").addEventListener("click", () => editarRegistroAbastecimento(row));
  row.querySelector(".btn-excluir").addEventListener("click", async () => {
    const confirmado = await confirmarExclusao("Deseja realmente excluir este abastecimento?");
    if (confirmado) {
      row.remove();
      await atualizarTotaisInfoAbastecimento();
      await sincronizarTabelaPrincipalAbastecimento();
      atualizarVisibilidadeContainers();
      if (typeof window.salvarBackupLocal === 'function') window.salvarBackupLocal();
    }
  });
  return row;
}

async function sincronizarTabelaPrincipalAbastecimento() {
    const infoPrincipalMap = new Map();
    $('.principal-table tbody tr').each(function() {
        const $row = $(this);
        const despesa = $row.find('.despesa-item').text();
        if (despesa.includes("3026")) {
            const descricao = $row.find('.descricao-item').text().trim();
            infoPrincipalMap.set(descricao, {
                codigo: $row.find('.codigo-item').text(),
                despesa: despesa,
                unidade: $row.find('.unidade-item').text()
            });
        }
    });

    const registrosAbastecimento = Array.from(document.querySelectorAll(".abastecimento-table tbody tr"));
    
    const gruposPorDescricao = registrosAbastecimento.reduce((acc, row) => {
        const $row = $(row);
        const descricao = $row.find('.tipo-item').text().trim();
        const chaveGrupo = descricao;
        
        if (!acc[chaveGrupo]) {
            const infoExistente = infoPrincipalMap.get(chaveGrupo);
            if(infoExistente){
                acc[chaveGrupo] = {
                    rows: [],
                    codigo: infoExistente.codigo,
                    despesa: infoExistente.despesa,
                    unidade: infoExistente.unidade
                };
            } else {
                const codigoPorTipo = {
                    "ABASTECIMENTO - TIPO: GASOLINA": "000715298",
                    "ABASTECIMENTO - TIPO: ALCOOL": "000715301",
                    "ABASTECIMENTO - TIPO: OLEO DIESEL": "001325876"
                };
                acc[chaveGrupo] = {
                    rows: [],
                    codigo: $row.attr('data-codigo') || codigoPorTipo[chaveGrupo],
                    despesa: $row.attr('data-despesa'),
                    unidade: $row.attr('data-unidade')
                };
            }
        }
        acc[chaveGrupo].rows.push(row);
        return acc;
    }, {});

    $('.principal-table tbody tr').each(function() {
        const despesaRow = $(this).find('.despesa-item').text();
        if (despesaRow.includes("3026")) {
          $(this).remove();
        }
    });

    for (const descricao in gruposPorDescricao) {
        const grupo = gruposPorDescricao[descricao];
        const { totalQuantidade, totalSubtotal, dataMaisRecente, observacoes } = agregarDadosGrupo(grupo.rows);
        const valorUnitarioMedio = totalSubtotal / (totalQuantidade || 1);

        const dadosParaTabelaPrincipal = {
            codigo: grupo.codigo,
            descricao: descricao,
            despesa: grupo.despesa,
            unidade: grupo.unidade,
            data: dataMaisRecente,
            quantidade: totalQuantidade,
            valorUnitario: valorUnitarioMedio,
            subtotal: totalSubtotal,
            observacao: observacoes,
            source: 'abastecimento'
        };
        await criarOuAtualizarLinhaPrincipal(descricao, dadosParaTabelaPrincipal);
    }
    
    await calcularTotalTabela();
}


async function preencherTabelaAbastecimento(dados) {
  $(".abastecimento-container .filtro-tabela").val("");
  if (!dados?.length) {
    $(".abastecimento-table tbody").empty();
    await atualizarTotaisInfoAbastecimento();
    return;
  }
  const tbody = $(".abastecimento-table tbody");
  tbody.empty();
  for (const registro of dados) {
    const row = criarLinhaRegistroAbastecimento(registro);
    tbody.append(row);
  }
  if (typeof ordenarTabelaAbastecimentoDOM === 'function') ordenarTabelaAbastecimentoDOM();
  await atualizarTotaisInfoAbastecimento();
}

function abrirFormularioAbastecimento(dados = null) {
  const config = obterConfigFormularioAbastecimento();
  abrirFormularioModal("abastecimento", config, dados, config.descricaoModal);
}
