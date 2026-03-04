"use client"

import { useEffect, useState, type ReactNode } from "react"
import { auth, ADMIN_EMAILS } from "@/lib/auth"
import { onAuthStateChanged } from "firebase/auth"
import { useRouter } from "next/navigation"

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (!user || !user.email || !ADMIN_EMAILS.includes(user.email)) {
        router.push("/login")
      } else {
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [router])

  if (loading) return <p>Loading...</p>

  return <>{children}</>
}