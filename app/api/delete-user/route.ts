import { NextRequest, NextResponse } from "next/server"
import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

// Initialize Firebase Admin only once
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  })
}

const adminAuth = getAuth()
const adminDb   = getFirestore()

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    // Step 1 — Find and delete user from Firebase Auth
    let uid: string | null = null
    try {
      const userRecord = await adminAuth.getUserByEmail(email)
      uid = userRecord.uid
      await adminAuth.deleteUser(uid)
    } catch (e: unknown) {
      // User may not exist in Auth — still continue to delete Firestore data
      console.warn("Auth user not found or already deleted:", e)
    }

    // Step 2 — Delete from "users" collection by email field
    const usersSnap = await adminDb
      .collection("users")
      .where("email", "==", email)
      .get()
    for (const d of usersSnap.docs) await d.ref.delete()

    // Step 3 — Delete from "users" collection by UID (doc ID)
    if (uid) {
      try { await adminDb.collection("users").doc(uid).delete() } catch { }
    }

    // Step 4 — Delete from "scores" collection by email
    const scoresSnap = await adminDb
      .collection("scores")
      .where("email", "==", email)
      .get()
    for (const d of scoresSnap.docs) await d.ref.delete()

    // Step 5 — Delete from "leaderboard" collection by email
    const lbSnap = await adminDb
      .collection("leaderboard")
      .where("email", "==", email)
      .get()
    for (const d of lbSnap.docs) await d.ref.delete()

    // Step 6 — Delete from "scores" by UID (doc ID)
    if (uid) {
      try { await adminDb.collection("scores").doc(uid).delete() } catch { }
      try { await adminDb.collection("leaderboard").doc(uid).delete() } catch { }try { await adminDb.collection("leaderboard").doc(uid).delete() } catch { }
    }

    // Step 7 — Delete from "question_reports" by reporterEmail
    const reportsSnap = await adminDb
      .collection("question_reports")
      .where("reporterEmail", "==", email)
      .get()
    for (const d of reportsSnap.docs) await d.ref.delete()

    return NextResponse.json({
      success: true,
      message: `Successfully deleted all data for ${email}`,
    })

  } catch (error: unknown) {
    console.error("Delete user error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete user" },
      { status: 500 }
    )
  }
}