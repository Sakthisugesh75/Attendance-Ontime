package com.attendancedesk.update;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Updates the app from the company's own server (it isn't in the Play Store).
 * JS side: components/layout/app-update.tsx (window.Capacitor plugin "AppUpdate").
 *
 * getInfo() → { versionCode, versionName } of the installed app
 * download({ url }) → downloads the new APK into the app's cache; "progress" events { percent }
 * install() → opens Android's installer for it (the person taps Install). The first time,
 *             Android needs "Install unknown apps" allowed for this app: returns
 *             { needsPermission: true } after opening that settings page.
 *
 * Android checks that the new file is signed with the same key as the installed app, so only
 * genuine updates can be installed over it.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private static final String FILE_NAME = "attendance-update.apk";

    private File updateFile() {
        File dir = new File(getContext().getCacheDir(), "updates");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return new File(dir, FILE_NAME);
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        try {
            Context c = getContext();
            PackageInfo info = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
            JSObject r = new JSObject();
            r.put("versionCode", code);
            r.put("versionName", info.versionName);
            call.resolve(r);
        } catch (PackageManager.NameNotFoundException e) {
            call.reject("Couldn't read the app version.", e);
        }
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("No download address.");
            return;
        }
        call.setKeepAlive(false);
        // Off the plugin thread: an APK takes a while, and other plugin calls must keep working.
        new Thread(() -> {
            HttpURLConnection conn = null;
            File out = updateFile();
            File part = new File(out.getPath() + ".part");
            try {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(20000);
                conn.setReadTimeout(30000);
                conn.connect();
                if (conn.getResponseCode() != 200) {
                    call.reject("The server didn't send the update (" + conn.getResponseCode() + ").");
                    return;
                }
                long total = conn.getContentLengthLong();
                long done = 0;
                int lastPercent = -1;
                try (InputStream in = conn.getInputStream(); OutputStream os = new FileOutputStream(part)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        os.write(buf, 0, n);
                        done += n;
                        if (total > 0) {
                            int percent = (int) (done * 100 / total);
                            if (percent != lastPercent) {
                                lastPercent = percent;
                                JSObject p = new JSObject();
                                p.put("percent", percent);
                                notifyListeners("progress", p);
                            }
                        }
                    }
                }
                if (out.exists()) //noinspection ResultOfMethodCallIgnored
                    out.delete();
                if (!part.renameTo(out)) {
                    call.reject("Couldn't save the update.");
                    return;
                }
                JSObject r = new JSObject();
                r.put("bytes", done);
                call.resolve(r);
            } catch (Exception e) {
                //noinspection ResultOfMethodCallIgnored
                part.delete();
                call.reject("The download stopped. Check your internet and try again.", e);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void install(PluginCall call) {
        Context c = getContext();
        File apk = updateFile();
        if (!apk.exists()) {
            call.reject("Download the update first.");
            return;
        }
        JSObject r = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !c.getPackageManager().canRequestPackageInstalls()) {
            Intent allow = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + c.getPackageName()));
            allow.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(allow);
            r.put("needsPermission", true);
            call.resolve(r);
            return;
        }
        Uri uri = FileProvider.getUriForFile(c, c.getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        c.startActivity(intent);
        r.put("needsPermission", false);
        call.resolve(r);
    }
}
