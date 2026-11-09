// Workflow Kit for macOS: the panel in its own window (WKWebView) with its own Dock icon, so the
// app can be kept in the Dock. `wfk install` compiles this file with swiftc into
// ~/Applications/Workflow Kit.app/Contents/MacOS/workflow-kit.
//
//   workflow-kit                        runs the app; Info.plist keys WFKNode and WFKEntry name the
//                                       installed node and bin/wfk.mjs (`wfk open --url-only`
//                                       starts the service when needed and prints the panel URL)
//   workflow-kit --make-iconset <dir>   draws the icon into <dir> (an .iconset for iconutil): the
//                                       left half of the installed Claude icon, the right half of
//                                       the ChatGPT icon; a plain "WK" icon when one is missing
import Cocoa
import WebKit

// MARK: - Icon

func appIcon(paths: [String], bundleIds: [String]) -> NSImage? {
  let workspace = NSWorkspace.shared
  for path in paths where FileManager.default.fileExists(atPath: path) {
    return workspace.icon(forFile: path)
  }
  for id in bundleIds {
    if let url = workspace.urlForApplication(withBundleIdentifier: id) { return workspace.icon(forFile: url.path) }
  }
  return nil
}

func drawIcon(pixels: Int, left: NSImage?, right: NSImage?) -> NSBitmapImageRep? {
  guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4,
    hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)
  else { return nil }
  let size = CGFloat(pixels)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  NSGraphicsContext.current?.imageInterpolation = .high
  let full = NSRect(x: 0, y: 0, width: size, height: size)
  if let left = left, let right = right {
    for (image, x) in [(left, CGFloat(0)), (right, size / 2)] {
      NSGraphicsContext.saveGraphicsState()
      NSBezierPath(rect: NSRect(x: x, y: 0, width: size / 2, height: size)).addClip()
      image.draw(in: full, from: .zero, operation: .sourceOver, fraction: 1)
      NSGraphicsContext.restoreGraphicsState()
    }
  } else {
    // Big Sur grid: the body takes about 80% of the canvas.
    let inset = size * 0.1
    let body = NSBezierPath(roundedRect: full.insetBy(dx: inset, dy: inset), xRadius: size * 0.18, yRadius: size * 0.18)
    NSGradient(starting: NSColor(calibratedRed: 0.85, green: 0.47, blue: 0.34, alpha: 1),
               ending: NSColor(calibratedRed: 0.12, green: 0.12, blue: 0.14, alpha: 1))?.draw(in: body, angle: 0)
    let text = NSAttributedString(string: "WK", attributes: [
      .font: NSFont.systemFont(ofSize: size * 0.32, weight: .bold), .foregroundColor: NSColor.white,
    ])
    let box = text.size()
    text.draw(at: NSPoint(x: (size - box.width) / 2, y: (size - box.height) / 2))
  }
  NSGraphicsContext.restoreGraphicsState()
  return rep
}

func makeIconset(_ dir: String) -> Int32 {
  let left = appIcon(paths: ["/Applications/Claude.app"], bundleIds: ["com.anthropic.claudefordesktop"])
  let right = appIcon(paths: ["/Applications/ChatGPT.app"], bundleIds: ["com.openai.chat", "com.openai.codex"])
  do {
    try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
  } catch {
    FileHandle.standardError.write("cannot create \(dir): \(error)\n".data(using: .utf8)!)
    return 1
  }
  for base in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
      let name = scale == 1 ? "icon_\(base)x\(base).png" : "icon_\(base)x\(base)@2x.png"
      guard let rep = drawIcon(pixels: base * scale, left: left, right: right),
            let png = rep.representation(using: .png, properties: [:]) else { return 1 }
      do {
        try png.write(to: URL(fileURLWithPath: dir).appendingPathComponent(name))
      } catch {
        FileHandle.standardError.write("cannot write \(name): \(error)\n".data(using: .utf8)!)
        return 1
      }
    }
  }
  print(left != nil && right != nil ? "icon: Claude | ChatGPT" : "icon: WK (Claude or ChatGPT is not installed)")
  return 0
}

// MARK: - App

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
  private var window: NSWindow!
  private var webView: WKWebView!
  private var panel: URL?
  private var titleObservation: NSKeyValueObservation?

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.mainMenu = buildMenu()
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .default()
    webView = WKWebView(frame: .zero, configuration: config)
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.allowsBackForwardNavigationGestures = true
    window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1280, height: 860),
      styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
    window.title = "Workflow Kit"
    window.minSize = NSSize(width: 420, height: 400)
    window.isReleasedWhenClosed = false
    window.contentView = webView
    if !window.setFrameUsingName("WorkflowKitPanel") { window.center() }
    window.setFrameAutosaveName("WorkflowKitPanel")
    titleObservation = webView.observe(\.title, options: [.new]) { [weak self] view, _ in
      if let title = view.title, !title.isEmpty { self?.window.title = title }
    }
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    connect()
  }

  // The app stays in the Dock when its window is closed; a click on the icon shows it again.
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    if !flag { window.makeKeyAndOrderFront(nil) }
    return true
  }

  /** Starts the service when needed (`wfk open --url-only`) and loads the panel. */
  private func connect() {
    showMessage("Запуск службы Workflow Kit…", detail: nil)
    let info = Bundle.main.infoDictionary ?? [:]
    guard let node = info["WFKNode"] as? String, let entry = info["WFKEntry"] as? String else {
      showMessage("Workflow Kit установлен не полностью", detail: "Выполните в Терминале: wfk install")
      return
    }
    DispatchQueue.global(qos: .userInitiated).async {
      let process = Process()
      process.executableURL = URL(fileURLWithPath: node)
      process.arguments = [entry, "open", "--url-only"]
      let out = Pipe()
      process.standardOutput = out
      process.standardError = out
      var text = ""
      do {
        try process.run()
        text = String(data: out.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        process.waitUntilExit()
      } catch {
        text = "\(error)"
      }
      let found = text.range(of: #"https?://[^\s]+"#, options: .regularExpression).flatMap { URL(string: String(text[$0])) }
      DispatchQueue.main.async {
        if process.terminationStatus == 0, let url = found {
          self.panel = url
          self.webView.load(URLRequest(url: url))
        } else {
          self.showMessage("Служба Workflow Kit не запустилась", detail: text.trimmingCharacters(in: .whitespacesAndNewlines))
        }
      }
    }
  }

  private func showMessage(_ title: String, detail: String?) {
    let escape = { (s: String) in
      s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
    }
    let more = detail.map { "<pre>\(escape($0))</pre><p>⌘R — повторить.</p>" } ?? ""
    let html = """
      <!doctype html><meta charset="utf-8"><style>
      :root { color-scheme: light dark; }
      body { font: 14px -apple-system, system-ui; display: grid; place-items: center; height: 90vh; margin: 0; color: #888; }
      div { max-width: 640px; } h1 { font-size: 17px; font-weight: 600; color: CanvasText; }
      pre { white-space: pre-wrap; font-size: 12px; }
      </style><div><h1>\(escape(title))</h1>\(more)</div>
      """
    webView.loadHTMLString(html, baseURL: nil)
  }

  @objc func reloadPanel(_ sender: Any?) {
    if panel == nil { connect() } else { webView.reload() }
  }

  @objc func goBack(_ sender: Any?) { webView.goBack() }

  private func isPanel(_ url: URL) -> Bool {
    guard let panel = panel else { return false }
    return url.scheme == panel.scheme && url.host == panel.host && url.port == panel.port
  }

  // Links outside the panel (codex://, claude://, the web) go to their apps or the default browser.
  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    guard let url = action.request.url else { return decisionHandler(.allow) }
    if url.scheme == "about" || url.scheme == "data" || url.scheme == "blob" || isPanel(url) { return decisionHandler(.allow) }
    NSWorkspace.shared.open(url)
    decisionHandler(.cancel)
  }

  func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    if let url = action.request.url {
      if isPanel(url) { webView.load(URLRequest(url: url)) } else { NSWorkspace.shared.open(url) }
    }
    return nil
  }

  func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
    let alert = NSAlert()
    alert.messageText = message
    alert.beginSheetModal(for: window) { _ in completionHandler() }
  }

  func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
    let alert = NSAlert()
    alert.messageText = message
    alert.addButton(withTitle: "OK")
    alert.addButton(withTitle: "Отмена")
    alert.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn) }
  }

  func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
    let alert = NSAlert()
    alert.messageText = prompt
    let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 24))
    field.stringValue = defaultText ?? ""
    alert.accessoryView = field
    alert.addButton(withTitle: "OK")
    alert.addButton(withTitle: "Отмена")
    alert.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn ? field.stringValue : nil) }
  }

  func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
    let open = NSOpenPanel()
    open.allowsMultipleSelection = parameters.allowsMultipleSelection
    open.canChooseDirectories = parameters.allowsDirectories
    open.beginSheetModal(for: window) { completionHandler($0 == .OK ? open.urls : nil) }
  }

  // Without an Edit menu the standard shortcuts (copy, paste, select all) do not reach the page.
  private func buildMenu() -> NSMenu {
    let main = NSMenu()
    func submenu(_ title: String, _ items: [NSMenuItem]) {
      let holder = NSMenuItem(title: title, action: nil, keyEquivalent: "")
      let menu = NSMenu(title: title)
      items.forEach { menu.addItem($0) }
      holder.submenu = menu
      main.addItem(holder)
    }
    func item(_ title: String, _ action: Selector?, _ key: String, _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
      let entry = NSMenuItem(title: title, action: action, keyEquivalent: key)
      entry.keyEquivalentModifierMask = mods
      return entry
    }
    submenu("Workflow Kit", [
      item("Скрыть Workflow Kit", #selector(NSApplication.hide(_:)), "h"),
      item("Скрыть остальные", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]),
      .separator(),
      item("Завершить Workflow Kit", #selector(NSApplication.terminate(_:)), "q"),
    ])
    submenu("Правка", [
      item("Отменить", Selector(("undo:")), "z"),
      item("Повторить", Selector(("redo:")), "z", [.command, .shift]),
      .separator(),
      item("Вырезать", #selector(NSText.cut(_:)), "x"),
      item("Копировать", #selector(NSText.copy(_:)), "c"),
      item("Вставить", #selector(NSText.paste(_:)), "v"),
      item("Выбрать все", #selector(NSText.selectAll(_:)), "a"),
    ])
    let reload = item("Обновить", #selector(reloadPanel(_:)), "r")
    reload.target = self
    let back = item("Назад", #selector(goBack(_:)), "[")
    back.target = self
    submenu("Вид", [reload, back])
    submenu("Окно", [
      item("Свернуть", #selector(NSWindow.miniaturize(_:)), "m"),
      item("Закрыть", #selector(NSWindow.performClose(_:)), "w"),
    ])
    return main
  }
}

let arguments = CommandLine.arguments
if arguments.count >= 3 && arguments[1] == "--make-iconset" {
  exit(makeIconset(arguments[2]))
}
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
