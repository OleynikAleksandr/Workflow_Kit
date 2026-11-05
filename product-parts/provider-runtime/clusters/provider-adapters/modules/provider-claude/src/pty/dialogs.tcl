# Claude's dialogs for session.exp and environment.exp (sourced by both). Kit never answers a
# dialog: the scripts stop claude without pressing a key and print DIALOG <kind>; the backend fails
# the operation with the dialog text and sends the user to the trust preview, where the answer is
# written into ~/.claude.json. Claude's UI often prints cursor moves instead of spaces, so the words
# of a phrase are matched with a short gap between them.
#   DIALOG trust     the workspace trust dialog
#   DIALOG imports   "Allow external CLAUDE.md file imports?"
#   DIALOG unknown   any other dialog ("Enter to confirm" / "Esc to cancel" footer)
# The script exits 6 after printing the marker.

set G {.{0,16}}
set imports_pattern "CLAUDE\\.md${G}file${G}imports|allow${G}external${G}imports"
set trust_pattern "trust${G}this${G}folder|trust${G}the${G}files${G}in|Quick${G}safety${G}check"
set dialog_pattern "(?:${imports_pattern}|${trust_pattern}|Enter${G}to${G}confirm|Esc${G}to${G}cancel)"

# The kind of a dialog by its exact phrases; anything else is unknown.
proc dialog_kind {text} {
  global imports_pattern trust_pattern
  if {[regexp -nocase -- $imports_pattern $text]} { return imports }
  if {[regexp -nocase -- $trust_pattern $text]} { return trust }
  return unknown
}

# Lets the dialog finish drawing (1 s of silence, 5 s at most), stops claude without a key press,
# prints DIALOG <kind> and exits 6.
proc stop_on_dialog {seen} {
  set text $seen
  set timeout 1
  set deadline [expr {[clock milliseconds] + 5000}]
  expect {
    -re {.+} {
      append text $expect_out(buffer)
      if {[clock milliseconds] < $deadline} { exp_continue }
    }
    timeout {}
    eof {}
  }
  set kind [dialog_kind $text]
  catch {exec kill -TERM [exp_pid]}
  catch {close}
  catch {wait}
  puts "\nDIALOG $kind"
  exit 6
}
