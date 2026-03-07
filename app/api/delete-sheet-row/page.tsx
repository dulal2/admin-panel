import { NextRequest, NextResponse } from "next/server"
import { google } from "googleapis"

const SHEET_ID   = "1PBIRKOFzfsLbmMBen4OaPuN3-juh9PeLfcixLiWTzk4"
const SHEET_NAME = "Form responses 1"

/**
 * POST /api/delete-sheet-row
 * Body: { rowIndex: number }  — 1-based sheet row number (e.g. 3 = third row)
 *
 * Deletes a single row from the Google Sheet using the Firebase Admin
 * service account (same credentials, no extra setup needed).
 *
 * IMPORTANT: You must share the Google Sheet with the service account email
 * (FIREBASE_ADMIN_CLIENT_EMAIL) as Editor for this to work.
 */
export async function POST(req: NextRequest) {
  try {
    const { rowIndex } = await req.json()

    if (!rowIndex || typeof rowIndex !== "number") {
      return NextResponse.json({ error: "rowIndex (number) is required" }, { status: 400 })
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        private_key:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    })

    const sheets        = google.sheets({ version: "v4", auth })
    const spreadsheetId = SHEET_ID

    // Get numeric sheetId for the tab (batchUpdate needs this)
    const metaRes        = await sheets.spreadsheets.get({ spreadsheetId })
    const sheetTab       = metaRes.data.sheets?.find(s => s.properties?.title === SHEET_NAME)
    const numericSheetId = sheetTab?.properties?.sheetId ?? 0

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId:    numericSheetId,
              dimension:  "ROWS",
              startIndex: rowIndex - 1,  // 0-based
              endIndex:   rowIndex,       // exclusive
            },
          },
        }],
      },
    })

    return NextResponse.json({ success: true, deletedRow: rowIndex })

  } catch (error: unknown) {
    console.error("delete-sheet-row error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete sheet row" },
      { status: 500 }
    )
  }
}