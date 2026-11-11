// Codex on Windows refuses to start its daemon from a process with full administrator rights
// ("start the Windows daemon from a non-elevated terminal; shared clients must not inherit
// administrator privileges"). With UAC off (EnableLUA = 0) every process of an administrator has
// them, so the daemon never comes up (spec M14 section 2.2). Kit names the cause and the fix; it
// never changes UAC itself.

/** Why the daemon does not start. */
export const ELEVATED_REASON = 'Codex не запускает демон с правами администратора: на этом компьютере выключен контроль учётных записей (UAC)';

/** What the user does (Kit does not change system settings). */
export const ELEVATED_HINT =
  'Включите UAC: PowerShell от имени администратора — Set-ItemProperty -Path HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System -Name EnableLUA -Value 1, затем перезагрузите Windows.';

/** True when the output of `codex remote-control start` is the refusal of an elevated process. */
export function isElevatedRefusal(output: string): boolean {
  return /non-elevated terminal|must not inherit administrator privileges/i.test(output);
}
