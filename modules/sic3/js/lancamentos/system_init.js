async function inicializarSistema() {
  try {
    await executarComCarregamento(async () => {
      await inicializarComponentesGlobais();
      await configurarEventosDados();
      await inicializarDadosEnderecos();
      await carregarInformacoesConvenio();
      await configurarAcaoInicial();
      await configurarEventosFormularioOutros();
      await configurarEventosFormularioMaterial();
    });
  } catch (error) {
    console.error("Erro na inicialização:", error);
    resetarCarregamento();
    mostrarDialogo("Erro de Inicialização", "Ocorreu um erro ao carregar o aplicativo. Por favor, recarregue a página.");
  }
}

async function carregarInformacoesConvenio() {
  try {
    const convenioInfo = await carregarInformacoes();
    if (!convenioInfo?.convenios?.[0]) {
      throw new Error("Não foi possível carregar as informações do convênio");
    }
    const cItem = convenioInfo.convenios.find(c => c.convenio === convenio) || convenioInfo.convenios[0];

    preposto_n = cItem.preposto_n;
    preposto_pg = cItem.preposto_pg;
    preposto = cItem.preposto;

    $("#ano-info").val(ano);
    $("#mes-info").val(mes);
    $("#municipio-info").val(municipio);
    $("#convenio-info-val").val(cItem.convenio);
    $("#preposto-info").val(cItem.preposto_n ? `nº PM ${cItem.preposto_n} - ${cItem.preposto_pg} ${cItem.preposto}` : "");
    $("#unidade-info").val(cItem.unidade);
  } catch (error) {
    console.error("Erro ao carregar informações do convênio:", error);
    manipularErro(error, "carregarInformacoesConvenio");
    throw new Error("Não foi possível carregar as informações do convênio");
  }
}

async function configurarAcaoInicial() {
  switch (acao) {
    case "editar":
      $(".btn-editarDados").show();
      await carregarRelatorio();
      break;
    case "lancar":
      await editarRelatorio();
      break;
    case "visualizar":
      await carregarRelatorio();
      break;
  }
}

async function carregarInformacoes() {
  try {
    const conveniosData = await carregarDadosPlanilha({
      sheetId: idbase,
      sheet: "convenios",
      query: `SELECT A,B,C,D,E,F WHERE A='${municipio}' AND B='${convenio}'`
    });
    const resultado = { convenios: [] };
    conveniosData.forEach((row) => {
      const [municipioAtual, convenioNum, preposto_n_val, preposto_pg_val, preposto_val, unidade_val] = row;
      resultado.convenios.push({
        municipio: municipioAtual,
        convenio: convenioNum,
        preposto_n: preposto_n_val,
        preposto_pg: preposto_pg_val,
        preposto: preposto_val,
        unidade: unidade_val
      });
    });
    return resultado;
  } catch (error) {
    console.error("Erro ao carregar informações:", error);
    manipularErro(error, "carregarInformacoes");
    throw new Error("Não foi possível carregar as informações necessárias");
  }
}

async function carregarRelatorio() {
  return executarComCarregamento(async () => {
    try {
      const dados = await buscarDadosRelatorio();
      if (!dados) throw new Error("Não foi possível carregar os dados");

      valoresOriginais = {
        principal: dados.principal || [],
        abastecimento: dados.abastecimento || [],
        manutencao: dados.manutencao || [],
        obsgeral: dados.obsgeral || { texto: "" }
      };

      const promises = [];
      if(dados.abastecimento?.length && typeof preencherTabelaAbastecimento === 'function') promises.push(preencherTabelaAbastecimento(dados.abastecimento));
      if(dados.manutencao?.length && typeof preencherTabelaManutencao === 'function') promises.push(preencherTabelaManutencao(dados.manutencao));
      promises.push(preencherTabelaPrincipal(dados.principal || []));
      
      $(".obsgeral").text(dados.obsgeral.texto || "SEM OBSERVACOES");
      
      promises.push(atualizarTotaisInfoAbastecimento());
      promises.push(atualizarTotaisInfoManutencao());
      
      await Promise.all(promises);
      $(".acao-item").hide();

    } catch (error) {
      manipularErro(error, "carregarRelatorio");
    }
  });
}

async function tratarCliqueGlobal(event) {
  try {
    if (!$(event.target).closest('.outrosDropdown-toggle').length) {
      $(".outrosDropdown-content").slideUp();
    }

    const target = event.target.closest("button, a");
    if (!target) return;

    if (!target.hasAttribute('download') && target.getAttribute('href') !== '#' && !target.classList.contains('btn-sair')) {
      event.preventDefault();
    }

    switch (true) {
      case target.matches(".btn-voltar"):
        const temEdicaoVoltar = document.querySelector('.obsgeral.editavel') !== null;
        if (temEdicaoVoltar) {
          const confirmado = await confirmarAcao("Confirmação", "Todas as alterações não salvas serão perdidas. Deseja realmente sair?");
          if (!confirmado) return;
        }
        navegarPara("voltar");
        break;
      case target.matches(".btn-sair"):
        sessionStorage.removeItem('authToken');
        navegarPara("sair");
        break;
      case target.matches(".btn-infoConvenio"):
        $(".convenio-info").slideToggle();
        break;
      case target.matches(".btn-editarDados"):
        editarRelatorio();
        break;
      case target.matches(".btn-salvarDados"):
        salvarDados();
        break;
      case target.matches(".btn-cancelarEdicao"):
        cancelarEdicao();
        break;
      case target.matches(".btn-inserirAbastecimento"):
        abrirFormularioAbastecimento();
        break;
      case target.matches(".btn-inserirManutencao"):
        abrirFormularioManutencao();
        break;
      case target.matches(".abastecimento-container .btn-expandir-recolher"):
        $(".abastecimento-table").slideToggle();
        break;
      case target.matches(".manutencao-container .btn-expandir-recolher"):
        $(".manutencao-table").slideToggle();
        break;
      case target.matches(".outrosDropdown-toggle"):
        $(".outrosDropdown-content").slideToggle();
        break;
      case target.matches(".outrosDropdown-content a"):
        const codigoOutroItem = target.dataset.tipo;
        if (codigoOutroItem && typeof abrirFormularioOutrosItens === 'function') {
          try {
            abrirFormularioOutrosItens(codigoOutroItem);
          } catch (error) {
            console.error("Erro ao abrir formulário:", error);
            mostrarDialogo("Erro", "Não foi possível iniciar o lançamento: " + error.message);
          }
        }
        break;
      case target.matches("button i"):
        event.preventDefault();
        $(target).parent().trigger("click");
        break;
    }
  } catch (error) {
    manipularErro(error, "tratarCliqueGlobal");
    mostrarDialogo("Erro", "Ocorreu um erro ao processar sua ação. Por favor, tente novamente.");
  }
}

$(document).ready(async () => {
  mostrarCarregamento();
  const buttons = document.querySelectorAll("button");
  buttons.forEach((button) => (button.disabled = true));

  try {
    await inicializarSistema();
     buttons.forEach((button) => {
        if (!button.closest('.dataTables_wrapper')) {
             button.disabled = false;
        }
    });
    if (typeof acao !== 'undefined') {
        if (acao === 'visualizar') {
            $('.btn-editarDados, .btn-salvarDados, .btn-cancelarEdicao, .btn-inserirAbastecimento, .btn-inserirManutencao, .outrosDropdown-toggle, .pesquisa-container').prop('disabled', true).hide();
            $('.acao-item').hide();
        } else if (acao === 'editar') {
            $('.btn-editarDados').prop('disabled', false).show();
        }
    }
  } catch (error) {
    console.error("Erro fatal na inicialização:", error);
    mostrarDialogo("Erro Fatal", "Não foi possível inicializar o aplicativo. Por favor, tente novamente mais tarde.");
  } finally {
    ocultarCarregamento();
  }
});
