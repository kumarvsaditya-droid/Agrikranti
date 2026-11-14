package com.agrikranti1928.app;

import android.app.Activity;
import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.util.Base64;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;

/**
 * Agrikranti student app.
 * - FLAG_SECURE: screenshot / screen recording / recent-apps preview sab black.
 * - Sirf apni website (aur payment / Google script) app ke andar khulti hai; baaki link bahar.
 * - Debugging band, file access band, cleartext (http) band.
 */
public class MainActivity extends Activity {
    static final String HOST = "kumarvsaditya-droid.github.io";
    static final String HOME = "https://" + HOST + "/Agrikranti/?source=app";
    WebView web;

    static boolean inApp(Uri u) {
        if (u == null || !"https".equals(u.getScheme()) || u.getHost() == null) return false;
        String h = u.getHost();
        if (h.equals(HOST)) {
            String p = u.getPath() == null ? "" : u.getPath();
            return p.startsWith("/Agrikranti") && !p.toLowerCase().endsWith(".pdf");
        }
        return h.equals("razorpay.com") || h.endsWith(".razorpay.com")
            || h.equals("script.google.com") || h.endsWith(".googleusercontent.com");
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        WebView.setWebContentsDebuggingEnabled(false);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0E1410"));
        setup(web);
        web.addJavascriptInterface(new Bridge(), "AKNative");
        setContentView(web);
        if (b == null || web.restoreState(b) == null) web.loadUrl(HOME);
    }

    void setup(WebView w) {
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setGeolocationEnabled(false);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= 26) s.setSafeBrowsingEnabled(true);
        s.setUserAgentString(s.getUserAgentString() + " AgrikrantiApp/2");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, true);
        w.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (inApp(u)) return false;
                openOutside(u.toString());
                return true;
            }
        });
        w.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onCreateWindow(WebView v, boolean dialog, boolean user, Message msg) {
                final WebView pop = new WebView(MainActivity.this);
                setup(pop);
                final Dialog dlg = new Dialog(MainActivity.this, android.R.style.Theme_Black_NoTitleBar);
                dlg.getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
                pop.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView pv, WebResourceRequest r) {
                        Uri u = r.getUrl();
                        if (inApp(u)) { if (!dlg.isShowing()) dlg.show(); return false; }
                        openOutside(u.toString());
                        return true;
                    }
                    @Override public void onPageStarted(WebView pv, String url, android.graphics.Bitmap fav) {
                        Uri u = Uri.parse(url);
                        if (url.startsWith("about:")) return;
                        if (inApp(u)) { if (!dlg.isShowing()) dlg.show(); }
                        else { pv.stopLoading(); openOutside(url); if (dlg.isShowing()) dlg.dismiss(); }
                    }
                });
                pop.setWebChromeClient(new WebChromeClient() {
                    @Override public void onCloseWindow(WebView pv) { dlg.dismiss(); pv.destroy(); }
                });
                dlg.setContentView(pop, new ViewGroup.LayoutParams(-1, -1));
                ((WebView.WebViewTransport) msg.obj).setWebView(pop);
                msg.sendToTarget();
                return true;
            }
        });
        w.setDownloadListener((url, ua, cd, mime, len) -> { if (url.startsWith("https:")) openOutside(url); });
    }

    void openOutside(String url) {
        try {
            Intent i = url.startsWith("intent:") ? Intent.parseUri(url, Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            if (url.startsWith("intent:")) { i.addCategory(Intent.CATEGORY_BROWSABLE); i.setComponent(null); i.setSelector(null); }
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "यह link खोलने वाला app फोन में नहीं है", Toast.LENGTH_SHORT).show();
        } catch (Exception e) { /* ignore bad link */ }
    }

    /** Website ke liye chhota bridge: share (text + image). Sirf apni site par kaam karta hai. */
    class Bridge {
        boolean ok() {
            final String[] u = new String[1];
            try { runOnUiThreadAndWait(() -> u[0] = web.getUrl()); } catch (Exception e) { return false; }
            return u[0] != null && inApp(Uri.parse(u[0]));
        }
        @JavascriptInterface public void shareText(String text) {
            if (!ok()) return;
            Intent i = new Intent(Intent.ACTION_SEND); i.setType("text/plain"); i.putExtra(Intent.EXTRA_TEXT, text);
            runOnUiThread(() -> startActivity(Intent.createChooser(i, "Share")));
        }
        @JavascriptInterface public void shareFile(String b64, String mime, String name, String text) {
            if (!ok()) return;
            try {
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                if (data.length > 15 * 1024 * 1024) return;
                File dir = new File(getCacheDir(), "shared"); dir.mkdirs();
                String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
                File f = new File(dir, safe.isEmpty() ? "share.png" : safe);
                try (FileOutputStream o = new FileOutputStream(f)) { o.write(data); }
                Uri uri = FileProvider.getUriForFile(MainActivity.this, "com.agrikranti1928.app.files", f);
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType(mime == null || mime.isEmpty() ? "image/png" : mime);
                i.putExtra(Intent.EXTRA_STREAM, uri);
                if (text != null && !text.isEmpty()) i.putExtra(Intent.EXTRA_TEXT, text);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> startActivity(Intent.createChooser(i, "Share")));
            } catch (Exception e) { /* ignore */ }
        }
    }

    void runOnUiThreadAndWait(Runnable r) throws InterruptedException {
        final Object lock = new Object(); final boolean[] done = {false};
        runOnUiThread(() -> { try { r.run(); } finally { synchronized (lock) { done[0] = true; lock.notifyAll(); } } });
        synchronized (lock) { long end = System.currentTimeMillis() + 2000; while (!done[0] && System.currentTimeMillis() < end) lock.wait(200); }
    }

    @Override public void onBackPressed() {
        web.evaluateJavascript("(window.akBack&&window.akBack())?1:0", v -> {
            if ("1".equals(v)) return;
            if (web.canGoBack()) web.goBack(); else finish();
        });
    }

    @Override protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); web.saveState(o); }
    @Override protected void onPause() { super.onPause(); CookieManager.getInstance().flush(); }
}
