import CoreLocation
import UIKit
import UserNotifications

/// Office-arrival reminder: watches the office region (even when the app is closed, with "Always"
/// location) and posts "You're at the office. Tap to punch in." Created in AppDelegate so region
/// events and notification taps that relaunch the app have a delegate from the first moment.
/// JS side: components/attendance/arrival-punch.tsx, through OfficeArrivalPlugin.
final class OfficeArrivalMonitor: NSObject, CLLocationManagerDelegate, UNUserNotificationCenterDelegate {
    static let shared = OfficeArrivalMonitor()

    static let userInfoKey = "officeArrival"
    private static let regionId = "office"
    private static let notificationId = "office-arrival"
    private static let categoryId = "OFFICE_ARRIVAL"
    /// Don't notify again within this time (GPS drift at the edge of the area).
    private static let renotifyInterval: TimeInterval = 3 * 60 * 60
    /// A tap counts as "punch me in" for this long after it happened.
    private static let pendingInterval: TimeInterval = 30 * 60
    /// Region monitoring under ~100 m is unreliable.
    private static let minRadius: CLLocationDistance = 100

    let manager = CLLocationManager()
    private let defaults = UserDefaults(suiteName: "office_arrival") ?? .standard
    private var authWaiters: [() -> Void] = []
    /// Set by the plugin so a tap while the app is open punches in straight away.
    var onTapped: (() -> Void)?

    private override init() {
        super.init()
        manager.delegate = self
        let punch = UNNotificationAction(identifier: "PUNCH_IN", title: "Punch in", options: [.foreground])
        UNUserNotificationCenter.current().setNotificationCategories([
            UNNotificationCategory(identifier: Self.categoryId, actions: [punch], intentIdentifiers: [], options: []),
        ])
    }

    /// Call once at launch. Capacitor replaces the notification delegate when its bridge loads;
    /// until then (a cold start from a tap) this object receives the tap.
    func start() {
        if UNUserNotificationCenter.current().delegate == nil {
            UNUserNotificationCenter.current().delegate = self
        }
        register()
    }

    // MARK: Settings

    static func today() -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Asia/Kolkata")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    var enabled: Bool {
        get { defaults.bool(forKey: "enabled") }
        set { defaults.set(newValue, forKey: "enabled") }
    }

    func saveOffice(lat: Double, lng: Double, radius: Double) {
        defaults.set(lat, forKey: "lat")
        defaults.set(lng, forKey: "lng")
        defaults.set(radius, forKey: "radius")
    }

    private var hasOffice: Bool { defaults.object(forKey: "lat") != nil }

    func setPunchedIn(date: String) {
        defaults.set(date, forKey: "punchedDate")
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [Self.notificationId])
    }

    func markPending() {
        defaults.set(Date().timeIntervalSince1970, forKey: "pendingAt")
        defaults.set(Self.today(), forKey: "pendingDate")
    }

    /// True once per tap, within 30 minutes and on the same day.
    func consumePending() -> Bool {
        let at = defaults.double(forKey: "pendingAt")
        let fresh = at > 0 && Date().timeIntervalSince1970 - at < Self.pendingInterval && defaults.string(forKey: "pendingDate") == Self.today()
        defaults.removeObject(forKey: "pendingAt")
        defaults.removeObject(forKey: "pendingDate")
        return fresh
    }

    // MARK: Region

    func register() {
        for region in manager.monitoredRegions where region.identifier == Self.regionId {
            manager.stopMonitoring(for: region)
        }
        guard enabled, hasOffice, manager.authorizationStatus == .authorizedAlways,
              CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else { return }
        let center = CLLocationCoordinate2D(latitude: defaults.double(forKey: "lat"), longitude: defaults.double(forKey: "lng"))
        let radius = min(max(defaults.double(forKey: "radius"), Self.minRadius), manager.maximumRegionMonitoringDistance)
        let region = CLCircularRegion(center: center, radius: radius, identifier: Self.regionId)
        region.notifyOnEntry = true
        region.notifyOnExit = false
        manager.startMonitoring(for: region)
        // Already inside when it's switched on → notify straight away.
        manager.requestState(for: region)
    }

    func unregister() {
        for region in manager.monitoredRegions where region.identifier == Self.regionId {
            manager.stopMonitoring(for: region)
        }
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [Self.notificationId])
    }

    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        if region.identifier == Self.regionId { maybeNotify() }
    }

    func locationManager(_ manager: CLLocationManager, didDetermineState state: CLRegionState, for region: CLRegion) {
        if region.identifier == Self.regionId, state == .inside { maybeNotify() }
    }

    private func maybeNotify() {
        guard enabled, defaults.string(forKey: "punchedDate") != Self.today() else { return }
        let last = defaults.double(forKey: "notifiedAt")
        guard Date().timeIntervalSince1970 - last > Self.renotifyInterval else { return }

        let content = UNMutableNotificationContent()
        content.title = "You're at the office"
        content.body = "Tap to punch in."
        content.sound = .default
        content.categoryIdentifier = Self.categoryId
        content.userInfo = [Self.userInfoKey: true]
        let request = UNNotificationRequest(identifier: Self.notificationId, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
        defaults.set(Date().timeIntervalSince1970, forKey: "notifiedAt")
    }

    // MARK: Permissions

    var locationState: String {
        switch manager.authorizationStatus {
        case .authorizedAlways: return "always"
        case .authorizedWhenInUse: return "whenInUse"
        case .denied, .restricted: return "denied"
        default: return "prompt"
        }
    }

    /// Asks for "While using", then the upgrade to "Always". Calls back once the person has answered
    /// (or straight away if iOS shows no prompt because it was answered before).
    func requestAlways(_ done: @escaping () -> Void) {
        switch manager.authorizationStatus {
        case .notDetermined:
            authWaiters.append { [weak self] in
                guard let self else { return done() }
                self.manager.authorizationStatus == .authorizedWhenInUse ? self.upgradeToAlways(done) : done()
            }
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse:
            upgradeToAlways(done)
        default:
            done()
        }
    }

    private func upgradeToAlways(_ done: @escaping () -> Void) {
        var finished = false
        let finish = { if !finished { finished = true; done() } }
        authWaiters.append(finish)
        manager.requestAlwaysAuthorization()
        // No prompt (already answered once): the app stays active and no callback comes.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            if UIApplication.shared.applicationState == .active { finish() }
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus == .notDetermined { return }
        let waiters = authWaiters
        authWaiters.removeAll()
        waiters.forEach { $0() }
        register()
    }

    func requestNotifications(_ done: @escaping () -> Void) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in
            DispatchQueue.main.async { done() }
        }
    }

    func notificationState(_ done: @escaping (String) -> Void) {
        UNUserNotificationCenter.current().getNotificationSettings { s in
            let state: String
            switch s.authorizationStatus {
            case .authorized, .provisional, .ephemeral: state = "granted"
            case .denied: state = "denied"
            default: state = "prompt"
            }
            DispatchQueue.main.async { done(state) }
        }
    }

    // MARK: Taps (used until Capacitor's notification router takes over, and by the plugin after)

    func handleTap(_ response: UNNotificationResponse) -> Bool {
        guard response.notification.request.content.userInfo[Self.userInfoKey] as? Bool == true else { return false }
        markPending()
        onTapped?()
        return true
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        _ = handleTap(response)
        completionHandler()
    }
}
