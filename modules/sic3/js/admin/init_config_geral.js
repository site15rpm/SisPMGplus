// ===================== CONFIGURAÇÃO INICIAL =====================
var ADMIN_CONFIG = {
  adminInicializado: false,
  lancamentosCarregados: false,
  dados: {
    convenios: [],
    lancamentos: [],
    anos: [],
  },
  estados: {
    carregando: 0,
    telaAtual: "lancamentos",
  },
};

// Grupo 1: Inicialização e Configuração Geral

async function inicializarAdmin() {
  try {
    mostrarCarregamento();
    if (!ADMIN_CONFIG.adminInicializado) {
      await carregarInformacoesAdmin();
      await configurarEventListenersAdmin();
      ADMIN_CONFIG.adminInicializado = true;
    }

    if (!$("#mes").data("previous-value-static")) {
      $("#mes").data("previous-value-static", $("#mes").val());
    }
    if (!$("#municipio").data("previous-value-static")) {
      $("#municipio").data("previous-value-static", $("#municipio").val());
    }

    selecionarMesAutomatico();
    restaurarSelecaoUsuario();

    alternarVisualizacaoTela("lancamentos");

    ocultarCarregamento();
    return true;
  } catch (error) {
    ocultarCarregamento();
    manipularErro(error, "inicializarAdmin");
    mostrarDialogo("Erro", "Falha ao inicializar o sistema administrativo.");
    return false;
  }
}

async function configurarEventListenersAdmin() {
  try {
    $(document)
      .off("input.admin")
      .on("input.admin", "input:not([type=file]), textarea", function () {
        const texto = $(this).val();
        if (typeof texto === "string") {
          const textoFormatado = texto
            .toUpperCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
          if (texto != textoFormatado) $(this).val(textoFormatado);
        }
      });
    $(".btn-sair")
      .off("click.admin")
      .on("click.admin", function () {
        sessionStorage.removeItem("userSelections");
        mostrarCarregamento();
        google.script.run
          .withSuccessHandler((response) => includeHtmlBody(response))
          .withFailureHandler((error) => manipularErro(error, "logoutUser"))
          .logoutUser();
      });

    $("#btnGerenciarItem99")
      .off("click.admin")
      .on("click.admin", () => {
        mostrarCarregamento();
        const authToken = sessionStorage.getItem("authToken");
        google.script.run
          .withSuccessHandler((response) => includeHtmlBody(response))
          .withFailureHandler((error) =>
            manipularErro(error, "irParaPaginaGerenciarItem99")
          )
          .irParaPaginaGerenciarItem99(authToken);
      });

    $("#btnIrParaPesquisa")
      .off("click.admin")
      .on("click.admin", () => {
        alternarVisualizacaoTela("pesquisa");
      });

    $("#btnVoltarLancamentos")
      .off("click.admin")
      .on("click.admin", () => {
        alternarVisualizacaoTela("lancamentos");
      });

    $("#municipio, #mes, #ano, #convenio").off("change.admin");

    let changeTimeout;

    $("#municipio, #mes, #ano").on("change.admin", function () {
      clearTimeout(changeTimeout);

      const changedElement = $(this);
      const userIsAdmin = typeof mLog != "undefined" && mLog === "admin";

      if (changedElement.is("#municipio")) {
        const municipioAtual = changedElement.val();
        if (municipioAtual !== "TODOS") {
          const mesSelect = $("#mes");
          if (mesSelect.val() !== "TODOS") {
            mesSelect.val("TODOS");
          }
        }
      }

      if (changedElement.is("#mes")) {
        const mesAtual = changedElement.val();
        if (userIsAdmin && mesAtual !== "TODOS") {
          const municipioSelect = $("#municipio");
          if (municipioSelect.val() !== "TODOS") {
            municipioSelect.val("TODOS");
          }
        }
      }

      changeTimeout = setTimeout(handleFilterChange, 150);
    });

    $("#convenio").on("change.admin", function () {
      clearTimeout(changeTimeout);

      changeTimeout = setTimeout(async () => {
        atualizarInfoConvenioPreposto();
        window.salvarSelecaoUsuario();
        if (ADMIN_CONFIG.estados.telaAtual === "lancamentos")
          await carregarLancamentos();
      }, 150);
    });

    $(".btn-alterar").off("click.admin").on("click.admin", alterarConvenio);
    $(".btn-incluir").off("click.admin").on("click.admin", incluirConvenio);
    $(".btn-excluir").off("click.admin").on("click.admin", excluirConvenio);
    return true;
  } catch (error) {
    manipularErro(error, "configurarEventListenersAdmin");
    throw error;
  }
}

function selecionarMesAutomatico() {
  if (typeof mLog != "undefined" && mLog === "admin") {
    const mesSelecionado = getMesAtual();
    $("#mes")
      .val(mesSelecionado)
      .data("previous-value-static", mesSelecionado);
    
    // Correção: Ajustar ano se estivermos em Janeiro (mostrando Dezembro do ano anterior)
    const hoje = new Date();
    // Se estamos em Janeiro (mês 0), o padrão é mostrar Dezembro do ano passado
    if (hoje.getMonth() === 0) { 
        $("#ano").val(hoje.getFullYear() - 1);
    } else {
        // Caso contrário, mostra o ano atual
        $("#ano").val(hoje.getFullYear());
    }
    
    // Atualiza o Materialize Select se necessário (dependendo da implementação do frontend)
    if (typeof M !== 'undefined' && M.FormSelect) {
       $('select').formSelect();
    }
  }
}

function getMesAtual() {
  const hoje = new Date();
  const dia = hoje.getDate();
  const mesAtual = hoje.getMonth();
  //if (dia < 16) { // mantido para utilização no futuro.
  if (true) {
    const mesAnterior = mesAtual === 0 ? 11 : mesAtual - 1;
    const mesesNomes = [
      "JANEIRO",
      "FEVEREIRO",
      "MARÇO",
      "ABRIL",
      "MAIO",
      "JUNHO",
      "JULHO",
      "AGOSTO",
      "SETEMBRO",
      "OUTUBRO",
      "NOVEMBRO",
      "DEZEMBRO",
    ];
    return mesesNomes[mesAnterior];
  } else {
    const mesesNomes = [
      "JANEIRO",
      "FEVEREIRO",
      "MARÇO",
      "ABRIL",
      "MAIO",
      "JUNHO",
      "JULHO",
      "AGOSTO",
      "SETEMBRO",
      "OUTUBRO",
      "NOVEMBRO",
      "DEZEMBRO",
    ];
    return mesesNomes[mesAtual];
  }
}

// Grupo 1.1: Gestão de Estado da Sessão

function restaurarSelecaoUsuario() {
  try {
    const savedSelections = sessionStorage.getItem("userSelections");
    const mesSelect = $("#mes");
    const municipioSelect = $("#municipio");

    if (savedSelections) {
      const selecoes = JSON.parse(savedSelections);
      if (selecoes.ano) $("#ano").val(selecoes.ano);

      if (selecoes.mes) {
        mesSelect
          .val(selecoes.mes)
          .data("previous-value-static", selecoes.mes);
      } else {
        mesSelect.data("previous-value-static", mesSelect.val());
      }

      if (selecoes.municipio) {
        municipioSelect
          .val(selecoes.municipio)
          .data("previous-value-static", selecoes.municipio);

        atualizarSelectConvenios(selecoes.municipio).then(() => {
          if (selecoes.convenio) {
            const selectConvenio = $("#convenio");
            setTimeout(() => {
              if (
                selectConvenio.find(`option[value="${selecoes.convenio}"]`)
                  .length
              ) {
                selectConvenio.val(selecoes.convenio);
              } else {
                const primeiroValido = selectConvenio.find(
                  'option[value="TODOS"]'
                ).length
                  ? "TODOS"
                  : selectConvenio.find("option").first().val() || "-";
                selectConvenio.val(primeiroValido);
              }
              atualizarInfoConvenioPreposto();
              if (ADMIN_CONFIG.estados.telaAtual === "lancamentos")
                carregarLancamentos();
            }, 100);
          } else {
            atualizarInfoConvenioPreposto();
            if (ADMIN_CONFIG.estados.telaAtual === "lancamentos")
              carregarLancamentos();
          }
        });
      } else {
        municipioSelect.data("previous-value-static", municipioSelect.val());
        atualizarSelectConvenios(municipioSelect.val()).then(() => {
          atualizarInfoConvenioPreposto();
          if (ADMIN_CONFIG.estados.telaAtual === "lancamentos")
            carregarLancamentos();
        });
      }
    } else {
      mesSelect.data("previous-value-static", mesSelect.val());
      municipioSelect.data("previous-value-static", municipioSelect.val());
      atualizarSelectConvenios(municipioSelect.val()).then(() => {
        atualizarInfoConvenioPreposto();
        if (ADMIN_CONFIG.estados.telaAtual === "lancamentos")
          carregarLancamentos();
      });
    }
  } catch (error) {
    manipularErro(error, "restaurarSelecaoUsuario");
    atualizarSelectConvenios($("#municipio").val()).then(() => {
      atualizarInfoConvenioPreposto();
      if (ADMIN_CONFIG.estados.telaAtual === "lancamentos")
        carregarLancamentos();
    });
  }
}

window.salvarSelecaoUsuario = function () {
  const selecoes = {
    municipio: $("#municipio").val(),
    convenio: $("#convenio").val(),
    ano: $("#ano").val(),
    mes: $("#mes").val(),
  };
  try {
    sessionStorage.setItem("userSelections", JSON.stringify(selecoes));
    return true;
  } catch (error) {
    manipularErro(error, "salvarSelecaoUsuario");
    return false;
  }
};

$(document).ready(async () => {
  if (
    $("#mainTitle").text().includes("PAINEL ADMINISTRATIVO") ||
    $("#mainTitle").text().includes("PESQUISA DE MATERIAIS")
  ) {
    try {
      const userMLog = typeof mLog != "undefined" ? mLog : "";
      $(".dropdown").toggle(userMLog === "admin");
      $(".info-convenio .linha-2 > .btn-alterar").toggle(
        userMLog !== "admin"
      );
      $("#btnGerenciarItem99").toggle(userMLog === "admin");

      await inicializarAdmin();
    } catch (initError) {
      manipularErro(initError, "documentReadyAdmin");
    } finally {
      ocultarCarregamento();
    }
  }
});
