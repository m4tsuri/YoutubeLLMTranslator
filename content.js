// Inject interceptor script into the main world
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
(document.head || document.documentElement).appendChild(script);

let subtitles = [];
let videoElement = null;
let subtitleOverlay = null;
let pauseOverlay = null;
let debugOverlay = null;
let lastSentenceStr = '';
let isPaused = false;
let userSettings = {
  translationMode: 'pause_only',
  fontSize: 28,
  prefetchBuffer: 5,
  maxRetries: 2,
  showDebug: false
};

// Load initial settings
chrome.storage.sync.get({
  translationMode: 'pause_only',
  fontSize: 28,
  prefetchBuffer: 5,
  maxRetries: 2,
  showDebug: false
}, (items) => {
  userSettings = items;
  applySettings();
});

// Listen for settings updates from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'UPDATE_SETTINGS') {
    userSettings = { ...userSettings, ...request.settings };
    applySettings();
  }
});

function applySettings() {
  if (subtitleOverlay) {
    subtitleOverlay.style.fontSize = userSettings.fontSize + 'px';
  }
  if (pauseOverlay) {
    pauseOverlay.style.setProperty('--llm-font-size', userSettings.fontSize + 'px');
  }
  
  if (debugOverlay) {
    debugOverlay.style.display = userSettings.showDebug ? 'block' : 'none';
  }

  // Immediately update UI based on mode if needed
  if (!isPaused) {
    if (userSettings.translationMode === 'pause_only' && subtitleOverlay) {
      subtitleOverlay.style.display = 'none';
    } else if (subtitleOverlay) {
      subtitleOverlay.style.display = 'block';
    }
  }
}

// Listen for intercepted subtitle data
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'YT_SUBTITLES') {
    const data = event.data.data;
    if (data.events) {
      const rawSegs = data.events.map(ev => {
        if (!ev.segs) return null;
        const text = ev.segs.map(s => s.utf8).join('').replace(/\n/g, ' ');
        return {
          start: ev.tStartMs / 1000,
          end: (ev.tStartMs + (ev.dDurationMs || 0)) / 1000,
          text: text
        };
      }).filter(s => s && s.text.trim());
      
      mergeIntoSentences(rawSegs);
    }
  }
});

// Heuristically merge fragments into sentences based on punctuation
function mergeIntoSentences(rawSegs) {
  const sentences = [];
  let currentSentence = null;
  
  for (const sub of rawSegs) {
    if (!currentSentence) {
      currentSentence = { start: sub.start, end: sub.end, text: sub.text.trim() };
    } else {
      currentSentence.text += ' ' + sub.text.trim();
      currentSentence.end = sub.end;
    }
    
    // Split point: ends with punctuation or long gap
    if (/[.!?]$/.test(sub.text.trim())) {
      sentences.push(currentSentence);
      currentSentence = null;
    }
  }
  if (currentSentence) sentences.push(currentSentence);
  
  subtitles = sentences;
  console.log("LLM Translator: Loaded " + subtitles.length + " sentences.");
}

function setupVideo() {
  videoElement = document.querySelector('video');
  const playerContainer = document.querySelector('.html5-video-player');
  
  if (!videoElement || !playerContainer) {
    setTimeout(setupVideo, 1000);
    return;
  }
  
  if (!document.getElementById('yt-llm-subtitle-overlay')) {
    subtitleOverlay = document.createElement('div');
    subtitleOverlay.id = 'yt-llm-subtitle-overlay';
    playerContainer.appendChild(subtitleOverlay);
  } else {
    subtitleOverlay = document.getElementById('yt-llm-subtitle-overlay');
  }
  
  if (!document.getElementById('yt-llm-pause-overlay')) {
    pauseOverlay = document.createElement('div');
    pauseOverlay.id = 'yt-llm-pause-overlay';
    
    // Prevent scrolling and key events from leaking to the video player
    const stopPropagation = (e) => e.stopPropagation();
    pauseOverlay.addEventListener('wheel', stopPropagation);
    pauseOverlay.addEventListener('keydown', stopPropagation);
    pauseOverlay.addEventListener('touchstart', stopPropagation);
    pauseOverlay.addEventListener('touchmove', stopPropagation);
    
    playerContainer.appendChild(pauseOverlay);
  } else {
    pauseOverlay = document.getElementById('yt-llm-pause-overlay');
  }

  // Setup debug overlay
  if (!document.getElementById('yt-llm-debug-window')) {
    debugOverlay = document.createElement('div');
    debugOverlay.id = 'yt-llm-debug-window';
    debugOverlay.innerHTML = `
      <h3>LLM Debug Info</h3>
      <div class="debug-section"><span class="debug-label">Status:</span> <span id="debug-status" class="debug-content">Idle</span></div>
      <div class="debug-section"><span class="debug-label">Action:</span> <span id="debug-action" class="debug-content">-</span></div>
      <div class="debug-section"><span class="debug-label">Sent Text:</span> <div id="debug-sent" class="debug-content">-</div></div>
      <div class="debug-section"><span class="debug-label">LLM Response:</span> <div id="debug-response" class="debug-content">-</div></div>
    `;
    playerContainer.appendChild(debugOverlay);
  } else {
    debugOverlay = document.getElementById('yt-llm-debug-window');
  }

  // Apply settings after DOM elements are created so font size is correct on first load
  applySettings();

  // To prevent multiple listeners on SPA navigation
  videoElement.removeEventListener('timeupdate', onTimeUpdate);
  videoElement.removeEventListener('pause', onPause);
  videoElement.removeEventListener('play', onPlay);

  videoElement.addEventListener('timeupdate', onTimeUpdate);
  videoElement.addEventListener('pause', onPause);
  videoElement.addEventListener('play', onPlay);
  
  // Apply settings after DOM elements are created
  applySettings();
}

function updateDebugInfo(status, action, sentText, responseText) {
  if (!debugOverlay) return;
  if (status !== undefined) document.getElementById('debug-status').innerText = status;
  if (action !== undefined) document.getElementById('debug-action').innerText = action;
  if (sentText !== undefined) document.getElementById('debug-sent').innerText = sentText;
  if (responseText !== undefined) document.getElementById('debug-response').innerText = responseText;
}

function getVideoContext() {
  const titleEl = document.querySelector('h1.style-scope.ytd-watch-metadata');
  const title = titleEl ? titleEl.innerText.trim() : '';

  const descEl = document.querySelector('#description-inline-expander');
  const description = descEl ? descEl.innerText.trim() : '';
  
  return { title, description };
}

function getCurrentSentence() {
  if (!videoElement || !subtitles.length) return null;
  const time = videoElement.currentTime;
  return subtitles.find(s => time >= s.start - 0.5 && time <= s.end + 0.5); 
}

function getOnScreenSubtitleText() {
  // Extract currently displayed subtitle text directly from YouTube's DOM
  const captionSegments = document.querySelectorAll('.ytp-caption-segment');
  if (captionSegments && captionSegments.length > 0) {
    let text = Array.from(captionSegments).map(el => el.innerText).join(' ');
    // Clean up newlines or excessive spaces
    return text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return "";
}

let translationCache = {};
let pauseAnalysisCache = {};
let prefetchQueue = [];
let isPrefetching = false;

async function processPrefetch() {
  if (isPrefetching || prefetchQueue.length === 0) return;
  isPrefetching = true;
  
  const item = prefetchQueue.shift();
  if (!pauseAnalysisCache[item.text]) {
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ 
          action: 'analyze', 
          text: item.text,
          context: item.context
        }, (res) => {
          resolve(res);
        });
      });
      if (response && response.result) {
        pauseAnalysisCache[item.text] = response.result;
      }
    } catch(e) {}
  }
  
  isPrefetching = false;
  processPrefetch();
}

function queueForPrefetch(text, context) {
  if (!pauseAnalysisCache[text] && !prefetchQueue.some(i => i.text === text)) {
    prefetchQueue.push({text, context});
    processPrefetch();
  }
}

function onTimeUpdate() {
   if (isPaused) return;

   // Prefetch logic
   const time = videoElement.currentTime;
   const currentIndex = subtitles.findIndex(s => time >= s.start - 0.5 && time <= s.end + 0.5);
   
   if (currentIndex !== -1 && userSettings.translationMode !== 'live_only') {
     // Prefetch current and next sentences for pause analysis
     const bufferSize = userSettings.prefetchBuffer || 0;
     const videoContext = getVideoContext();
     
     for (let i = 0; i < bufferSize; i++) {
       if (currentIndex + i < subtitles.length) {
         let textToAnalyze = subtitles[currentIndex + i].text;
         if (textToAnalyze.split(' ').length < 4 && currentIndex + i + 1 < subtitles.length) {
            textToAnalyze += " " + subtitles[currentIndex + i + 1].text;
         }
         
         // Extract previous subtitles for better context
         let previousSubtitles = "";
         if (currentIndex + i > 0) {
           previousSubtitles = subtitles.slice(Math.max(0, currentIndex + i - 3), currentIndex + i).map(s => s.text).join(' ');
         }
         
         queueForPrefetch(textToAnalyze, { ...videoContext, previousSubtitles });
       }
     }
   }

   if (userSettings.translationMode === 'pause_only') {
      if (subtitleOverlay) subtitleOverlay.style.display = 'none';
      return;
   }

   const current = getCurrentSentence();
   if (current) {
      if (current.text !== lastSentenceStr) {
         lastSentenceStr = current.text;
         
         const currentIndex = subtitles.findIndex(s => time >= s.start - 0.5 && time <= s.end + 0.5);
         let previousSubtitles = "";
         if (currentIndex > 0) {
           previousSubtitles = subtitles.slice(Math.max(0, currentIndex - 3), currentIndex).map(s => s.text).join(' ');
         }
         const context = { ...getVideoContext(), previousSubtitles };
         
         translateLiveSubtitle(current.text, context);
      }
   } else {
      subtitleOverlay.innerText = '';
      lastSentenceStr = '';
   }
}

function translateLiveSubtitle(text, context = null) {
  if (translationCache[text]) {
    subtitleOverlay.innerText = translationCache[text];
    updateDebugInfo("Cached", "Translate", text, translationCache[text]);
    return;
  }
  subtitleOverlay.innerText = '正在翻译...';
  updateDebugInfo("Translating...", "Translate", text, "Waiting for LLM response...");
  


  chrome.runtime.sendMessage({ action: 'translate', text: text, context: context }, (response) => {
    if (chrome.runtime.lastError) {
      updateDebugInfo("Error", "Translate", text, chrome.runtime.lastError.message);
      return;
    }
    if (response && response.result) {
      translationCache[text] = response.result;
      updateDebugInfo("Idle", "Translate", text, response.result);
      if (lastSentenceStr === text && !isPaused) {
         subtitleOverlay.innerText = response.result;
      }
    } else {
      updateDebugInfo("Error", "Translate", text, response ? response.error : 'Unknown error');
    }
  });
}

function onPause() {
  isPaused = true;
  if (subtitleOverlay) subtitleOverlay.style.display = 'none'; // Hide live translation
  
  if (userSettings.translationMode === 'live_only') return;

  // Find the sentence that is currently on screen
  const time = videoElement.currentTime;
  const currentIndex = subtitles.findIndex(s => time >= s.start - 0.5 && time <= s.end + 0.5);
  
  if (currentIndex !== -1) {
    const current = subtitles[currentIndex];
    let textToAnalyze = current.text;

    // If the sentence seems too short, append the next one to give LLM better context
    if (textToAnalyze.split(' ').length < 4 && currentIndex + 1 < subtitles.length) {
       textToAnalyze += " " + subtitles[currentIndex + 1].text;
    }
    
    let previousSubtitles = "";
    if (currentIndex > 0) {
      previousSubtitles = subtitles.slice(Math.max(0, currentIndex - 3), currentIndex).map(s => s.text).join(' ');
    }
    const context = { ...getVideoContext(), previousSubtitles };

    showPauseAnalysis(textToAnalyze, context);
  }
}

function onPlay() {
  isPaused = false;
  if (pauseOverlay) pauseOverlay.style.display = 'none';
  if (userSettings.translationMode !== 'pause_only' && subtitleOverlay) {
    subtitleOverlay.style.display = 'block';
  }
}

function showPauseAnalysis(text, context = null, retryCount = 0) {
  pauseOverlay.style.display = 'flex';
  
  if (pauseAnalysisCache[text]) {
    updateDebugInfo("Cached", "Analyze", text, pauseAnalysisCache[text]);
    renderPauseAnalysis(pauseAnalysisCache[text], text, context);
    return;
  }

  const retryText = retryCount > 0 ? ` (重试第 ${retryCount} 次...)` : '';
  pauseOverlay.innerHTML = `<div class="llm-analysis-container"><div class="sentence-zh" style="font-size: var(--llm-font-size, 24px);">正在利用本地大模型进行深度解析${retryText}</div></div>`;
  
  updateDebugInfo("Analyzing...", "Analyze", text, "Waiting for LLM response...");

  chrome.runtime.sendMessage({ action: 'analyze', text: text, context: context }, (response) => {
    if (chrome.runtime.lastError || (response && response.error)) {
        const errMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : response.error;
        updateDebugInfo("Error", "Analyze", text, errMsg);
        
        if (retryCount < (userSettings.maxRetries || 0)) {
            setTimeout(() => {
                showPauseAnalysis(text, context, retryCount + 1);
            }, 1000);
            return;
        }

        // Attach retry function to window so the button can call it
        window.__yt_llm_retry_analysis = () => showPauseAnalysis(text, context, 0);
        
        pauseOverlay.innerHTML = `
        <div class="llm-analysis-container">
            <div class="sentence-zh" style="color:#ff6b6b; font-size: var(--llm-font-size, 24px);">解析失败: ${errMsg}</div>
            <button class="llm-retry-btn" id="llm-retry-btn-fetch">重试 (Retry)</button>
        </div>`;
        const btn = document.getElementById('llm-retry-btn-fetch');
        if (btn) btn.addEventListener('click', () => {
             delete pauseAnalysisCache[text];
             showPauseAnalysis(text, context, 0);
        });
        return;
    }
    
    if (response && response.result) {
      pauseAnalysisCache[text] = response.result;
      updateDebugInfo("Idle", "Analyze", text, response.result);
      renderPauseAnalysis(response.result, text, context);
    }
  });
}

function renderPauseAnalysis(analysisDataStr, textForRetry, contextForRetry) {
   try {
     // Handle Markdown JSON block if LLM outputs it
     const jsonStrMatch = analysisDataStr.match(/```json\n([\s\S]*?)\n```/);
     const jsonStr = jsonStrMatch ? jsonStrMatch[1] : analysisDataStr;
     const data = JSON.parse(jsonStr);
     
     // Identify currently playing part to highlight
     const screenText = getOnScreenSubtitleText();
     const currentSentenceObj = getCurrentSentence();
     // Prefer DOM text if available, otherwise fallback to array
     const currentText = screenText || (currentSentenceObj ? currentSentenceObj.text : "");
     
     let finalTranslationHTML = "";
     if (data.sentences && Array.isArray(data.sentences)) {
         data.sentences.forEach(s => {
             // Match English to highlight the corresponding Chinese
             let isHighlighted = false;
             // Calculate character overlap
             if (currentText && s.en) {
                // Remove punctuation and lowercase for better matching
                const cleanCurrent = currentText.toLowerCase().replace(/[^a-z0-9]/g, '');
                const cleanEn = s.en.toLowerCase().replace(/[^a-z0-9]/g, '');
                
                // If they have substantial overlap (one contains a large part of the other)
                if (cleanCurrent && cleanEn && (cleanEn.includes(cleanCurrent) || cleanCurrent.includes(cleanEn) || (cleanCurrent.length > 5 && (s.en.toLowerCase().includes(currentText.toLowerCase().substring(0, 10)))))) {
                    isHighlighted = true;
                }
             }
             if (isHighlighted) {
                 finalTranslationHTML += `<span class="highlight-text">${s.zh}</span> `;
             } else {
                 finalTranslationHTML += `${s.zh} `;
             }
         });
     } else if (data.translation) {
         // Fallback just in case LLM ignored sentences structure
         finalTranslationHTML = data.translation;
     }
     
     let html = `<div class="llm-analysis-container">`;
     html += `<div class="sentence-zh">${finalTranslationHTML.trim()}</div>`;
     if (data.vocabulary && data.vocabulary.length > 0) {
        html += `<div class="vocab-list">`;
        data.vocabulary.forEach(v => {
           html += `<div class="vocab-item"><span class="word">${v.word}</span> <span class="meaning">${v.meaning}</span></div>`;
        });
        html += `</div>`;
     }
     html += `</div>`;
     pauseOverlay.innerHTML = html;
   } catch(e) {
     console.error("Failed to parse LLM analysis:", e, analysisDataStr);
     pauseOverlay.innerHTML = `
     <div class="llm-analysis-container">
       <div class="sentence-zh" style="color:#ff6b6b;">解析失败，大模型返回格式异常</div>
       <button class="llm-retry-btn" onclick="window.__yt_llm_retry_analysis()">重试 (Retry)</button>
     </div>`;
   }
}

// Handle YouTube Single Page App (SPA) navigation
let lastUrl = location.href; 
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    subtitles = [];
    translationCache = {};
    lastSentenceStr = '';
    if (subtitleOverlay) subtitleOverlay.innerText = '';
    if (pauseOverlay) pauseOverlay.style.display = 'none';
  }
  // Keep trying to find the video element when switching pages
  if (!videoElement || !document.contains(videoElement)) {
     setupVideo();
  }
}).observe(document, {subtree: true, childList: true});

// Initialize on load
setTimeout(setupVideo, 2000);