"use client";

import { useEffect, useState } from "react";

// sessionStorage is scoped to the browser tab and normally disappears when it
// closes, unlike cookies. Refreshing and navigating in the tab keep the marker.
export const LEGACY_TAB_MARKER = "fp_legacy_tab_authenticated_v1";

export default function TabSessionGate({ children }: { children: React.ReactNode }) {
  const [allowed,setAllowed] = useState(false);
  useEffect(()=>{
    const check=()=>{
      let active=false;
      try { active=sessionStorage.getItem(LEGACY_TAB_MARKER)==="1"; } catch {}
      if (!active) {
        window.location.replace("/logout");
        return;
      }
      setAllowed(true);
    };
    check();
    window.addEventListener("pageshow",check);
    return ()=>window.removeEventListener("pageshow",check);
  },[]);
  return allowed?<>{children}</>:null;
}
