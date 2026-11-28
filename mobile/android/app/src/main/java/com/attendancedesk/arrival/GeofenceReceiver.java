package com.attendancedesk.arrival;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;

/** The OS calls this when the phone enters the office area, even if the app is closed. */
public class GeofenceReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        GeofencingEvent event = GeofencingEvent.fromIntent(intent);
        if (event == null) return;
        if (event.hasError()) {
            Log.w(ArrivalStore.TAG, "Geofence error " + event.getErrorCode());
            return;
        }
        if (event.getGeofenceTransition() == Geofence.GEOFENCE_TRANSITION_ENTER) {
            ArrivalStore.maybeNotify(context);
        }
    }
}
