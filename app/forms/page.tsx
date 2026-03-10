"use client"

import { db } from "@/lib/auth"
import { useState, useEffect, useRef } from "react"
import {
  collection, query, orderBy, onSnapshot,
  doc, updateDoc, deleteDoc, setDoc, addDoc, getDocs, Timestamp,
} from "firebase/firestore"

// ─── Types ─────────────────────────────────────────────────────────────────

type ReportStatus  = "pending" | "reviewed" | "dismissed"
type ActiveSection = "reports" | "deletions" | "questions" | "mocktests"

interface Report {
  id: string
  questionText: string
  examName: string
  reporterEmail: string
  message: string
  status: ReportStatus
  adminNote: string
  createdAt: Timestamp
}

interface DeletionRequest {
  timestamp: string
  email: string
  registeredEmail: string
  confirmation: string
}

interface MockTestQuestion {
  text: string
  options: string[]
  correctAnswerIndex: number
}

interface MockTestPaper {
  id: string
  fileName: string
  displayName: string
  questions: MockTestQuestion[]
  totalQuestions: number
  createdAt: Timestamp
}

interface QuestionFile {
  category: string          // "OPTG" | "COMM" | "Estd Rule" | "Rajbhasa"
  fileName: string          // "optg.json"
  totalQuestions: number
  uploadedAt: Timestamp | null
  questions: { questionText: string; options: string[]; correctAnswer: number }[]
}

interface QuestionForm {
  questionText: string
  optionA: string
  optionB: string
  optionC: string
  optionD: string
  correctAnswer: number
  category: string
}

type CorrectionForm = QuestionForm

const EMPTY_FORM: QuestionForm = {
  questionText: "", optionA: "", optionB: "", optionC: "", optionD: "",
  correctAnswer: 0, category: "OPTG",
}


const STATUS_META: Record<ReportStatus, { label: string; color: string; bg: string }> = {
  pending:   { label: "Pending",  color: "#f59e0b", bg: "rgba(245,158,11,0.1)"  },
  reviewed:  { label: "Fixed",    color: "#10b981", bg: "rgba(16,185,129,0.1)"  },
  dismissed: { label: "Rejected", color: "#ef4444", bg: "rgba(239,68,68,0.1)"   },
}

const SHEET_ID   = "1PBIRKOFzfsLbmMBen4OaPuN3-juh9PeLfcixLiWTzk4"
const SHEET_NAME = "Form responses 1"

function formatDate(ts: Timestamp) {
  return ts?.toDate().toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }) ?? "—"
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function FormsPage() {
  const [activeSection, setActiveSection] = useState<ActiveSection>("reports")

  // ── Reports ──
  const [reports, setReports]               = useState<Report[]>([])
  const [reportsLoading, setReportsLoading] = useState(true)
  const [filter, setFilter]                 = useState<ReportStatus | "all">("all")
  const [selected, setSelected]             = useState<Report | null>(null)
  const [adminNote, setAdminNote]           = useState("")
  const [saving, setSaving]                 = useState(false)
  const [deleteConfirm, setDeleteConfirm]   = useState<string | null>(null)
  const [showCorrection, setShowCorrection] = useState(false)
  const [correction, setCorrection]         = useState<CorrectionForm>({ ...EMPTY_FORM })
  const [savingCorrection, setSavingCorrection] = useState(false)

  // ── Deletions ──
  const [deletions, setDeletions]               = useState<DeletionRequest[]>([])
  const [deletionsLoading, setDeletionsLoading] = useState(false)
  const [deletionsError, setDeletionsError]     = useState("")
  const [search, setSearch]                     = useState("")
  const [confirmEmail, setConfirmEmail]         = useState<string | null>(null)
  const [deleting, setDeleting]                 = useState(false)

  // ── Questions (file-based, one doc per category) ──
  const CAT_FILES = [
    { cat: "OPTG",      file: "optg.json",     color: "#818cf8", bg: "rgba(99,102,241,0.08)",  border: "rgba(99,102,241,0.3)"  },
    { cat: "COMM",      file: "comm.json",     color: "#10b981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.3)"  },
    { cat: "Estd Rule", file: "estd.json",     color: "#f59e0b", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.3)"  },
    { cat: "Rajbhasa",  file: "rajbhasa.json", color: "#f87171", bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.3)"   },
  ]
  const [questionFiles, setQuestionFiles]           = useState<Record<string, QuestionFile>>({})
  const [qFilesLoading, setQFilesLoading]           = useState(false)
  const [qUploadingCat, setQUploadingCat]           = useState<string | null>(null)
  const [qUploadResult, setQUploadResult]           = useState("")
  const [deleteQCatConfirm, setDeleteQCatConfirm]   = useState<string | null>(null)
  const qFileRefs: Record<string, React.RefObject<HTMLInputElement | null>> = {
    "OPTG":      useRef<HTMLInputElement>(null),
    "COMM":      useRef<HTMLInputElement>(null),
    "Estd Rule": useRef<HTMLInputElement>(null),
    "Rajbhasa":  useRef<HTMLInputElement>(null),
  }

  // ── Mock Tests ──
  const [mockTests, setMockTests]                     = useState<MockTestPaper[]>([])
  const [mockTestsLoading, setMockTestsLoading]       = useState(false)
  const [mockUploadLoading, setMockUploadLoading]     = useState(false)
  const [mockUploadResult, setMockUploadResult]       = useState("")
  const [deleteMockConfirm, setDeleteMockConfirm]     = useState<string | null>(null)
  const [editingMock, setEditingMock]                 = useState<MockTestPaper | null>(null)
  const [editMockName, setEditMockName]               = useState("")
  const [savingMockName, setSavingMockName]           = useState(false)
  const mockFileInputRef                              = useRef<HTMLInputElement>(null)

  // ── JSON Update (Mock Tests) ──
  const [updateMockTarget, setUpdateMockTarget]       = useState<MockTestPaper | null>(null)
  const [mockUpdateLoading, setMockUpdateLoading]     = useState(false)
  const mockUpdateFileInputRef                        = useRef<HTMLInputElement>(null)

  // ── JSON Update (Questions) ──

  // ── Toast ──
  const [toast, setToast] = useState("")
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3500) }

  // ── Reports listener ──
  useEffect(() => {
    const q    = query(collection(db, "question_reports"), orderBy("createdAt", "desc"))
    const unsub = onSnapshot(q, (snap) => {
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as Report)))
      setReportsLoading(false)
    })
    return unsub
  }, [])

  // ── Fetch deletions ──
  const fetchDeletions = async () => {
    setDeletionsLoading(true); setDeletionsError("")
    try {
      const key  = process.env.NEXT_PUBLIC_GOOGLE_SHEETS_API_KEY
      const url  = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`${SHEET_NAME}!A2:D1000`)}?key=${key}`
      const res  = await fetch(url)
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      setDeletions((data.values ?? []).map((r: string[]) => ({
        timestamp: r[0] ?? "—", email: r[1] ?? "—",
        registeredEmail: r[2] ?? "—", confirmation: r[3] ?? "—",
      })))
    } catch (e: unknown) {
      setDeletionsError(e instanceof Error ? e.message : "Failed")
    } finally { setDeletionsLoading(false) }
  }

  useEffect(() => {
    if (activeSection === "deletions" && deletions.length === 0) fetchDeletions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection])

  // ── Fetch question files (one doc per category in question_files collection) ──
  const fetchQuestionFiles = async () => {
    setQFilesLoading(true)
    try {
      const snap = await getDocs(collection(db, "question_files"))
      const map: Record<string, QuestionFile> = {}
      snap.docs.forEach(d => {
        const data = d.data()
        map[data.category] = {
          category:       data.category,
          fileName:       data.fileName,
          totalQuestions: data.totalQuestions ?? 0,
          uploadedAt:     data.uploadedAt ?? null,
          questions:      data.questions ?? [],
        }
      })
      setQuestionFiles(map)
    } catch {
      showToast("⚠ Failed to load question files")
    } finally { setQFilesLoading(false) }
  }

  useEffect(() => {
    if (activeSection === "questions") fetchQuestionFiles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection])

  // ── Counts ──
  const reportCounts = {
    all: reports.length,
    pending:   reports.filter(r => r.status === "pending").length,
    reviewed:  reports.filter(r => r.status === "reviewed").length,
    dismissed: reports.filter(r => r.status === "dismissed").length,
  }

  const filteredReports   = filter === "all" ? reports : reports.filter(r => r.status === filter)
  const filteredDeletions = deletions.filter(r =>
    r.email.toLowerCase().includes(search.toLowerCase()) ||
    r.registeredEmail.toLowerCase().includes(search.toLowerCase())
  )


  // ── Report actions ──
  const openDetail = (r: Report) => { setSelected(r); setAdminNote(r.adminNote ?? ""); setShowCorrection(false) }

  const openCorrectionForm = (r: Report) => {
    setCorrection({ questionText: r.questionText, optionA: "", optionB: "", optionC: "", optionD: "", correctAnswer: 0, category: r.examName ?? "OPTG" })
    setShowCorrection(true)
  }

  const handleSaveCorrection = async () => {
    if (!selected) return
    setSavingCorrection(true)
    try {
      await setDoc(doc(db, "question_corrections", selected.id), {
        originalQuestion: selected.questionText,
        questionText:     correction.questionText,
        options:          [correction.optionA, correction.optionB, correction.optionC, correction.optionD],
        correctAnswer:    correction.correctAnswer,
        examName:         selected.examName ?? "",
        reportId:         selected.id,
        fixedAt:          Timestamp.now(),
      })
      await updateDoc(doc(db, "question_reports", selected.id), { status: "reviewed", adminNote })
      await deleteDoc(doc(db, "question_reports", selected.id))
      showToast("✓ Correction saved to Firebase")
      setSelected(null); setShowCorrection(false)
    } catch (e: unknown) {
      showToast(`⚠ ${e instanceof Error ? e.message : "Failed"}`)
    } finally { setSavingCorrection(false) }
  }

  const handleReject = async (id: string) => {
    setSaving(true)
    await updateDoc(doc(db, "question_reports", id), { status: "dismissed", adminNote })
    await deleteDoc(doc(db, "question_reports", id))
    setSaving(false); setSelected(null)
  }

  const handleReportDelete = async (id: string) => {
    await deleteDoc(doc(db, "question_reports", id))
    setDeleteConfirm(null); setSelected(null)
  }

  // ── Account deletion ──
  const handleDeleteAccount = async (email: string) => {
    setDeleting(true)
    try {
      const res  = await fetch("/api/delete-user", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDeletions(prev => prev.filter(r => r.registeredEmail !== email && r.email !== email))
      if (data.sheetError) {
        showToast(`✓ Firebase deleted. ⚠ Sheet: ${data.sheetError}`)
      } else if (data.sheetRowsDeleted > 0) {
        showToast(`✓ Deleted Firebase + ${data.sheetRowsDeleted} row(s) from Sheet`)
      } else {
        showToast(`✓ Firebase deleted. (No rows found in Sheet)`)
      }
    } catch (e: unknown) { showToast(`⚠ ${e instanceof Error ? e.message : "Failed"}`) }
    finally { setDeleting(false); setConfirmEmail(null) }
  }

  const handleDeleteSheetRow = async (email: string) => {
    try {
      const key  = process.env.NEXT_PUBLIC_GOOGLE_SHEETS_API_KEY
      const url  = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A2:D1000")}?key=${key}`
      const res  = await fetch(url)
      const data = await res.json()
      const rows: string[][] = data.values ?? []
      const target = email.toLowerCase().trim()
      const matchIndex = rows.findIndex(r =>
        (r[1] ?? "").toLowerCase().trim() === target ||
        (r[2] ?? "").toLowerCase().trim() === target
      )
      if (matchIndex === -1) { showToast("⚠ No matching row found in Sheet"); return }
      const delRes  = await fetch("/api/delete-sheet-row", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIndex: matchIndex + 2 }),
      })
      const delData = await delRes.json()
      if (!delRes.ok) throw new Error(delData.error)
      setDeletions(prev => prev.filter(r => r.registeredEmail !== email && r.email !== email))
      showToast("✓ Row removed from Google Sheet")
    } catch (e: unknown) { showToast(`⚠ ${e instanceof Error ? e.message : "Sheet deletion failed"}`) }
  }

  // ── Upload category JSON → single doc in question_files collection ──
  const handleQFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, category: string, fileName: string) => {
    const file = e.target.files?.[0]
    if (!file) return
    setQUploadingCat(category); setQUploadResult("")
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const raw: unknown[] = Array.isArray(parsed) ? parsed : parsed.questions ?? []

      const questions = raw.map((q: unknown) => {
        const item = q as Record<string, unknown>
        return {
          questionText:  (item.question ?? item.text ?? item.questionText ?? "") as string,
          options:       (item.options ?? []) as string[],
          correctAnswer: (item.correctAnswer ?? item.correctAnswerIndex ?? 0) as number,
        }
      }).filter(q => q.questionText && Array.isArray(q.options) && q.options.length === 4)

      if (questions.length === 0) throw new Error("No valid questions found in file")

      // Store as single document, doc ID = category key e.g. "Estd_Rule"
      const docId = category.replace(/\s+/g, "_")
      await setDoc(doc(db, "question_files", docId), {
        category,
        fileName,
        questions,
        totalQuestions: questions.length,
        uploadedAt:     Timestamp.now(),
      })

      setQuestionFiles(prev => ({
        ...prev,
        [category]: { category, fileName, totalQuestions: questions.length, uploadedAt: Timestamp.now(), questions }
      }))
      setQUploadResult(`✓ [${category}] ${questions.length} questions saved`)
    } catch (e: unknown) {
      setQUploadResult(`⚠ ${e instanceof Error ? e.message : "Upload failed"}`)
    } finally {
      setQUploadingCat(null)
      const ref = qFileRefs[category]
      if (ref?.current) ref.current.value = ""
    }
  }

  // ── Download category as JSON ──
  const handleQFileDownload = (cat: string) => {
    const qf = questionFiles[cat]
    if (!qf) return
    const blob = new Blob([JSON.stringify(qf.questions, null, 2)], { type: "application/json" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a"); a.href = url
    a.download = qf.fileName; a.click(); URL.revokeObjectURL(url)
    showToast("📥 " + qf.fileName + " downloaded")
  }

  // ── Delete category file from Firestore ──
  const handleQFileDelete = async (cat: string) => {
    try {
      const docId = cat.replace(/\s+/g, "_")
      await deleteDoc(doc(db, "question_files", docId))
      setQuestionFiles(prev => { const n = { ...prev }; delete n[cat]; return n })
      showToast("✓ " + cat + " questions deleted")
    } catch { showToast("⚠ Failed to delete") }
    setDeleteQCatConfirm(null)
  }

    // ── Mock Tests CRUD ──
  const fetchMockTests = async () => {
    setMockTestsLoading(true)
    try {
      const snap = await getDocs(collection(db, "mock_tests"))
      setMockTests(snap.docs.map(d => ({
        id: d.id,
        fileName:       d.data().fileName       ?? "",
        displayName:    d.data().displayName    ?? "",
        questions:      d.data().questions      ?? [],
        totalQuestions: d.data().totalQuestions ?? 0,
        createdAt:      d.data().createdAt,
      })))
    } catch {
      showToast("⚠ Failed to load mock tests")
    } finally { setMockTestsLoading(false) }
  }

  useEffect(() => {
    if (activeSection === "mocktests" && mockTests.length === 0) fetchMockTests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection])

  const handleMockJsonUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setMockUploadLoading(true); setMockUploadResult("")
    try {
      const text   = await file.text()
      const parsed = JSON.parse(text)
      // Support both flat array and {questions:[...]} shape
      const raw: unknown[] = Array.isArray(parsed) ? parsed : parsed.questions ?? []

      const questions: MockTestQuestion[] = raw.map((q: unknown) => {
        const item = q as Record<string, unknown>
        return {
          text:               (item.text ?? item.question ?? item.questionText ?? "") as string,
          options:            (item.options ?? []) as string[],
          correctAnswerIndex: (item.correctAnswerIndex ?? item.correctAnswer ?? 0) as number,
        }
      }).filter(q => q.text && Array.isArray(q.options) && q.options.length === 4)

      if (questions.length === 0) throw new Error("No valid questions found in file")

      const fileName    = file.name
      const displayName = fileName.replace(".json", "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())

      const ref = await addDoc(collection(db, "mock_tests"), {
        fileName,
        displayName,
        questions,
        totalQuestions: questions.length,
        createdAt: Timestamp.now(),
      })

      setMockTests(prev => [...prev, { id: ref.id, fileName, displayName, questions, totalQuestions: questions.length, createdAt: Timestamp.now() }])
      setMockUploadResult(`✓ Uploaded "${displayName}" with ${questions.length} questions`)
    } catch (e: unknown) {
      setMockUploadResult(`⚠ ${e instanceof Error ? e.message : "Upload failed"}`)
    } finally { setMockUploadLoading(false); if (mockFileInputRef.current) mockFileInputRef.current.value = "" }
  }

  const handleSaveMockName = async () => {
    if (!editingMock || !editMockName.trim()) return
    setSavingMockName(true)
    try {
      await updateDoc(doc(db, "mock_tests", editingMock.id), { displayName: editMockName.trim() })
      setMockTests(prev => prev.map(m => m.id === editingMock.id ? { ...m, displayName: editMockName.trim() } : m))
      showToast("✓ Name updated")
      setEditingMock(null)
    } catch { showToast("⚠ Failed to update") }
    finally { setSavingMockName(false) }
  }

  const handleDeleteMockTest = async (id: string) => {
    try {
      await deleteDoc(doc(db, "mock_tests", id))
      setMockTests(prev => prev.filter(m => m.id !== id))
      showToast("✓ Mock test deleted")
    } catch { showToast("⚠ Failed to delete") }
    setDeleteMockConfirm(null)
  }

  // ── Download JSON for editing ──
  const handleDownloadMockJson = (m: MockTestPaper) => {
    const exportData = m.questions.map(q => ({
      text: q.text,
      options: q.options,
      correctAnswerIndex: q.correctAnswerIndex,
    }))
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a"); a.href = url
    a.download = m.fileName || `${m.displayName.replace(/\s+/g, "_")}.json`
    a.click(); URL.revokeObjectURL(url)
    setUpdateMockTarget(m)
    showToast("📥 JSON downloaded — edit it, then click 'Upload Updated JSON'")
  }

    const handleMockJsonReupload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !updateMockTarget) return
    setMockUpdateLoading(true)
    try {
      const text   = await file.text()
      const parsed = JSON.parse(text)
      const raw: unknown[] = Array.isArray(parsed) ? parsed : parsed.questions ?? []

      const updatedQuestions: MockTestQuestion[] = raw.map((q: unknown) => {
        const item = q as Record<string, unknown>
        return {
          text:               (item.text ?? item.question ?? item.questionText ?? "") as string,
          options:            (item.options ?? []) as string[],
          correctAnswerIndex: (item.correctAnswerIndex ?? item.correctAnswer ?? 0) as number,
        }
      }).filter(q => q.text && Array.isArray(q.options) && q.options.length === 4)

      if (updatedQuestions.length === 0) throw new Error("No valid questions found in file")

      await updateDoc(doc(db, "mock_tests", updateMockTarget.id), {
        questions:      updatedQuestions,
        totalQuestions: updatedQuestions.length,
      })

      setMockTests(prev => prev.map(m =>
        m.id === updateMockTarget.id
          ? { ...m, questions: updatedQuestions, totalQuestions: updatedQuestions.length }
          : m
      ))
      showToast(`✓ Mock test updated — ${updatedQuestions.length} questions saved to Firestore`)
      setUpdateMockTarget(null)
    } catch (e: unknown) {
      showToast(`⚠ ${e instanceof Error ? e.message : "Update failed"}`)
    } finally {
      setMockUpdateLoading(false)
      if (mockUpdateFileInputRef.current) mockUpdateFileInputRef.current.value = ""
    }
  }




  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #080b12; }
        .page { min-height: 100vh; background: #080b12; font-family: 'IBM Plex Sans', sans-serif; color: #c9d1e8; display: flex; flex-direction: column; animation: fadeIn 0.4s ease; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .topbar { display: flex; align-items: center; justify-content: space-between; padding: 18px 32px; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(8,11,18,0.95); position: sticky; top: 0; z-index: 10; backdrop-filter: blur(12px); }
        .topbar-left { display: flex; align-items: center; gap: 12px; }
        .topbar-icon { width: 32px; height: 32px; border-radius: 8px; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.25); display: flex; align-items: center; justify-content: center; font-size: 15px; }
        .topbar-title { font-size: 15px; font-weight: 600; color: #e2e8f8; }
        .topbar-sub { font-size: 11px; color: rgba(140,155,200,0.5); font-family: 'IBM Plex Mono', monospace; }
        .topbar-badges { display: flex; gap: 8px; }
        .badge { padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; }
        .badge-red   { background: rgba(239,68,68,0.12);  border: 1px solid rgba(239,68,68,0.2);  color: #ef4444; }
        .badge-amber { background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.2); color: #f59e0b; }
        .badge-indigo { background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.2); color: #818cf8; }
        .layout { display: flex; flex: 1; }
        .sidebar { width: 220px; flex-shrink: 0; border-right: 1px solid rgba(255,255,255,0.04); padding: 24px 16px; display: flex; flex-direction: column; gap: 4px; }
        .sidebar-label { font-size: 9px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(140,155,200,0.35); padding: 0 8px; margin-bottom: 8px; margin-top: 4px; }
        .nav-btn { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; border: none; background: transparent; cursor: pointer; width: 100%; font-family: 'IBM Plex Sans', sans-serif; text-align: left; transition: background 0.15s; }
        .nav-btn:hover { background: rgba(255,255,255,0.04); }
        .nav-btn.active { background: rgba(255,255,255,0.07); }
        .nav-btn-icon { font-size: 14px; width: 20px; text-align: center; }
        .nav-btn-text { font-size: 13px; flex: 1; }
        .nav-btn.active .nav-btn-text { font-weight: 500; color: #e2e8f8; }
        .nav-btn:not(.active) .nav-btn-text { color: rgba(140,155,200,0.6); }
        .nav-badge { font-size: 10px; font-family: 'IBM Plex Mono', monospace; padding: 1px 7px; border-radius: 10px; }
        .sidebar-divider { height: 1px; background: rgba(255,255,255,0.04); margin: 8px 0; }
        .filter-btn { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px 8px 32px; border-radius: 8px; border: none; background: transparent; cursor: pointer; width: 100%; font-family: 'IBM Plex Sans', sans-serif; transition: background 0.15s; }
        .filter-btn:hover { background: rgba(255,255,255,0.03); }
        .filter-btn.active { background: rgba(255,255,255,0.05); }
        .filter-btn-label { font-size: 12px; }
        .filter-btn.active .filter-btn-label { color: #e2e8f8; font-weight: 500; }
        .filter-btn:not(.active) .filter-btn-label { color: rgba(140,155,200,0.5); }
        .filter-num { font-size: 10px; font-family: 'IBM Plex Mono', monospace; padding: 1px 6px; border-radius: 8px; }
        .main { flex: 1; padding: 24px 28px; overflow-y: auto; }
        .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; gap: 12px; flex-wrap: wrap; }
        .section-title { font-size: 14px; font-weight: 600; color: #e2e8f8; }
        .search-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .search-input { padding: 8px 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #c9d1e8; font-family: 'IBM Plex Sans', sans-serif; font-size: 12px; outline: none; width: 220px; }
        .search-input::placeholder { color: rgba(140,155,200,0.3); }
        .select-input { padding: 8px 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #c9d1e8; font-family: 'IBM Plex Sans', sans-serif; font-size: 12px; outline: none; cursor: pointer; }
        .select-input option { background: #0d1120; }
        .btn-primary { padding: 8px 16px; border-radius: 8px; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); color: #818cf8; cursor: pointer; font-family: 'IBM Plex Sans', sans-serif; font-size: 12px; font-weight: 500; transition: all 0.2s; white-space: nowrap; }
        .btn-primary:hover { background: rgba(99,102,241,0.25); }
        .btn-secondary { padding: 8px 14px; border-radius: 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: rgba(140,155,200,0.7); font-family: 'IBM Plex Sans', sans-serif; font-size: 12px; cursor: pointer; transition: all 0.2s; }
        .btn-secondary:hover { background: rgba(255,255,255,0.08); color: #e2e8f8; }
        .upload-box { padding: 16px 20px; background: rgba(99,102,241,0.05); border: 1px dashed rgba(99,102,241,0.2); border-radius: 10px; margin-bottom: 16px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .upload-label { font-size: 12px; color: rgba(140,155,200,0.6); }
        .upload-result { font-size: 12px; font-family: 'IBM Plex Mono', monospace; }
        .upload-result.success { color: #10b981; }
        .upload-result.error { color: #ef4444; }
        .table-wrap { border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; overflow: hidden; background: rgba(255,255,255,0.015); }
        .table { width: 100%; border-collapse: collapse; }
        .table thead tr { border-bottom: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); }
        .table th { padding: 12px 16px; text-align: left; font-size: 9px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(140,155,200,0.4); font-family: 'IBM Plex Mono', monospace; }
        .table tbody tr { border-bottom: 1px solid rgba(255,255,255,0.03); transition: background 0.15s; }
        .table tbody tr:last-child { border-bottom: none; }
        .table tbody tr:hover { background: rgba(255,255,255,0.03); }
        .table td { padding: 14px 16px; font-size: 13px; vertical-align: middle; }
        .question-preview { max-width: 380px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #c9d1e8; }
        .option-preview { font-size: 11px; color: rgba(140,155,200,0.5); font-family: 'IBM Plex Mono', monospace; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .correct-badge { display: inline-block; padding: 2px 8px; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.2); border-radius: 4px; font-size: 10px; color: #10b981; font-family: 'IBM Plex Mono', monospace; font-weight: 600; }
        .cat-tag { display: inline-block; padding: 2px 8px; background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2); border-radius: 4px; font-size: 10px; color: rgba(129,140,248,0.8); font-family: 'IBM Plex Mono', monospace; }
        .exam-tag { display: inline-block; padding: 2px 8px; background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2); border-radius: 4px; font-size: 10px; color: rgba(129,140,248,0.8); font-family: 'IBM Plex Mono', monospace; }
        .status-pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; }
        .status-dot { width: 5px; height: 5px; border-radius: 50%; }
        .email-cell { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: rgba(140,155,200,0.8); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .date-cell { font-size: 11px; color: rgba(140,155,200,0.4); font-family: 'IBM Plex Mono', monospace; white-space: nowrap; }
        .delete-type-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 600; font-family: 'IBM Plex Mono', monospace; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: #ef4444; }
        .row-actions { display: flex; gap: 6px; }
        .btn-edit { padding: 5px 12px; border-radius: 6px; background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.2); color: #818cf8; cursor: pointer; font-family: 'IBM Plex Sans', sans-serif; font-size: 11px; transition: all 0.2s; }
        .btn-edit:hover { background: rgba(99,102,241,0.18); }
        .btn-del { padding: 5px 12px; border-radius: 6px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); color: #f87171; cursor: pointer; font-family: 'IBM Plex Sans', sans-serif; font-size: 11px; transition: all 0.2s; white-space: nowrap; }
        .btn-del:hover { background: rgba(239,68,68,0.18); }
        .empty { padding: 80px 20px; text-align: center; color: rgba(140,155,200,0.3); font-size: 13px; }
        .error-box { padding: 16px 20px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); border-radius: 10px; color: #f87171; font-size: 13px; margin-bottom: 20px; }
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 40; display: flex; align-items: flex-end; justify-content: flex-end; }
        .detail-panel { width: 520px; height: 100vh; background: #0d1120; border-left: 1px solid rgba(255,255,255,0.07); display: flex; flex-direction: column; animation: slideIn 0.25s ease; }
        @keyframes slideIn { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .panel-header { padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
        .panel-title { font-size: 14px; font-weight: 600; color: #e2e8f8; }
        .panel-close { width: 28px; height: 28px; border-radius: 7px; background: rgba(255,255,255,0.06); border: none; color: rgba(140,155,200,0.6); cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; }
        .panel-close:hover { background: rgba(255,255,255,0.1); color: #e2e8f8; }
        .panel-body { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
        .detail-section { display: flex; flex-direction: column; gap: 8px; }
        .detail-label { font-size: 9px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(140,155,200,0.35); font-family: 'IBM Plex Mono', monospace; }
        .detail-box { padding: 12px 14px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); font-size: 13px; color: #c9d1e8; line-height: 1.6; }
        .detail-meta { font-size: 12px; color: rgba(140,155,200,0.55); font-family: 'IBM Plex Mono', monospace; }
        .note-input { width: 100%; padding: 12px 14px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: #c9d1e8; font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; line-height: 1.6; resize: vertical; min-height: 70px; outline: none; }
        .note-input::placeholder { color: rgba(140,155,200,0.2); }
        .correction-section { border: 1px solid rgba(16,185,129,0.15); border-radius: 10px; padding: 16px; background: rgba(16,185,129,0.03); display: flex; flex-direction: column; gap: 14px; }
        .correction-title { font-size: 11px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: #10b981; font-family: 'IBM Plex Mono', monospace; }
        .field-group { display: flex; flex-direction: column; gap: 6px; }
        .field-label { font-size: 10px; font-weight: 500; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(140,155,200,0.4); font-family: 'IBM Plex Mono', monospace; }
        .field-input { width: 100%; padding: 10px 12px; border-radius: 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: #c9d1e8; font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; outline: none; resize: vertical; transition: border-color 0.2s; }
        .field-input:focus { border-color: rgba(16,185,129,0.4); }
        .field-input.indigo:focus { border-color: rgba(99,102,241,0.4); }
        .field-input::placeholder { color: rgba(140,155,200,0.2); }
        .options-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .option-wrap { display: flex; flex-direction: column; gap: 5px; }
        .correct-select { display: flex; gap: 6px; }
        .correct-btn { padding: 7px 16px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); color: rgba(140,155,200,0.6); cursor: pointer; font-family: 'IBM Plex Mono', monospace; font-size: 12px; font-weight: 500; transition: all 0.15s; }
        .correct-btn.selected { background: rgba(16,185,129,0.15); border-color: rgba(16,185,129,0.4); color: #10b981; }
        .panel-actions { padding: 16px 24px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
        .action-row { display: flex; gap: 8px; }
        .action-btn { flex: 1; padding: 11px; border-radius: 8px; border: 1px solid; cursor: pointer; font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .action-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .btn-fix { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.35); color: #10b981; }
        .btn-fix:hover:not(:disabled) { background: rgba(16,185,129,0.2); }
        .btn-reject { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.35); color: #ef4444; }
        .btn-reject:hover:not(:disabled) { background: rgba(239,68,68,0.2); }
        .btn-save-correction { width: 100%; padding: 12px; border-radius: 8px; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.3); color: #10b981; cursor: pointer; font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; font-weight: 600; transition: all 0.2s; }
        .btn-save-correction:hover:not(:disabled) { background: rgba(16,185,129,0.22); }
        .btn-save-correction:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-save-indigo { width: 100%; padding: 12px; border-radius: 8px; background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.3); color: #818cf8; cursor: pointer; font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; font-weight: 600; transition: all 0.2s; }
        .btn-save-indigo:hover:not(:disabled) { background: rgba(99,102,241,0.22); }
        .btn-save-indigo:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-back { width: 100%; padding: 9px; border-radius: 8px; background: transparent; border: 1px solid rgba(255,255,255,0.06); color: rgba(140,155,200,0.5); cursor: pointer; font-family: 'IBM Plex Sans', sans-serif; font-size: 12px; transition: all 0.2s; }
        .btn-back:hover { background: rgba(255,255,255,0.04); color: rgba(140,155,200,0.8); }
        .btn-delete-report { width: 100%; padding: 9px; border-radius: 8px; background: rgba(107,114,128,0.06); border: 1px solid rgba(107,114,128,0.18); color: rgba(140,155,200,0.4); cursor: pointer; font-family: 'IBM Plex Sans', sans-serif; font-size: 11px; transition: all 0.2s; }
        .btn-delete-report:hover { background: rgba(107,114,128,0.12); color: rgba(140,155,200,0.7); }
        .confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 60; display: flex; align-items: center; justify-content: center; }
        .confirm-box { background: #0d1120; border: 1px solid rgba(239,68,68,0.25); border-radius: 14px; padding: 28px; max-width: 400px; width: 90%; }
        .confirm-title { font-size: 15px; font-weight: 600; color: #f87171; margin-bottom: 10px; }
        .confirm-body { font-size: 13px; color: rgba(140,155,200,0.6); line-height: 1.6; margin-bottom: 8px; }
        .confirm-email { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: #ef4444; background: rgba(239,68,68,0.08); padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; word-break: break-all; }
        .confirm-warning { font-size: 11px; color: rgba(239,68,68,0.6); margin-bottom: 24px; line-height: 1.5; }
        .confirm-btns { display: flex; gap: 10px; }
        .confirm-cancel { flex: 1; padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); color: rgba(140,155,200,0.7); cursor: pointer; font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; }
        .confirm-delete { flex: 1; padding: 10px; border-radius: 8px; background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); color: #f87171; cursor: pointer; font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .confirm-delete:disabled { opacity: 0.5; cursor: not-allowed; }
        .toast { position: fixed; bottom: 24px; right: 24px; z-index: 100; padding: 12px 20px; background: #0d1120; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; font-size: 13px; color: #c9d1e8; box-shadow: 0 8px 32px rgba(0,0,0,0.4); animation: slideUp 0.3s ease; }
        @keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .spinner { width: 12px; height: 12px; border: 2px solid rgba(248,113,113,0.3); border-top-color: #f87171; border-radius: 50%; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .q-count { font-size: 11px; color: rgba(140,155,200,0.4); font-family: 'IBM Plex Mono', monospace; }
      `}</style>

      <div className="page">
        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-left">
            <div className="topbar-icon">⚙️</div>
            <div>
              <div className="topbar-title">Admin Dashboard</div>
              <div className="topbar-sub">quiz app panel</div>
            </div>
          </div>
          <div className="topbar-badges">
            {reportCounts.pending > 0 && <div className="badge badge-amber">{reportCounts.pending} pending</div>}
            {deletions.length > 0 && <div className="badge badge-red">{deletions.length} deletions</div>}
            {Object.keys(questionFiles).length > 0 && <div className="badge badge-indigo">{Object.values(questionFiles).reduce((s, f) => s + f.totalQuestions, 0)} questions</div>}
            {mockTests.length > 0 && <div className="badge badge-amber">{mockTests.length} mock tests</div>}
          </div>
        </div>

        <div className="layout">
          {/* Sidebar */}
          <div className="sidebar">
            <div className="sidebar-label">Sections</div>

            <button className={`nav-btn ${activeSection === "reports" ? "active" : ""}`} onClick={() => setActiveSection("reports")}>
              <span className="nav-btn-icon">🐛</span>
              <span className="nav-btn-text">Question Reports</span>
              {reportCounts.pending > 0 && <span className="nav-badge" style={{ color: "#f59e0b", background: "rgba(245,158,11,0.1)" }}>{reportCounts.pending}</span>}
            </button>

            {activeSection === "reports" && (["all","pending","reviewed","dismissed"] as const).map((f) => {
              const meta = f === "all" ? null : STATUS_META[f]
              const labels = { all: "All", pending: "Pending", reviewed: "Fixed", dismissed: "Rejected" }
              return (
                <button key={f} className={`filter-btn ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                  <span className="filter-btn-label">{labels[f]}</span>
                  <span className="filter-num" style={{ color: meta?.color ?? "#c9d1e8", background: meta?.bg ?? "rgba(255,255,255,0.06)" }}>{reportCounts[f]}</span>
                </button>
              )
            })}

            <div className="sidebar-divider" />

            <button className={`nav-btn ${activeSection === "deletions" ? "active" : ""}`} onClick={() => setActiveSection("deletions")}>
              <span className="nav-btn-icon">🗑</span>
              <span className="nav-btn-text">Account Deletions</span>
              {deletions.length > 0 && <span className="nav-badge" style={{ color: "#ef4444", background: "rgba(239,68,68,0.1)" }}>{deletions.length}</span>}
            </button>

            <div className="sidebar-divider" />

            <button className={`nav-btn ${activeSection === "questions" ? "active" : ""}`} onClick={() => setActiveSection("questions")}>
              <span className="nav-btn-icon">📚</span>
              <span className="nav-btn-text">Questions</span>
              {Object.keys(questionFiles).length > 0 && <span className="nav-badge" style={{ color: "#818cf8", background: "rgba(99,102,241,0.1)" }}>{Object.values(questionFiles).reduce((s, f) => s + f.totalQuestions, 0)}</span>}
            </button>

            <div className="sidebar-divider" />

            <button className={`nav-btn ${activeSection === "mocktests" ? "active" : ""}`} onClick={() => setActiveSection("mocktests")}>
              <span className="nav-btn-icon">📝</span>
              <span className="nav-btn-text">Mock Tests</span>
              {mockTests.length > 0 && <span className="nav-badge" style={{ color: "#f59e0b", background: "rgba(245,158,11,0.1)" }}>{mockTests.length}</span>}
            </button>
          </div>

          {/* Main */}
          <div className="main">

            {/* REPORTS */}
            {activeSection === "reports" && (
              reportsLoading ? <div className="empty">Loading reports...</div>
              : filteredReports.length === 0 ? <div className="empty">No reports found.</div>
              : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Question</th><th>Exam</th><th>Reporter</th><th>Status</th><th>Date</th></tr></thead>
                    <tbody>
                      {filteredReports.map((r) => {
                        const meta = STATUS_META[r.status]
                        return (
                          <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => openDetail(r)}>
                            <td><div className="question-preview">{r.questionText}</div></td>
                            <td>{r.examName ? <span className="exam-tag">{r.examName}</span> : <span style={{ color: "rgba(140,155,200,0.2)", fontSize: 12 }}>—</span>}</td>
                            <td><div className="email-cell">{r.reporterEmail}</div></td>
                            <td><span className="status-pill" style={{ color: meta.color, background: meta.bg }}><span className="status-dot" style={{ background: meta.color }} />{meta.label}</span></td>
                            <td><div className="date-cell">{formatDate(r.createdAt)}</div></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* DELETIONS */}
            {activeSection === "deletions" && (
              <>
                <div className="section-header">
                  <div className="search-row">
                    <input className="search-input" placeholder="Search by email..." value={search} onChange={(e) => setSearch(e.target.value)} />
                    <button className="btn-secondary" onClick={fetchDeletions}>↻ Refresh</button>
                  </div>
                </div>
                {deletionsError && <div className="error-box">⚠ {deletionsError}</div>}
                {deletionsLoading ? <div className="empty">Loading...</div>
                : filteredDeletions.length === 0 ? <div className="empty">{search ? "No results." : "No deletion requests yet."}</div>
                : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Timestamp</th><th>Email</th><th>Registered Email</th><th>Type</th><th>Action</th></tr></thead>
                      <tbody>
                        {filteredDeletions.map((r, i) => (
                          <tr key={i}>
                            <td><div className="date-cell">{r.timestamp}</div></td>
                            <td><div className="email-cell">{r.email}</div></td>
                            <td><div className="email-cell">{r.registeredEmail}</div></td>
                            <td><span className="delete-type-badge">🗑 Delete</span></td>
                            <td>
                              <div className="row-actions">
                                <button className="btn-del" onClick={() => setConfirmEmail(r.registeredEmail)}>🗑 Delete Account</button>
                                <button className="btn-secondary" style={{fontSize:11,padding:"5px 10px"}} onClick={() => handleDeleteSheetRow(r.registeredEmail)}>📋 Remove from Sheet</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* MOCK TESTS */}
            {activeSection === "mocktests" && (
              <>
                <div className="upload-box">
                  <span className="upload-label">📝 Upload a mock test JSON file (array of questions):</span>
                  <input ref={mockFileInputRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleMockJsonUpload} />
                  <button className="btn-primary" onClick={() => mockFileInputRef.current?.click()} disabled={mockUploadLoading}>
                    {mockUploadLoading ? "Uploading..." : "Upload Mock Test JSON"}
                  </button>
                  {mockUploadResult && <span className={`upload-result ${mockUploadResult.startsWith("✓") ? "success" : "error"}`}>{mockUploadResult}</span>}
                </div>

                <div className="section-header">
                  <span className="section-title">Mock Test Papers ({mockTests.length})</span>
                  <button className="btn-secondary" onClick={fetchMockTests}>↻ Refresh</button>
                </div>

                {mockTestsLoading ? <div className="empty">Loading mock tests...</div>
                : mockTests.length === 0 ? (
                  <div className="empty">No mock tests yet. Upload a JSON file to add one.</div>
                ) : (
                  <>
                    {/* Hidden file input for JSON re-upload */}
                    <input
                      ref={mockUpdateFileInputRef}
                      type="file"
                      accept=".json"
                      style={{ display: "none" }}
                      onChange={handleMockJsonReupload}
                    />

                    {/* Update pending banner */}
                    {updateMockTarget && (
                      <div style={{ marginBottom: 12, padding: "12px 16px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <span style={{ fontSize: 12, color: "#f59e0b" }}>
                          📝 Editing: <strong>{updateMockTarget.displayName}</strong> — Edit the downloaded JSON, then upload it back.
                        </span>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            className="btn-primary"
                            style={{ background: "rgba(245,158,11,0.15)", borderColor: "rgba(245,158,11,0.35)", color: "#f59e0b" }}
                            disabled={mockUpdateLoading}
                            onClick={() => mockUpdateFileInputRef.current?.click()}
                          >
                            {mockUpdateLoading ? "Saving..." : "⬆ Upload Updated JSON"}
                          </button>
                          <button className="btn-secondary" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => setUpdateMockTarget(null)}>✕ Cancel</button>
                        </div>
                      </div>
                    )}

                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Display Name</th><th>File Name</th><th>Questions</th><th>Uploaded</th><th>Actions</th></tr></thead>
                      <tbody>
                        {mockTests.map((m) => (
                          <tr key={m.id}>
                            <td>
                              {editingMock?.id === m.id ? (
                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <input
                                    className="search-input"
                                    style={{ width: 200 }}
                                    value={editMockName}
                                    onChange={(e) => setEditMockName(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleSaveMockName()}
                                    autoFocus
                                  />
                                  <button className="btn-edit" onClick={handleSaveMockName} disabled={savingMockName}>{savingMockName ? "..." : "✓"}</button>
                                  <button className="btn-secondary" style={{ padding: "5px 10px", fontSize: 11 }} onClick={() => setEditingMock(null)}>✕</button>
                                </div>
                              ) : (
                                <span style={{ color: "#c9d1e8", fontWeight: 500 }}>{m.displayName}</span>
                              )}
                            </td>
                            <td><span className="cat-tag">{m.fileName}</span></td>
                            <td><span className="correct-badge">{m.totalQuestions}</span></td>
                            <td><div className="date-cell">{m.createdAt ? formatDate(m.createdAt) : "—"}</div></td>
                            <td>
                              <div className="row-actions">
                                <button className="btn-edit" onClick={() => { setEditingMock(m); setEditMockName(m.displayName) }}>✏ Rename</button>
                                <button
                                  className="btn-edit"
                                  style={{ background: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.25)", color: "#f59e0b" }}
                                  onClick={() => handleDownloadMockJson(m)}
                                  title="Download JSON, edit in VS Code, then upload back"
                                >
                                  🔄 Update JSON
                                </button>
                                <button className="btn-del" onClick={() => setDeleteMockConfirm(m.id)}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </>
                )}
              </>
            )}

            {/* QUESTIONS */}
            {activeSection === "questions" && (
              <>
                <div className="section-header" style={{ marginBottom: 16 }}>
                  <span className="section-title">📚 Question Files ({Object.keys(questionFiles).length} / 4)</span>
                  <button className="btn-secondary" onClick={fetchQuestionFiles}>↻ Refresh</button>
                </div>

                {qUploadResult && (
                  <div style={{ marginBottom: 12 }}>
                    <span className={`upload-result ${qUploadResult.startsWith("✓") ? "success" : "error"}`}>{qUploadResult}</span>
                  </div>
                )}

                {qFilesLoading ? <div className="empty">Loading...</div> : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th>File Name</th>
                          <th>Questions</th>
                          <th>Last Uploaded</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {CAT_FILES.map(({ cat, file, color, bg }) => {
                          const qf = questionFiles[cat]
                          const inputRef = qFileRefs[cat]
                          return (
                            <tr key={cat}>
                              <td>
                                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color, background: bg, padding: "3px 10px", borderRadius: 6, fontSize: 12 }}>
                                  {cat}
                                </span>
                              </td>
                              <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "rgba(201,209,232,0.6)" }}>
                                {qf ? qf.fileName : <span style={{ color: "rgba(201,209,232,0.25)" }}>{file}</span>}
                              </td>
                              <td>
                                {qf
                                  ? <span style={{ color, fontWeight: 600 }}>{qf.totalQuestions}</span>
                                  : <span style={{ color: "rgba(201,209,232,0.25)" }}>—</span>
                                }
                              </td>
                              <td style={{ fontSize: 12, color: "rgba(201,209,232,0.5)" }}>
                                {qf?.uploadedAt
                                  ? new Date(qf.uploadedAt.seconds * 1000).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                                  : <span style={{ color: "rgba(201,209,232,0.25)" }}>Not uploaded</span>
                                }
                              </td>
                              <td>
                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <input
                                    ref={inputRef}
                                    type="file"
                                    accept=".json"
                                    style={{ display: "none" }}
                                    onChange={(e) => handleQFileUpload(e, cat, file)}
                                  />
                                  <button
                                    className="btn-primary"
                                    style={{ fontSize: 11, padding: "5px 12px" }}
                                    onClick={() => inputRef.current?.click()}
                                    disabled={qUploadingCat !== null}
                                  >
                                    {qUploadingCat === cat ? "Uploading..." : qf ? "🔄 Re-upload" : "↑ Upload"}
                                  </button>
                                  {qf && (
                                    <>
                                      <button className="btn-edit" style={{ fontSize: 11 }} onClick={() => handleQFileDownload(cat)}>📥 Download</button>
                                      <button className="btn-del" onClick={() => setDeleteQCatConfirm(cat)}>🗑</button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

          </div>   {/* end .main */}
        </div>     {/* end .layout */}
      </div>       {/* end .page */}

      {/* ── Report Detail Panel ── */}
      {selected && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
          <div className="detail-panel">
            <div className="panel-header">
              <div className="panel-title">{showCorrection ? "✏ Edit Correction" : "Report Detail"}</div>
              <button className="panel-close" onClick={() => setSelected(null)}>×</button>
            </div>
            <div className="panel-body">
              {!showCorrection ? (
                <>
                  <div className="detail-section"><div className="detail-label">Question</div><div className="detail-box">{selected.questionText}</div></div>
                  {selected.examName && <div className="detail-section"><div className="detail-label">Exam</div><div className="detail-meta">{selected.examName}</div></div>}
                  <div className="detail-section"><div className="detail-label">Reporter</div><div className="detail-meta">{selected.reporterEmail}</div></div>
                  <div className="detail-section"><div className="detail-label">Message</div><div className="detail-box">{selected.message}</div></div>
                  <div className="detail-section"><div className="detail-label">Reported At</div><div className="detail-meta">{formatDate(selected.createdAt)}</div></div>
                  <div className="detail-section">
                    <div className="detail-label">Status</div>
                    <span className="status-pill" style={{ color: STATUS_META[selected.status].color, background: STATUS_META[selected.status].bg, display: "inline-flex" }}>
                      <span className="status-dot" style={{ background: STATUS_META[selected.status].color }} />{STATUS_META[selected.status].label}
                    </span>
                  </div>
                  <div className="detail-section">
                    <div className="detail-label">Admin Note</div>
                    <textarea className="note-input" placeholder="Add a note..." value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
                  </div>
                </>
              ) : (
                <div className="correction-section">
                  <div className="correction-title">✏ Corrected Question</div>
                  <div className="field-group">
                    <div className="field-label">Question Text</div>
                    <textarea className="field-input" rows={3} placeholder="Enter corrected question..." value={correction.questionText} onChange={(e) => setCorrection(p => ({ ...p, questionText: e.target.value }))} />
                  </div>
                  <div className="options-grid">
                    {(["A","B","C","D"] as const).map((letter) => {
                      const key = `option${letter}` as keyof QuestionForm
                      return (
                        <div className="option-wrap" key={letter}>
                          <div className="field-label">Option {letter}</div>
                          <input className="field-input" placeholder={`Option ${letter}`} value={correction[key] as string} onChange={(e) => setCorrection(p => ({ ...p, [key]: e.target.value }))} />
                        </div>
                      )
                    })}
                  </div>
                  <div className="field-group">
                    <div className="field-label">Correct Answer</div>
                    <div className="correct-select">
                      {["A","B","C","D"].map((l, i) => (
                        <button key={l} className={`correct-btn ${correction.correctAnswer === i ? "selected" : ""}`} onClick={() => setCorrection(p => ({ ...p, correctAnswer: i }))}>{l}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="panel-actions">
              {!showCorrection ? (
                <>
                  <div className="action-row">
                    <button className="action-btn btn-fix" disabled={saving} onClick={() => openCorrectionForm(selected)}>✏ Fix</button>
                    <button className="action-btn btn-reject" disabled={saving} onClick={() => handleReject(selected.id)}>✕ Reject</button>
                  </div>
                  <button className="btn-delete-report" onClick={() => setDeleteConfirm(selected.id)}>🗑 Delete Report</button>
                </>
              ) : (
                <>
                  <button className="btn-save-correction" disabled={savingCorrection || !correction.questionText || !correction.optionA || !correction.optionB || !correction.optionC || !correction.optionD} onClick={handleSaveCorrection}>
                    {savingCorrection ? "Saving..." : "💾 Save Correction to Firebase"}
                  </button>
                  <button className="btn-back" onClick={() => setShowCorrection(false)}>← Back to Report</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}



      {/* Delete Report Confirm */}
      {deleteConfirm && (
        <div className="confirm-overlay">
          <div className="confirm-box">
            <div className="confirm-title">Delete Report?</div>
            <div className="confirm-body">This will permanently delete this report.</div>
            <div className="confirm-btns" style={{ marginTop: 24 }}>
              <button className="confirm-cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="confirm-delete" onClick={() => handleReportDelete(deleteConfirm)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Question File Confirm */}
      {deleteQCatConfirm && (
        <div className="confirm-overlay">
          <div className="confirm-box">
            <div className="confirm-title">Delete {deleteQCatConfirm} Questions?</div>
            <div className="confirm-body">This will permanently remove all {deleteQCatConfirm} questions from Firestore. The Android app will fall back to local JSON.</div>
            <div className="confirm-btns" style={{ marginTop: 24 }}>
              <button className="confirm-cancel" onClick={() => setDeleteQCatConfirm(null)}>Cancel</button>
              <button className="confirm-delete" onClick={() => handleQFileDelete(deleteQCatConfirm)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirm */}
      {confirmEmail && (
        <div className="confirm-overlay">
          <div className="confirm-box">
            <div className="confirm-title">Delete Account?</div>
            <div className="confirm-body">Permanently delete all data for:</div>
            <div className="confirm-email">{confirmEmail}</div>
            <div className="confirm-warning">⚠ Removes user from Firebase Auth and all Firestore data. Cannot be undone.</div>
            <div className="confirm-btns">
              <button className="confirm-cancel" onClick={() => setConfirmEmail(null)} disabled={deleting}>Cancel</button>
              <button className="confirm-delete" disabled={deleting} onClick={() => handleDeleteAccount(confirmEmail)}>
                {deleting ? <><div className="spinner" /> Deleting...</> : "🗑 Delete Everything"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Mock Test Confirm */}
      {deleteMockConfirm && (
        <div className="confirm-overlay">
          <div className="confirm-box">
            <div className="confirm-title">Delete Mock Test?</div>
            <div className="confirm-body">This will permanently remove the mock test paper and all its questions from Firestore. The Android app will no longer show it.</div>
            <div className="confirm-btns" style={{ marginTop: 24 }}>
              <button className="confirm-cancel" onClick={() => setDeleteMockConfirm(null)}>Cancel</button>
              <button className="confirm-delete" onClick={() => handleDeleteMockTest(deleteMockConfirm)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  )
}