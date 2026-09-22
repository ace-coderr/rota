"use client";

import {
  DEPLOYMENTS,
  missingMainnetConfig,
  missingTestnetConfig,
} from "@/lib/deployments";

/**
 * Says exactly which variable is absent.
 *
 * The person most likely to hit this is the one who can fix it, and "please
 * try again later" tells them nothing — it reads like an outage when it is a
 * missing setting. It also names the build-time trap, because adding the
 * variable to the host is not enough on its own.
 */
export function ConfigNotice() {
  const mainnet = missingMainnetConfig();
  const testnet = missingTestnetConfig();
  const missing = [...mainnet, ...testnet];

  return (
    <div className="notice notice-stop">
      <p className="notice-title">
        Rota has no network configured on this site.
      </p>

      {missing.length > 0 && (
        <>
          <p className="small">These environment variables are not set:</p>
          <ul style={{ margin: "0 0 0.75rem 1.25rem", padding: 0 }}>
            {missing.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="small">
        A chain needs its id, its RPC URL and a deployed contract address
        before it is offered. {DEPLOYMENTS.length} are configured.
      </p>
      <p className="small">
        These are read when the site is built, not when it is served, so
        setting them on the host only takes effect on the next deploy.
      </p>
    </div>
  );
}
