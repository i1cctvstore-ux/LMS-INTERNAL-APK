"use client"

import { useEffect } from "react"

// Registrasi service worker -- harus di client component (App Router
// layout.tsx default-nya Server Component, gak bisa akses `navigator`).
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service worker gagal register:", err)
    })
  }, [])
  return null
}
