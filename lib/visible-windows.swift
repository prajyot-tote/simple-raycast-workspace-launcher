// Emits JSON for every window currently on-screen (i.e. on the active Space
// and not minimized). Compiled once into a cached binary next to this source
// — see capture.js / compileVisBinary().

import Cocoa

let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
guard let arr = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] else {
  print("[]"); exit(0)
}

var out: [[String: Any]] = []
for w in arr {
  guard let layer = w["kCGWindowLayer"] as? Int, layer == 0 else { continue }
  guard let bounds = w["kCGWindowBounds"] as? [String: Any] else { continue }
  func num(_ k: String) -> Int {
    if let n = bounds[k] as? NSNumber { return Int(n.doubleValue.rounded()) }
    return 0
  }
  out.append([
    "pid": w["kCGWindowOwnerPID"] as? Int ?? 0,
    "app": w["kCGWindowOwnerName"] as? String ?? "",
    "x": num("X"),
    "y": num("Y"),
    "w": num("Width"),
    "h": num("Height"),
  ])
}

if let data = try? JSONSerialization.data(withJSONObject: out),
   let json = String(data: data, encoding: .utf8) {
  print(json)
} else {
  print("[]")
}
