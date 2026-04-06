document.addEventListener("DOMContentLoaded", async () => {
  const avatarPreview = document.getElementById("faAvatarPreview");
  const avatarFile = document.getElementById("faAvatarFile");
  const avatarPick = document.getElementById("faAvatarPick");
  const fullNameInput = document.getElementById("faFullName");
  const emailInput = document.getElementById("faEmail");
  const passwordInput = document.getElementById("faPassword");
  const passwordConfirmInput = document.getElementById("faPasswordConfirm");
  const feedback = document.getElementById("faFeedback");
  const saveBtn = document.getElementById("faSave");

  function setFeedback(message = "", type = "error") {
    if (!feedback) return;

    if (!message) {
      feedback.textContent = "";
      feedback.className = "hidden";
      return;
    }

    feedback.textContent = message;
    feedback.className = type === "success"
      ? "admin-users-feedback admin-feedback-success"
      : "admin-users-feedback admin-feedback-error";
  }

  function setAvatarPreview(file) {
    if (!avatarPreview) return;

    if (!file) {
      avatarPreview.textContent = "IMG";
      avatarPreview.style.backgroundImage = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      avatarPreview.textContent = "";
      avatarPreview.style.backgroundImage = `url('${reader.result}')`;
      avatarPreview.style.backgroundSize = "cover";
      avatarPreview.style.backgroundPosition = "center";
    };
    reader.readAsDataURL(file);
  }

  async function getCurrentSessionUser() {
    const { data, error } = await window.sb.auth.getSession();
    if (error) throw error;

    const session = data?.session || null;
    const user = session?.user || null;

    if (!user) {
      throw new Error("Link inválido ou expirado.");
    }

    return user;
  }

  async function loadProfile(userId) {
    const { data, error } = await window.sb
      .from("profiles")
      .select("id, email, full_name, avatar_path")
      .eq("id", userId)
      .single();

    if (error) throw error;
    return data;
  }

  async function uploadAvatar(userId, file) {
    if (!file) return null;

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${userId}/avatar.${ext}`;

    const { error } = await window.sb.storage
      .from("user-avatars")
      .upload(path, file, { upsert: true });

    if (error) throw error;

    return path;
  }

  async function saveFirstAccess() {
    try {
      setFeedback("");

      const fullName = String(fullNameInput?.value || "").trim();
      const password = String(passwordInput?.value || "");
      const passwordConfirm = String(passwordConfirmInput?.value || "");
      const selectedAvatar = avatarFile?.files?.[0] || null;

      if (!fullName) {
        setFeedback("Digite seu nome completo.");
        return;
      }

      if (!password) {
        setFeedback("Digite sua senha.");
        return;
      }

      if (password.length < 6) {
        setFeedback("A senha deve ter pelo menos 6 caracteres.");
        return;
      }

      if (password !== passwordConfirm) {
        setFeedback("A confirmação da senha não confere.");
        return;
      }

      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Salvando...";
      }

      const user = await getCurrentSessionUser();

      let avatarPath = null;
      if (selectedAvatar) {
        avatarPath = await uploadAvatar(user.id, selectedAvatar);
      }

      const { error: passwordError } = await window.sb.auth.updateUser({
        password
      });

      if (passwordError) throw passwordError;

      const payload = {
        full_name: fullName,
        first_access_completed: true,
        updated_at: new Date().toISOString()
      };

      if (avatarPath) {
        payload.avatar_path = avatarPath;
      }

      const { error: profileError } = await window.sb
        .from("profiles")
        .update(payload)
        .eq("id", user.id);

      if (profileError) throw profileError;

      setFeedback("Primeiro acesso concluído com sucesso.", "success");

      setTimeout(() => {
        window.location.href = "../../index.html";
      }, 1200);
    } catch (err) {
      console.error("[FIRST ACCESS] erro:", err);
      setFeedback(err?.message || "Não foi possível concluir o primeiro acesso.");
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "Salvar e continuar";
      }
    }
  }

  try {
    const user = await getCurrentSessionUser();
    const profile = await loadProfile(user.id);

    if (emailInput) emailInput.value = profile?.email || user.email || "";
    if (fullNameInput) fullNameInput.value = profile?.full_name || "";
  } catch (err) {
    console.error("[FIRST ACCESS] erro ao iniciar:", err);
    setFeedback("Link inválido ou expirado.");
  }

  if (avatarPick && avatarFile) {
    avatarPick.addEventListener("click", () => {
      avatarFile.click();
    });
  }

  if (avatarFile) {
    avatarFile.addEventListener("change", () => {
      const file = avatarFile.files?.[0] || null;
      setAvatarPreview(file);
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", saveFirstAccess);
  }
});