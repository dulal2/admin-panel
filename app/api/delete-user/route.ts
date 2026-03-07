import { NextRequest, NextResponse } from "next/server"
import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { google } from "googleapis"

// ── Firebase Admin ────────────────────────────────────────────────────────────
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

const SHEET_ID   = "1PBIRKOFzfsLbmMBen4OaPuN3-juh9PeLfcixLiWTzk4"
const SHEET_NAME = "Form responses 1"

/**
 * Deletes Google Sheet rows where col B or col C matches the email.
 * Throws on failure so the caller can surface the error properly.
 */
async function deleteSheetRowsByEmail(email: string): Promise<number> {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      private_key:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })

  const sheets        = google.sheets({ version: "v4", auth })
  const spreadsheetId = SHEET_ID

  // Read data rows (row 2 onwards, header is row 1)
  const getRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A2:D1000`,
  })

  const rows = getRes.data.values ?? []
  if (rows.length === 0) return 0

  // Match col B (index 1) = form email, col C (index 2) = registered email
  const target = email.toLowerCase().trim()
  const rowsToDelete: number[] = []

  rows.forEach((row, i) => {
    const colB = (row[1] ?? "").toString().toLowerCase().trim()
    const colC = (row[2] ?? "").toString().toLowerCase().trim()
    if (colB === target || colC === target) rowsToDelete.push(i + 2) // +2: 0-based + header
  })

  if (rowsToDelete.length === 0) return 0

  // Get numeric sheetId for the tab (batchUpdate needs this, not the string name)
  const metaRes        = await sheets.spreadsheets.get({ spreadsheetId })
  const sheetTab       = metaRes.data.sheets?.find(s => s.properties?.title === SHEET_NAME)
  const numericSheetId = sheetTab?.properties?.sheetId ?? 0

  // Delete bottom-up so earlier indices don't shift
  const requests = rowsToDelete
    .sort((a, b) => b - a)
    .map(rowIndex => ({
      deleteDimension: {
        range: {
          sheetId:    numericSheetId,
          dimension:  "ROWS",
          startIndex: rowIndex - 1,  // 0-based
          endIndex:   rowIndex,
        },
      },
    }))

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  })

  return rowsToDelete.length
}

// ── POST /api/delete-user ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 })

    // 1 — Firebase Auth
    let uid: string | null = null
    try {
      const userRecord = await adminAuth.getUserByEmail(email)
      uid = userRecord.uid
      await adminAuth.deleteUser(uid)
    } catch (e: unknown) {
      console.warn("Auth user not found or already deleted:", e)
    }

    // 2 — Firestore: users (email)
    const usersSnap = await adminDb.collection("users").where("email", "==", email).get()
    for (const d of usersSnap.docs) await d.ref.delete()

    // 3 — Firestore: users (UID doc)
    if (uid) { try { await adminDb.collection("users").doc(uid).delete() } catch  {} }

    // 4 — Firestore: scores (email)
    const scoresSnap = await adminDb.collection("scores").where("email", "==", email).get()
    for (const d of scoresSnap.docs) await d.ref.delete()

    // 5 — Firestore: leaderboard (email)
    const lbSnap = await adminDb.collection("leaderboard").where("email", "==", email).get()
    for (const d of lbSnap.docs) await d.ref.delete()

    // 6 — Firestore: scores + leaderboard (UID doc)
    if (uid) {
      try { await adminDb.collection("scores").doc(uid).delete() } catch  {}
      try { await adminDb.collection("leaderboard").doc(uid).delete() } catch  {}
    }

    // 7 — Firestore: question_reports (reporterEmail)
    const reportsSnap = await adminDb
      .collection("question_reports")
      .where("reporterEmail", "==", email)
      .get()
    for (const d of reportsSnap.docs) await d.ref.delete()

    // 8 — Google Sheet rows
    let sheetRowsDeleted  = 0
    let sheetError: string | null = null
    try {
      sheetRowsDeleted = await deleteSheetRowsByEmail(email)
    } catch (err: unknown) {
      // Surface the real error so we can debug it
      sheetError = err instanceof Error ? err.message : "Sheet deletion failed"
      console.error("Sheet deletion error:", err)
    }

    return NextResponse.json({
      success: true,
      message: `Deleted Firebase data for ${email}`,
      sheetRowsDeleted,
      sheetError,   // null if sheet deletion worked, error string if it failed
    })

  } catch (error: unknown) {
    console.error("Delete user error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete user" },
      { status: 500 }
    )
  }
}