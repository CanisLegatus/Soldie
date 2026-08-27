package ru.galamart.markdownmanager;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

/** Hosts the existing offline analyst in a locked-down WebView. */
public final class MainActivity extends Activity {
    private static final int REQUEST_OPEN_FILE = 1001;
    private static final int REQUEST_CREATE_FILE = 1002;
    private static final String ASSET_ORIGIN = "https://appassets.androidplatform.net/assets/www/";

    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private PendingWrite pendingWrite;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        configureWebView(webView);
        setContentView(webView);
        webView.loadUrl(ASSET_ORIGIN + "index.html");
    }

    @SuppressWarnings("SetJavaScriptEnabled")
    private void configureWebView(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true); // zones and settings are stored locally by the original app.
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // required for Android's document picker URIs.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(true);

        view.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        view.setWebViewClient(new OfflineAssetClient());
        view.setWebChromeClient(new AppChromeClient());
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_OPEN_FILE) {
            if (fileChooserCallback == null) return;
            Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            fileChooserCallback.onReceiveValue(result);
            fileChooserCallback = null;
            return;
        }
        if (requestCode == REQUEST_CREATE_FILE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingWrite != null) {
                try (java.io.OutputStream stream = getContentResolver().openOutputStream(data.getData())) {
                    if (stream == null) throw new IOException("Не удалось открыть выбранный файл");
                    stream.write(pendingWrite.bytes);
                    Toast.makeText(this, "Файл сохранён", Toast.LENGTH_SHORT).show();
                } catch (IOException e) {
                    Toast.makeText(this, "Не удалось сохранить файл: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            }
            pendingWrite = null;
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidBridge");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private void chooseFile(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
        fileChooserCallback = callback;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE);
        try {
            startActivityForResult(intent, REQUEST_OPEN_FILE);
        } catch (ActivityNotFoundException e) {
            fileChooserCallback.onReceiveValue(null);
            fileChooserCallback = null;
            Toast.makeText(this, "Не найдено приложение для выбора файла", Toast.LENGTH_LONG).show();
        }
    }

    private void requestSave(String filename, byte[] bytes, String mimeType) {
        runOnUiThread(() -> {
            pendingWrite = new PendingWrite(bytes);
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(mimeType);
            intent.putExtra(Intent.EXTRA_TITLE, safeFilename(filename));
            try {
                startActivityForResult(intent, REQUEST_CREATE_FILE);
            } catch (ActivityNotFoundException e) {
                pendingWrite = null;
                Toast.makeText(this, "Не найден диалог сохранения файлов", Toast.LENGTH_LONG).show();
            }
        });
    }

    private static String safeFilename(String name) {
        String safe = name == null ? "export.xlsx" : name.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        return safe.isEmpty() ? "export.xlsx" : safe;
    }

    private final class AppChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            chooseFile(callback, params);
            return true;
        }
    }

    /** Exposes only save operations to JavaScript served from the bundled app origin. */
    private final class AndroidBridge {
        @JavascriptInterface
        public void saveBase64(String filename, String base64) {
            try {
                requestSave(filename, Base64.decode(base64, Base64.DEFAULT),
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            } catch (IllegalArgumentException e) {
                new Handler(Looper.getMainLooper()).post(() -> Toast.makeText(MainActivity.this,
                        "Не удалось подготовить Excel-файл", Toast.LENGTH_LONG).show());
            }
        }

        @JavascriptInterface
        public void saveText(String filename, String content) {
            requestSave(filename, content.getBytes(StandardCharsets.UTF_8), "application/json");
        }
    }

    /** Prevents navigation to arbitrary web pages and serves every application file from APK assets. */
    private final class OfflineAssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!"https".equals(uri.getScheme()) || !"appassets.androidplatform.net".equals(uri.getHost())) return forbidden();
            String path = uri.getPath();
            if (path == null || !path.startsWith("/assets/www/")) return forbidden();
            try {
                String assetPath = URLDecoder.decode(path.substring("/assets/www/".length()), "UTF-8");
                if (assetPath.contains("..")) return forbidden();
                InputStream asset = getAssets().open("www/" + assetPath);
                return new WebResourceResponse(mimeType(assetPath), "UTF-8", asset);
            } catch (IOException e) {
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null,
                        new ByteArrayInputStream("Asset not found".getBytes(StandardCharsets.UTF_8)));
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return true;
        }

        private WebResourceResponse forbidden() {
            return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", null,
                    new ByteArrayInputStream(new byte[0]));
        }

        private String mimeType(String path) {
            if (path.endsWith(".html")) return "text/html";
            if (path.endsWith(".js")) return "application/javascript";
            if (path.endsWith(".css")) return "text/css";
            if (path.endsWith(".json")) return "application/json";
            return "application/octet-stream";
        }
    }

    private static final class PendingWrite {
        final byte[] bytes;
        PendingWrite(byte[] bytes) { this.bytes = bytes; }
    }
}
