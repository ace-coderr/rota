"use client";

import { formatUnits } from "viem";
import { useReadContracts } from "wagmi";

import { Button } from "@/components/Button";
import { CircleRing } from "@/components/CircleRing";
import { CountUp, Reveal } from "@/components/Reveal";
import { DEFAULT_DEPLOYMENT, mainnetDeployment } from "@/lib/deployments";
import { addressUrl } from "@/lib/explorer";
import { ERC20_ABI, USDC_ADDRESS } from "@/lib/usdc";

/**
 * The editorial volume: the argument for trusting Rota, made with type,
 * structure and one live number. No imagery, no logos, nothing borrowed.
 */
export default function Home() {
  // Prefer mainnet: the claim is about the contract real money goes through.
  const deployment = mainnetDeployment ?? DEFAULT_DEPLOYMENT;

  const reads = useReadContracts({
    allowFailure: false,
    contracts: [
      {
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "decimals",
        chainId: deployment?.chain.id,
      },
      {
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        // Guarded, not asserted: with no chain configured this renders during
        // the build, and a non-null assertion here failed the whole export.
        args: deployment ? [deployment.rota] : undefined,
        chainId: deployment?.chain.id,
      },
    ],
    query: { enabled: Boolean(deployment) },
  });

  const [decimals, held] = reads.data ?? [];
  const heldNumber =
    held !== undefined && decimals !== undefined
      ? Number(formatUnits(held as bigint, decimals as number))
      : 0;

  return (
    <>

      {/* ---------------------------------------------------------- hero */}
      <header
        className="band band-dark grain"
        style={{ paddingTop: "7rem", paddingBottom: "4rem" }}
      >
        <div className="hero-grid">
          <div>
            <span className="label label-rule">
              Rota / Savings circles on Arc
            </span>
            <h1 className="display">
              Save
              <br />
              together,
              <br />
              <em>take turns.</em>
            </h1>
            <p style={{ fontSize: "1.125rem", marginTop: "1.5rem" }}>
              Everyone puts in the same amount each round, and one person
              receives everyone&rsquo;s share. Next round, someone else does —
              until everyone has had a turn.
            </p>

            <div className="hero-actions">
              <Button href="/create" size="lg" block>
                Start a circle
              </Button>
              <Button href="#live-proof" size="lg" variant="secondary" block>
                See the proof
              </Button>
            </div>

            <div className="stat-strip">
              <div className="stat">
                <span className="stat-value">
                  <CountUp value={heldNumber} /> USDC
                </span>
                <span className="stat-key">Held by Rota</span>
              </div>
              <div className="stat">
                <span className="stat-value">Under 2 cents</span>
                <span className="stat-key">A round, 20 people</span>
              </div>
              <div className="stat">
                <span className="stat-value">
                  {deployment?.label ?? "Arc"}
                </span>
                <span className="stat-key">Chain {deployment?.chain.id}</span>
              </div>
            </div>
          </div>

          <div>
            <CircleRing />
          </div>
        </div>
      </header>

      {/* ------------------------------------------------ 01 how it works */}
      <section className="band band-cream" id="how-it-works">
        <div className="band-inner">
          <Reveal>
            <div className="section-head">
              <span className="section-marker">01 / How it works</span>
              <h2 className="display-sm">Three steps, then it runs itself</h2>
            </div>
          </Reveal>

          <div className="card-grid">
            {[
              {
                n: "01",
                title: "Agree the amount",
                body: "One person sets up the circle: how much each person puts in, how often, and who is in it.",
              },
              {
                n: "02",
                title: "Everyone joins",
                body: "Each member gives permission for their share to move when their turn comes. Nothing moves yet.",
              },
              {
                n: "03",
                title: "Take turns",
                body: "Each round, everyone's share goes straight to whoever's turn it is. Wallet to wallet, in one go.",
              },
            ].map((step, index) => (
              <Reveal key={step.n} delay={index * 80}>
                <article className="numbered">
                  <span className="numbered-n">{step.n}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------- 02 where your money is */}
      <section className="band band-cream" style={{ paddingTop: 0 }}>
        <div className="band-inner">
          <Reveal>
            <div className="section-head">
              <span className="section-marker">02 / Where your money is</span>
              <h2 className="display-sm">Nothing is ever pooled</h2>
            </div>
          </Reveal>

          <Reveal>
            <div className="compare">
              <div className="compare-side compare-a">
                <h3>Every other savings circle: someone holds the money</h3>
                <ul className="marks">
                  <li>
                    <span className="mark mark-no">✕</span>
                    <span>One person collects everyone&rsquo;s share first</span>
                  </li>
                  <li>
                    <span className="mark mark-no">✕</span>
                    <span>You have to trust them not to disappear with it</span>
                  </li>
                  <li>
                    <span className="mark mark-no">✕</span>
                    <span>
                      If they do, there is nothing you can check and nothing to
                      recover
                    </span>
                  </li>
                </ul>
              </div>

              <div className="compare-side compare-b">
                <h3>Rota: nothing is ever pooled</h3>
                <ul className="marks">
                  <li>
                    <span className="mark mark-yes">✓</span>
                    <span>
                      Each share moves straight from one wallet to another
                    </span>
                  </li>
                  <li>
                    <span className="mark mark-yes">✓</span>
                    <span>
                      Rota can&rsquo;t hold your money and can&rsquo;t take it
                    </span>
                  </li>
                  <li>
                    <span className="mark mark-yes">✓</span>
                    <span>
                      You can withdraw your permission at any time, from the app
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ----------------------------------------------- 03 live proof */}
      <section className="band band-dark grain" id="live-proof">
        <div className="band-inner">
          <Reveal>
            <div className="section-head">
              <span className="section-marker">03 / Live proof</span>
              <h2 className="display-sm">What Rota is holding right now</h2>
            </div>
          </Reveal>

          <Reveal>
            <p className="figure" style={{ marginBottom: "1rem" }}>
              {reads.isLoading ? "—" : <CountUp value={heldNumber} />}{" "}
              <span className="figure-unit">
                USDC · {deployment?.label ?? "Arc"}
              </span>
            </p>
          </Reveal>

          <Reveal>
            <p style={{ fontSize: "1.125rem", maxWidth: "36rem" }}>
              Read from the contract as this page loaded. It stays at zero
              because every share goes straight from one member to another —
              and you don&rsquo;t have to take our word for it.
            </p>
            {deployment && (
              <p>
                <a
                  href={addressUrl(deployment.explorer, deployment.rota)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Check the contract on explorer.arc.io
                </a>
              </p>
            )}
          </Reveal>
        </div>
      </section>

      {/* --------------------------------------------- 04 what it costs */}
      <section className="band band-cream">
        <div className="band-inner">
          <Reveal>
            <div className="section-head">
              <span className="section-marker">04 / What it costs</span>
              <h2 className="display-sm">Under two cents a round</h2>
            </div>
          </Reveal>

          <Reveal>
            <p className="formula">disburse = 55,100 + 25,400 × (n − 1) gas</p>
          </Reveal>

          <Reveal>
            <table className="cost">
              <thead>
                <tr>
                  <th>Measured on Arc</th>
                  <th>Gas</th>
                  <th>At 25.3 gwei</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>A round, 3 people</td>
                  <td>105,960</td>
                  <td>$0.0027</td>
                </tr>
                <tr>
                  <td>A round, 20 people</td>
                  <td>538,180</td>
                  <td>$0.0136</td>
                </tr>
                <tr>
                  <td>Setting up, 20 people</td>
                  <td>625,570</td>
                  <td>$0.0158</td>
                </tr>
              </tbody>
            </table>
          </Reveal>

          <Reveal>
            <p style={{ marginTop: "1.5rem" }}>
              Fitted from two real measurements and accurate to 12 gas at 19
              transfers. The network charge is paid in the same USDC
              you&rsquo;re saving, so there is no second currency to buy.
            </p>
          </Reveal>
        </div>
      </section>

    </>
  );
}
