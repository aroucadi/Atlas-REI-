"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "../lib/api";

interface TerminalContextType {
  user: any;
  workspaces: any[];
  activeWorkspace: any;
  setActiveWorkspace: (ws: any) => void;
  profiles: any[];
  activeProfile: any;
  setActiveProfile: (profile: any) => void;
  defaultPropertyId: string | null;
  loading: boolean;
  refreshProfiles: () => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  logout: () => Promise<void>;
}

const TerminalContext = createContext<TerminalContextType | undefined>(
  undefined,
);

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<any>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [activeProfile, setActiveProfile] = useState<any>(null);
  const [defaultPropertyId, setDefaultPropertyId] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  const router = useRouter();
  const pathname = usePathname();

  const handleSetActiveWorkspace = (ws: any) => {
    setActiveWorkspace(ws);
    if (typeof window !== "undefined") {
      if (ws?.id) {
        localStorage.setItem("atlas_active_ws_id", ws.id);
      } else {
        localStorage.removeItem("atlas_active_ws_id");
      }
    }
  };

  const handleSetActiveProfile = (profile: any) => {
    setActiveProfile(profile);
    if (typeof window !== "undefined") {
      if (profile?.id) {
        localStorage.setItem("atlas_active_profile_id", profile.id);
      } else {
        localStorage.removeItem("atlas_active_profile_id");
      }
    }
  };

  const loadSession = async () => {
    try {
      const res = await api.me();
      const userData = res.data || res;
      setUser(userData);
      if (userData?.defaultPropertyId) {
        setDefaultPropertyId(userData.defaultPropertyId);
      }

      const wsData = await api.getWorkspaces();
      setWorkspaces(wsData);
      if (wsData.length > 0) {
        const persistedWsId =
          typeof window !== "undefined"
            ? localStorage.getItem("atlas_active_ws_id")
            : null;
        const persistedWs = wsData.find((w: any) => w.id === persistedWsId);
        const resolvedWs = persistedWs || wsData[0];
        setActiveWorkspace(resolvedWs);
        if (typeof window !== "undefined" && resolvedWs?.id) {
          localStorage.setItem("atlas_active_ws_id", resolvedWs.id);
        }
      }
    } catch {
      if (pathname !== "/login") {
        router.push("/login");
      }
    } finally {
      setLoading(false);
    }
  };

  const refreshWorkspaces = async () => {
    try {
      const wsData = await api.getWorkspaces();
      setWorkspaces(wsData);
    } catch (err) {
      console.error(err);
    }
  };

  const refreshProfiles = async () => {
    if (!activeWorkspace) return;
    try {
      const profs = await api.getProfiles(activeWorkspace.id);
      setProfiles(profs);
      const persistedProfileId =
        typeof window !== "undefined"
          ? localStorage.getItem("atlas_active_profile_id")
          : null;
      const persistedProfile = profs.find(
        (p: any) => p.id === persistedProfileId,
      );
      const resolvedProfile = persistedProfile || profs[0] || null;
      setActiveProfile(resolvedProfile);
      if (typeof window !== "undefined" && resolvedProfile?.id) {
        localStorage.setItem("atlas_active_profile_id", resolvedProfile.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.error(err);
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem("atlas_active_ws_id");
      localStorage.removeItem("atlas_active_profile_id");
    }
    setUser(null);
    setWorkspaces([]);
    setActiveWorkspace(null);
    setProfiles([]);
    setActiveProfile(null);
    router.push("/login");
  };

  useEffect(() => {
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeWorkspace) {
      refreshProfiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace]);

  return (
    <TerminalContext.Provider
      value={{
        user,
        workspaces,
        activeWorkspace,
        setActiveWorkspace: handleSetActiveWorkspace,
        profiles,
        activeProfile,
        setActiveProfile: handleSetActiveProfile,
        defaultPropertyId,
        loading,
        refreshProfiles,
        refreshWorkspaces,
        logout,
      }}
    >
      {children}
    </TerminalContext.Provider>
  );
}

export function useTerminal() {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error("useTerminal must be used within a TerminalProvider");
  }
  return context;
}
