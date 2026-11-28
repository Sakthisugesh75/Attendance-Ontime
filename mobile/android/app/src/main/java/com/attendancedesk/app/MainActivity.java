package com.attendancedesk.app;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.attendancedesk.arrival.OfficeArrivalPlugin;
import com.attendancedesk.update.AppUpdatePlugin;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.Locale;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins must be registered before the bridge starts.
        registerPlugin(OfficeArrivalPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);

        // The app draws under the status and gesture bars. Capacitor passes their size to the page
        // as --safe-area-inset-* only when the bars first report it, and a page (re)load clears
        // that; the web app (app/globals.css → --inset-*) needs it on every load.
        bridge.addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    sendSafeArea(webView);
                }
            }
        );
    }

    private void sendSafeArea(WebView webView) {
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(webView);
        if (insets == null) return;
        Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
        float density = getResources().getDisplayMetrics().density;
        String js = String.format(
            Locale.US,
            "(function(s){s.setProperty('--safe-area-inset-top','%dpx');s.setProperty('--safe-area-inset-right','%dpx');" +
            "s.setProperty('--safe-area-inset-bottom','%dpx');s.setProperty('--safe-area-inset-left','%dpx');})(document.documentElement.style);",
            Math.round(bars.top / density),
            Math.round(bars.right / density),
            Math.round(bars.bottom / density),
            Math.round(bars.left / density)
        );
        webView.evaluateJavascript(js, null);
    }
}
