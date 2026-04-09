window.CorePageModules = window.CorePageModules || {};

window.CorePageModules.login = function () {
  document.body.classList.add("is-login");

  const emailInput = document.getElementById("loginEmail");
  const passwordInput = document.getElementById("loginPassword");
  const btnLogin = document.getElementById("btnLogin");
  const btnAdmin = document.getElementById("btnAdminArea");
const errorEl = document.getElementById("loginError");

if (!emailInput || !passwordInput || !btnLogin || !errorEl) {
  console.error("[LOGIN] Elementos da tela de login não encontrados.");
  return;
}

  function setError(message = "") {
    if (!message) {
      errorEl.textContent = "";
      errorEl.classList.add("hidden");
      return;
    }

    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
  }

  async function submitLogin() {
    const email = String(emailInput.value || "").trim();
    const password = String(passwordInput.value || "");

    setError("");

    if (!email || !password) {
      setError("Preencha e-mail e senha.");
      return;
    }

    btnLogin.disabled = true;
    btnLogin.textContent = "Entrando...";

    try {
      const result = await window.CoreAuth.login({
        email,
        password
      });

      if (!result?.ok) {
        setError(result?.message || "Usuário ou senha inválidos.");
        return;
      }

      document.body.classList.remove("is-login");

      const user = window.CoreAuth?.getCurrentUser?.();
      if (user && typeof updateUserUI === "function") {
        updateUserUI(user);
      }

      if (window.setActiveSidebar) {
        window.setActiveSidebar("home");
      }

      if (window.coreRouterInstance?.render) {
        await window.coreRouterInstance.render("home");
        return;
      }

      window.location.reload();
    } catch (err) {
      console.error("[LOGIN] Erro ao autenticar:", err);
      setError("Não foi possível entrar agora.");
    } finally {
      btnLogin.disabled = false;
      btnLogin.textContent = "Entrar";
    }
  }

  btnLogin.onclick = submitLogin;

  emailInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      passwordInput.focus();
    }
  });

  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitLogin();
    }
  });

    if (btnAdmin) {
    btnAdmin.onclick = () => {
      setError("");
      console.warn("[LOGIN] Acesso administrativo antes do login foi desativado.");
    };
  }

  setTimeout(() => {
    emailInput.focus();
  }, 40);
};