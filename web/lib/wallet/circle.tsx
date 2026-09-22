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

const chainCode = (chainId: number) =>
  chainId === ARC_MAINNET_CHAIN_ID
    ? "ARC"
    : chainId === ARC_TESTNET_CHAIN_ID
      ? "ARC-TESTNET"
      : undefined;

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(data.message ?? "Request failed");
  return data;
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

  /** Creates the wallet if the user has none, then loads it. */
  const ensureWallet = useCallback(
    async (userToken: string, encryptionKey: string) => {
      const existing = await loadWallets(userToken);
      if (existing.length > 0) {
        setStatus("ready");
        return;
      }

      setStatus("creating-wallet");
      const init = await post<{ challengeId?: string; code?: number }>(
        "/api/circle/initialize",
        { userToken, chainId },
      );

      if (!init.challengeId) {
        await loadWallets(userToken);
        setStatus("ready");
        return;
      }

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

      await loadWallets(userToken);
      setStatus("ready");
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
            setStatus("error");
            setMessage("Sign-in did not complete. Please try again.");
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

  const wallet = useMemo(() => {
    const code = chainCode(chainId);
    return wallets.find((w) => w.blockchain === code) ?? wallets[0];
  }, [wallets, chainId]);

  /**
   * Runs an encoded call. The server only creates a challenge — the person
   * approves it in Circle's UI, and nothing is signed until they do.
   */
  const execute = useCallback(
    async (to: Address, data: Hex, forChainId: number) => {
      const sdk = sdkRef.current;
      const { userToken, encryptionKey } = session;

      if (!sdk || !userToken || !encryptionKey || !wallet) {
        throw new Error("Your wallet is not ready yet.");
      }
      if (!chainCode(forChainId)) {
        throw new Error("This network is not supported.");
      }

      const { challengeId } = await post<{ challengeId: string }>(
        "/api/circle/execute",
        { userToken, walletId: wallet.id, contractAddress: to, callData: data },
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
    [session, wallet],
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
