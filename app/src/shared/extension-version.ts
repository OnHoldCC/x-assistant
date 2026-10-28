import manifest from "../../../extension/manifest.json" with { type: "json" };
export const extensionVersion = manifest.version;

export function extensionNeedsUpgrade(version?: string) {
  if (!version || !/^\d{1,5}(\.\d{1,5}){0,3}$/.test(version)) return true;
  const current = version.split(".").map(Number), expected = extensionVersion.split(".").map(Number);
  if (current.some(part => part > 65535)) return true;
  for (let i = 0; i < 4; i++) {
    const difference = (current[i] || 0) - (expected[i] || 0);
    if (difference) return difference < 0;
  }
  return false;
}
