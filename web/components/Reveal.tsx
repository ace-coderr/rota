"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
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
  const ref = useRef<HTMLElement | null>(null);
  // Unarmed means "plain, visible content" — the safe default.
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

  /*
   * Inline, not a class. A stylesheet rule for this was silently losing the
   * cascade once Tailwind layered the imported file, which left elements
   * carrying the class but never actually hidden — and would just as easily
   * have left them hidden and never shown. Owning the two properties here
   * means nothing else can change what this component does.
   */
  const style: React.CSSProperties | undefined = armed
    ? {
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(16px)",
        transition: "opacity 360ms ease, transform 360ms ease",
        transitionDelay: shown && delay ? `${delay}ms` : undefined,
        willChange: shown ? undefined : "opacity, transform",
      }
    : undefined;

  return (
    <Tag ref={ref as never} className={className || undefined} style={style}>
      {children}
    </Tag>
  );
}

/**
 * Counts once, when it comes into view.
 *
 * Also fails visible: the state starts at the real value, so if the animation
 * never runs the correct number is on screen. A figure people are being asked
 * to trust must never be able to render as a stale zero.
 */
export function CountUp({
  value,
  decimals = 2,
  duration = 900,
}: {
  value: number;
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
        setShown(value * (1 - Math.pow(1 - progress, 3)));
        if (progress < 1) frame = requestAnimationFrame(step);
      };
      setShown(0);
      frame = requestAnimationFrame(step);
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
    };
  }, [value, duration]);

  return (
    <span ref={ref}>
      {shown.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  );
}
