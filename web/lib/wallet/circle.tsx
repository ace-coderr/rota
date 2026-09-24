"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Address, Hex } from "viem";

import { ARC_MAINNET_CHAIN_ID, ARC_TESTNET_CHAIN_ID } from "./chains-ids";

/**
 * Circle user-controlled wallets.
 *
 * USER-controlled, never developer-controlled. Circle holds no authority to
 * move anyone's money: every action becomes a challenge the person approves in
 * Circle's own UI, and CIRCLE_API_KEY lives only on the server, where it can
 * create challenges but cannot approve them.
 *
 * Confirmed supported on Arc mainnet as well as testnet — Circle's supported
 * blockchains table lists "Arc (ARC / ARC-TESTNET)" with EOA and SCA under
 * User-controlled, and the SDK exports both Blockchain.Arc and
 * Blockchain.ArcTestnet.
 */
type W3SSdkInstance = {
  getDeviceId: () => Promise<string>;
  updateConfigs: (configs: unknown) => void;
  performLogin: (provider: unknown) => void;
  verifyOtp: () => void;
  setAuthentication: (auth: { userToken: string; encryptionKey: string }) => void;
  execute: (
    challengeId: string,
    callback: (error: unknown, result?: unknown) => void,
  ) => void;
};

export type CircleWallet = {
  id: string;
  address: Address;
  blockchain: string;
};

export type CircleStatus =
  | "unconfigured"
  | "loading"
  | "signed-out"
  | "awaiting-otp"
  | "signing-in"
  | "creating-wallet"
  /** Signed in, but there is no usable wallet on this chain. */
  | "no-wallet"
  | "ready"
  | "error";

type CircleContextValue = {
  status: CircleStatus;
  message?: string;
  wallet?: CircleWallet;
  address?: Address;
  signInWithGoogle: () => Promise<void>;
  sendEmailCode: (email: string) => Promise<void>;
  verifyEmailCode: () => void;
  signOut: () => void;
  /** Encoded call → confirmed on chain. Throws on failure or rejection. */
  execute: (to: Address, data: Hex, chainId: number) => Promise<void>;
};

const CircleContext = createContext<CircleContextValue | undefined>(undefined);

const APP_ID = process.env.NEXT_PUBLIC_CIRCLE_APP_ID;
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export const circleConfigured = Boolean(APP_ID);
export const googleConfigured = Boolean(APP_ID && GOOGLE_CLIENT_ID);

/** Social login round-trips through an OAuth redirect, so this must survive a reload. */
const store = {
  get(key: string) {
    try {
      return window.localStorage.getItem(`rota.circle.${key}`) ?? undefined;
    } catch {
      return undefined;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(`rota.circle.${key}`, value);
    } catch {
      // Private window: the session just will not survive a reload.
    }
  },
  clear(keys: string[]) {
    for (const key of keys) {
      try {
        window.localStorage.removeItem(`rota.circle.${key}`);
      } catch {
        // Nothing to do.
      }
    }
  },
};

export const chainCode = (chainId: number) =>
  chainId === ARC_MAINNET_CHAIN_ID
    ? "ARC"
    : chainId === ARC_TESTNET_CHAIN_ID
      ? "ARC-TESTNET"
      : undefined;

/**
 * The wallet for a chain, or none.
 *
 * Exported and pure so the rule can be tested: there is no `?? wallets[0]`
 * fallback, because a user with only an Arc testnet wallet, signed in on
 * mainnet, would otherwise get the testnet wallet — a real address, attached
 * to the wrong chain, which every consumer would then trust. A wallet with no
 * address yet is Circle still creating it, and does not count either.
 */
export function selectWallet(
  wallets: CircleWallet[],
  chainId: number,
): CircleWallet | undefined {
  const code = chainCode(chainId);
  if (!code) return undefined;
  return wallets.find((w) => w.blockchain === code && Boolean(w.address));
}

/**
 * A failure the server has already classified. The raw Circle error stays on
 * the server; what comes back is a message safe to show plus a reference that
 * ties it to the logged line.
 */
export class CircleRequestError extends Error {
  readonly kind: string;
  readonly reference?: string;
  constructor(message: string, kind: string, reference?: string) {
    super(message);
    this.name = "CircleRequestError";
    this.kind = kind;
    this.reference = reference;
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Never reached our own server — the browser is offline or blocked.
    throw new CircleRequestError(
      "We could not reach this site's server. Check your connection and try again.",
      "network",
    );
  }

  const data = (await response.json().catch(() => ({}))) as T & {
    message?: string;
    kind?: string;
    reference?: string;
  };
  if (!response.ok) {
    throw new CircleRequestError(
      data.message ?? "Sign-in failed.",
      data.kind ?? "unknown",
      data.reference,
    );
  }
  return data;
}

/** The message plus its reference, which is what makes a report actionable. */
export function describeCircleError(error: unknown): string {
  if (error instanceof CircleRequestError) {
    return error.reference
      ? `${error.message} (reference ${error.reference})`
      : error.message;
  }
  return "Sign-in failed. The full error is in this site's server log.";
}

export function CircleWalletProvider({
  children,
  chainId,
}: {
  children: ReactNode;
  chainId: number;
}) {
  const sdkRef = useRef<W3SSdkInstance | null>(null);
  const [status, setStatus] = useState<CircleStatus>(
    circleConfigured ? "loading" : "unconfigured",
  );
  const [message, setMessage] = useState<string>();
  const [wallets, setWallets] = useState<CircleWallet[]>([]);
  const [session, setSession] = useState<{
    userToken?: string;
    encryptionKey?: string;
  }>({});

  /** Pulls the user's wallets and picks the one for the chain in use. */
  const loadWallets = useCallback(async (userToken: string) => {
    const data = await post<{ wallets: CircleWallet[] }>(
      "/api/circle/wallets",
      { userToken },
    );
    setWallets(data.wallets ?? []);
    return data.wallets ?? [];
  }, []);

  /**
   * Creates a wallet on this chain if the user has none, then loads it.
   *
   * A Circle sign-in gives a user token; the wallet is a separate object that
   * may not exist yet, may exist only on another chain, or may still be
   * initialising. "Signed in" is therefore not the same as "has an address",
   * and this function is only allowed to report ready once an address for
   * THIS chain actually came back.
   */
  const ensureWallet = useCallback(
    async (userToken: string, encryptionKey: string) => {
      const onThisChain = (list: CircleWallet[]) =>
        selectWallet(list, chainId) !== undefined;

      const existing = await loadWallets(userToken);
      if (onThisChain(existing)) {
        setStatus("ready");
        return;
      }

      setStatus("creating-wallet");
      const init = await post<{ challengeId?: string; code?: number }>(
        "/api/circle/initialize",
        { userToken, chainId },
      );

      if (init.challengeId) {
        const sdk = sdkRef.current;
        if (!sdk) throw new Error("Wallet SDK is not ready");

        sdk.setAuthentication({ userToken, encryptionKey });
        await new Promise<void>((resolve, reject) => {
          sdk.execute(init.challengeId!, (error) => {
            if (error) {
              reject(new Error("Wallet setup was not completed"));
              return;
            }
            resolve();
          });
        });
      }

      /*
       * Circle creates the wallet asynchronously, so the list can still be
       * empty immediately after the challenge completes. Poll briefly rather
       * than declaring success on a list nobody checked — which is exactly
       * how the chip ended up reading "Signed in" with nothing to copy.
       */
      for (let attempt = 0; attempt < 6; attempt++) {
        const list = await loadWallets(userToken);
        if (onThisChain(list)) {
          setStatus("ready");
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }

      setStatus("no-wallet");
      setMessage(
        "You are signed in, but there is no wallet on this network yet. " +
          "Circle may still be setting it up — wait a moment and reload. If it " +
          "keeps saying this, the site's Circle project may not have this " +
          "network enabled.",
      );
    },
    [chainId, loadWallets],
  );

  // Boot the SDK once, and pick up an existing session after an OAuth redirect.
  useEffect(() => {
    if (!circleConfigured) return;
    let cancelled = false;

    (async () => {
      try {
        const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");

        const onLogin = (error: unknown, result: unknown) => {
          if (cancelled) return;
          if (error) {
            /*
             * This one happens in the browser, so there is no server log to
             * point at — the whole error goes to the console instead, and the
             * message distinguishes the case that is not a fault at all.
             */
            console.error("[circle] social login failed", error);
            const raw = error as { code?: number | string; message?: string };
            const text = `${raw.code ?? ""} ${raw.message ?? ""}`.toLowerCase();

            if (/cancel|closed|abort|denied|dismiss|popup/.test(text)) {
              // Closing the Google window is a decision, not a failure.
              setStatus("signed-out");
              setMessage(undefined);
              return;
            }

            setStatus("error");
            setMessage(
              /app ?id|client ?id|redirect|origin|unauthorized|invalid/.test(text)
                ? "Google sign-in is not set up correctly on this site — the app " +
                  "id, Google client id or redirect address does not match. This " +
                  "needs fixing by whoever deployed it. The full error is in the " +
                  "browser console."
                : "Google sign-in did not complete. The full error is in the " +
                  "browser console.",
            );
            return;
          }
          const { userToken, encryptionKey } = result as {
            userToken: string;
            encryptionKey: string;
          };
          store.set("userToken", userToken);
          store.set("encryptionKey", encryptionKey);
          setSession({ userToken, encryptionKey });
        };

        const sdk = new W3SSdk(
          {
            appSettings: { appId: APP_ID! },
            loginConfigs: {
              deviceToken: store.get("deviceToken") ?? "",
              deviceEncryptionKey: store.get("deviceEncryptionKey") ?? "",
              ...(GOOGLE_CLIENT_ID
                ? {
                    google: {
                      clientId: GOOGLE_CLIENT_ID,
                      redirectUri: window.location.origin,
                      selectAccountPrompt: true,
                    },
                  }
                : {}),
            },
          },
          onLogin,
        ) as unknown as W3SSdkInstance;

        sdkRef.current = sdk;

        // Required, or execute() silently does nothing.
        if (!store.get("deviceId")) {
          store.set("deviceId", await sdk.getDeviceId());
        }

        if (cancelled) return;

        const userToken = store.get("userToken");
        const encryptionKey = store.get("encryptionKey");
        if (userToken && encryptionKey) {
          setSession({ userToken, encryptionKey });
        } else {
          setStatus("signed-out");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Could not load the sign-in service.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Once signed in, make sure there is a wallet on this chain.
  useEffect(() => {
    if (!session.userToken || !session.encryptionKey) return;
    let cancelled = false;

    (async () => {
      try {
        setStatus("signing-in");
        await ensureWallet(session.userToken!, session.encryptionKey!);
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setMessage(
          error instanceof Error ? error.message : "Could not open your wallet.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, ensureWallet]);

  const signInWithGoogle = useCallback(async () => {
    const sdk = sdkRef.current;
    if (!sdk || !GOOGLE_CLIENT_ID || !APP_ID) return;

    setStatus("signing-in");
    setMessage(undefined);

    const deviceId = store.get("deviceId") ?? (await sdk.getDeviceId());
    store.set("deviceId", deviceId);

    const tokens = await post<{
      deviceToken: string;
      deviceEncryptionKey: string;
    }>("/api/circle/device-token", { deviceId });

    store.set("deviceToken", tokens.deviceToken);
    store.set("deviceEncryptionKey", tokens.deviceEncryptionKey);

    sdk.updateConfigs({
      appSettings: { appId: APP_ID },
      loginConfigs: {
        deviceToken: tokens.deviceToken,
        deviceEncryptionKey: tokens.deviceEncryptionKey,
        google: {
          clientId: GOOGLE_CLIENT_ID,
          redirectUri: window.location.origin,
          selectAccountPrompt: true,
        },
      },
    });

    const { SocialLoginProvider } = await import(
      "@circle-fin/w3s-pw-web-sdk/dist/src/types"
    );
    sdk.performLogin(SocialLoginProvider.GOOGLE);
  }, []);

  const sendEmailCode = useCallback(async (email: string) => {
    const sdk = sdkRef.current;
    if (!sdk || !APP_ID) return;

    setStatus("signing-in");
    setMessage(undefined);

    const deviceId = store.get("deviceId") ?? (await sdk.getDeviceId());
    store.set("deviceId", deviceId);

    const tokens = await post<{
      deviceToken: string;
      deviceEncryptionKey: string;
      otpToken: string;
    }>("/api/circle/email-token", { deviceId, email });

    store.set("deviceToken", tokens.deviceToken);
    store.set("deviceEncryptionKey", tokens.deviceEncryptionKey);

    sdk.updateConfigs({
      appSettings: { appId: APP_ID },
      loginConfigs: {
        deviceToken: tokens.deviceToken,
        deviceEncryptionKey: tokens.deviceEncryptionKey,
        otpToken: tokens.otpToken,
      },
    });

    setStatus("awaiting-otp");
  }, []);

  const verifyEmailCode = useCallback(() => {
    sdkRef.current?.verifyOtp();
  }, []);

  const signOut = useCallback(() => {
    store.clear([
      "userToken",
      "encryptionKey",
      "deviceToken",
      "deviceEncryptionKey",
    ]);
    setSession({});
    setWallets([]);
    setStatus("signed-out");
  }, []);

  /**
   * The wallet for THIS chain, or none.
   *
   * There used to be a `?? wallets[0]` fallback here. A user with only an
   * Arc testnet wallet, signed in on mainnet, would silently get the testnet
   * wallet: the app would show a real address and then build mainnet
   * transactions against a wallet that lives on another chain. Being
   * addressless is a state the UI can explain; being on the wrong chain is
   * not.
   */
  const wallet = useMemo(
    () => selectWallet(wallets, chainId),
    [wallets, chainId],
  );

  /**
   * Runs an encoded call. The server only creates a challenge — the person
   * approves it in Circle's UI, and nothing is signed until they do.
   */
  const execute = useCallback(
    async (to: Address, data: Hex, forChainId: number) => {
      const sdk = sdkRef.current;
      const { userToken, encryptionKey } = session;

      if (!chainCode(forChainId)) {
        throw new Error("This network is not supported.");
      }

      /*
       * Selected for the chain this call targets, not the ambient one. Circle
       * takes a walletId and infers the chain from it, so sending with a
       * wallet that lives on another chain is a silent wrong-network send
       * rather than a rejection.
       */
      const sending = selectWallet(wallets, forChainId);

      if (!sdk || !userToken || !encryptionKey || !sending) {
        throw new Error(
          sending
            ? "Your wallet is not ready yet."
            : "You do not have a wallet on this network yet.",
        );
      }

      const { challengeId } = await post<{ challengeId: string }>(
        "/api/circle/execute",
        { userToken, walletId: sending.id, contractAddress: to, callData: data },
      );

      sdk.setAuthentication({ userToken, encryptionKey });

      await new Promise<void>((resolve, reject) => {
        sdk.execute(challengeId, (error) => {
          if (error) {
            reject(new Error("user rejected the request"));
            return;
          }
          resolve();
        });
      });

      // Circle submits after approval, so wait for a terminal state rather
      // than reporting success on a transaction that has not landed.
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise((r) => setTimeout(r, 2000));
        const tx = await post<{ state?: string; errorReason?: string }>(
          "/api/circle/transaction",
          { userToken, id: challengeId },
        ).catch(() => ({ state: undefined, errorReason: undefined }));

        if (tx.state === "COMPLETE" || tx.state === "CONFIRMED") return;
        if (tx.state === "FAILED" || tx.state === "CANCELLED") {
          throw new Error(tx.errorReason ?? "The transaction did not go through.");
        }
      }
    },
    [session, wallets],
  );

  const value = useMemo<CircleContextValue>(
    () => ({
      status,
      message,
      wallet,
      address: wallet?.address,
      signInWithGoogle,
      sendEmailCode,
      verifyEmailCode,
      signOut,
      execute,
    }),
    [
      status,
      message,
      wallet,
      signInWithGoogle,
      sendEmailCode,
      verifyEmailCode,
      signOut,
      execute,
    ],
  );

  return (
    <CircleContext.Provider value={value}>{children}</CircleContext.Provider>
  );
}

export function useCircleWallet() {
  const context = useContext(CircleContext);
  if (!context) {
    throw new Error("useCircleWallet must be used inside CircleWalletProvider");
  }
  return context;
}
