# Claude's dialogs for session.exp and environment.exp (sourced by both). Kit answers no dialog
# but one: a feature offer ("Try the new …?" with a "Not now" option) gets "Not now" and the
# script waits for the link again (spec M15). On any other dialog the scripts stop claude
# without pressing a key and print DIALOG <kind>; the backend fails the operation with the
# dialog text and says what to do. Claude's UI often prints cursor moves instead of spaces, so
# the words of a phrase are matched with a short gap between them. The same patterns live in
# screen.ts for the Windows host.
#   DIALOG trust       the workspace trust dialog
#   DIALOG imports     "Allow external CLAUDE.md file imports?"
#   DIALOG onboarding  Claude's first run: the theme picker or the login method
#   DIALOG unknown     any other dialog ("Enter to confirm" / "Esc to cancel" footer)
#   PROMO_DECLINED <n> a feature offer was answered with option <n>, "Not now"
# The script exits 6 after printing a DIALOG marker.

set G {.{0,16}}
set imports_pattern "CLAUDE\\.md${G}file${G}imports|allow${G}external${G}imports"
set trust_pattern "trust${G}this${G}folder|trust${G}the${G}files${G}in|Quick${G}safety${G}check"
set onboarding_pattern "Syntax${G}theme|Choose${G}the${G}text${G}style|Select${G}login${G}method"
set offer_pattern "Try${G}the${G}new|Would${G}you${G}like${G}to${G}try"
# The theme picker prints no footer, so the first run is part of the pattern.
set dialog_pattern "(?:${imports_pattern}|${trust_pattern}|${onboarding_pattern}|Enter${G}to${G}confirm|Esc${G}to${G}cancel)"
# Feature offers one launch declines at most, and the questions already answered.
set max_offers 3
set offers_declined {}

# Screen text without escape sequences; cursor-forward moves become spaces (stripAnsi of pty.ts).
proc plain_text {text} {
  regsub -all {\x1b\[[0-9]*C} $text { } text
  regsub -all {\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]} $text {} text
  regsub -all {\r} $text {} text
  return $text
}

# The kind of a dialog by its exact phrases; anything else is unknown.
proc dialog_kind {text} {
  global imports_pattern trust_pattern onboarding_pattern offer_pattern
  set plain [plain_text $text]
  if {[regexp -nocase -- $imports_pattern $plain]} { return imports }
  if {[regexp -nocase -- $trust_pattern $plain]} { return trust }
  if {[regexp -nocase -- $onboarding_pattern $plain]} { return onboarding }
  if {[regexp -nocase -- $offer_pattern $plain] && [regexp -nocase -- {(\d)\.[ \t]{0,4}Not.{0,16}now} $plain]} { return promo }
  return unknown
}

# The question of a feature offer without spaces, to tell a repeated offer from a new one.
proc offer_question {text} {
  global offer_pattern
  set question ""
  regexp -nocase -- "(?:${offer_pattern})\[^?\]{0,120}\\?" [plain_text $text] question
  regsub -all {\s+} $question {} question
  return [string tolower $question]
}

# Lets the dialog finish drawing (1 s of silence, 5 s at most). A feature offer is answered
# "Not now" (arrows from the option under the cursor, then Enter) and "declined" is returned;
# any other dialog stops claude without a key press, prints DIALOG <kind> and exits 6.
proc handle_dialog {seen} {
  global max_offers offers_declined
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
  if {$kind eq "promo"} {
    set plain [plain_text $text]
    set question [offer_question $text]
    regexp -nocase -- {(\d)\.[ \t]{0,4}Not.{0,16}now} $plain -> option
    set cursor 1
    regexp -- {(?:❯|›|>)[ \t]{0,4}(\d)\.} $plain -> cursor
    if {[llength $offers_declined] < $max_offers && [lsearch -exact $offers_declined $question] < 0} {
      lappend offers_declined $question
      set arrow [expr {$option >= $cursor ? "\x1b\[B" : "\x1b\[A"}]
      for {set i 0} {$i < abs($option - $cursor)} {incr i} {
        send -- $arrow
        after 100
      }
      send "\r"
      puts "\nPROMO_DECLINED $option"
      return declined
    }
    set kind unknown
  }
  catch {exec kill -TERM [exp_pid]}
  catch {close}
  catch {wait}
  puts "\nDIALOG $kind"
  exit 6
}
