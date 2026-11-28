import Capacitor
import UIKit
import UserNotifications

/// JS name "OfficeArrival" (components/attendance/arrival-punch.tsx). Same methods as the Android
/// plugin: getStatus · enable · disable · updateOffice · setPunchedIn · consumePending · openSettings,
/// and the "arrivalTapped" event. Registered in MainViewController.
@objc(OfficeArrivalPlugin)
public class OfficeArrivalPlugin: CAPPlugin, CAPBridgedPlugin, NotificationHandlerProtocol {
    public let identifier = "OfficeArrivalPlugin"
    public let jsName = "OfficeArrival"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateOffice", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPunchedIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumePending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
    ]

    private let monitor = OfficeArrivalMonitor.shared

    override public func load() {
        // Taps on our notification now arrive through Capacitor's notification router.
        bridge?.notificationRouter.localNotificationHandler = self
        monitor.onTapped = { [weak self] in
            self?.notifyListeners("arrivalTapped", data: [:], retainUntilConsumed: true)
        }
        monitor.register()
    }

    private func resolveStatus(_ call: CAPPluginCall) {
        let location = monitor.locationState
        let enabled = monitor.enabled
        monitor.notificationState { notifications in
            call.resolve(["enabled": enabled, "location": location, "notifications": notifications])
        }
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        resolveStatus(call)
    }

    @objc func enable(_ call: CAPPluginCall) {
        guard let lat = call.getDouble("lat"), let lng = call.getDouble("lng") else {
            return call.reject("The office location is missing.")
        }
        monitor.saveOffice(lat: lat, lng: lng, radius: call.getDouble("radius") ?? 200)
        if let punched = call.getString("punchedInDate") { monitor.setPunchedIn(date: punched) }
        monitor.enabled = true
        DispatchQueue.main.async {
            self.monitor.requestAlways {
                self.monitor.requestNotifications {
                    self.monitor.register()
                    self.resolveStatus(call)
                }
            }
        }
    }

    @objc func disable(_ call: CAPPluginCall) {
        monitor.enabled = false
        DispatchQueue.main.async {
            self.monitor.unregister()
            self.resolveStatus(call)
        }
    }

    @objc func updateOffice(_ call: CAPPluginCall) {
        if let lat = call.getDouble("lat"), let lng = call.getDouble("lng") {
            monitor.saveOffice(lat: lat, lng: lng, radius: call.getDouble("radius") ?? 200)
            DispatchQueue.main.async { self.monitor.register() }
        }
        call.resolve()
    }

    @objc func setPunchedIn(_ call: CAPPluginCall) {
        monitor.setPunchedIn(date: call.getString("date") ?? OfficeArrivalMonitor.today())
        call.resolve()
    }

    @objc func consumePending(_ call: CAPPluginCall) {
        call.resolve(["pending": monitor.consumePending()])
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            call.resolve()
        }
    }

    // MARK: NotificationHandlerProtocol (local notifications routed by Capacitor)

    public func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    public func didReceive(response: UNNotificationResponse) {
        _ = monitor.handleTap(response)
    }
}
