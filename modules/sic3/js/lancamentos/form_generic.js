async function abrirFormularioModal(tipo, config, dados = null, modalTitle = null) {
  try {
    $('.dt-search-input').val('').change();
    const modal = document.getElementById("modal-base");
    if (!modal) throw new Error("Modal base não encontrado");

    modal.querySelector(".modal-header h2").textContent = modalTitle || `LANÇAMENTO - ${config?.descricao || tipo.toUpperCase()}`;

    const contemEndereco = tipo.startsWith("O");
    const enderecoMedidorHtml = contemEndereco && typeof gerarSecaoEnderecoMedidor === 'function' ? await gerarSecaoEnderecoMedidor(tipo) : "";
    const labelTotal = "Valor Unitário:";
    
    let camposHtml = "";
    const allFields = (config?.campos || []).concat(config?.camposEspecificos || []);
    let i = 0;
    while (i < allFields.length) {
        const campo = allFields[i];
        const isPairedStart = campo.id === 'quantidade' || campo.id === 'consumo';
        
        if (isPairedStart) {
            const nextCampo = (i + 1 < allFields.length) ? allFields[i + 1] : null;
            if (nextCampo && nextCampo.id === 'valorTotal') {
                camposHtml += `<div class="form-group-pair">`;
                camposHtml += gerarCampoFormulario(campo);
                camposHtml += gerarCampoFormulario(nextCampo);
                camposHtml += `</div>`;
                i += 2; // Pula o campo atual e o próximo
            } else {
                camposHtml += gerarCampoFormulario(campo);
                i++;
            }
        } else {
            camposHtml += gerarCampoFormulario(campo);
            i++;
        }
    }

    const formHtml = `
      <form id="form-dinamico" data-tipo-form="${tipo}" novalidate>
        <div class="form-grid">
          ${enderecoMedidorHtml}
          <div class="form-content">
            ${camposHtml}
            <div class="form-group total-container">
              <div class="total-label-valor">
                <span class="label">${labelTotal}</span>
                <span id="total-valor" class="total-valor">R$ 0,00</span>
              </div>
            </div>
          </div>
        </div>
      </form>
    `;

    modal.querySelector(".modal-body").innerHTML = formHtml;
    const form = document.getElementById("form-dinamico");
    $(form).data('formConfig', config);
    await configurarEventosFormulario(config);
    configurarValidacoesFormulario(form);

    if (contemEndereco && typeof configurarFormularioEndereco === 'function') {
      await configurarFormularioEndereco(form, tipo);
    }

    if (dados) {
      if (dados.endereco) {
        const enderecoSelect = form.querySelector('#endereco');
        if (enderecoSelect) {
          enderecoSelect.value = dados.endereco;
          enderecoSelect.dispatchEvent(new Event('change'));
        }
      }
      const dadosParaForm = { ...dados };
      
      allFields.forEach(campoConfig => {
        if (campoConfig.tipo === 'file' && dadosParaForm.hasOwnProperty(campoConfig.id)) {
          delete dadosParaForm[campoConfig.id];
        }
      });

      allFields.forEach(campoConfig => {
        const campoId = campoConfig.id;
        const input = form.querySelector(`#${campoId}`);
        if (input) {
          if (input.type === 'file') {
              return; 
          }
          if (dadosParaForm.hasOwnProperty(campoId)) {
            input.value = dadosParaForm[campoId] != undefined ? dadosParaForm[campoId] : "";
            input.dispatchEvent(new Event("change"));
          } else if (campoConfig.valor != undefined) {
            input.value = campoConfig.valor;
          }
        }
      });
    }

    // Ajuste 1: Configurar min, max e valor inicial para inputs de data com base no período do relatório
    const mesesMap = {
      "JANEIRO": "01", "FEVEREIRO": "02", "MARCO": "03", "MARÇO": "03",
      "ABRIL": "04", "MAIO": "05", "JUNHO": "06", "JULHO": "07",
      "AGOSTO": "08", "SETEMBRO": "09", "OUTUBRO": "10", "NOVEMBRO": "11",
      "DEZEMBRO": "12"
    };
    const anoRelatorio = window.ano ? String(window.ano).trim() : new Date().getFullYear().toString();
    const mesRelatorioStr = window.mes ? String(window.mes).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
    const mesNum = mesesMap[mesRelatorioStr];
    
    const inputsData = form.querySelectorAll('input[type="date"]');
    inputsData.forEach(input => {
      if (mesNum && anoRelatorio) {
        const dataMin = `${anoRelatorio}-${mesNum}-01`;
        const ultimoDia = new Date(parseInt(anoRelatorio, 10), parseInt(mesNum, 10), 0).getDate();
        const dataMax = `${anoRelatorio}-${mesNum}-${String(ultimoDia).padStart(2, '0')}`;
        
        input.setAttribute("min", dataMin);
        input.setAttribute("max", dataMax);
        
        // Se estiver vazio, define o primeiro dia do período como valor padrão para abrir o calendário no período correto
        if (!input.value) {
          input.value = dataMin;
          input.dispatchEvent(new Event("change"));
        }
      }
    });

    modal.style.display = "flex";

    // Ajuste 2: Garantir que a barra de rolagem volte ao ponto zero ao abrir o formulário
    const modalContent = modal.querySelector(".modal-content");
    if (modalContent) modalContent.scrollTop = 0;
    const modalBody = modal.querySelector(".modal-body");
    if (modalBody) modalBody.scrollTop = 0;
    modal.scrollTop = 0;

    calcularTotalFormulario();
    adicionarBotaoAutocompletarDev(tipo);

  } catch (error) {
    console.error("Erro ao abrir modal:", error);
    mostrarDialogo("Erro", "Erro ao abrir formulário");
  }
}

function gerarCampoFormulario(campo) {
    const regras = typeof obterRegrasValidacao === 'function' ? obterRegrasValidacao(campo.id) : { required: false };
    const required = campo.isRequired || regras.required;

    const inputHtml = gerarInputFormulario(campo);

    const isPaired = campo.id === 'quantidade' || campo.id === 'valorTotal' || campo.id === 'consumo';
    const groupClass = isPaired ? 'form-group' : `form-group ${campo.fullWidth ? "form-full" : ""}`;

    return `
      <div class="${groupClass}" id="group-${campo.id}">
        <label for="${campo.id}">${campo.label} ${required ? '<span class="info">*</span>' : ""}</label>
        ${inputHtml}
        <div class="invalid-feedback"></div>
      </div>
    `;
  }

function gerarInputFormulario(campo) {
  const regras = typeof obterRegrasValidacao === 'function' ? obterRegrasValidacao(campo.id) : { required: false };
  const baseAttrs = `
    id="${campo.id}"
    class="form-control ${campo.disabled ? "disabled" : ""}"
    ${regras.required ? "required" : ""}
    ${campo.placeholder ? `placeholder="${campo.placeholder}"` : ""}
    ${campo.disabled ? "disabled" : ""}
    ${(campo.tipo !== 'select' && campo.valor != undefined) ? `value="${campo.valor}"` : ""}
  `;

  switch (campo.tipo) {
    case "select":
      return `
        <select ${baseAttrs}>
          <option value="">Selecione...</option>
          ${campo.opcoes?.map((opt) => `<option value="${opt.value}" ${campo.valor == opt.value ? 'selected' : ''}>${opt.label}</option>`).join("") || ""}
        </select>`;
    case "textarea":
      return `<textarea ${baseAttrs} rows="3">${campo.valor || ""}</textarea>`;
    case "file":
      return `<input type="file" ${baseAttrs.replace(/value=".*?"/, '')} accept=".pdf,image/*">`;
    default:
      return `<input type="${campo.tipo}" ${baseAttrs}>`;
  }
}

async function configurarEventosFormulario(config) {
  const form = document.getElementById("form-dinamico");
  if (!form) return;

  $(form).off("submit").on("submit", (e) => {
    processarSubmissaoFormulario(e, config);
  });

  $(form).off('change.sic3Despesa').on('change.sic3Despesa', '#despesa', function() {
    const codigoDespesa = $(this).val().split(" - ")[0];

    // CORREÇÃO: Salva os valores atuais, remove os campos antigos de forma robusta e os recria.
    const currentValues = {};
    const possibleIds = ['placa', 'prefixo', 'odometro', 'responsavel', 'motorista'];
    
    possibleIds.forEach(id => {
        const field = form.querySelector(`#${id}`);
        if (field) {
            currentValues[id] = field.value;
        }
    });

    // Remove campos dinâmicos antigos pelo ID do grupo, garantindo a remoção completa.
    possibleIds.forEach(id => {
        const group = form.querySelector(`#group-${id}`);
        if (group) {
            group.remove();
        }
    });
    // A remoção por classe '.dynamic' é mantida como fallback.
    $(form).find(".form-group.dynamic").remove();

    const observacaoGroup = form.querySelector("#group-observacao");

    let camposDinamicos = [];
    if (codigoDespesa === "3023") {
      camposDinamicos = [
        { id: "placa", label: "Placa", tipo: "text" },
        { id: "prefixo", label: "Prefixo VTR", tipo: "text" },
        { id: "odometro", label: "Odômetro", tipo: "text" },
        { id: "responsavel", label: "Responsável (Nº PM)", tipo: "text" },
      ];
      if (observacaoGroup) $(observacaoGroup).hide();
    } else if (codigoDespesa === "3026") {
      camposDinamicos = [
        { id: "placa", label: "Placa", tipo: "text" },
        { id: "prefixo", label: "Prefixo VTR", tipo: "text" },
        { id: "odometro", label: "Odômetro", tipo: "text" },
        { id: "motorista", label: "Motorista (Nº PM)", tipo: "text" },
      ];
      if (observacaoGroup) $(observacaoGroup).hide();
    } else {
      if (observacaoGroup) $(observacaoGroup).show();
    }

    if (camposDinamicos.length > 0) {
      const unidadeFieldGroup = $(form).find("#unidade")?.closest(".form-group");
      if (unidadeFieldGroup.length) {
        const camposHtml = camposDinamicos
          .map((campo) => gerarCampoFormulario(campo).replace('class="form-group', 'class="form-group dynamic'))
          .join("");
        unidadeFieldGroup.after(camposHtml);
        configurarValidacoesFormulario(form);

        // Restaura os valores preservados nos novos campos.
        camposDinamicos.forEach(campo => {
            if (currentValues[campo.id] !== undefined) {
                const newField = form.querySelector(`#${campo.id}`);
                if (newField) {
                    newField.value = currentValues[campo.id];
                }
            }
        });
      }
    }
  });

  const submitBtn = document.querySelector('.modal-footer button[type="submit"]');
  const cancelBtn = document.querySelector('.modal-footer button[type="button"]');

  if (submitBtn) {
    $(submitBtn).off('click').on('click', (e) => { processarSubmissaoFormulario(e, config); });
  }

  if (cancelBtn) {
    $(cancelBtn).off('click').on('click', (e) => {
      e.preventDefault();
      const tipoForm = form.getAttribute("data-tipo-form");
      const modoEdicaoEndereco = form.getAttribute("data-modo-edicao-endereco");

      if (tipoForm && tipoForm.startsWith("O") && modoEdicaoEndereco) {
        cancelarAlteracaoEndereco(form);
      } else {
        fecharModal();
      }
    });
  }
}

function calcularTotalFormulario() {
    const form = document.getElementById("form-dinamico");
    if (!form) return;

    const totalElement = form.querySelector("#total-valor");
    if (!totalElement) return;

    const quantidadeInput = form.querySelector("#quantidade");
    const consumoInput = form.querySelector("#consumo");
    const valorTotalInput = form.querySelector("#valorTotal");
    const tipoForm = form.getAttribute("data-tipo-form");

    const isConsumoItem = !!consumoInput;
    
    const quantidade = formatarNumero((quantidadeInput || consumoInput)?.value || "0", "numero");
    const valorTotal = formatarNumero(valorTotalInput?.value || "0", "numero");

    let valorUnitarioCalculado = 0;
    
    if (isConsumoItem) {
        valorUnitarioCalculado = valorTotal;
    } else {
        if (quantidade > 0 && valorTotal > 0) {
            valorUnitarioCalculado = valorTotal / quantidade;
        }
    }
    
    totalElement.textContent = formatarNumero(valorUnitarioCalculado, "moeda");
}


async function processarSubmissaoFormulario(e, config) {
  e.preventDefault();
  const form = document.getElementById("form-dinamico");
  if (!form) return;
  const tipo = form.getAttribute("data-tipo-form");
  if (!tipo) return;

  if (typeof validarFormulario === 'function' && !validarFormulario({}, form)) return;

  try {
    const dadosForm = {};
    form.querySelectorAll("input:not([type=hidden]), select, textarea").forEach((input) => {
      if (input.type === 'file') return;
      if (input.id) dadosForm[input.id] = input.value;
    });

    const isConsumoItem = !!form.querySelector("#consumo");
    const valorTotal = formatarNumero(dadosForm.valorTotal || '0', 'numero');
    const quantidade = formatarNumero(dadosForm.quantidade || dadosForm.consumo || "1", "numero");
    
    dadosForm.subtotal = formatarNumero(valorTotal, "moeda");
    
    if (isConsumoItem) {
        dadosForm.valorUnitario = formatarNumero(valorTotal, "decimal");
    } else {
        dadosForm.valorUnitario = (quantidade > 0) ? formatarNumero(valorTotal / quantidade, "decimal") : formatarNumero(0, "decimal");
    }
    
    dadosForm.valorTotal = formatarNumero(valorTotal, "decimal");

    const linhaEditadaId = form.getAttribute("data-linha-edicao");

    switch (tipo) {
      case "abastecimento":
        await processarSubmissaoAbastecimento(dadosForm, linhaEditadaId);
        break;
      case "manutencao":
        await processarSubmissaoManutencao(dadosForm, linhaEditadaId);
        break;
      case "material":
        await processarSubmissaoMaterial(dadosForm, linhaEditadaId);
        break;
      default:
        if (tipo.startsWith("O")) {
          await processarSubmissaoOutrosItens(tipo, config, dadosForm, linhaEditadaId);
        }
        break;
    }
  } catch (error) {
    console.error("Erro ao processar formulário:", error);
    mostrarDialogo("Erro", "Erro ao processar formulário");
  }
}
