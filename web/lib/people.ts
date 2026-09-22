"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { Address } from "viem";

/**
 * Names for the people in a circle.
 *
 * The contract stores addresses and nothing else, so names live in this
 * browser only. That is enough for the thing that matters: a message that says
 * "Chidi hasn't added his share yet" rather than quoting a 42-character
 * address at someone trying to work out whether their savings are safe.
 *
 * Unnamed people fall back to "Person 3". Every storage call is wrapped:
 * it throws in private windows and returns nothing in a fresh one, and a
 * missing name must never break the page.
 *
 * Names also travel in an invite link's #fragment. A fragment is never put on
 * the wire — browsers do not send it in the HTTP request — so the organizer
 * can pass names to the other members without them touching a server, and
 * without them going on chain. On arrival they are merged into this browser's
 * own store and the fragment is cleared from the address bar.
 */
const key = (circleId: string) => `rota.names.${circleId}`;

type NameMap = Record<string, string>;

// Same-tab writes do not fire the storage event, so changes are announced here.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(circleId: string): string | null {
  try {
    return window.localStorage.getItem(key(circleId));
  } catch {
    return null;
  }
}

export type Naming = {
  nameOf: (member: Address) => string;
  setName: (member: Address, name: string) => void;
  isCustom: (member: Address) => boolean;
};

export function useNames(
  circleId: string,
  members: readonly Address[] | undefined,
): Naming {
  // The raw string is the snapshot, so it stays referentially stable between
  // renders; parsing happens once per change instead.
  const raw = useSyncExternalStore(
    subscribe,
    () => read(circleId),
    () => null,
  );

  const names = useMemo<NameMap>(() => {
    if (!raw) return {};
    try {
      return JSON.parse(raw) as NameMap;
    } catch {
      return {};
    }
  }, [raw]);

  const setName = useCallback(
    (member: Address, name: string) => {
      const current = (() => {
        const stored = read(circleId);
        if (!stored) return {} as NameMap;
        try {
          return JSON.parse(stored) as NameMap;
        } catch {
          return {} as NameMap;
        }
      })();

      const trimmed = name.trim();
      if (trimmed) current[member.toLowerCase()] = trimmed;
      else delete current[member.toLowerCase()];

      try {
        window.localStorage.setItem(key(circleId), JSON.stringify(current));
      } catch {
        // Names just will not persist here. Not worth interrupting anyone over.
      }
      listeners.forEach((listener) => listener());
    },
    [circleId],
  );

  const nameOf = useCallback(
    (member: Address) => {
      const stored = names[member.toLowerCase()];
      if (stored) return stored;

      const index = members?.findIndex(
        (m) => m.toLowerCase() === member.toLowerCase(),
      );
      return index !== undefined && index >= 0
        ? `Person ${index + 1}`
        : "Someone";
    },
    [names, members],
  );

  const isCustom = useCallback(
    (member: Address) => Boolean(names[member.toLowerCase()]),
    [names],
  );

  return { nameOf, setName, isCustom };
}

/** Packs a name map for an invite link. Base64url so it survives a URL. */
export function encodeNames(names: Record<string, string>): string {
  const json = JSON.stringify(names);
  const base64 =
    typeof window === "undefined"
      ? Buffer.from(json, "utf8").toString("base64")
      : window.btoa(unescape(encodeURIComponent(json)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeNames(encoded: string): NameMap | undefined {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(window.atob(base64)));
    const parsed = JSON.parse(json) as NameMap;
    if (!parsed || typeof parsed !== "object") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/** The invite link an organizer shares. Names ride in the fragment only. */
export function inviteLink(
  origin: string,
  circleId: string,
  names: Record<string, string>,
): string {
  const base = `${origin}/circle/${circleId}`;
  const filled = Object.keys(names).length > 0;
  return filled ? `${base}#n=${encodeNames(names)}` : base;
}

/**
 * Merges names out of the current URL fragment, once, then strips it.
 *
 * Nothing here is sent anywhere: the fragment never leaves the browser, and
 * the merged names live only in this device's storage.
 */
export function useNamesFromInvite(circleId: string) {
  useEffect(() => {
    const apply = () => {
      const hash = window.location.hash;
      if (!hash.startsWith("#n=")) return;

      const incoming = decodeNames(hash.slice(3));
      if (!incoming) return;

      const stored = read(circleId);
      let current: NameMap = {};
      try {
        current = stored ? (JSON.parse(stored) as NameMap) : {};
      } catch {
        current = {};
      }

      // Names already set on this device win: the person using it knows best.
      const merged: NameMap = { ...incoming, ...current };
      try {
        window.localStorage.setItem(key(circleId), JSON.stringify(merged));
      } catch {
        // Cannot persist here; the names simply will not stick.
      }
      listeners.forEach((listener) => listener());

      // Take it out of the address bar so it is not shared on by accident.
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    };

    apply();

    // Opening an invite for the circle you are already looking at only changes
    // the fragment, which does not remount anything — so listen for it too.
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [circleId]);
}
