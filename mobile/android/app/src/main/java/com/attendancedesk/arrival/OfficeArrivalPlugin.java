package com.attendancedesk.arrival;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * JS side: components/attendance/arrival-punch.tsx (window.Capacitor plugin "OfficeArrival").
 *
 * enable({lat,lng,radius,punchedInDate}) → asks for location, then "all the time", then notifications.
 * disable() · getStatus() · updateOffice({lat,lng,radius}) · setPunchedIn({date}) · consumePending() · openSettings()
 * Event "arrivalTapped" when the notification is tapped while the app is open.
 */
@CapacitorPlugin(
    name = "OfficeArrival",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "background", strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }),
    }
)
public class OfficeArrivalPlugin extends Plugin {

    @Override
    public void load() {
        Intent launch = getActivity().getIntent();
        if (launch != null && launch.getBooleanExtra(ArrivalStore.EXTRA_ARRIVAL, false)) {
            ArrivalStore.markPending(getContext());
            launch.removeExtra(ArrivalStore.EXTRA_ARRIVAL);
        }
        ArrivalStore.register(getContext());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent != null && intent.getBooleanExtra(ArrivalStore.EXTRA_ARRIVAL, false)) {
            ArrivalStore.markPending(getContext());
            intent.removeExtra(ArrivalStore.EXTRA_ARRIVAL);
            notifyListeners("arrivalTapped", new JSObject(), true);
        }
    }

    private JSObject status() {
        Context c = getContext();
        JSObject s = new JSObject();
        s.put("enabled", ArrivalStore.enabled(c));
        String location;
        if (ArrivalStore.hasBackgroundLocation(c)) location = "always";
        else if (ArrivalStore.hasFineLocation(c)) location = "whenInUse";
        else location = getPermissionState("location") == PermissionState.DENIED ? "denied" : "prompt";
        s.put("location", location);
        s.put("notifications", NotificationManagerCompat.from(c).areNotificationsEnabled() ? "granted" : "denied");
        return s;
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void enable(PluginCall call) {
        Double lat = call.getDouble("lat");
        Double lng = call.getDouble("lng");
        Double radius = call.getDouble("radius", 200.0);
        if (lat == null || lng == null) {
            call.reject("The office location is missing.");
            return;
        }
        Context c = getContext();
        ArrivalStore.saveOffice(c, lat, lng, radius.floatValue());
        String punched = call.getString("punchedInDate");
        if (punched != null) ArrivalStore.setPunchedIn(c, punched);
        ArrivalStore.setEnabled(c, true);
        askLocation(call);
    }

    private void askLocation(PluginCall call) {
        if (!ArrivalStore.hasFineLocation(getContext())) requestPermissionForAlias("location", call, "afterLocation");
        else askBackground(call);
    }

    @PermissionCallback
    private void afterLocation(PluginCall call) {
        if (!ArrivalStore.hasFineLocation(getContext())) {
            call.resolve(status());
            return;
        }
        askBackground(call);
    }

    private void askBackground(PluginCall call) {
        // Android 10+: a separate step; on 11+ the system sends the person to the app's location page.
        if (!ArrivalStore.hasBackgroundLocation(getContext())) requestPermissionForAlias("background", call, "afterBackground");
        else askNotifications(call);
    }

    @PermissionCallback
    private void afterBackground(PluginCall call) {
        askNotifications(call);
    }

    private void askNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && !NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) {
            requestPermissionForAlias("notifications", call, "afterNotifications");
        } else {
            finishEnable(call);
        }
    }

    @PermissionCallback
    private void afterNotifications(PluginCall call) {
        finishEnable(call);
    }

    private void finishEnable(PluginCall call) {
        ArrivalStore.register(getContext());
        call.resolve(status());
    }

    @PluginMethod
    public void disable(PluginCall call) {
        ArrivalStore.setEnabled(getContext(), false);
        ArrivalStore.unregister(getContext());
        call.resolve(status());
    }

    @PluginMethod
    public void updateOffice(PluginCall call) {
        Double lat = call.getDouble("lat");
        Double lng = call.getDouble("lng");
        Double radius = call.getDouble("radius", 200.0);
        if (lat != null && lng != null) {
            ArrivalStore.saveOffice(getContext(), lat, lng, radius.floatValue());
            ArrivalStore.register(getContext());
        }
        call.resolve();
    }

    @PluginMethod
    public void setPunchedIn(PluginCall call) {
        String date = call.getString("date", ArrivalStore.today());
        ArrivalStore.setPunchedIn(getContext(), date);
        call.resolve();
    }

    @PluginMethod
    public void consumePending(PluginCall call) {
        JSObject r = new JSObject();
        r.put("pending", ArrivalStore.consumePending(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }
}
