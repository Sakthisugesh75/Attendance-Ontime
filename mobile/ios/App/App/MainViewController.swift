import Capacitor
import UIKit

/// The app's web view (set as the custom class in Main.storyboard). Registers app-local plugins.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(OfficeArrivalPlugin())
    }
}
