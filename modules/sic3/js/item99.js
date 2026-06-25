// Arquivo: modules/sic3/js/item99.js
// Controlador da tela de Gerenciamento de Itens 99 da extensão.

var authToken = window.authToken || "";
var mLog = window.mLog || "";
var nUser = window.nUser || "";
var tabelaMateriais;
var item99Selecionado = null;
var idbase = window.idbase || "";

function inicializarPagina() {
    mostrarCarregamento();
    google.script.run
        .withSuccessHandler(response => {
            if (response.success) {
                preencherFiltros(response.metadados);
                preencherTabelaItens99(response.dados);
                carregarCatalogoMateriais();
            } else {
                manipularErro(new Error(response.message), "inicializarPagina");
            }
            ocultarCarregamento();
        })
        .withFailureHandler(err => {
            manipularErro(err, "inicializarPagina");
            ocultarCarregamento();
        })
        .obterDadosItens99(authToken, { ano: new Date().getFullYear(), mes: 'TODOS', municipio: 'TODOS', status: 'pendente' });
    
    configurarEventListeners();
}

function configurarEventListeners() {
    $('#filtro-ano, #filtro-mes, #filtro-municipio, #filtro-status').on('change', function() {
        const filtros = {
            ano: $('#filtro-ano').val(),
            mes: $('#filtro-mes').val(),
            municipio: $('#filtro-municipio').val(),
            status: $('#filtro-status').val()
        };
        mostrarCarregamento();
        google.script.run
            .withSuccessHandler(response => {
                if (response.success) preencherTabelaItens99(response.dados);
                else manipularErro(new Error(response.message), "filtrarDados");
                ocultarCarregamento();
            })
            .withFailureHandler(err => {
                 manipularErro(err, "filtrarDados");
                 ocultarCarregamento();
            })
            .obterDadosItens99(authToken, filtros);
    });

    $('#btn-voltar').on('click', () => {
        mostrarCarregamento();
        if (typeof window.navegarParaSic3 === 'function') {
            window.ocultarCarregamento();
            window.navegarParaSic3('admin', { authToken: authToken, mLog: mLog, nUser: nUser, idbase: idbase });
        } else {
            google.script.run.withSuccessHandler(includeHtmlBody).voltarParaPainelAdmin(authToken);
        }
    });

    $('#btn-sair').on('click', () => {
        mostrarCarregamento();
        if (typeof window.navegarParaSic3 === 'function') {
            window.ocultarCarregamento();
            window.navegarParaSic3('admin', { authToken: authToken, mLog: mLog, nUser: nUser, idbase: idbase });
        } else {
            google.script.run.withSuccessHandler(includeHtmlBody).logoutUser();
        }
    });
}

function preencherFiltros(metadados) {
    const preencher = (id, lista, selecionado) => {
        const select = $(`#${id}`).empty().append('<option value="TODOS">TODOS</option>');
        lista.forEach(item => select.append(`<option value="${item}">${item}</option>`));
        if (selecionado) select.val(selecionado);
    };
    preencher('filtro-ano', metadados.anos, new Date().getFullYear());
    preencher('filtro-mes', ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'], 'TODOS');
    preencher('filtro-municipio', metadados.municipios, 'TODOS');
    preencher('filtro-status', metadados.status, 'pendente');
}

function preencherTabelaItens99(dados) {
    const tbody = $('#tabela-itens-99 tbody').empty();
    if (dados.length === 0) {
        tbody.append('<tr><td colspan="8" style="text-align:center;">Nenhum item encontrado para os filtros selecionados.</td></tr>');
        return;
    }
    dados.forEach(item => {
        const tr = $('<tr>').data('item', item);
        tr.append(
            $('<td>').text(item.timestamp),
            $('<td>').text(item.municipio),
            $('<td>').text(item.ano),
            $('<td>').text(item.mes),
            $('<td>').text(item.codigo),
            $('<td>').text(item.descricao),
            $('<td>').html(`<span class="status-${(item.status||'').toLowerCase().replace('/', '-')}">${item.status}</span>`),
            $('<td>').addClass('cell-actions').append(
                $('<button>').addClass('btn btn-sm btn-primary btn-detalhes').html('<i class="fas fa-search"></i> Detalhes')
            )
        );
        tbody.append(tr);
    });

    $('.btn-detalhes').on('click', function() {
        const item = $(this).closest('tr').data('item');
        exibirDetalhesItem(item);
    });
}

function exibirDetalhesItem(item) {
    item99Selecionado = item;
    $('#container-tabela-principal').hide();
    $('#container-detalhes-item').show();
    
    const botoesAcaoContainer = $('<div>').addClass('detalhes-acoes');
    
    const criarBotao = (classe, icone, texto, handler) => {
        return $('<button>').addClass(`btn ${classe}`).html(`<i class="fas ${icone}"></i> ${texto}`).on('click', handler);
    };

    if (item.status === 'pendente') {
        botoesAcaoContainer.append(
            criarBotao('btn-success btn-aprovar', 'fa-check', 'Aprovar', () => handleAcaoItem('atualizarStatusItem99', [item.codigo, 'aprovado'], 'Item aprovado com sucesso.', item)),
            criarBotao('btn-danger btn-excluir', 'fa-trash', 'Excluir', () => handleAcaoItem('excluirItem99Principal', [item.codigo], 'Item excluído com sucesso.', item))
        );
    } else if (item.status === 'aprovado') {
         botoesAcaoContainer.append(
            criarBotao('btn-success btn-liberar', 'fa-check-double', 'Liberar para Geração de PDF', () => handleAcaoItem('atualizarStatusItem99', [item.codigo, 'aprovado/liberado'], 'Item liberado para geração de PDF.', item)),
            criarBotao('btn-danger btn-excluir', 'fa-trash', 'Excluir', () => handleAcaoItem('excluirItem99Principal', [item.codigo], 'Item excluído com sucesso.', item))
        );
    }
    
    botoesAcaoContainer.append(
        criarBotao('btn-secondary btn-voltar-lista', 'fa-arrow-left', 'Voltar para Lista', () => {
            $('#container-detalhes-item').hide();
            $('#container-tabela-principal').show();
            item99Selecionado = null;
        })
    );

    const detalhesHtml = `
        <div class="detalhes-grid">
            <div><strong>Código:</strong> ${item.codigo}</div>
            <div><strong>Município:</strong> ${item.municipio}</div>
            <div><strong>Convênio:</strong> ${item.convenio}</div>
            <div><strong>Período:</strong> ${item.mes}/${item.ano}</div>
            <div class="full-width"><strong>Descrição:</strong> ${item.descricao}</div>
            <div><strong>Elem. Despesa:</strong> ${item.elementoDespesa}</div>
            <div><strong>Unidade Distrib.:</strong> ${item.unidade}</div>
            <div class="full-width"><strong>Termos Buscados:</strong> ${item.termos || 'N/A'}</div>
            <div class="full-width"><strong>Nota Fiscal:</strong> ${item.linkNotaFiscal ? `<a href="${item.linkNotaFiscal}" target="_blank">Visualizar Anexo</a>` : 'Não disponível'}</div>
        </div>
    `;
    $('#detalhes-item-body').html(detalhesHtml).append(botoesAcaoContainer);
}

async function carregarCatalogoMateriais() {
    try {
        const data = await carregarDadosPlanilha({
            sheetId: idbase,
            sheet: 'tb-primaria',
            query: 'SELECT A, B, C, D'
        });
        if ($.fn.DataTable.isDataTable('#tabelaMateriais')) {
            tabelaMateriais.clear().rows.add(data.slice(1)).draw();
        } else {
            tabelaMateriais = $('#tabelaMateriais').DataTable({
                data: data.slice(1),
                language: { url: "https://cdn.datatables.net/plug-ins/2.0.8/i18n/pt-BR.json" },
                columns: [
                    { title: "Cód. Consumo", data: 0 },
                    { title: "Descrição", data: 1 },
                    { title: "Elemento de Despesa", data: 2, render: (d) => `<select class="form-control-sm dt-select">${criarOpcoesSelect(d)}</select>` },
                    { title: "Unidade", data: 3, render: (d) => `<select class="form-control-sm dt-select">${criarOpcoesSelect(d)}</select>` },
                    { title: "Ação", data: null, orderable: false, render: () => '<button class="btn btn-sm btn-primary btn-substituir"><i class="fas fa-exchange-alt"></i> Substituir</button>' }
                ]
            });
        }
         $('#tabelaMateriais tbody').on('click', '.btn-substituir', function() {
            handleSubstituirItem(this);
        });
    } catch(error) {
        manipularErro(error, 'carregarCatalogoMateriais');
    }
}

function criarOpcoesSelect(data) {
     const opcoes = data ? String(data).split('|').map(s => s.trim()) : [];
     let html = '<option value="">Selecione...</option>';
     opcoes.forEach(opt => { if(opt) html += `<option value="${opt}">${opt}</option>`; });
     return html;
}

async function handleSubstituirItem(buttonElement) {
    const $row = $(buttonElement).closest('tr');
    const rowData = tabelaMateriais.row($row).data();
    const elDespesa = $row.find('select').eq(0).val();
    const unidade = $row.find('select').eq(1).val();

    if (!item99Selecionado) {
        mostrarDialogo('Erro', 'Nenhum "Item 99" selecionado para substituição.');
        return;
    }
    if (!elDespesa || !unidade) {
        mostrarDialogo('Validação', 'Selecione o Elemento de Despesa e a Unidade para o item de consumo.');
        return;
    }

    const dados = {
        item99Codigo: item99Selecionado.codigo,
        itemConsumoCodigo: rowData[0],
        itemConsumoDescricao: rowData[1],
        itemConsumoDespesa: elDespesa,
        itemConsumoUnidade: unidade
    };
    
    const msg = `Confirmar substituição?<br><b>De:</b> Item 99 (${dados.item99Codigo})<br><b>Para:</b> Item Padrão (${dados.itemConsumoCodigo})`;
    const confirmado = await confirmarAcao("Confirmar Ação", msg);
    if(confirmado) {
        handleAcaoItem('substituirItem99', [dados], 'Item substituído com sucesso.', () => {
            $('#container-detalhes-item').hide();
            $('#container-tabela-principal').show();
        });
    }
}

function handleAcaoItem(funcaoServidor, params, msgSucesso, itemOriginal) {
    mostrarCarregamento();
    google.script.run
        .withSuccessHandler(response => {
            ocultarCarregamento();
            if (response.success) {
                mostrarDialogo('Sucesso', msgSucesso, () => {
                    // Atualização da UI pós-sucesso
                    if (funcaoServidor === 'atualizarStatusItem99' && params[1] === 'aprovado') {
                        itemOriginal.status = 'aprovado';
                        exibirDetalhesItem(itemOriginal); // Re-renderiza a seção de detalhes com o botão "Liberar"
                    } else {
                        $('#container-detalhes-item').hide();
                        $('#container-tabela-principal').show();
                        $('#filtro-status').trigger('change'); // Recarrega a lista
                    }
                });
            } else {
                mostrarDialogo('Erro', response.message || 'Ocorreu um erro no servidor.');
            }
        })
        .withFailureHandler(err => {
            manipularErro(err, `handleAcaoItem: ${funcaoServidor}`);
        })
        [funcaoServidor](authToken, ...params);
}

// Inicializa a página
$(document).ready(inicializarPagina);
