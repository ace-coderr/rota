import type { Metadata } from "next";

import { Button } from "@/components/Button";
import { Reveal, Stagger } from "@/components/Reveal";

/**
 * The explainer.
 *
 * The landing page makes an argument in three cards. This answers the
 * questions people actually ask, in the order they ask them — and the order
 * matters more than the content, because nobody reaches "is it safe" until
 * they have stopped assuming their money is being collected somewhere.
 *
 * Two rules it is written under:
 *
 * 1. Editorial volume, readable body. The bands and display type are the
 *    landing page's; the prose is set wider and larger than anywhere else in
 *    the app, because this is the only page somebody reads rather than scans.
 *
 * 2. No jargon, and that means no euphemisms either. The words "allowance",
 *    "approve", "escrow", "custody", "gas" and "transaction" do not appear.
 *    Not softened — absent. Someone who has never held a wallet has no way to
 *    tell a technical term they should look up from one they can skip, so
 *    every one of them reads as a reason to stop.
 *
 * No chain reads: every figure here is a fact that already happened, so this
 * is a server component and the numbers cannot flicker or disagree with
 * themselves between two renders.
 */

export const metadata: Metadata = {
  // The root layout's template appends " — Rota"; spelling it out here too
  // renders "How it works — Rota — Rota" in the tab.
  title: "How it works",
  description:
    "A savings circle where nobody holds the money. What it is, a worked example, what it costs, and what Rota cannot do.",
};

// The round shown as proof. A fact from a specific block, so it is written
// down rather than read — a live read would show today's circles, which is a
// different claim and one that changes under the reader.
const PROOF = {
  tx: "0x0dd5d508813cbbf3eae78122a1be3dd201fb21122523264ce5a7399b6f0c71c3",
  explorer: "https://explorer.arc.io",
  when: "1 October 2026",
};

const ANYONE_TX =
  "0xbfd16864b5916c66d2aa6e9e3aa0bf1036f6a9402c30f8b104493ef4712d3f89";

const SECURITY = "https://github.com/ace-coderr/rota#security";
const FUNDING = "https://github.com/ace-coderr/rota#getting-usdc-on-arc";

export default function HowItWorks() {
  return (
    <>
      {/* ---------------------------------------------------------- hero */}
      <header
        className="band band-dark grain"
        style={{ paddingTop: "7rem", paddingBottom: "3.5rem" }}
      >
        <div className="band-inner">
          <span className="label label-rule">Rota / How it works</span>
          <h1 className="display">
            Nobody
            <br />
            <span className="display-outline">holds</span>
            <br />
            <em>the money.</em>
          </h1>
          <p className="prose-lede">
            A savings circle is an old idea. This is the same idea with the one
            weak part removed — the person who collects everyone&rsquo;s share
            and is trusted not to vanish with it.
          </p>
          <p className="prose-lede prose-lede-quiet">
            Ten minutes of reading, no wallet required. Everything below can be
            checked by anyone.
          </p>
        </div>
      </header>

      {/* ------------------------------------------- 01 what a circle is */}
      <section className="band band-cream">
        <div className="band-inner prose">
          <Reveal>
            <div className="section-head">
              <span className="section-marker">01 / The idea</span>
              <h2 className="display-sm">What a savings circle is</h2>
            </div>
          </Reveal>

          <Reveal>
            <p>
              A group of people agree on an amount and how often they&rsquo;ll
              meet. Every round, everyone puts in the same amount — and one
              person receives everyone&rsquo;s share.
            </p>
            <p>
              Next round, someone else receives it. Then someone else, until
              everyone in the group has had a turn. Then it&rsquo;s finished.
            </p>
            <p>
              That&rsquo;s the whole mechanism. If there are six people, there
              are six rounds, and each person is paid once.
            </p>
            <p className="prose-aside">
              You may already know this by its local name:{" "}
              <strong>ajo</strong>, <strong>esusu</strong> or{" "}
              <strong>adashe</strong> in Nigeria, <strong>susu</strong> in Ghana
              and the Caribbean, <strong>chama</strong> in Kenya,{" "}
              <strong>tanda</strong> in Mexico. Hundreds of millions of people
              save this way. It long predates banks, and it works.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------- 02 an example */}
      <section className="band band-cream" style={{ paddingTop: 0 }}>
        <div className="band-inner prose">
          <Reveal>
            <div className="section-head">
              <span className="section-marker">02 / An example</span>
              <h2 className="display-sm">Three people, 10 each</h2>
            </div>
          </Reveal>

          <Reveal>
            <p>
              Ama, Bisi and Caro agree on 10 USDC each, once a week, for three
              weeks. USDC is a digital dollar — one USDC is one US dollar.
            </p>
          </Reveal>

          <Reveal>
            {/* Scrolls rather than wraps on a narrow phone: a wrapped ledger
                cell lands under the wrong column and quietly says the wrong
                number, which is worse than a scrollbar. */}
            <div className="ledger-scroll">
              <table className="ledger">
                <caption className="sr-only">
                  What each person pays and receives in each of three rounds,
                  and their net position at the end.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Round</th>
                    <th scope="col">Ama</th>
                    <th scope="col">Bisi</th>
                    <th scope="col">Caro</th>
                    <th scope="col" className="ledger-who">
                      Who&rsquo;s paid
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Week 1</th>
                    <td className="up">+20</td>
                    <td className="down">−10</td>
                    <td className="down">−10</td>
                    <td className="ledger-who">Ama</td>
                  </tr>
                  <tr>
                    <th scope="row">Week 2</th>
                    <td className="down">−10</td>
                    <td className="up">+20</td>
                    <td className="down">−10</td>
                    <td className="ledger-who">Bisi</td>
                  </tr>
                  <tr>
                    <th scope="row">Week 3</th>
                    <td className="down">−10</td>
                    <td className="down">−10</td>
                    <td className="up">+20</td>
                    <td className="ledger-who">Caro</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Net</th>
                    <td>0</td>
                    <td>0</td>
                    <td>0</td>
                    <td className="ledger-who">Everyone</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Reveal>

          <Reveal>
            <p>
              Each person pays 10 twice and receives 20 once. Nobody is up,
              nobody is down. Nobody has paid a fee, and nobody has earned
              interest.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ----------------------------------------------------- 03 why bother */}
      <section className="band band-cream" style={{ paddingTop: 0 }}>
        <div className="band-inner prose">
          <Reveal>
            <div className="section-head">
              <span className="section-marker">03 / The point</span>
              <h2 className="display-sm">
                So why bother, if everyone ends at zero?
              </h2>
            </div>
          </Reveal>

          <Reveal>
            <p>
              Because <em>when</em> you have the money is the whole point.
            </p>
            <p>
              Ama has 20 USDC in week one. Saving 10 a week on her own, she
              wouldn&rsquo;t have 20 until week two — and she would have had to
              keep it untouched to get there, which is the part that usually
              fails.
            </p>
            <p>
              A circle turns small regular amounts into a useful lump sum,
              earlier, without a bank and without borrowing. Nobody checks your
              credit. There is no interest, because nobody has lent anything.
            </p>
          </Reveal>

          <Reveal>
            <div className="case">
              <h3>Three traders, one market</h3>
              <p>
                Ama, Bisi and Caro sell at the same market. Stock costs 20 to
                buy and sells for 30, but none of them makes enough in a week to
                put 20 aside.
              </p>
              <p>
                They run a circle. Ama buys stock in week one and sells it; Bisi
                buys in week two; Caro in week three. By the end, all three have
                traded — on money they already had between them, just not at the
                same time.
              </p>
              <p>
                A bank would have called this three loans and charged for them.
                It isn&rsquo;t three loans. It&rsquo;s the same money, arriving
                in a more useful order.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------- 04 no deposit */}
      <section className="band band-dark grain">
        <div className="band-inner prose">
          <Reveal>
            <div className="section-head">
              <span className="section-marker">04 / The part people assume</span>
              <h2 className="display-sm">There is no deposit</h2>
            </div>
          </Reveal>

          <Reveal>
            <p>
              Almost everyone reads &ldquo;savings circle&rdquo; and pictures
              handing money over. Rota never asks you to.
            </p>
            <p>
              When you join, you give permission once: Rota may move your share
              — that exact amount, and only when it&rsquo;s somebody&rsquo;s
              turn. Your money does not go anywhere. It sits in your own wallet,
              yours to spend, until the moment a round runs.
            </p>
            <p>
              Then every share moves directly to the one person being paid.
              Wallet to wallet, all at once. Rota is never a stop along the way;
              it holds nothing at any point, including the instant in between.
            </p>
          </Reveal>

          <Reveal>
            <p className="prose-strong">
              You don&rsquo;t have to take our word for it. Here is a real round
              on {PROOF.when}.
            </p>
          </Reveal>

          <Reveal>
            <div className="receipt">
              <ol className="receipt-rows">
                <li>
                  <span className="receipt-who">First member</span>
                  <span className="receipt-move down">−0.05</span>
                  <span className="receipt-note">0.297244 → 0.247244</span>
                </li>
                <li>
                  <span className="receipt-who">Second member</span>
                  <span className="receipt-move down">−0.05</span>
                  <span className="receipt-note">0.291416 → 0.241416</span>
                </li>
                <li>
                  <span className="receipt-who">Whose turn it was</span>
                  <span className="receipt-move up">+0.10</span>
                  <span className="receipt-note">0.531841 → 0.631841</span>
                </li>
              </ol>
              <p className="receipt-total">
                <span className="receipt-who">Rota itself</span>
                <span className="receipt-move">0.00 → 0.00</span>
              </p>
            </div>
          </Reveal>

          <Reveal>
            <p>
              Two wallets went down by 0.05. One went up by 0.10. Rota held
              nothing before and nothing after — not a rounding of nothing, but
              zero, because at no point was any of it anywhere except in
              somebody&rsquo;s own wallet.
            </p>
            <p>
              <a
                href={`${PROOF.explorer}/tx/${PROOF.tx}`}
                target="_blank"
                rel="noreferrer"
              >
                See this round on the public record →
              </a>
            </p>
          </Reveal>
        </div>
      </section>

      {/* --------------------------------------------- 05 who starts it */}
      <section className="band band-cream">
        <div className="band-inner prose">
          <Reveal>
            <div className="section-head">
              <span className="section-marker">05 / Who starts a round</span>
              <h2 className="display-sm">Nobody is in charge</h2>
            </div>
          </Reveal>

          <Reveal>
            <p>
              A round doesn&rsquo;t run until somebody sets it going — and that
              somebody can be <em>anyone</em>. Any member, from the circle page,
              in one tap. It costs a fraction of a cent, which the person
              tapping pays.
            </p>
            <p>
              In practice you won&rsquo;t have to. Rota checks every hour and
              starts any round that has come due, so circles keep running while
              everyone&rsquo;s asleep.
            </p>
            <p>
              But that helper has no powers. It can&rsquo;t decide who gets
              paid, can&rsquo;t pay early, can&rsquo;t skip anyone, and
              can&rsquo;t touch anybody&rsquo;s money. It only pays the fraction
              of a cent that nobody else felt like paying.
            </p>
            <p className="prose-aside">
              On the live network, one circle&rsquo;s final round was started by{" "}
              <a href={`${PROOF.explorer}/tx/${ANYONE_TX}`} target="_blank" rel="noreferrer">
                a wallet that wasn&rsquo;t even in that circle
              </a>
              . A stranger paid the fraction of a cent, and the money still went
              to exactly the person whose turn it was. That&rsquo;s not a gap —
              it&rsquo;s the proof that nobody, including us, can point a round
              anywhere.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------- 06 someone is short */}
      <section className="band band-cream" style={{ paddingTop: 0 }}>
        <div className="band-inner prose">
          <Reveal>
            <div className="section-head">
              <span className="section-marker">06 / If someone is short</span>
              <h2 className="display-sm">The round simply doesn&rsquo;t run</h2>
            </div>
          </Reveal>

          <Reveal>
            <p>
              If one person doesn&rsquo;t have their share when a round comes
              due, nothing happens. Nobody is charged. Nobody loses anything.
              Nothing is taken from anyone and held while it waits.
            </p>
            <p>
              The circle page says who everyone is waiting for, by name. The
              moment they top up, the round runs — the same day, the same hour,
              no restart and nothing to sign again.
            </p>
          </Reveal>

          <Reveal>
            <div className="case">
              <h3>Why all-or-nothing</h3>
              <p>
                It would be easy to pay out whatever was collected. We
                don&rsquo;t, and the reason is fairness over time.
              </p>
              <p>
                If a round could pay out short, then what you receive on your
                turn would depend on who happened to be ready that week — and
                whoever goes last would carry every shortfall the circle ever
                had. Your position in the order would decide how much you got
                back.
              </p>
              <p>
                Everyone pays the same, so everyone receives the same. A round
                either happens in full or it waits.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------ 07 what it can't */}
      <section className="band band-dark grain">
        <div className="band-inner prose">
          <Reveal>
            <div className="section-head">
              <span className="section-marker">07 / The limits</span>
              <h2 className="display-sm">What Rota cannot do</h2>
            </div>
          </Reveal>

          <Reveal>
            <p>
              Not &ldquo;promises not to&rdquo; — <em>cannot</em>. These
              aren&rsquo;t policies anyone decided. They&rsquo;re the absence of
              any way to do it:
            </p>
          </Reveal>

          <Stagger className="cannot">
            {[
              {
                t: "Hold your money",
                b: "There is nowhere for it to sit. Shares move from one wallet to another and never pause in between.",
              },
              {
                t: "Take your money",
                b: "The only thing it can move is your share, and the only place it can move it is to whoever's turn it is.",
              },
              {
                t: "Freeze you out",
                b: "There's no button for it. Your balance is in your wallet, spendable by you, every day of the circle.",
              },
              {
                t: "Pay the wrong person",
                b: "Whose turn it is comes from the order the circle agreed. Nobody can set it, skip it, or reorder it.",
              },
              {
                t: "Keep your permission",
                b: "You can withdraw it at any time, in one tap. You don't need our cooperation and we can't refuse.",
              },
              {
                t: "Change the rules",
                b: "No admin, no owner, no settings. Once a circle starts, the amount, the schedule and the order are fixed for everyone — us included.",
              },
            ].map((item) => (
              <article className="cannot-item" key={item.t}>
                <h3>{item.t}</h3>
                <p>{item.b}</p>
              </article>
            ))}
          </Stagger>
        </div>
      </section>

      {/* -------------------------------------------- 08 what it costs */}
      <section className="band band-cream">
        <div className="band-inner prose">
          <Reveal>
            <div className="section-head">
              <span className="section-marker">08 / What it costs</span>
              <h2 className="display-sm">Under two cents</h2>
            </div>
          </Reveal>

          <Reveal>
            <p>
              Running a round for twenty people costs under two cents, paid by
              whoever sets it going. For three people it&rsquo;s a fifth of a
              cent.
            </p>
            <p className="prose-strong">
              Rota itself takes nothing. No fee, no percentage, no subscription,
              no cut of anyone&rsquo;s turn. There is no account anywhere for a
              fee to go to.
            </p>
            <p>
              That isn&rsquo;t generosity — it&rsquo;s the same fact as
              everything above. A thing that can&rsquo;t hold your money
              also can&rsquo;t take a slice of it on the way past.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ----------------------------------------------------- 09 is it safe */}
      <section className="band band-cream" style={{ paddingTop: 0 }}>
        <div className="band-inner prose">
          <Reveal>
            <div className="section-head">
              <span className="section-marker">09 / Is it safe</span>
              <h2 className="display-sm">Honestly: use small amounts</h2>
            </div>
          </Reveal>

          <Reveal>
            <p>Here is the real picture, good and bad.</p>
            <ul className="plainlist">
              <li>
                <strong>The code is public and published.</strong> Anyone can
                read exactly what Rota does, and check that the published code
                is what&rsquo;s actually running.
              </li>
              <li>
                <strong>It has 30 tests</strong>, including one that runs a real
                attack against the live version and proves it fails.
              </li>
              <li>
                <strong>Automated review found one serious flaw.</strong> It was
                fixed, re-published, and the attack re-run against the fixed
                version to prove the fix holds. Nobody ever lost anything —
                there was no money on the affected version.
              </li>
              <li>
                <strong>It has not had a professional audit.</strong> That is a
                real gap. Expert reviewers find things that tests and automated
                tools do not, because they think about what a determined person
                would try.
              </li>
            </ul>
          </Reveal>

          <Reveal>
            <p className="prose-strong">
              So: use small amounts. Amounts you&rsquo;d be annoyed to lose, not
              hurt to lose. That advice stands until an audit says otherwise.
            </p>
            <p>
              <a href={SECURITY} target="_blank" rel="noreferrer">
                Read the full security write-up, including the flaw →
              </a>
            </p>
          </Reveal>
        </div>
      </section>

      {/* -------------------------------------------------- 10 why arc */}
      <section className="band band-dark grain">
        <div className="band-inner prose">
          <Reveal>
            <div className="section-head">
              <span className="section-marker">10 / Why this network</span>
              <h2 className="display-sm">One thing in your wallet</h2>
            </div>
          </Reveal>

          <Reveal>
            <p>
              Rota runs on a network called Arc, for one reason that matters to
              members rather than to engineers.
            </p>
            <p>
              On most networks, moving dollars requires you to also hold a
              second, separate thing to pay the network with — one that goes up
              and down in value and has to be bought somewhere. Run out of it
              and your dollars are stuck: you can see them and you can&rsquo;t
              move them.
            </p>
            <p>
              On Arc, the dollar <em>is</em> the network&rsquo;s own money. The
              small charge for running a round comes out of the same USDC
              you&rsquo;re saving. One thing in your wallet, never two, and no
              way to be stranded holding savings you can&rsquo;t send.
            </p>
            <p>
              It&rsquo;s also quick. A whole round — everyone&rsquo;s share
              moving at once — finishes in under a second, so a circle meeting
              in a room settles before the conversation moves on.
            </p>
          </Reveal>

          {/*
            The question this section leaves a reader with, answered where they
            ask it. Quiet on purpose: it is the one thing on this page Rota has
            no part in, and overselling a link to somebody else's service would
            read as a recommendation Rota is in no position to make.
          */}
          <Reveal>
            <p className="prose-aside">
              Getting USDC into your wallet in the first place is between you and
              whichever service you use — Rota never handles pounds, naira or
              dollars, in either direction.{" "}
              <a href={FUNDING} target="_blank" rel="noreferrer">
                What we know about the current options
              </a>
              , including where it doesn&rsquo;t work yet.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------- close */}
      <section className="band band-cream">
        <div className="band-inner prose">
          <Reveal>
            <h2 className="display-sm" style={{ marginBottom: "1.25rem" }}>
              That&rsquo;s all of it
            </h2>
            <p>
              Everyone puts in the same, everyone receives the same, nobody
              holds anything, and nobody is in charge. If any of that still
              reads as too good, the proof page is live numbers rather than
              prose.
            </p>
            <div className="hero-actions" style={{ marginTop: "2rem" }}>
              <Button href="/create" size="lg" block>
                Start a circle
              </Button>
              <Button href="/#live-proof" size="lg" variant="secondary" block>
                See the proof
              </Button>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
