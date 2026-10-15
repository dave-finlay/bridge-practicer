// Draws the app icons: a white bidding card with a green question mark,
// on baize green. The bid recorder's icon is a white spade on the same
// green, so the two sit well together but are easy to tell apart. Run
// from the project folder with `npm run icons`; it writes
// icons/icon-<size>.png. iOS rounds the corners itself, so the icons are
// plain squares.

import AppKit

let green = NSColor(srgbRed: 0x1d / 255, green: 0x6b / 255, blue: 0x41 / 255, alpha: 1)

for size in [180, 192, 512] {
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

    let side = CGFloat(size)
    green.setFill()
    NSRect(x: 0, y: 0, width: side, height: side).fill()

    // The card: upright, a little taller than wide, like a bidding card.
    let card = NSRect(x: side * 0.24, y: side * 0.17, width: side * 0.52, height: side * 0.66)
    NSColor.white.setFill()
    NSBezierPath(roundedRect: card, xRadius: side * 0.07, yRadius: side * 0.07).fill()

    let mark = "?" as NSString
    let attributes: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: side * 0.46, weight: .heavy),
        .foregroundColor: green,
    ]
    let glyph = mark.size(withAttributes: attributes)
    mark.draw(
        at: NSPoint(x: card.midX - glyph.width / 2, y: card.midY - glyph.height / 2),
        withAttributes: attributes)

    NSGraphicsContext.restoreGraphicsState()
    let png = rep.representation(using: .png, properties: [:])!
    try! png.write(to: URL(fileURLWithPath: "icons/icon-\(size).png"))
    print("icons/icon-\(size).png")
}
