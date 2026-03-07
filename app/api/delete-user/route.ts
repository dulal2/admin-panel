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

// ── Google Sheets config ──────────────────────────────────────────────────────
const SHEET_ID   = "1PBIRKOFzfsLbmMBen4OaPuN3-juh9PeLfcixLiWTzk4"
const SHEET_NAME = "Form responses 1"

/**
 * Deletes all Google Sheet rows where column B or C matches the email.
 * Uses the same Firebase Admin service account — no extra credentials needed.
 * Returns count of rows deleted (0 on error or not found — non-fatal).
 */
async function deleteSheetRowsByEmail(email: string): Promise<number> {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        private_key:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    })

    const sheets        = google.sheets({ version: "v4", auth })
    const spreadsheetId = SHEET_ID

    // Read all data rows (skip header row 1)
    const getRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A2:D1000`,
    })

    const rows = getRes.data.values ?? []
    if (rows.length === 0) return 0

    // col B = index 1 (email), col C = index 2 (registered email)
    // Sheet row number = array index + 2  (row 1 is header, array is 0-based)
    const target = email.toLowerCase().trim()
    const rowsToDelete: number[] = []

    rows.forEach((row, i) => {
      const colB = (row[1] ?? "").toString().toLowerCase().trim()
      const colC = (row[2] ?? "").toString().toLowerCase().trim()
      if (colB === target || colC === target) rowsToDelete.push(i + 2)
    })

    if (rowsToDelete.length === 0) return 0

    // Get numeric sheetId for the tab name (needed by batchUpdate)
    const metaRes        = await sheets.spreadsheets.get({ spreadsheetId })
    const sheetTab       = metaRes.data.sheets?.find(s => s.properties?.title === SHEET_NAME)
    const numericSheetId = sheetTab?.properties?.sheetId ?? 0

    // Delete bottom-up so row indices don't shift during deletion
    const requests = rowsToDelete
      .sort((a, b) => b - a)
      .map(rowIndex => ({
        deleteDimension: {
          range: {
            sheetId:    numericSheetId,
            dimension:  "ROWS",
            startIndex: rowIndex - 1,  // 0-based
            endIndex:   rowIndex,       // exclusive
          },
        },
      }))

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    })

    console.log(`Sheet: deleted ${rowsToDelete.length} row(s) for ${email}`)
    return rowsToDelete.length

  } catch (err) {
    console.warn("Sheet row deletion failed (non-fatal):", err)
    return 0
  }
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

    // 2 — Firestore: users (by email)
    const usersSnap = await adminDb.collection("users").where("email", "==", email).get()
    for (const d of usersSnap.docs) await d.ref.delete()

    // 3 — Firestore: users (by UID doc)
    if (uid) { try { await adminDb.collection("users").doc(uid).delete() } catch  {} }

    // 4 — Firestore: scores (by email)
    const scoresSnap = await adminDb.collection("scores").where("email", "==", email).get()
    for (const d of scoresSnap.docs) await d.ref.delete()

    // 5 — Firestore: leaderboard (by email)
    const lbSnap = await adminDb.collection("leaderboard").where("email", "==", email).get()
    for (const d of lbSnap.docs) await d.ref.delete()

    // 6 — Firestore: scores + leaderboard (by UID doc)
    if (uid) {
      try { await adminDb.collection("scores").doc(uid).delete() } catch  {}
      try { await adminDb.collection("leaderboard").doc(uid).delete() } catch {}
    }

    // 7 — Firestore: question_reports (by reporterEmail)
    const reportsSnap = await adminDb
      .collection("question_reports")
      .where("reporterEmail", "==", email)
      .get()
    for (const d of reportsSnap.docs) await d.ref.delete()

    // 8 — Google Sheet: delete matching rows
    const sheetRowsDeleted = await deleteSheetRowsByEmail(email)

    return NextResponse.json({
      success: true,
      message: `Successfully deleted all data for ${email}`,
      sheetRowsDeleted,
    })

  } catch (error: unknown) {
    console.error("Delete user error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete user" },
      { status: 500 }
    )
  }
}