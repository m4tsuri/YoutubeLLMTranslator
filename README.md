# YoutubeLLMTranslator

YoutubeLLMTranslator is a powerful Chrome/Edge extension that leverages local or cloud-based Large Language Models (LLMs) to provide real-time translation and deep contextual analysis of YouTube video subtitles. It is designed to offer a seamless and immersive language learning and viewing experience.

## Features

- **Pause & Analyze (Core Feature):** 
  When you encounter a difficult sentence while watching a video, simply pause the player. The extension will instantly display a deep contextual analysis of the current on-screen subtitle. This analysis includes:
  - Precise translation of the entire paragraph.
  - Highlighting of the exact subtitle fragment you paused on.
  - Extraction and explanation of key vocabulary, idioms, and proper nouns (like names, places, or specific events) based on the video's context.
  - Zero-latency experience backed by a prefetch buffering mechanism that translates upcoming sentences in the background.

- **Real-Time Translation:**
  Optionally display AI-generated translated subtitles natively on the YouTube player in real-time, synchronized with the video playback.

- **Customizable LLM Backend:**
  Configure the extension to point to any OpenAI-compatible API endpoint. Whether you are running a local LLM via vLLM/Ollama (e.g., a 35B model) or using a cloud provider, you can easily set your API URL, API Key, and Model Name in the extension settings.

- **Robust Error Handling & Auto-Retry:**
  Built-in mechanisms to handle network fluctuations or API errors, featuring auto-retries and manual retry buttons to ensure you never miss a translation.

- **Strict Structured Output:**
  Uses JSON Schema strict mode to guarantee that the LLM always returns perfectly formatted data for stable rendering.

## Installation

1. Open your Chromium-based browser (Chrome, Edge, Brave) and navigate to the extensions page (`chrome://extensions/` or `edge://extensions/`).
2. Enable **Developer mode** in the top right corner.
3. Click on **Load unpacked** and select the directory containing this project.
4. Pin the extension to your toolbar for quick access to settings.

## Configuration

Click on the extension icon in your browser toolbar to open the settings panel:

- **API URL:** Your OpenAI-compatible API endpoint (default: `http://localhost:30000/v1/chat/completions`).
- **API Key:** Your authentication token (if required by your backend).
- **Model Name:** The name of the model you wish to use.
- **Operation Mode:** Choose between "Pause Analysis Only", "Live Translation Only", or "Both".
- **Live Subtitle Font Size:** Adjust the size of the real-time translated text.
- **Prefetch Buffer:** Define how many sentences the extension should translate in advance to ensure instant results when pausing.

## Usage

1. Open a YouTube video that has closed captions (CC) enabled.
2. The extension will automatically start processing the subtitles based on your operation mode.
3. **Press the Spacebar to pause the video.** The intelligent analysis panel will immediately pop up, providing translations and vocabulary insights for the current context.

![Usage Screenshot](usage.png)

## Privacy and Security

This extension runs locally in your browser. All communication happens directly between your browser and the API endpoint you configure. No telemetry or tracking data is collected.
