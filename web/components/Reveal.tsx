"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";

/**
 * Fade and rise on first sight.
 *
 * The important property is that this FAILS VISIBLE. Content is never hidden
 * unless we have already armed an observer that can show it again, and even
 * then a scroll listener backs the observer up. An earlier version started at
 * opacity 0 and waited for IntersectionObserver — which does not fire at all
 * while a tab is throttled or backgrounded, so most of the page could stay
 * blank permanently. A decorative effect must never be able to swallow the
 * content it decorates.
 *
 * Anyone who has asked their system for less motion gets none.
 */
function useIsomorphicLayoutEffect() {
  return typeof window === "undefined" ? useEffect : useLayoutEffect;
}

/**
 * Arms, then watches. Returns [ref, armed, shown].
 *
 * `armed` is the safety catch: it is only ever true once there is a working
 * observer AND the reader has not asked for less motion, so every rule that
 * hides something can be written to depend on it. Nothing in this file may
 * hide content that it is not already certain it can show again.
 */
function useOnFirstSight() {
  const ref = useRef<HTMLElement | null>(null);
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);

  const useLayout = useIsomorphicLayoutEffect();

  // Arm before paint, so arming cannot cause a flash of visible content.
  useLayout(() => {
    if (
      typeof window === "undefined" ||
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    setArmed(true);
  }, []);

  useEffect(() => {
    if (!armed) return;
    const node = ref.current;
    if (!node) {
      setShown(true);
      return;
    }

    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      setShown(true);
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };

    // Backstop: whenever the page moves, check by geometry. This is what keeps
    // the page correct if the observer is throttled and never calls back.
    const onScroll = () => {
      const rect = node.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) reveal();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) reveal();
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );

    observer.observe(node);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [armed]);

  return [ref, armed, shown] as const;
}

export function Reveal({
  children,
  as: Tag = "div",
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  as?: "div" | "section" | "li";
  className?: string;
  delay?: number;
}) {
  const [ref, armed, shown] = useOnFirstSight();

  /*
   * Inline, not a class. A stylesheet rule for this was silently losing the
   * cascade once Tailwind layered the imported file, which left elements
   * carrying the class but never actually hidden — and would just as easily
   * have left them hidden and never shown. Owning the two properties here
   * means nothing else can change what this component does.
   */
  const style: CSSProperties | undefined = armed
    ? {
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(16px)",
        transition: "opacity 360ms ease, transform 360ms ease",
        transitionDelay: shown && delay ? `${delay}ms` : undefined,
        willChange: shown ? undefined : "opacity, transform",
      }
    : undefined;

  /*
   * The two hooks anything inside can style against — a number that slides up
   * with its card, a tick that draws itself. Both are needed: `data-armed`
   * says a hidden starting state is safe to apply at all, and `data-shown`
   * says to play. A rule written against `data-shown` alone would leave its
   * element stuck in the hidden state forever on a browser without an
   * observer, which is exactly the failure this component exists to avoid.
   */
  return (
    <Tag
      ref={ref as never}
      className={className || undefined}
      style={style}
      data-armed={armed ? "" : undefined}
      data-shown={shown ? "" : undefined}
    >
      {children}
    </Tag>
  );
}

/**
 * The same reveal, but the children arrive one after another.
 *
 * A grid of three cards fading as one block reads as a page that was slow to
 * load. The same three 60ms apart reads as a list being set down. The
 * container is what is watched, so they stagger in document order from one
 * moment rather than each waiting for its own edge to cross the fold — which
 * on a wide screen would fire them all together anyway.
 *
 * Children are cloned rather than wrapped: wrapping each one in a div would
 * put a box between a grid and its items and quietly break every layout this
 * is used in.
 */
export function Stagger({
  children,
  as: Tag = "div",
  className = "",
  step = 60,
}: {
  children: ReactNode;
  as?: "div" | "ul" | "ol";
  className?: string;
  step?: number;
}) {
  const [ref, armed, shown] = useOnFirstSight();

  return (
    <Tag
      ref={ref as never}
      className={className || undefined}
      data-armed={armed ? "" : undefined}
      data-shown={shown ? "" : undefined}
    >
      {Children.map(children, (child, index) => {
        if (!armed || !isValidElement(child)) return child;
        const element = child as ReactElement<{ style?: CSSProperties }>;
        return cloneElement(element, {
          style: {
            ...(element.props.style ?? {}),
            opacity: shown ? 1 : 0,
            transform: shown ? "none" : "translateY(14px)",
            transition: "opacity 420ms ease, transform 420ms ease",
            transitionDelay: shown ? `${index * step}ms` : undefined,
          },
        });
      })}
    </Tag>
  );
}

/**
 * Counts once, when it comes into view.
 *
 * Also fails visible: the state starts at the real value, so if the animation
 * never runs the correct number is on screen. A figure people are being asked
 * to trust must never be able to render as a stale zero.
 *
 * `from` is where the count starts. It defaults to zero — the ordinary count
 * up — but /proof passes the size of the pot a circle would have had, so the
 * number falls out of that and lands on nothing. The figure performs the
 * claim the page is making, and the value it settles on is always the one
 * read from the chain.
 */
export function CountUp({
  value,
  from = 0,
  decimals = 2,
  duration = 900,
}: {
  value: number;
  from?: number;
  decimals?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Nothing to do: the state already holds the real value, which is exactly
    // what should be on screen when there is no animation.
    if (
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let frame = 0;
    let settle = 0;
    let started = false;

    const run = () => {
      if (started) return;
      started = true;
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);

      const start = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        // Ease out, so it lands rather than stops.
        const eased = 1 - Math.pow(1 - progress, 3);
        setShown(from + (value - from) * eased);
        if (progress < 1) frame = requestAnimationFrame(step);
      };

      /*
       * The animation is allowed to be interrupted; the figure is not allowed
       * to be wrong.
       *
       * requestAnimationFrame does not run at all in a hidden or backgrounded
       * tab, so an animation started just before someone switched away stops
       * on whatever frame it reached and stays there. That is survivable when
       * counting up from nothing and serious when counting DOWN from the size
       * of a pot: /proof would sit there showing a few USDC as Rota's holding,
       * which is the one number on the site that has to be right.
       *
       * A timer is the backstop. Background tabs clamp timers to about a
       * second but they do still fire, so the real value lands either way and
       * the animation is only ever the nicer of the two paths.
       */
      setShown(from);
      frame = requestAnimationFrame(step);
      settle = window.setTimeout(() => setShown(value), duration + 400);
    };

    const onScroll = () => {
      const rect = node.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) run();
    };

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) run();
    });

    observer.observe(node);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [value, from, duration]);

  return (
    <span ref={ref}>
      {shown.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  );
}
