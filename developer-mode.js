(() => {
  const ACCESS_PASSWORD = "yan88888";
  const SESSION_KEY = "ys-developer-mode-enabled";
  const body = document.body;
  const toggle = document.getElementById("developerModeToggle");
  const dialog = document.getElementById("developerModeDialog");
  const form = document.getElementById("developerModeForm");
  const close = document.getElementById("developerModeClose");
  const input = document.getElementById("developerModePassword");
  const status = document.getElementById("developerModeStatus");
  const editorToggles = [
    document.getElementById("portfolioImageEditorToggle"),
    document.getElementById("portfolioEditorToggle")
  ].filter(Boolean);

  if (!toggle || !dialog || !form || !input || !status) return;

  const sync = (enabled) => {
    body.classList.toggle("developer-mode-enabled", enabled);
    toggle.setAttribute("aria-expanded", String(enabled));
    toggle.textContent = enabled ? "退出开发者模式" : "开发者模式";
    editorToggles.forEach((button) => {
      button.disabled = !enabled;
      button.setAttribute("aria-hidden", String(!enabled));
      if (enabled) button.removeAttribute("tabindex");
      else button.setAttribute("tabindex", "-1");
    });
  };

  const openAccessDialog = () => {
    input.value = "";
    status.textContent = "";
    form.classList.remove("is-error");
    dialog.showModal();
    requestAnimationFrame(() => input.focus());
  };

  const disableDeveloperMode = () => {
    document.getElementById("portfolioEditorClose")?.click();
    document.getElementById("portfolioImageEditorClose")?.click();
    sessionStorage.removeItem(SESSION_KEY);
    sync(false);
  };

  toggle.addEventListener("click", () => {
    if (body.classList.contains("developer-mode-enabled")) disableDeveloperMode();
    else openAccessDialog();
  });

  close?.addEventListener("click", () => dialog.close());

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (input.value !== ACCESS_PASSWORD) {
      status.textContent = "密码不正确，请重试。";
      form.classList.remove("is-error");
      void form.offsetWidth;
      form.classList.add("is-error");
      input.select();
      return;
    }

    sessionStorage.setItem(SESSION_KEY, "true");
    sync(true);
    dialog.close();
    toggle.focus();
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  sync(sessionStorage.getItem(SESSION_KEY) === "true");
})();
