import fs from "node:fs";
import yaml from "yaml";

const policy = yaml.parse(fs.readFileSync("tools/security/policy/default.policy.yaml", "utf8"));

console.log("[CTR] policy:", policy.runtime?.kind, policy.runtime?.image);
console.log("[CTR] hello from sandbox-runner.");
