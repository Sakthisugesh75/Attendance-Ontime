package com.attendancedesk.arrival;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Office-arrival reminder: settings, the OS geofence and the notification.
 * Shared by the plugin (JS calls), the geofence receiver (arrival) and the boot receiver (re-arm).
 */
final class ArrivalStore {

    static final String TAG = "OfficeArrival";
    static final String EXTRA_ARRIVAL = "officeArrival";
    private static final String PREFS = "office_arrival";
    private static final String CHANNEL = "office_arrival";
    private static final int NOTIFICATION_ID = 4701;
    private static final String FENCE_ID = "office";
    /** Don't notify again within this time (GPS drift at the edge of the area). */
    private static final long RENOTIFY_MS = 3L * 60 * 60 * 1000;
    /** A tap counts as "punch me in" for this long after it happened. */
    private static final long PENDING_MS = 30L * 60 * 1000;
    /** Android geofences under ~100 m are unreliable. */
    private static final float MIN_RADIUS = 100f;

    private ArrivalStore() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Today in IST, the same calendar the server uses (yyyy-MM-dd). */
    static String today() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
        return f.format(new Date());
    }

    static boolean enabled(Context c) {
        return prefs(c).getBoolean("enabled", false);
    }

    static void saveOffice(Context c, double lat, double lng, float radius) {
        prefs(c)
            .edit()
            .putLong("lat", Double.doubleToRawLongBits(lat))
            .putLong("lng", Double.doubleToRawLongBits(lng))
            .putFloat("radius", radius)
            .apply();
    }

    static boolean hasOffice(Context c) {
        return prefs(c).contains("lat");
    }

    static void setEnabled(Context c, boolean on) {
        prefs(c).edit().putBoolean("enabled", on).apply();
    }

    static void setPunchedIn(Context c, String date) {
        prefs(c).edit().putString("punchedDate", date).apply();
        NotificationManagerCompat.from(c).cancel(NOTIFICATION_ID);
    }

    static void markPending(Context c) {
        prefs(c).edit().putLong("pendingAt", System.currentTimeMillis()).putString("pendingDate", today()).apply();
    }

    /** True once per tap, within 30 minutes and on the same day. */
    static boolean consumePending(Context c) {
        SharedPreferences p = prefs(c);
        long at = p.getLong("pendingAt", 0);
        boolean fresh = at > 0 && System.currentTimeMillis() - at < PENDING_MS && today().equals(p.getString("pendingDate", ""));
        p.edit().remove("pendingAt").remove("pendingDate").apply();
        return fresh;
    }

    static boolean hasFineLocation(Context c) {
        return ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    static boolean hasBackgroundLocation(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return hasFineLocation(c);
        return ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private static PendingIntent fenceIntent(Context c) {
        Intent i = new Intent(c, GeofenceReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
        return PendingIntent.getBroadcast(c, 0, i, flags);
    }

    /** (Re)registers the office geofence. Needs "Allow all the time" to fire while the app is closed. */
    @SuppressLint("MissingPermission")
    static void register(Context c) {
        if (!enabled(c) || !hasOffice(c) || !hasBackgroundLocation(c)) return;
        SharedPreferences p = prefs(c);
        double lat = Double.longBitsToDouble(p.getLong("lat", 0));
        double lng = Double.longBitsToDouble(p.getLong("lng", 0));
        float radius = Math.max(MIN_RADIUS, p.getFloat("radius", 200f));
        Geofence fence = new Geofence.Builder()
            .setRequestId(FENCE_ID)
            .setCircularRegion(lat, lng, radius)
            .setExpirationDuration(Geofence.NEVER_EXPIRE)
            .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
            .build();
        GeofencingRequest req = new GeofencingRequest.Builder()
            // Already inside when it's switched on → notify straight away.
            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
            .addGeofence(fence)
            .build();
        LocationServices.getGeofencingClient(c)
            .addGeofences(req, fenceIntent(c))
            .addOnFailureListener((e) -> Log.w(TAG, "Couldn't register the office geofence", e));
    }

    static void unregister(Context c) {
        LocationServices.getGeofencingClient(c).removeGeofences(fenceIntent(c));
        NotificationManagerCompat.from(c).cancel(NOTIFICATION_ID);
    }

    /** Called on arrival. Skips if switched off, already punched in today, or notified recently. */
    @SuppressLint("MissingPermission")
    static void maybeNotify(Context c) {
        SharedPreferences p = prefs(c);
        if (!enabled(c)) return;
        if (today().equals(p.getString("punchedDate", ""))) return;
        if (System.currentTimeMillis() - p.getLong("notifiedAt", 0) < RENOTIFY_MS) return;
        if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) return;

        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Arrival reminder", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Tells you when you reach the office so you can punch in with one tap.");
            nm.createNotificationChannel(ch);
        }

        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (open == null) return;
        open.putExtra(EXTRA_ARRIVAL, true);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(c, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder n = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(c.getResources().getIdentifier("ic_stat_arrival", "drawable", c.getPackageName()))
            .setContentTitle("You're at the office")
            .setContentText("Tap to punch in.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(tap)
            .addAction(0, "Punch in", tap);
        NotificationManagerCompat.from(c).notify(NOTIFICATION_ID, n.build());
        p.edit().putLong("notifiedAt", System.currentTimeMillis()).apply();
    }
}
