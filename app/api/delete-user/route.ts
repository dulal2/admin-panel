import { NextRequest, NextResponse } from "next/server"
import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  })
}

const adminDb = getFirestore()

export async function POST(req: NextRequest) {
  try {
    const { questions } = await req.json()

    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "No questions provided" }, { status: 400 })
    }

    const batch     = adminDb.batch()
    let   batchSize = 0
    let   total     = 0

    for (const q of questions) {
      if (!q.questionText || !Array.isArray(q.options) || q.options.length !== 4) continue

      const ref = adminDb.collection("questions").doc()
      batch.set(ref, {
        questionText:  q.questionText,
        options:       q.options,
        correctAnswer: q.correctAnswer ?? 0,
        category:      q.category ?? "General",
        createdAt:     new Date(),
      })

      batchSize++
      total++

      // Firestore batch limit is 500 — commit and start new batch
      if (batchSize === 490) {
        await batch.commit()
        batchSize = 0
      }
    }

    if (batchSize > 0) await batch.commit()

    return NextResponse.json({ success: true, uploaded: total })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    )
  }
}