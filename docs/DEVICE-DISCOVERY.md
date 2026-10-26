# Local device discovery

Copyright (c) 2026 Adms Chung. Apache-2.0.

Caruso Remote 0.5.3 browses the `_http._tcp`, `_airplay._tcp`, and `_raop._tcp` Bonjour services in-process in the signed Mac application. These types are declared in `NSBonjourServices`, alongside `NSLocalNetworkUsageDescription`.

The existing saved address is attempted immediately. Bonjour discovery begins after the app window loads, runs for eight seconds, and repeats every twenty seconds while the receiver is disconnected. It only resolves Caruso advertisements with `.local.` hostnames. Public and loopback addresses are rejected; no subnet-wide port scan or control command is used to discover devices.

If the saved address changes, the candidate must first return verified Caruso master and optical descriptors through the existing read-only native query. A saved advertised device identity is preferred over an IP match, preventing an unrelated address reuse from being automatically selected. Without a saved identity, a unique Caruso candidate may be selected; multiple candidates remain unresolved. Successful rediscovery replaces the old transport clients and persists the private address. An in-flight control operation is never replayed to the new connection.

The UI distinguishes searching, found/connecting, unresolved multiple devices, and a Bonjour `kDNSServiceErr_PolicyDenied` response. Network permission is never granted programmatically. Socket reachability errors alone do not prove a Local Network privacy denial.

macOS keeps permission state by responsible app identity. The addon operates in-process rather than through a Terminal helper, and uses the existing stable bundle ID and Developer ID. Development backup app registrations can be unregistered from Launch Services without deleting their contents or resetting privacy state.

Primary reference: [Apple TN3179: Understanding local network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).
