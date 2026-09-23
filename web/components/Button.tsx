import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * Every button in Rota.
 *
 * There is one geometry and two variants, and a link that looks like a button
 * gets exactly the same box as a real button — that was the actual bug before
 * this existed: a `<Link className="btn">` in the hero and a `<button>` in the
 * navbar were different components with different heights, borders and corner
 * radii, so the same action looked like two different affordances.
 *
 * Both variants carry a 1px border, including the filled one. A filled button
 * without a border is two pixels smaller than a bordered one beside it, and
 * the two never line up.
 *
 * Colour comes from the surface, not from a prop. Secondary is drawn in
 * currentColor, so it is cream on a near-black band and near-black on a cream
 * one without anyone choosing. Primary is blue everywhere, because the one
 * thing you are meant to press should not change colour between pages.
 */

type Size = "lg" | "md" | "sm";
type Variant = "primary" | "secondary";

type Common = {
  /**
   * lg (56px) for a page's main action, md (44px) for actions inside a page,
   * sm (36px) for the navbar and anything inline.
   */
  size?: Size;
  variant?: Variant;
  /** Full width. Stacked block buttons space themselves. */
  block?: boolean;
  children: ReactNode;
  className?: string;
};

type AsButton = Common & { href?: undefined } & Omit<
    ComponentProps<"button">,
    keyof Common | "href"
  >;

type AsLink = Common & { href: string } & Omit<
    ComponentProps<typeof Link>,
    keyof Common | "href"
  >;

function classesFor(
  size: Size,
  variant: Variant,
  block: boolean,
  extra: string | undefined,
) {
  return ["btn", `btn-${size}`, `btn-${variant}`, block ? "btn-block" : "", extra]
    .filter(Boolean)
    .join(" ");
}

export function Button(props: AsButton | AsLink) {
  // Narrow before destructuring, so neither branch has to unpack props it
  // will not pass on.
  if (props.href !== undefined) {
    const {
      href,
      size = "md",
      variant = "primary",
      block = false,
      className,
      children,
      ...rest
    } = props;
    return (
      <Link
        href={href}
        className={classesFor(size, variant, block, className)}
        {...rest}
      >
        {children}
      </Link>
    );
  }

  const {
    size = "md",
    variant = "primary",
    block = false,
    className,
    children,
    type = "button",
    ...rest
  } = props;
  return (
    <button
      type={type}
      className={classesFor(size, variant, block, className)}
      {...rest}
    >
      {children}
    </button>
  );
}
