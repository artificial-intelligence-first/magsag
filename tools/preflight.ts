import fs from "node:fs";
import yaml from "yaml";

const EXPECTED_IMAGE = "ghcr.io/openai/codex-universal:latest";
const EXPECTED_WORKDIR = ".work";
const EXPECTED_WORKDIR_QUOTA_MB = 64;
const EXPECTED_MEMORY_MB = 256;
const EXPECTED_CPU_SECONDS = 30;
const EXPECTED_PIDS_LIMIT = 32;
const REQUIRED_FORBIDDEN = ["child_process.exec", "eval"];

const raw = fs.readFileSync("tools/security/policy/default.policy.yaml", "utf8");
const policy = yaml.parse(raw);

const fail = (message: string): never => {
  console.error(message);
  process.exit(2);
};

const ensure = (condition: boolean, message: string): void => {
  if (!condition) {
    fail(message);
  }
};

ensure(policy?.runtime?.kind === "container", "policy.runtime.kind must be 'container'");

const runtimeImage = policy?.runtime?.image;
ensure(typeof runtimeImage === "string" && runtimeImage.length > 0, "policy.runtime.image is required");
ensure(runtimeImage === EXPECTED_IMAGE, `policy.runtime.image must be '${EXPECTED_IMAGE}'`);

ensure(policy?.network?.mode === "none", "network must start as 'none'");

ensure(policy?.filesystem?.workdir === EXPECTED_WORKDIR, `filesystem.workdir must be '${EXPECTED_WORKDIR}'`);

const workdirQuota = Number(policy?.filesystem?.workdir_quota_mb);
ensure(Number.isFinite(workdirQuota) && workdirQuota > 0, "filesystem.workdir_quota_mb must be a positive number");
ensure(workdirQuota <= EXPECTED_WORKDIR_QUOTA_MB, `filesystem.workdir_quota_mb must be ≤ ${EXPECTED_WORKDIR_QUOTA_MB}`);

const memoryMb = Number(policy?.limits?.memory_mb);
ensure(Number.isFinite(memoryMb) && memoryMb > 0, "limits.memory_mb must be a positive number");
ensure(memoryMb <= EXPECTED_MEMORY_MB, `limits.memory_mb must be ≤ ${EXPECTED_MEMORY_MB}`);

const cpuSeconds = Number(policy?.limits?.cpu_seconds);
ensure(Number.isFinite(cpuSeconds) && cpuSeconds > 0, "limits.cpu_seconds must be a positive number");
ensure(cpuSeconds <= EXPECTED_CPU_SECONDS, `limits.cpu_seconds must be ≤ ${EXPECTED_CPU_SECONDS}`);

const pidsLimit = Number(policy?.limits?.pids);
ensure(Number.isFinite(pidsLimit) && pidsLimit > 0, "limits.pids must be a positive integer");
ensure(Number.isInteger(pidsLimit), "limits.pids must be an integer");
ensure(pidsLimit <= EXPECTED_PIDS_LIMIT, `limits.pids must be ≤ ${EXPECTED_PIDS_LIMIT}`);

const forbiddenFunctions = policy?.forbidden?.functions;
ensure(Array.isArray(forbiddenFunctions), "policy.forbidden.functions must be an array");

for (const fn of REQUIRED_FORBIDDEN) {
  ensure(forbiddenFunctions.includes(fn), `policy.forbidden.functions must include '${fn}'`);
}

console.log("[preflight] policy OK:", policy.runtime.kind, policy.runtime.image);
