// Prints the CGWindowID of the main window owned by a given PID.
//
// screencapture(1) takes a CGWindowID for -l, and there is no CLI that hands
// one out. Matching on the PID we spawned is what keeps the capture pointed
// at the throwaway Obsidian rather than whatever else is on screen.

import CoreGraphics
import Foundation

guard CommandLine.arguments.count > 1, let wanted = Int(CommandLine.arguments[1]) else {
	FileHandle.standardError.write("usage: windowid.swift <pid>\n".data(using: .utf8)!)
	exit(64)
}

guard
	let list = CGWindowListCopyWindowInfo(
		[.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID
	) as? [[String: Any]]
else {
	FileHandle.standardError.write("could not list windows\n".data(using: .utf8)!)
	exit(1)
}

for window in list {
	guard let owner = window[kCGWindowOwnerPID as String] as? Int, owner == wanted else { continue }
	guard let number = window[kCGWindowNumber as String] as? Int else { continue }
	// Layer 0 is the ordinary document layer; Electron also owns small
	// offscreen helper windows that would otherwise match first.
	let layer = window[kCGWindowLayer as String] as? Int ?? -1
	let bounds = window[kCGWindowBounds as String] as? [String: Any]
	let width = bounds?["Width"] as? Double ?? 0
	let height = bounds?["Height"] as? Double ?? 0
	if layer == 0 && width > 300 && height > 300 {
		print(number)
		exit(0)
	}
}

FileHandle.standardError.write("no main window for pid \(wanted)\n".data(using: .utf8)!)
exit(2)
