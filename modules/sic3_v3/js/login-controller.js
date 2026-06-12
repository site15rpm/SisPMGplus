// Arquivo: modules/sic3/js/login-controller.js
// Controlador da tela de Login do SIC3 na extensão.

window.login = function() {
  const username = document.getElementById("uid").value;
  const password = document.getElementById("pass").value;
  const loginButton = document.querySelector(".btn-primary");

  if (!username || !password) {
    $("#RetMsg").removeClass("alert-danger").removeClass("alert-success").addClass("alert-danger");
    $("#RetMsg").html("Digite o Número PM e a Senha");
    $("#RetMsg").css("visibility", "visible");
    return;
  }

  // Validação no lado do cliente para garantir que apenas números sejam enviados
  if (!/^\d+$/.test(username)) {
      $("#RetMsg").removeClass("alert-danger").removeClass("alert-success").addClass("alert-danger");
      $("#RetMsg").html("Usuário deve conter apenas números.");
      $("#RetMsg").css("visibility", "visible");
      return;
  }

  // Executa a validação de dígito verificador se a função existir
  if (typeof window.verificarDigitoVerificador === 'function' && !window.verificarDigitoVerificador(username)) {
    $("#RetMsg").removeClass("alert-danger").removeClass("alert-success").addClass("alert-danger");
    $("#RetMsg").html("Número PM incorreto");
    $("#RetMsg").css("visibility", "visible");
  } else {
    loginButton.disabled = true;
    loginButton.style.backgroundColor = "#cccccc";
    loginButton.innerHTML = '<div class="loading-spinner" style="border: 2px solid #f3f3f3; border-top: 2px solid #1a73e8; border-radius: 50%; width: 14px; height: 14px; animation: spin 1s linear infinite; margin: 0 auto;"></div>';

    // Roda no Proxy que simula o google.script.run do GAS
    google.script.run
      .withSuccessHandler(function (response) {
        loginButton.disabled = false;
        loginButton.style.backgroundColor = "#0d6efd";
        loginButton.innerHTML = "Login";

        if (response.success) {
          // O includeHtmlBody do shim cuidará de interceptar o conteúdo e navegar para o Admin!
          window.includeHtmlBody(response.content);
        } else {
          $("#RetMsg").removeClass("alert-danger").removeClass("alert-success").addClass("alert-danger");
          $("#RetMsg").html(response.message || "Senha inválida");
          $("#RetMsg").css("visibility", "visible");
        }
      })
      .withFailureHandler(function (err) {
        loginButton.disabled = false;
        loginButton.style.backgroundColor = "#0d6efd";
        loginButton.innerHTML = "Login";
        
        $("#RetMsg").removeClass("alert-danger").removeClass("alert-success").addClass("alert-danger");
        $("#RetMsg").html("Erro ao conectar ao servidor. Verifique a URL do GAS configurada.");
        $("#RetMsg").css("visibility", "visible");
      })
      .loginCheck(username, password);
  }
  return true;
};

window.ClearText = function() {
  $("#RetMsg").html("");
  $("#RetMsg").css("visibility", "hidden"); 
};

// Configurações do estado inicial da página
$(document).ready(function() {
  sessionStorage.removeItem("userSelections");
  if (typeof window.ocultarCarregamento === 'function') {
      window.ocultarCarregamento();
  }
});
