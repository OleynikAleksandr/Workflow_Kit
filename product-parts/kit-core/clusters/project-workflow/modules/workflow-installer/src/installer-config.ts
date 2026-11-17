// The project configuration an installation writes: the default one for a
// new project, and the markers the host passes (`host`, `decisions`).
import {
  ensure,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import {
  type WorkflowConfig,
  workflowQualityFacade,
} from "../../workflow-quality/src/workflow-quality-facade.js";

export interface ConfigMarkers {
  /** `host` turns on host-only user decisions (M40); absent keeps the config. */
  decisions?: "host" | null;
  /** Host marker written to `config.host`; an existing marker is kept. */
  host?: "harness" | null;
}

/** USAGE for a marker value the installer does not know. */
export function checkMarkers(markers: ConfigMarkers): void {
  ensure(
    markers.host === undefined ||
      markers.host === null ||
      markers.host === "harness",
    "USAGE",
    "--host is harness."
  );
  ensure(
    markers.decisions === undefined ||
      markers.decisions === null ||
      markers.decisions === "host",
    "USAGE",
    "--decisions is host."
  );
}

/**
 * The decisions mode the installation ends with: the passed marker, else
 * the one of the existing configuration; `agent` without either.
 */
export function decisionsOf(
  root: string,
  markers: ConfigMarkers
): "agent" | "host" {
  if (markers.decisions === "host") {
    return "host";
  }
  const exists =
    workflowPlatformFacade.readTextIfExists(
      workflowQualityFacade.configFile(root)
    ) !== null;
  return exists && workflowQualityFacade.readConfig(root).decisions === "host"
    ? "host"
    : "agent";
}

/**
 * Writes the default configuration when it is absent, or only the passed
 * markers into an existing one; returns true when the file changed.
 */
export function writeConfig(root: string, markers: ConfigMarkers): boolean {
  const { decisions, host } = markers;
  const exists =
    workflowPlatformFacade.readTextIfExists(
      workflowQualityFacade.configFile(root)
    ) !== null;
  const config: WorkflowConfig = exists
    ? workflowQualityFacade.readConfig(root)
    : workflowQualityFacade.defaultConfig();
  const hostSame = !host || config.host === host;
  const decisionsSame = !decisions || config.decisions === decisions;
  if (exists && hostSame && decisionsSame) {
    return false;
  }
  workflowQualityFacade.writeConfig(root, {
    ...config,
    ...(host ? { host } : {}),
    ...(decisions ? { decisions } : {}),
  });
  return true;
}
