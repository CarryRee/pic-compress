const fileInput = document.querySelector("#fileInput");
const dropZone = document.querySelector("#dropZone");
const qualityRange = document.querySelector("#qualityRange");
const qualityValue = document.querySelector("#qualityValue");
const message = document.querySelector("#message");
const originalSize = document.querySelector("#originalSize");
const compressedSize = document.querySelector("#compressedSize");
const savingValue = document.querySelector("#savingValue");
const formatValue = document.querySelector("#formatValue");
const dimensionsValue = document.querySelector("#dimensionsValue");
const afterBar = document.querySelector("#afterBar");
const previewFrame = document.querySelector("#previewFrame");
const previewImage = document.querySelector("#previewImage");
const downloadButton = document.querySelector("#downloadButton");
const originalDimensions = document.querySelector("#originalDimensions");
const widthInput = document.querySelector("#widthInput");
const heightInput = document.querySelector("#heightInput");
const resetSizeButton = document.querySelector("#resetSizeButton");
const ratioModeButton = document.querySelector("#ratioModeButton");
const customModeButton = document.querySelector("#customModeButton");
const dimensionModeHint = document.querySelector("#dimensionModeHint");
const languagePicker = document.querySelector("#languagePicker");
const languageTrigger = document.querySelector("#languageTrigger");
const languageCurrent = document.querySelector("#languageCurrent");
const languageMenu = document.querySelector("#languageMenu");
const languageOptions = Array.from(document.querySelectorAll(".language-option"));

const maxPixels = 24_000_000;
const translations = window.I18N_MESSAGES || {};
const supportedLanguages = ["zh", "en", "ja"];
const languageNames = {
  zh: "中文",
  en: "English",
  ja: "日本語"
};
let currentFile = null;
let currentObjectUrl = null;
let originalWidth = 0;
let originalHeight = 0;
let targetWidth = 0;
let targetHeight = 0;
let activeDimensionInput = null;
let resizeTimer = null;
let compressionRunId = 0;
let resizeMode = "ratio";
let currentLanguage = localStorage.getItem("image-compressor-language") || "zh";
let currentMessage = { key: "initialMessage", isError: false };

if (!supportedLanguages.includes(currentLanguage)) {
  currentLanguage = "zh";
}

qualityRange.addEventListener("input", () => {
  qualityValue.textContent = `${qualityRange.value}%`;

  if (currentFile) {
    compressImage(currentFile);
  }
});

fileInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  handleFile(file);
});

widthInput.addEventListener("input", () => {
  if (resizeMode === "ratio") {
    syncRatioFromWidth();
    return;
  }

  syncCustomDimension("width");
});

heightInput.addEventListener("input", () => {
  if (resizeMode === "ratio") {
    syncRatioFromHeight();
    return;
  }

  syncCustomDimension("height");
});

resetSizeButton.addEventListener("click", () => {
  if (!currentFile || !originalWidth || !originalHeight) {
    return;
  }

  setTargetDimensions(originalWidth, originalHeight);
  compressImage(currentFile);
});

ratioModeButton.addEventListener("click", () => {
  setResizeMode("ratio");
});

customModeButton.addEventListener("click", () => {
  setResizeMode("custom");
});

languageTrigger.addEventListener("click", () => {
  setLanguageMenuOpen(languageMenu.hidden);
});

languageOptions.forEach((option) => {
  option.addEventListener("click", () => {
    setLanguage(option.dataset.language);
    setLanguageMenuOpen(false);
    languageTrigger.focus();
  });
});

document.addEventListener("click", (event) => {
  if (!languagePicker.contains(event.target)) {
    setLanguageMenuOpen(false);
  }
});

languagePicker.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setLanguageMenuOpen(false);
    languageTrigger.focus();
    return;
  }

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    focusAdjacentLanguageOption(event.key === "ArrowDown" ? 1 : -1);
  }

  if (event.key === "Enter" && document.activeElement?.classList.contains("language-option")) {
    document.activeElement.click();
  }
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("is-dragging");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("is-dragging");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-dragging");
  const [file] = event.dataTransfer.files;
  handleFile(file);
});

function handleFile(file) {
  if (!file) {
    setMessage("chooseImage", true);
    return;
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    currentFile = null;
    resetDimensions();
    resetResult();
    setMessage("unsupportedFile", true);
    return;
  }

  currentFile = file;
  resetDimensions();
  compressImage(file);
}

async function compressImage(file) {
  const runId = ++compressionRunId;
  setMessage("compressing");

  try {
    const bitmap = await createImageBitmap(file);

    if (runId !== compressionRunId || file !== currentFile) {
      bitmap.close();
      return;
    }

    const totalPixels = bitmap.width * bitmap.height;

    if (totalPixels > maxPixels) {
      bitmap.close();
      currentFile = null;
      resetDimensions();
      resetResult();
      setMessage("tooLarge", true);
      return;
    }

    if (!originalWidth || !originalHeight) {
      initializeDimensions(bitmap.width, bitmap.height);
    }

    const dimensions = getValidTargetDimensions();

    if (!dimensions) {
      bitmap.close();
      clearGeneratedResult();
      setMessage("invalidDimensions", true);
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const context = canvas.getContext("2d", { alpha: file.type === "image/png" });
    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
    bitmap.close();

    const quality = Number(qualityRange.value) / 100;
    const outputType = chooseOutputType(file.type);
    const blob = await canvasToBlob(canvas, outputType, quality);

    if (runId !== compressionRunId || file !== currentFile) {
      return;
    }

    if (!blob) {
      resetResult();
      setMessage("browserUnsupported", true);
      return;
    }

    renderResult(file, blob, outputType, dimensions);
    setMessage("complete");
  } catch (error) {
    resetResult();
    setMessage("unreadable", true);
  }
}

function chooseOutputType(type) {
  if (type === "image/png") {
    return "image/webp";
  }

  if (type === "image/webp") {
    return "image/webp";
  }

  return "image/jpeg";
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

function renderResult(file, blob, outputType, dimensions) {
  const savedBytes = Math.max(file.size - blob.size, 0);
  const ratio = file.size > 0 ? blob.size / file.size : 0;
  const savedPercent = file.size > 0 ? Math.round((savedBytes / file.size) * 100) : 0;

  originalSize.textContent = formatBytes(file.size);
  compressedSize.textContent = formatBytes(blob.size);
  savingValue.textContent = savedPercent > 0 ? `${savedPercent}%` : "0%";
  formatValue.textContent = outputType.replace("image/", "").toUpperCase();
  dimensionsValue.textContent = `${dimensions.width} x ${dimensions.height}`;
  afterBar.style.width = `${Math.max(Math.min(ratio * 100, 100), 4)}%`;

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
  }

  currentObjectUrl = URL.createObjectURL(blob);
  previewImage.src = currentObjectUrl;
  previewFrame.hidden = false;

  downloadButton.href = currentObjectUrl;
  downloadButton.download = buildDownloadName(file.name, outputType);
  downloadButton.hidden = false;
}

function initializeDimensions(width, height) {
  originalWidth = width;
  originalHeight = height;
  updateOriginalDimensionsText();
  widthInput.disabled = false;
  heightInput.disabled = false;
  resetSizeButton.disabled = false;
  setTargetDimensions(width, height);
}

function resetDimensions() {
  originalWidth = 0;
  originalHeight = 0;
  targetWidth = 0;
  targetHeight = 0;
  activeDimensionInput = null;
  resizeMode = "ratio";
  updateResizeModeUi();
  updateOriginalDimensionsText();
  widthInput.value = "";
  heightInput.value = "";
  widthInput.disabled = true;
  heightInput.disabled = true;
  resetSizeButton.disabled = true;
}

function setTargetDimensions(width, height) {
  targetWidth = width;
  targetHeight = height;
  activeDimensionInput = null;
  widthInput.value = String(width);
  heightInput.value = String(height);
}

function setResizeMode(mode) {
  if (!["ratio", "custom"].includes(mode) || resizeMode === mode) {
    return;
  }

  resizeMode = mode;
  updateResizeModeUi();

  if (mode === "ratio" && originalWidth && originalHeight) {
    syncRatioFromWidth();
    return;
  }

  scheduleCompression();
}

function updateResizeModeUi() {
  ratioModeButton.classList.toggle("is-active", resizeMode === "ratio");
  customModeButton.classList.toggle("is-active", resizeMode === "custom");
  ratioModeButton.setAttribute("aria-pressed", String(resizeMode === "ratio"));
  customModeButton.setAttribute("aria-pressed", String(resizeMode === "custom"));
  dimensionModeHint.textContent =
    resizeMode === "ratio"
      ? t("ratioHint")
      : t("customHint");
}

function syncRatioFromWidth() {
  if (!originalWidth || !originalHeight) {
    return;
  }

  activeDimensionInput = "width";
  const width = Number(widthInput.value);

  if (!Number.isFinite(width) || width < 1) {
    scheduleCompression();
    return;
  }

  const nextWidth = Math.round(width);
  const nextHeight = Math.max(1, Math.round((nextWidth / originalWidth) * originalHeight));
  targetWidth = nextWidth;
  targetHeight = nextHeight;
  widthInput.value = String(nextWidth);
  heightInput.value = String(nextHeight);
  scheduleCompression();
}

function syncRatioFromHeight() {
  if (!originalWidth || !originalHeight) {
    return;
  }

  activeDimensionInput = "height";
  const height = Number(heightInput.value);

  if (!Number.isFinite(height) || height < 1) {
    scheduleCompression();
    return;
  }

  const nextHeight = Math.round(height);
  const nextWidth = Math.max(1, Math.round((nextHeight / originalHeight) * originalWidth));
  targetHeight = nextHeight;
  targetWidth = nextWidth;
  heightInput.value = String(nextHeight);
  widthInput.value = String(nextWidth);
  scheduleCompression();
}

function syncCustomDimension(source) {
  activeDimensionInput = source;
  const input = source === "width" ? widthInput : heightInput;
  const value = Number(input.value);

  if (!Number.isFinite(value) || value < 1) {
    scheduleCompression();
    return;
  }

  const nextValue = Math.round(value);
  input.value = String(nextValue);

  if (source === "width") {
    targetWidth = nextValue;
  } else {
    targetHeight = nextValue;
  }

  scheduleCompression();
}

function scheduleCompression() {
  clearTimeout(resizeTimer);

  if (!currentFile) {
    return;
  }

  resizeTimer = setTimeout(() => {
    compressImage(currentFile);
  }, 180);
}

function getValidTargetDimensions() {
  const width = Math.round(Number(widthInput.value));
  const height = Math.round(Number(heightInput.value));

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1 ||
    width > originalWidth ||
    height > originalHeight
  ) {
    return null;
  }

  targetWidth = width;
  targetHeight = height;
  return { width, height, source: activeDimensionInput };
}

function buildDownloadName(fileName, outputType) {
  const extension = outputType.split("/")[1].replace("jpeg", "jpg");
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return `${baseName || "image"}-compressed.${extension}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function setMessage(key, isError = false) {
  currentMessage = { key, isError };
  renderMessage();
}

function renderMessage() {
  message.textContent = t(currentMessage.key);
  message.classList.toggle("is-error", currentMessage.isError);
}

function updateOriginalDimensionsText() {
  originalDimensions.textContent =
    originalWidth && originalHeight
      ? t("originalSizeLabel", { width: originalWidth, height: originalHeight })
      : t("originalPending");
}

function t(key, values = {}) {
  const text = translations[currentLanguage]?.[key] || translations.zh[key] || key;

  return Object.entries(values).reduce((result, [name, value]) => {
    return result.replaceAll(`{${name}}`, value);
  }, text);
}

function setLanguage(language) {
  currentLanguage = supportedLanguages.includes(language) ? language : "zh";
  localStorage.setItem("image-compressor-language", currentLanguage);
  applyLanguage();
}

function setLanguageMenuOpen(isOpen) {
  languageMenu.hidden = !isOpen;
  languageTrigger.setAttribute("aria-expanded", String(isOpen));
  languagePicker.classList.toggle("is-open", isOpen);

  if (isOpen) {
    getCurrentLanguageOption()?.focus();
  }
}

function focusAdjacentLanguageOption(direction) {
  if (languageMenu.hidden) {
    setLanguageMenuOpen(true);
    return;
  }

  const currentIndex = Math.max(0, languageOptions.indexOf(document.activeElement));
  const nextIndex = (currentIndex + direction + languageOptions.length) % languageOptions.length;
  languageOptions[nextIndex].focus();
}

function getCurrentLanguageOption() {
  return languageOptions.find((option) => option.dataset.language === currentLanguage);
}

function applyLanguage() {
  document.documentElement.lang = currentLanguage === "zh" ? "zh-CN" : currentLanguage;
  document.title = t("pageTitle");
  languageCurrent.textContent = languageNames[currentLanguage];

  const description = document.querySelector('meta[name="description"]');
  if (description) {
    description.setAttribute("content", t("metaDescription"));
  }

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  document.querySelectorAll("[data-i18n-attr]").forEach((element) => {
    element.dataset.i18nAttr.split(",").forEach((binding) => {
      const [attribute, key] = binding.split(":").map((part) => part.trim());
      element.setAttribute(attribute, t(key));
    });
  });

  updateOriginalDimensionsText();
  updateResizeModeUi();
  renderMessage();
  languageOptions.forEach((option) => {
    option.setAttribute("aria-selected", String(option.dataset.language === currentLanguage));
  });
}

function resetResult() {
  originalSize.textContent = "--";
  clearGeneratedResult();
}

function clearGeneratedResult() {
  compressedSize.textContent = "--";
  savingValue.textContent = "--";
  formatValue.textContent = "--";
  dimensionsValue.textContent = "--";
  afterBar.style.width = "0";
  hideDownload();
}

function hideDownload() {
  previewFrame.hidden = true;
  downloadButton.hidden = true;

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

applyLanguage();

