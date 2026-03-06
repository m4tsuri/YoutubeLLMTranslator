(function() {
  // Monkey-patch XMLHttpRequest
  const originalXHR = window.XMLHttpRequest;
  function newXHR() {
    const xhr = new originalXHR();
    const originalOpen = xhr.open;
    const originalSend = xhr.send;

    xhr.open = function(method, url) {
      this._url = url;
      return originalOpen.apply(this, arguments);
    };

    xhr.send = function() {
      this.addEventListener('load', function() {
        if (this._url && this._url.includes('/api/timedtext')) {
          try {
            const data = JSON.parse(this.responseText);
            window.postMessage({ type: 'YT_SUBTITLES', data: data, url: this._url }, '*');
          } catch (e) {
            // ignore parse errors
          }
        }
      });
      return originalSend.apply(this, arguments);
    };
    return xhr;
  }
  window.XMLHttpRequest = newXHR;

  // Monkey-patch fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
    if (url && url.includes('/api/timedtext')) {
      response.clone().json().then(data => {
        window.postMessage({ type: 'YT_SUBTITLES', data: data, url: url }, '*');
      }).catch(e => {});
    }
    return response;
  };
})();