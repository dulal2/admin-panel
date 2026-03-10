import { NextRequest, NextResponse } from "next/server"
import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

// ── Firebase Admin ─────────────────────────────────────────────────────────
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

interface QuestionInput {
  questionText: string
  options: string[]
  correctAnswer: number
  category: string
}

// ── POST /api/upload-questions ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const questions: QuestionInput[] = body.questions

    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "No questions provided" }, { status: 400 })
    }

    // Validate each question
    const valid = questions.filter(q =>
      q.questionText &&
      Array.isArray(q.options) &&
      q.options.length === 4 &&
      typeof q.correctAnswer === "number" &&
      q.category
    )

    if (valid.length === 0) {
      return NextResponse.json({ error: "No valid questions found" }, { status: 400 })
    }

    // Batch write to Firestore (max 500 per batch)
    const BATCH_SIZE = 499
    let uploaded = 0

    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
      const batch = adminDb.batch()
      const chunk = valid.slice(i, i + BATCH_SIZE)

      chunk.forEach((q) => {
        const ref = adminDb.collection("questions").doc()
        batch.set(ref, {
          questionText:  q.questionText,
          options:       q.options,
          correctAnswer: q.correctAnswer,
          category:      q.category,
          createdAt:     new Date(),
        })
      })

      await batch.commit()
      uploaded += chunk.length
    }

    return NextResponse.json({ success: true, uploaded })

  } catch (error: unknown) {
    console.error("upload-questions error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    )
  }
}