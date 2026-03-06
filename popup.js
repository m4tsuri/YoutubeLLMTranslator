document.addEventListener('DOMContentLoaded', () => {
  const modeRadios = document.querySelectorAll('input[name="mode"]');
  const fontSizeSlider = document.getElementById('fontSize');
  const fontSizeValue = document.getElementById('fontSizeValue');
  const prefetchSlider = document.getElementById('prefetchBuffer');
  const prefetchValue = document.getElementById('prefetchBufferValue');
  const maxRetriesSlider = document.getElementById('maxRetries');
  const maxRetriesValue = document.getElementById('maxRetriesValue');
  const showDebugCheckbox = document.getElementById('showDebug');
  const apiUrlInput = document.getElementById('apiUrl');
  const apiKeyInput = document.getElementById('apiKey');
  const modelNameInput = document.getElementById('modelName');

  // Load saved settings
  chrome.storage.sync.get({
    apiUrl: 'http://localhost:30000/v1/chat/completions',
    apiKey: '',
    modelName: 'default',
    translationMode: 'pause_only', // 'both', 'live_only', 'pause_only'
    fontSize: 28,
    prefetchBuffer: 5,
    maxRetries: 2,
    showDebug: false
  }, (items) => {
    // Set radio
    for (let radio of modeRadios) {
      if (radio.value === items.translationMode) {
        radio.checked = true;
        break;
      }
    }
    // Set sliders & checkbox
    fontSizeSlider.value = items.fontSize;
    fontSizeValue.textContent = items.fontSize + 'px';
    prefetchSlider.value = items.prefetchBuffer;
    prefetchValue.textContent = items.prefetchBuffer;
    maxRetriesSlider.value = items.maxRetries;
    maxRetriesValue.textContent = items.maxRetries;
    showDebugCheckbox.checked = items.showDebug;
    
    apiUrlInput.value = items.apiUrl;
    apiKeyInput.value = items.apiKey;
    modelNameInput.value = items.modelName;
  });
  
  // Save LLM settings on change
  apiUrlInput.addEventListener('change', (e) => {
     chrome.storage.sync.set({ apiUrl: e.target.value });
  });
  apiKeyInput.addEventListener('change', (e) => {
     chrome.storage.sync.set({ apiKey: e.target.value });
  });
  modelNameInput.addEventListener('change', (e) => {
     chrome.storage.sync.set({ modelName: e.target.value });
  });
  

  // Save settings when changed
  modeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const mode = e.target.value;
      chrome.storage.sync.set({ translationMode: mode }, () => {
        notifyContentScript({ type: 'UPDATE_SETTINGS', settings: { translationMode: mode } });
      });
    });
  });

  fontSizeSlider.addEventListener('input', (e) => {
    const size = e.target.value;
    fontSizeValue.textContent = size + 'px';
    chrome.storage.sync.set({ fontSize: parseInt(size, 10) }, () => {
        notifyContentScript({ type: 'UPDATE_SETTINGS', settings: { fontSize: parseInt(size, 10) } });
    });
  });

  prefetchSlider.addEventListener('input', (e) => {
    const val = e.target.value;
    prefetchValue.textContent = val;
    chrome.storage.sync.set({ prefetchBuffer: parseInt(val, 10) }, () => {
        notifyContentScript({ type: 'UPDATE_SETTINGS', settings: { prefetchBuffer: parseInt(val, 10) } });
    });
  });

  maxRetriesSlider.addEventListener('input', (e) => {
    const val = e.target.value;
    maxRetriesValue.textContent = val;
    chrome.storage.sync.set({ maxRetries: parseInt(val, 10) }, () => {
        notifyContentScript({ type: 'UPDATE_SETTINGS', settings: { maxRetries: parseInt(val, 10) } });
    });
  });

  showDebugCheckbox.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    chrome.storage.sync.set({ showDebug: isChecked }, () => {
        notifyContentScript({ type: 'UPDATE_SETTINGS', settings: { showDebug: isChecked } });
    });
  });

  function notifyContentScript(message) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {});
      }
    });
  }
});