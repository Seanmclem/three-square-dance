// Deploy seam (phase D): providers take a finished export bundle directory and
// put it somewhere reachable (static host, itch.io, zip…). Nothing is wired
// yet — exportGameBundle produces the folder, providers are a later increment.

export interface DeployProvider {
  name: string;
  deploy(bundleDir: string): Promise<{ ok: boolean; url?: string; log: string }>;
}

/** Registry of available providers, keyed by name. Empty until a provider ships. */
export const deployProviders: Record<string, DeployProvider> = {};
