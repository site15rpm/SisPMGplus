function mostrarErroValidacao(campo, mensagem) {
  if (!campo) return;
  campo.classList.add('is-invalid');
  let feedbackElement = campo.nextElementSibling;
  if (!feedbackElement || !feedbackElement.classList.contains('invalid-feedback')) {
    feedbackElement = document.createElement('div');
    feedbackElement.className = 'invalid-feedback';
    if (campo.parentNode) {
        campo.parentNode.insertBefore(feedbackElement, campo.nextSibling);
    } else {
        document.body.appendChild(feedbackElement);
    }
  }
  feedbackElement.textContent = mensagem;
  feedbackElement.style.visibility = 'visible';
}

function limparValidacoes(form) {
  if (!form) return;
  form.querySelectorAll('.form-control, input, select, textarea').forEach(input => {
    input.classList.remove('is-invalid');
    const feedback = input.nextElementSibling;
    if (feedback?.classList.contains('invalid-feedback')) {
      feedback.textContent = '';
      feedback.style.visibility = 'hidden';
    }
  });
}

function obterRegrasValidacao(fieldId) {
  const rules = { required: false };

  if (!window.regrasValidacao) {
    console.warn("Atenção: window.regrasValidacao não foi inicializado. Usando regras padrão.");
    window.regrasValidacao = {};
  }
  window.regrasValidacao = {
    "valorTotal, quantidade, consumo, odometro, responsavel, motorista, placa, prefixo, descricao, tipo, codigoItem, despesa, unidade, fornecedor, endereco, endereco-input, notaFiscal, telefone": {
      required: true
    },
    observacao: {
      required: false
    },
    data: {
      required: true
    },
    mesRef: {
      required: true
    },
    "medidor-O33903912, medidor-O33903913": {
      required: true
    },
    "notaFiscalAnexo": { required: true, message: "O anexo é obrigatório." },
    "municipio-conv": { required: true, message: "Município é obrigatório." },
    "convenio-conv": { required: true, pattern: /^(\d{10})$/, message: "Convênio deve ter 10 dígitos numéricos." },
    "preposto-n": { required: true, message: "Número do Preposto é obrigatório." },
    "preposto-pg": { required: true, message: "Posto/Graduação é obrigatório." },
    "preposto-nome": { required: true, message: "Nome do Preposto é obrigatório." },
    "unidade-conv": { required: true, message: "Unidade é obrigatória." },
    "dataInicio-conv": { required: true, message: "Data Início é obrigatória." },
    "dataFim-conv": { required: true, message: "Data Fim é obrigatória." },
  };

  for (const selectors in window.regrasValidacao) {
    const fields = selectors.split(",").map(f => f.trim());
    if (fields.includes(fieldId)) {
      Object.assign(rules, window.regrasValidacao[selectors]);
      break;
    }
  }
  return rules;
}

function validarCampo(campo, contexto = {}) {
  if (!campo || campo.offsetParent === null) {
      return { valid: true, message: "" };
  }

  campo.classList.remove('is-invalid');
  const feedbackElement = campo.nextElementSibling;
  if (feedbackElement?.classList.contains('invalid-feedback')) {
    feedbackElement.textContent = '';
    feedbackElement.style.visibility = 'hidden';
  }

  const id = campo.id;
  let value = campo.value;
  const regras = obterRegrasValidacao(id);

  if (regras.required && !campo.disabled) {
    if (campo.type === 'file') {
      const form = campo.closest('form');
      const isEditing = form && form.hasAttribute('data-linha-edicao');
      
      if (!isEditing && campo.files.length === 0) {
        return { valid: false, message: regras.message || "Campo obrigatório" };
      }
    } else if (!value.trim()) {
      return { valid: false, message: regras.message || "Campo obrigatório" };
    }
  }
  
  if (!value.trim() && !regras.required && !regras.pattern && !regras.type && campo.type != 'file') {
    return { valid: true, message: "" };
  }

  if (regras.pattern && !regras.pattern.test(value)) {
    if (!regras.required && value.trim() === "") {
        return { valid: true, message: "" };
    }
    return { valid: false, message: regras.message || "Formato inválido." };
  }

  switch (id) {
    case 'preposto-n':
    case 'responsavel':
    case 'motorista':
      if (value.trim() && /^0+$/.test(value)) return { valid: false, message: "Número PM não pode ser somente zeros" };
      if (typeof verificarDigitoVerificador === 'function' && value.trim() && !verificarDigitoVerificador(value)) {
        return { valid: false, message: "Número PM inválido" };
      }
      break;
    case 'telefone':
        if (value.trim()) {
            const justNumbers = value.replace(/\D/g, '');
            if (!/^\d{10,11}$/.test(justNumbers)) {
                return { valid: false, message: "Quantidade de dígitos incorreta." };
            }
        }
        break;
    case 'convenio-conv':
      break;
    case 'unidade-conv':
      if (value.length > 0 && value.length < 6) return { valid: false, message: "Unidade deve ter pelo menos 6 caracteres" };
      break;
    case 'municipio-conv':
      if (value.length > 0 && value.length < 3) return { valid: false, message: "Município deve ter pelo menos 3 caracteres" };
      break;
    case 'preposto-nome':
      if (value.trim() && !/^[^\d\s]{2,}(\s[^\d\s]{2,})+$/.test(value)) return { valid: false, message: "Escreva o nome completo do preposto" };
      break;
    case "valorTotal":
      if (value.trim()) {
        const numValor = parseFloat(String(value).replace(/[^\d,.-]/g, "").replace(",", "."));
        if (isNaN(numValor)) return { valid: false, message: "Valor deve ser numérico" };
      }
      break;
    case "quantidade":
    case "consumo":
      if (value.trim()) {
        const numQtde = parseFloat(String(value).replace(/[^\d,.-]/g, "").replace(",", "."));
        if (isNaN(numQtde)) return { valid: false, message: "Deve ser numérico" };

        const formTipoQtde = campo.closest('form')?.getAttribute('data-tipo-form');
        const tipoItemEndereco = campo.closest('form')?.getAttribute('data-tipo-item-endereco');

        if (id === "quantidade" && formTipoQtde === "abastecimento" && numQtde <= 0) return { valid: false, message: "Qtd. abastecimento > 0" };
        if (id === "consumo" && numQtde <= 0) return { valid: false, message: "Consumo deve ser maior que zero" };

        if (id === "consumo") {
            if (tipoItemEndereco === "O33903913" && !/^\d{1,3}(,\d+)?$/.test(value.trim())) return { valid: false, message: "Consumo de água: máx 3 dígitos inteiros" };
            if (tipoItemEndereco === "O33903912" && !/^\d{1,5}(,\d+)?$/.test(value.trim())) return { valid: false, message: "Consumo de energia: máx 5 dígitos inteiros" };
        }
      }
      break;
    case "placa":
      if (value.trim() && !/^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/.test(String(value).toUpperCase())) return { valid: false, message: "Placa inválida (Formato AAA0X00)" };
      break;
    case "odometro":
      if (value.trim()) {
        const odometroNum = parseInt(value.replace(/\D/g,''));
        if (isNaN(odometroNum) || odometroNum <= 0) return { valid: false, message: "Odômetro deve ser > 0" };
      }
      break;
    case "prefixo":
      if (value.trim() && (value.replace(/\D/g,'').length > 0 && value.replace(/\D/g,'').length < 5)) return { valid: false, message: "Prefixo inválido: Deve conter 5 dígitos" };
      break;
    case "descricao":
      if (campo.closest('form')?.getAttribute('data-tipo-form') === 'manutencao' && value.trim() === 'MAO DE OBRA - SERVICO DE') return { valid: false, message: "Descreva o serviço." };
      if (campo.closest('form')?.getAttribute('data-tipo-form') !== 'material' && value.trim() && value.length < 5) return { valid: false, message: "Descreva o item" };
      break;
    case "medidor-O33903912":
    case "medidor-O33903913":
      if (value.length > 0 && value.length < 7) return { valid: false, message: `Medidor deve ter no mínimo 7 caracteres` };
      break;
    case "data":
    case "mesRef":
      if (value && typeof mes !== 'undefined' && typeof ano !== 'undefined') { 
        try {
          const dataObj = new Date(value + (id === "data" ? "T00:00:00" : "-01T00:00:00"));
          if (isNaN(dataObj.valueOf())) return { valid: false, message: "Data inválida" };

          const anoLancamento = dataObj.getFullYear();
          const mesLancamento = dataObj.getMonth() + 1;

          const mesRelatorioNum = parseInt(mNumerico(mes, "numero"));
          const anoRelatorioNum = parseInt(ano);

          const form = campo.closest("form");
          const temMesRefNoForm = form ? form.querySelector("#mesRef") : null;

          if (id === "data") {
            if (!temMesRefNoForm && (mesLancamento !== mesRelatorioNum || anoLancamento !== anoRelatorioNum)) {
              return { valid: false, message: `Data fora do período do relatório (${mes}/${ano})` };
            }
            if (temMesRefNoForm) {
                const mesRefValue = temMesRefNoForm.value;
                if (mesRefValue) {
                    const [anoMesRef, mesMesRef] = mesRefValue.split("-").map(Number);
                    if (anoMesRef === anoRelatorioNum && mesMesRef === mesRelatorioNum) {
                        const inicioMesRelatorio = new Date(anoRelatorioNum, mesRelatorioNum - 1, 1);
                        if (dataObj < inicioMesRelatorio) {
                             return { valid: false, message: `Data não pode ser anterior a ${mNumerico(mesRelatorioNum, 'nome')}/${anoRelatorioNum}` };
                        }
                    }
                }
            }
          } else if (id === "mesRef") {
            if (anoLancamento !== anoRelatorioNum || mesLancamento !== mesRelatorioNum) {
              return { valid: false, message: `Mês de referência deve ser ${mes}/${ano}` };
            }
          }
        } catch (e) {
          return { valid: false, message: "Formato de data inválido para processamento" };
        }
      }
      break;
    case "dataFim-conv": 
      const dataInicioConvElement = document.getElementById('dataInicio-conv');
      if (dataInicioConvElement) {
          const dataInicioConv = dataInicioConvElement.value;
          if (dataInicioConv && value && new Date(value + "T00:00:00") < new Date(dataInicioConv + "T00:00:00")) {
              return { valid: false, message: "Data Fim não pode ser anterior à Data Início." };
          }
      }
      break;
  }
  return { valid: true, message: "" };
}

function configurarValidacoesFormulario(formElement = null) {
  const form = formElement || document.querySelector('#modal-base form');
  if (!form) {
    console.warn("Formulário não encontrado para configurar validações.");
    return;
  }

  const formatarCampoDecimal = (campo) => {
    let valor = campo.value;
    valor = valor.replace(/[^0-9,]/g, ''); // Permite apenas números e vírgula
    valor = valor.replace(/(,.*?),/g, '$1'); // Garante apenas uma vírgula

    const maxDec = campo.id === 'quantidade' ? 4 : 2;

    const partes = valor.split(',');
    if (partes.length > 1) {
        if (partes[1].length > maxDec) {
            partes[1] = partes[1].substring(0, maxDec);
            valor = partes.join(',');
        }
    }
    
    if (campo.value !== valor) {
        campo.value = valor;
    }
  };

  form.querySelectorAll('input, select, textarea').forEach(campo => {
    if (!campo.nextElementSibling || !campo.nextElementSibling.classList.contains('invalid-feedback')) {
      const feedback = document.createElement('div');
      feedback.className = 'invalid-feedback';
      if (campo.parentNode) {
        campo.parentNode.insertBefore(feedback, campo.nextSibling);
      }
    }

    campo.addEventListener('input', function() {
      this.classList.remove('is-invalid');
      const feedback = this.nextElementSibling;
      if (feedback?.classList.contains('invalid-feedback')) {
        feedback.textContent = '';
        feedback.style.visibility = 'hidden';
      }
      if (["valorTotal", "quantidade", "consumo"].includes(this.id)) {
        formatarCampoDecimal(this);
        calcularTotalFormulario();
      }
    });

    campo.addEventListener('blur', function() {
      const validacao = validarCampo(this);
      if (!validacao.valid) {
        mostrarErroValidacao(this, validacao.message);
      }
    });

    if (campo.tagName === 'SELECT') {
      campo.addEventListener('change', function() {
        const validacao = validarCampo(this);
        if (!validacao.valid) {
          mostrarErroValidacao(this, validacao.message);
        } else {
            this.classList.remove('is-invalid');
            const feedback = this.nextElementSibling;
            if (feedback?.classList.contains('invalid-feedback')) {
                feedback.textContent = '';
                feedback.style.visibility = 'hidden';
            }
        }
      });
    }
  });

  configurarValidacaoTiposCampo(form);
}

function configurarValidacaoTiposCampo(form) {
  if (!form) return;
  form.querySelectorAll('#preposto-n, [id^="responsavel"], [id^="motorista"]').forEach(campo => {
    campo.addEventListener('input', function() { this.value = this.value.replace(/\D/g, '').substring(0, 7); });
  });
  form.querySelectorAll('#convenio-conv').forEach(campo => {
    campo.addEventListener('input', function() { this.value = this.value.replace(/\D/g, '').substring(0, 10); });
  });
  form.querySelectorAll('[id^="odometro"]').forEach(campo => {
    campo.addEventListener('input', function() { this.value = this.value.replace(/\D/g, '').substring(0, 6); });
  });
  form.querySelectorAll('[id^="prefixo"]').forEach(campo => {
    campo.addEventListener('input', function() { this.value = this.value.replace(/\D/g, '').substring(0, 5); });
  });
  form.querySelectorAll('[id^="placa"]').forEach(campo => {
    campo.addEventListener('input', function() { this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 7); });
  });
  form.querySelectorAll('#telefone').forEach(campo => {
    campo.addEventListener('input', function() { this.value = this.value.replace(/\D/g, '').substring(0, 11); });
  });
  
  form.querySelectorAll('[id^="consumo"]').forEach(campo => {
    campo.addEventListener('input', function() {
      const tipoFormContexto = this.closest('form')?.getAttribute('data-tipo-item-endereco') || this.closest('form')?.getAttribute('data-tipo-form');
      if (tipoFormContexto === "O33903913") {
        this.value = this.value.replace(/\D/g, "").substring(0, 3);
      } else if (tipoFormContexto === "O33903912") {
        this.value = this.value.replace(/\D/g, "").substring(0, 5);
      } else {
        let valor = this.value.replace(/[^0-9,]/g, "");
        valor = valor.replace(/(,.*?),/g, "$1").replace(/^(\d+,\d{2}).*$/, "$1");
        this.value = valor;
      }
    });
  });
}

function validarFormulario(contexto = {}, formElement = null) {
  const form = formElement || document.querySelector('#modal-base form');
  if (!form) {
    console.error("Formulário não encontrado para validação completa.");
    return false;
  }
  limparValidacoes(form);
  let isValid = true;
  form.querySelectorAll("input:not([type=hidden]):not(:disabled), select:not(:disabled), textarea:not(:disabled)").forEach(campo => {
    if ((campo.id === "medidor-O33903912" || campo.id === "medidor-O33903913") && campo.disabled) {
        return;
    }
    if (campo.id === "endereco-input" && campo.closest("#endereco-edit")?.style.display === 'none') {
        return;
    }
    if (campo.id === "endereco" && campo.style.display === 'none') {
        return;
    }

    const validacao = validarCampo(campo, contexto);
    if (!validacao.valid) {
      mostrarErroValidacao(campo, validacao.message);
      if (isValid) { 
          mostrarDialogo("Atenção!", "Preencha todos os campos obrigatórios (*) corretamente antes de prosseguir.");
      }
      isValid = false;
    }
  });
  return isValid;
}

function validarDuplicidadeEndereco(dadosItem, linhaEditadaId = null, isOutroItem = false) {
  if (!isOutroItem || !dadosItem.endereco) return true;

  const [anoRef, mesRef] = (dadosItem.data.split("-")).slice(0, 2);

  const registroDuplicado = $(".principal-table tbody tr").toArray().some((tr) => {
    if (linhaEditadaId && tr.id === linhaEditadaId) return false;

    const $tr = $(tr);
    const codigoLinha = $tr.find(".codigo-item").text();
    if (!codigoLinha.startsWith('O')) return false;

    // Se não for item de telefonia, usa a lógica original
    if (codigoLinha !== 'O33903914' && codigoLinha !== 'O33904004') {
        if (codigoLinha !== dadosItem.codigo) return false;
        
        const descricaoLinha = $tr.find(".descricao-item").text();
        const enderecoMatch = descricaoLinha.match(/End\.:\s*(.+)/);
        const enderecoLinha = enderecoMatch ? enderecoMatch[1].trim() : null;
        const dataLinha = $tr.find(".data-item").text();
        const [anoLinha, mesLinha] = dataLinha.split("-").slice(0, 2);

        if (enderecoLinha === dadosItem.endereco && anoLinha === anoRef && mesLinha === mesRef) {
            return true;
        }
    } else { // Lógica para telefonia
        if (codigoLinha !== dadosItem.codigo) return false;

        const descricaoLinha = $tr.find(".descricao-item").text();
        const enderecoMatch = descricaoLinha.match(/End\.:\s*(.+)/);
        const enderecoLinha = enderecoMatch ? enderecoMatch[1].trim() : null;
        
        const observacaoLinha = $tr.find(".observacao-item").text();
        const telefoneMatch = observacaoLinha.match(/Tel\.:\s*(\S+)/);
        const telefoneLinha = telefoneMatch ? telefoneMatch[1].trim() : null;

        const dataLinha = $tr.find(".data-item").text();
        const [anoLinha, mesLinha] = dataLinha.split("-").slice(0, 2);

        if (enderecoLinha === dadosItem.endereco && telefoneLinha === dadosItem.telefone && anoLinha === anoRef && mesLinha === mesRef) {
            return true;
        }
    }
    return false;
  });

  if (registroDuplicado) {
    const mesNome = typeof mes !== 'undefined' ? mes.toLowerCase() : mNumerico(mesRef, 'nome');
    const anoNome = typeof ano !== 'undefined' ? ano : anoRef;
    let msg = `Já existe um lançamento para este serviço/endereço no período de ${mesNome}/${anoNome}.`;
    if (dadosItem.codigo === 'O33903914' || dadosItem.codigo === 'O33904004') {
        msg = `Já existe um lançamento para este número de telefone (${dadosItem.telefone}) neste endereço e período.`;
    }
    mostrarDialogo("Aviso de Duplicidade", msg);
    return false;
  }
  return true;
}

// Exportações explícitas para o escopo global (evita erros de carregamento assíncrono em manifest v3)
window.mostrarErroValidacao = mostrarErroValidacao;
window.limparValidacoes = limparValidacoes;
window.obterRegrasValidacao = obterRegrasValidacao;
window.validarCampo = validarCampo;
window.configurarValidacoesFormulario = configurarValidacoesFormulario;
window.configurarValidacaoTiposCampo = configurarValidacaoTiposCampo;
window.validarFormulario = validarFormulario;
window.validarDuplicidadeEndereco = validarDuplicidadeEndereco;
