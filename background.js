// Default values if storage is not set
let LLM_URL = 'http://localhost:30000/v1/chat/completions';
let MODEL_NAME = 'default';
let API_KEY = '';

// Load initially and keep updated
chrome.storage.sync.get({
  apiUrl: 'http://localhost:30000/v1/chat/completions',
  apiKey: '',
  modelName: 'default'
}, (items) => {
  LLM_URL = items.apiUrl;
  API_KEY = items.apiKey;
  MODEL_NAME = items.modelName;
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    if (changes.apiUrl) LLM_URL = changes.apiUrl.newValue;
    if (changes.apiKey) API_KEY = changes.apiKey.newValue;
    if (changes.modelName) MODEL_NAME = changes.modelName.newValue;
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    let systemPrompt = "你是一个专业的字幕翻译员，深谙英语地道表达与中文习惯。请将以下英文字幕翻译成流畅的中文，不要输出任何解释或其他内容。只输出翻译结果。";

    if (request.context && (request.context.title || request.context.description || request.context.previousSubtitles)) {
      systemPrompt += `\n\n【视频背景信息】（供翻译参考，请勿直接翻译背景信息）：\n`;
      if (request.context.title) systemPrompt += `- 视频标题：${request.context.title}\n`;
      if (request.context.description) systemPrompt += `- 视频简介（节选）：${request.context.description.substring(0, 300)}\n`;
      if (request.context.previousSubtitles) systemPrompt += `- 上文：${request.context.previousSubtitles}\n`;
    }

    callLLM(systemPrompt, request.text)
     .then(res => sendResponse({ result: res }))
     .catch(err => sendResponse({ error: err.message }));
    return true; // Keep message channel open
  }

  if (request.action === 'analyze') {
    let systemPrompt = `你是一个专业的英语学习助手与百科全书。请分析下面的一段话，提供它的精准中文翻译。由于我会提供一小段完整的上下文，而用户可能只卡在其中的某一句（当前字幕残句），请将你的翻译结果映射到每一句英文上，以便我能进行高亮。
同时，提取出整个段落中重要或有难度的单词、词组、专有名词（如人名、地名、机构名、特定事件），并解释其在当前语境中的含义与背景。

必须返回严格的JSON格式数据，不要有任何其他输出。JSON格式如下：
{
  "sentences": [
    { "en": "第一句英文原句", "zh": "对应的中文翻译" },
    { "en": "第二句英文原句", "zh": "对应的中文翻译" }
  ],
  "vocabulary": [
    { "word": "单词或词组1", "meaning": "语境词义或百科解释1" }
  ]
}`;

    if (request.context && (request.context.title || request.context.description || request.context.previousSubtitles)) {
      systemPrompt += `\n\n【视频背景信息】（供解析参考）：\n`;
      if (request.context.title) systemPrompt += `- 视频标题：${request.context.title}\n`;
      if (request.context.description) systemPrompt += `- 视频简介（节选）：${request.context.description.substring(0, 300)}\n`;
      if (request.context.previousSubtitles) systemPrompt += `- 上下文：${request.context.previousSubtitles}\n`;
    }

    callLLM(systemPrompt, request.text, true)
     .then(res => sendResponse({ result: res }))
     .catch(err => sendResponse({ error: err.message }));
    return true; // Keep message channel open
  }
});

async function callLLM(systemPrompt, userText, isJson = false) {
  const payload = {
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText }
      ],
      stream: false,
      temperature: 0.1
  };

  if (isJson) {
      payload.response_format = { 
          type: "json_schema",
          json_schema: {
              name: "pause_analysis_schema",
              strict: true,
              schema: {
                  type: "object",
                  properties: {
                      sentences: {
                          type: "array",
                          description: "The paragraph broken down into individual sentences with English to Chinese mapping.",
                          items: {
                              type: "object",
                              properties: {
                                  en: { type: "string", description: "The original English sentence" },
                                  zh: { type: "string", description: "The translated Chinese sentence" }
                              },
                              required: ["en", "zh"],
                              additionalProperties: false
                          }
                      },
                      vocabulary: {
                          type: "array",
                          description: "List of important words, phrases, or entities and their meanings.",
                          items: {
                              type: "object",
                              properties: {
                                  word: { type: "string", description: "The word, phrase or entity" },
                                  meaning: { type: "string", description: "The explanation or Wikipedia-like description in Chinese" }
                              },
                              required: ["word", "meaning"],
                              additionalProperties: false
                          }
                      }
                  },
                  required: ["sentences", "vocabulary"],
                  additionalProperties: false
              }
          }
      };
  }

  
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) {
      headers['Authorization'] = `Bearer ${API_KEY}`;
  }

  const response = await fetch(LLM_URL, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    throw new Error("LLM API Error: " + response.status);
  }
  
  const data = await response.json();
  return data.choices[0].message.content.trim();
}