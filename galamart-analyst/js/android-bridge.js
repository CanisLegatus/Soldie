window.__bootStamp && window.__bootStamp('js/android-bridge.js: выполнение');
/* Android WebView bridge. In a normal browser this file intentionally does nothing. */
(() => {
  if (!window.AndroidBridge) return;

  window.__isAndroidApp = true;

  // SheetJS normally downloads a blob URL. Android WebView cannot hand blob URLs
  // to the system file picker, so send the generated workbook to the native layer.
  if (typeof XLSX !== 'undefined') {
    XLSX.writeFile = (workbook, filename, options = {}) => {
      try {
        const base64 = XLSX.write(workbook, {
          ...options,
          bookType: options.bookType || 'xlsx',
          type: 'base64'
        });
        window.AndroidBridge.saveBase64(filename, base64);
      } catch (error) {
        console.error('Android Excel export failed', error);
        if (typeof showStatus === 'function') showStatus(`❌ Не удалось подготовить Excel: ${error.message}`, 'error');
      }
    };
  }
})();
