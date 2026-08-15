(() => {
  const storageKey = "ys-portfolio-copy-v1";
  const candidateSelector = [
    ".site-header .brand span",
    ".site-header .main-nav a",
    ".site-header .contact-link",
    "main h1", "main h2", "main h3", "main h4",
    "main p", "main span", "main small", "main strong", "main b", "main em", "main figcaption",
    "main .eyebrow", "main .section-no", "main button",
    "dialog h2", "dialog h3", "dialog h4", "dialog p", "dialog span", "dialog small", "dialog strong", "dialog b", "dialog em", "dialog figcaption", "dialog button"
  ].join(",");

  const toggle = document.getElementById("portfolioEditorToggle");
  const editor = document.getElementById("portfolioEditor");
  const close = document.getElementById("portfolioEditorClose");
  const picker = document.getElementById("portfolioEditorPicker");
  const selectionLabel = document.getElementById("portfolioEditorSelection");
  const textInput = document.getElementById("portfolioEditorText");
  const save = document.getElementById("portfolioEditorSave");
  const resetCurrent = document.getElementById("portfolioEditorResetCurrent");
  const resetAll = document.getElementById("portfolioEditorResetAll");
  const status = document.getElementById("portfolioEditorStatus");
  let selected = null;
  let selecting = false;
  let edits = {};

  const setElementText = (element, value) => {
    const lines = String(value).split(/\r?\n/);
    element.replaceChildren();
    lines.forEach((line, index) => {
      if (index) element.append(document.createElement("br"));
      element.append(document.createTextNode(line));
    });
  };

  const getElementText = (element) => [...element.childNodes].map((node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
    return node.nodeName === "BR" ? "\n" : "";
  }).join("").trim();

  const readEdits = () => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "{}"); }
    catch { return {}; }
  };

  const writeEdits = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(edits));
      status.textContent = "已保存到当前浏览器";
    } catch {
      status.textContent = "已应用；当前浏览器不支持本地保存";
    }
  };

  const candidates = [...document.querySelectorAll(candidateSelector)].filter((element) => {
    if (element.closest(".portfolio-editor")) return false;
    if (element.classList.contains("char")) return false;
    if ([...element.children].some((child) => child.tagName !== "BR")) return false;
    return getElementText(element).length > 0;
  });

  candidates.forEach((element, index) => {
    const id = String(index);
    element.dataset.portfolioEditId = id;
    element.dataset.portfolioDefaultText = getElementText(element);
  });

  const setSelecting = (active) => {
    selecting = active;
    document.body.classList.toggle("portfolio-copy-selecting", active);
    picker.setAttribute("aria-pressed", String(active));
    picker.textContent = active ? "请点击页面中的文字" : "选择页面文字";
    status.textContent = active ? "选择已开启，请直接点击页面文字" : "";
  };

  const clearSelection = () => {
    selected?.classList.remove("is-copy-selected");
    selected = null;
    selectionLabel.textContent = "尚未选择文字";
    textInput.value = "";
    textInput.disabled = true;
    save.disabled = true;
    resetCurrent.disabled = true;
  };

  const selectElement = (element) => {
    selected?.classList.remove("is-copy-selected");
    selected = element;
    selected.classList.add("is-copy-selected");
    const section = element.closest("section[id],section,article,dialog")?.id || element.closest("section,article,dialog")?.className || "当前页面";
    selectionLabel.textContent = `${section || "当前页面"} · ${element.tagName.toLowerCase()}`;
    textInput.value = getElementText(element);
    textInput.disabled = false;
    save.disabled = false;
    resetCurrent.disabled = false;
    textInput.focus();
  };

  const openEditor = () => {
    editor.hidden = false;
    document.body.classList.add("portfolio-copy-editor-open");
    toggle.setAttribute("aria-expanded", "true");
    status.textContent = "";
  };

  const closeEditor = () => {
    setSelecting(false);
    clearSelection();
    editor.hidden = true;
    document.body.classList.remove("portfolio-copy-editor-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus();
  };

  edits = readEdits();
  candidates.forEach((element) => {
    const id = element.dataset.portfolioEditId;
    if (Object.prototype.hasOwnProperty.call(edits, id)) setElementText(element, edits[id]);
  });

  toggle.addEventListener("click", openEditor);
  close.addEventListener("click", closeEditor);
  picker.addEventListener("click", () => setSelecting(!selecting));

  document.addEventListener("click", (event) => {
    if (!selecting || editor.contains(event.target) || toggle.contains(event.target)) return;
    const target = event.target.closest("[data-portfolio-edit-id]");
    if (!target) {
      status.textContent = "这里不是可编辑文字，请直接点击标题、段落或标签";
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    selectElement(target);
    setSelecting(false);
  }, true);

  save.addEventListener("click", () => {
    if (!selected) return;
    const value = textInput.value.trim();
    setElementText(selected, value);
    edits[selected.dataset.portfolioEditId] = value;
    writeEdits();
  });

  resetCurrent.addEventListener("click", () => {
    if (!selected) return;
    const id = selected.dataset.portfolioEditId;
    const value = selected.dataset.portfolioDefaultText;
    setElementText(selected, value);
    textInput.value = value;
    delete edits[id];
    writeEdits();
    status.textContent = "已恢复当前默认文字";
  });

  resetAll.addEventListener("click", () => {
    edits = {};
    try { localStorage.removeItem(storageKey); } catch {}
    candidates.forEach((element) => { setElementText(element, element.dataset.portfolioDefaultText); });
    clearSelection();
    status.textContent = "已恢复全部默认文字";
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !editor.hidden) closeEditor();
  });
})();
