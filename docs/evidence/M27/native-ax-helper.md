# M27: одноразовый native GUI helper

Исходник инструмента наблюдения/нажатия Accessibility + CGEvent после прямого
согласия пользователя и AX_TRUSTED=true. Использовался только на собственных
M27 probe карточках Claude Desktop. Это macOS-only исследовательский инструмент,
не часть поставки; production controls одинаковы для трёх ОС и не требуют GUI.
Не запускать на рабочем/чужом чате. Tree/path читается заново перед действием;
CGEvent нужен для pointer-driven popup, AXPress одного не хватало.

```swift
import AppKit
import ApplicationServices
let args=CommandLine.arguments
let app=AXUIElementCreateApplication(Int32(args[1])!)
func attr(_ e:AXUIElement,_ key:String)->CFTypeRef? { var v:CFTypeRef?;guard AXUIElementCopyAttributeValue(e,key as CFString,&v)==AXError.success else{return nil};return v }
var nodes:[String:AXUIElement]=[:]; var labels:[String:AXUIElement]=[:]
func walk(_ e:AXUIElement,_ key:String,_ depth:Int){if depth>65{return};nodes[key]=e
let role=attr(e,"AXRole") as? String ?? "";let title=attr(e,"AXTitle") as? String ?? "";let desc=attr(e,"AXDescription") as? String ?? "";let value=attr(e,"AXValue").map{String(describing:$0)} ?? ""
if ["AXPopUpButton","AXMenuItem","AXButton"].contains(role) { labels[title]=e }; if !title.isEmpty || !desc.isEmpty || ["AXButton","AXPopUpButton","AXTextField","AXMenuItem"].contains(role){print("\(key) \(role) title=\(title.prefix(160)) desc=\(desc.prefix(120)) value=\(value.prefix(120))")}
for (i,c) in ((attr(e,"AXChildren") as? [AXUIElement]) ?? []).enumerated(){walk(c,key+"."+String(i),depth+1)} }
if args.count>2 && args[2]=="activate" {NSRunningApplication(processIdentifier:Int32(args[1])!)?.activate(options:[])}
walk((attr(app,"AXWindows") as? [AXUIElement])!.first!,"0",0)
if args.count>3 && args[2]=="press",let e=nodes[args[3]] ?? labels[args[3]]{ print("PRESS",AXUIElementPerformAction(e,kAXPressAction as CFString).rawValue) }
if args.count>3 && ["click","hover"].contains(args[2]),let e=nodes[args[3]] ?? labels[args[3]] {var pos=CGPoint.zero;var size=CGSize.zero
if let p=attr(e,"AXPosition"), let s=attr(e,"AXSize") {AXValueGetValue(p as! AXValue,.cgPoint,&pos);AXValueGetValue(s as! AXValue,.cgSize,&size);let point=CGPoint(x:pos.x+size.width/2,y:pos.y+size.height/2);print("CLICK",point,"enabled",attr(e,"AXEnabled") ?? "unknown" as CFString);CGEvent(mouseEventSource:nil,mouseType:.mouseMoved,mouseCursorPosition:point,mouseButton:.left)?.post(tap:.cghidEventTap);if args[2]=="click" { CGEvent(mouseEventSource:nil,mouseType:.leftMouseDown,mouseCursorPosition:point,mouseButton:.left)?.post(tap:.cghidEventTap);CGEvent(mouseEventSource:nil,mouseType:.leftMouseUp,mouseCursorPosition:point,mouseButton:.left)?.post(tap:.cghidEventTap)} } }
```
