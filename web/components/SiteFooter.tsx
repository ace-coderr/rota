"use client";

import Link from "next/link";

import { RotaMark } from "@/components/Logo";

import { DEFAULT_DEPLOYMENT, mainnetDeployment } from "@/lib/deployments";
import { addressUrl } from "@/lib/explorer";
import { shortAddress } from "@/lib/format";
import { USDC_ADDRESS } from "@/lib/usdc";

const GITHUB = "https://github.com/ace-coderr/rota";
/*
 * Derived, not hardcoded. This was pinned to a contract address literal and
 * went on pointing at the superseded deployment after the redeploy — a
 * "verified source" link that shows you a different contract is worse than no
 * link at all.
 */
const sourcifyUrl = (chainId: number, address: string) =>
  `https://sourcify.dev/server/v2/contract/${chainId}/${address}`;

export function SiteFooter() {
  // Prefer mainnet when it is configured: that is the contract people's money
  // would actually go through.
  const deployment = mainnetDeployment ?? DEFAULT_DEPLOYMENT;

  return (
    <footer className="foot grain">
      <div className="foot-grid">
        <div>
          <RotaMark size={40} />
          <p style={{ marginTop: "0.75rem", maxWidth: "22rem" }}>
            A savings circle where everyone takes a turn. Your money stays in
            your own wallet until it&rsquo;s your turn to be paid.
          </p>
        </div>

        <div>
          <h4>Product</h4>
          <ul>
            <li>
              <Link href="/#how-it-works">How it works</Link>
            </li>
            <li>
              <Link href="/#live-proof">Proof</Link>
            </li>
            <li>
              <Link href="/create">Start a circle</Link>
            </li>
          </ul>
        </div>

        <div>
          <h4>Built on</h4>
          <ul>
            <li>
              <a href="https://arc.network" target="_blank" rel="noreferrer">
                Arc
              </a>
            </li>
            <li>
              {deployment ? (
                <a
                  href={addressUrl(deployment.explorer, USDC_ADDRESS)}
                  target="_blank"
                  rel="noreferrer"
                >
                  USDC
                </a>
              ) : (
                "USDC"
              )}
            </li>
            <li>
              {deployment ? (
                <a
                  href={addressUrl(deployment.explorer, deployment.rota)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Contract {shortAddress(deployment.rota)}
                </a>
              ) : (
                "Contract not deployed"
              )}
            </li>
            {deployment && (
              <li>
                <a
                  href={sourcifyUrl(deployment.chain.id, deployment.rota)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Verified source
                </a>
              </li>
            )}
          </ul>
        </div>

        <div>
          <h4>Code</h4>
          <ul>
            <li>
              <a href={GITHUB} target="_blank" rel="noreferrer">
                GitHub
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="foot-bar">
        <span>Unaudited — use small amounts.</span>
        <span>
          {deployment
            ? `${deployment.label} · chain ${deployment.chain.id}`
            : "not configured"}
        </span>
      </div>
    </footer>
  );
}
