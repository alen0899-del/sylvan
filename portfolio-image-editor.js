(() => {
  const storageKey = "ys-portfolio-images-v2";
  const toggle = document.getElementById("portfolioImageEditorToggle");
  const editor = document.getElementById("portfolioImageEditor");
  const close = document.getElementById("portfolioImageEditorClose");
  const picker = document.getElementById("portfolioImageEditorPicker");
  const selectionLabel = document.getElementById("portfolioImageEditorSelection");
  const preview = document.getElementById("portfolioImageEditorPreview");
  const previewImage = document.getElementById("portfolioImageEditorPreviewImage");
  const upload = document.getElementById("portfolioImageEditorUpload");
  const uploadLabel = upload?.closest("label");
  const scale = document.getElementById("portfolioImageScale");
  const positionX = document.getElementById("portfolioImageX");
  const positionY = document.getElementById("portfolioImageY");
  const brightness = document.getElementById("portfolioImageBrightness");
  const scaleValue = document.getElementById("portfolioImageScaleValue");
  const xValue = document.getElementById("portfolioImageXValue");
  const yValue = document.getElementById("portfolioImageYValue");
  const brightnessValue = document.getElementById("portfolioImageBrightnessValue");
  const save = document.getElementById("portfolioImageEditorSave");
  const resetCurrent = document.getElementById("portfolioImageEditorResetCurrent");
  const resetAll = document.getElementById("portfolioImageEditorResetAll");
  const status = document.getElementById("portfolioImageEditorStatus");
  if (!toggle || !editor) return;

  const images = new Set();
  const applying = new WeakSet();
  let imageSerial = 0;
  let selected = null;
  let selecting = false;
  let suppressNextClick = false;
  let edits = {};
  let draft = null;

  const readEdits = () => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "{}"); }
    catch { return {}; }
  };

  const writeEdits = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(edits));
      status.textContent = "已保存，刷新页面后仍会保留";
    } catch {
      status.textContent = "图片已应用；文件较大，浏览器空间不足，刷新后可能无法保留";
    }
  };

  const isEditableImage = (image) => {
    if (!(image instanceof HTMLImageElement)) return false;
    if (image.closest(".portfolio-editor")) return false;
    return Boolean(image.getAttribute("src"));
  };

  const keyFor = (image) => image.dataset.portfolioImageKey || image.getAttribute("src") || "";
  const matchingImages = (key) => [...images].filter((image) => keyFor(image) === key);

  const setImageSource = (image, source) => {
    applying.add(image);
    image.dataset.portfolioAppliedSrc = source;
    if (image.getAttribute("src") !== source) image.setAttribute("src", source);
    queueMicrotask(() => applying.delete(image));
  };

  const restoreElement = (image) => {
    setImageSource(image, image.dataset.portfolioDefaultSrc);
    image.style.objectPosition = image.dataset.portfolioDefaultObjectPosition || "";
    image.style.scale = image.dataset.portfolioDefaultScale || "";
    image.style.filter = image.dataset.portfolioDefaultFilter || "";
  };

  const applyEdit = (image, edit) => {
    if (!edit) return restoreElement(image);
    setImageSource(image, edit.src || image.dataset.portfolioDefaultSrc);
    image.style.objectPosition = `${edit.x ?? 50}% ${edit.y ?? 50}%`;
    image.style.scale = String((edit.scale ?? 100) / 100);
    image.style.filter = `brightness(${edit.brightness ?? 100}%)`;
  };

  const registerImage = (image, forceNewSource = false) => {
    if (!isEditableImage(image)) return;
    const source = image.getAttribute("src");
    if (!image.dataset.portfolioImageId) image.dataset.portfolioImageId = String(imageSerial++);
    if (!image.dataset.portfolioImageKey || forceNewSource) {
      image.dataset.portfolioImageKey = source;
      image.dataset.portfolioDefaultSrc = source;
      image.dataset.portfolioDefaultObjectPosition = image.style.objectPosition;
      image.dataset.portfolioDefaultScale = image.style.scale;
      image.dataset.portfolioDefaultFilter = image.style.filter;
    }
    images.add(image);
    applyEdit(image, edits[keyFor(image)]);
  };

  edits = readEdits();
  document.querySelectorAll("body img").forEach((image) => registerImage(image));

  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      if (record.type === "childList") {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLImageElement) registerImage(node);
          node.querySelectorAll?.("img").forEach((image) => registerImage(image));
        });
        return;
      }
      const image = record.target;
      if (!isEditableImage(image) || applying.has(image)) return;
      const source = image.getAttribute("src");
      if (source === image.dataset.portfolioAppliedSrc) return;
      registerImage(image, true);
      if (selected === image) selectImage(image);
    });
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });

  const setEnabled = (enabled) => {
    [upload, scale, positionX, positionY, brightness, save, resetCurrent].forEach((control) => { if (control) control.disabled = !enabled; });
    uploadLabel?.setAttribute("aria-disabled", String(!enabled));
  };

  const applyDraftToPage = () => {
    if (!selected || !draft) return;
    matchingImages(draft.key).forEach((image) => applyEdit(image, draft));
  };

  const updatePreview = (applyLive = false) => {
    if (!draft) return;
    preview.classList.remove("is-empty");
    previewImage.src = draft.src;
    previewImage.style.objectPosition = `${draft.x}% ${draft.y}%`;
    previewImage.style.scale = String(draft.scale / 100);
    previewImage.style.filter = `brightness(${draft.brightness}%)`;
    scale.value = String(draft.scale);
    positionX.value = String(draft.x);
    positionY.value = String(draft.y);
    brightness.value = String(draft.brightness);
    scaleValue.textContent = `${draft.scale}%`;
    xValue.textContent = `${draft.x}%`;
    yValue.textContent = `${draft.y}%`;
    brightnessValue.textContent = `${draft.brightness}%`;
    if (applyLive) applyDraftToPage();
  };

  const setSelecting = (active) => {
    selecting = active;
    document.body.classList.toggle("portfolio-image-selecting", active);
    picker.setAttribute("aria-pressed", String(active));
    picker.textContent = active ? "请点击页面中的图片" : "选择页面图片";
    status.textContent = active ? "选择已开启，所有页面图片都可直接点击" : "";
  };

  const clearSelection = () => {
    selected?.classList.remove("is-image-selected");
    selected = null;
    draft = null;
    selectionLabel.textContent = "尚未选择图片";
    preview.classList.add("is-empty");
    previewImage.removeAttribute("src");
    setEnabled(false);
  };

  function selectImage(image) {
    registerImage(image);
    selected?.classList.remove("is-image-selected");
    selected = image;
    selected.classList.add("is-image-selected");
    const key = keyFor(image);
    const saved = edits[key];
    draft = saved
      ? { ...saved, key }
      : { key, src: image.dataset.portfolioDefaultSrc, scale: 100, x: 50, y: 50, brightness: 100 };
    const section = image.closest("section[id],section,article,dialog")?.id || image.closest("section,article,dialog")?.className || "当前页面";
    selectionLabel.textContent = `${section || "当前页面"} · ${image.alt || "图片"}`;
    setEnabled(true);
    updatePreview(false);
  }

  const openEditor = () => {
    document.getElementById("portfolioEditorClose")?.click();
    document.querySelectorAll("body img").forEach((image) => registerImage(image));
    editor.hidden = false;
    document.body.classList.add("portfolio-image-editor-open");
    toggle.setAttribute("aria-expanded", "true");
    status.textContent = "";
  };

  const closeEditor = () => {
    setSelecting(false);
    clearSelection();
    editor.hidden = true;
    document.body.classList.remove("portfolio-image-editor-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus();
  };

  const compressImage = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const maxSide = 1600;
        const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const context = canvas.getContext("2d");
        if (!context) return reject(new Error("Canvas unavailable"));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/webp", .82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  toggle.addEventListener("click", openEditor);
  close.addEventListener("click", closeEditor);
  picker.addEventListener("click", () => {
    document.querySelectorAll("body img").forEach((image) => registerImage(image));
    setSelecting(!selecting);
  });

  const resolveImageFromEvent = (event) => event.target.closest("img")
    || event.target.closest(".matrix-sleeve,.matrix-record,.operating-cover,.operating-slide")?.querySelector("img")
    || event.target.closest("[data-operating-carousel]")?.querySelector(".operating-slide.is-active img");

  document.addEventListener("pointerdown", (event) => {
    if (!selecting || editor.contains(event.target) || toggle.contains(event.target)) return;
    if (event.button !== undefined && event.button !== 0) return;
    const target = resolveImageFromEvent(event);
    if (!isEditableImage(target)) {
      status.textContent = "这里不是图片，请点击画面中的作品图片";
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    registerImage(target);
    selectImage(target);
    setSelecting(false);
    suppressNextClick = true;
    window.setTimeout(() => { suppressNextClick = false; }, 300);
  }, true);

  document.addEventListener("click", (event) => {
    if (!suppressNextClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressNextClick = false;
  }, true);

  upload.addEventListener("change", async () => {
    const file = upload.files?.[0];
    if (!file || !selected || !draft) return;
    status.textContent = "正在处理图片…";
    try {
      draft.src = await compressImage(file);
      updatePreview(true);
      status.textContent = "新图片已立即应用，点击“保存并应用”可在刷新后保留";
    } catch {
      status.textContent = "无法读取这张图片，请换一张重试";
    } finally {
      upload.value = "";
    }
  });

  [scale, positionX, positionY, brightness].forEach((control) => control.addEventListener("input", () => {
    if (!draft) return;
    draft.scale = Number(scale.value);
    draft.x = Number(positionX.value);
    draft.y = Number(positionY.value);
    draft.brightness = Number(brightness.value);
    updatePreview(true);
    status.textContent = "调整已立即应用，点击保存可在刷新后保留";
  }));

  save.addEventListener("click", () => {
    if (!selected || !draft) return;
    edits[draft.key] = { src: draft.src, scale: draft.scale, x: draft.x, y: draft.y, brightness: draft.brightness };
    applyDraftToPage();
    writeEdits();
  });

  resetCurrent.addEventListener("click", () => {
    if (!selected || !draft) return;
    const key = draft.key;
    delete edits[key];
    matchingImages(key).forEach(restoreElement);
    draft = { key, src: selected.dataset.portfolioDefaultSrc, scale: 100, x: 50, y: 50, brightness: 100 };
    updatePreview(false);
    writeEdits();
    status.textContent = "当前图片已立即恢复为默认图片";
  });

  resetAll.addEventListener("click", () => {
    edits = {};
    try { localStorage.removeItem(storageKey); } catch {}
    images.forEach(restoreElement);
    clearSelection();
    status.textContent = "全部图片已立即恢复为默认图片";
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !editor.hidden) closeEditor();
  });
})();
