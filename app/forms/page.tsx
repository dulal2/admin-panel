"use client"

import { db } from "@/lib/auth"
import { useState, useEffect } from "react"
import {
  collection, query, orderBy, onSnapshot,
  doc, updateDoc, deleteDoc, Timestamp,
} from "firebase/firestore"

// ─── Types ────────────────────────────────────────────────────

type ReportStatus = "pending" | "reviewed" | "dismissed"
type ActiveSection = "reports" | "deletions"

interface Report {
  id: string
  questionId: string
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

// ─── Constants ────────────────────────────────────────────────

const STATUS_META: Record<ReportStatus, { label: string; color: string; bg: string }> = {
  pending:   { label: "Pending",  color: "#f59e0b", bg: "rgba(245,158,11,0.1)"  },
  reviewed:  { label: "Fixed",    color: "#10b981", bg: "rgba(16,185,129,0.1)"  },
  dismissed: { label: "Rejected", color: "#ef4444", bg: "rgba(239,68,68,0.1)"   },
}

const FILTER_LABEL: Record<ReportStatus | "all", string> = {
  all: "All", pending: "Pending", reviewed: "Fixed", dismissed: "Rejected",
}

const SHEET_ID   = "1PBIRKOFzfsLbmMBen4OaPuN3-juh9PeLfcixLiWTzk4"
const SHEET_NAME = "Form responses 1"

function formatDate(ts: Timestamp) {
  return ts?.toDate().toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }) ?? "—"
}

// ─── Main Dashboard ───────────────────────────────────────────

export default function DashboardPage() {
  const [activeSection, setActiveSection] = useState<ActiveSection>("reports")

  // Reports state
  const [reports, setReports]       = useState<Report[]>([])
  const [reportsLoading, setReportsLoading] = useState(true)
  const [filter, setFilter]         = useState<ReportStatus | "all">("all")
  const [selected, setSelected]     = useState<Report | null>(null)
  const [adminNote, setAdminNote]   = useState("")
  const [saving, setSaving]         = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Deletions state
  const [deletions, setDeletions]         = useState<DeletionRequest[]>([])
  const [deletionsLoading, setDeletionsLoading] = useState(false)
  const [deletionsError, setDeletionsError]     = useState("")
  const [search, setSearch]               = useState("")
  const [confirmEmail, setConfirmEmail]   = useState<string | null>(null)
  const [deleting, setDeleting]           = useState(false)
  const [toast, setToast]                 = useState("")

  // ── Reports: realtime listener ──
  useEffect(() => {
    const q = query(collection(db, "question_reports"), orderBy("createdAt", "desc"))
    const unsub = onSnapshot(q, (snap) => {
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as Report)))
      setReportsLoading(false)
    })
    return unsub
  }, [])

  // ── Deletions: fetch from Google Sheets ──
  const fetchDeletions = async () => {
    setDeletionsLoading(true)
    setDeletionsError("")
    try {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_SHEETS_API_KEY
      const range  = encodeURIComponent(`${SHEET_NAME}!A2:D1000`)
      const url    = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${apiKey}`
      const res    = await fetch(url)
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)
      const data   = await res.json()
      const rows   = data.values ?? []
      setDeletions(rows.map((row: string[]) => ({
        timestamp:       row[0] ?? "—",
        email:           row[1] ?? "—",
        registeredEmail: row[2] ?? "—",
        confirmation:    row[3] ?? "—",
      })))
    } catch (e: unknown) {
      setDeletionsError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setDeletionsLoading(false)
    }
  }

useEffect(() => {
  if (activeSection === "deletions" && deletions.length === 0) {
    fetchDeletions()
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeSection])
  // ── Reports handlers ──
  const reportCounts = {
    all:       reports.length,
    pending:   reports.filter(r => r.status === "pending").length,
    reviewed:  reports.filter(r => r.status === "reviewed").length,
    dismissed: reports.filter(r => r.status === "dismissed").length,
  }

  const filteredReports = filter === "all" ? reports : reports.filter(r => r.status === filter)

  const openDetail = (r: Report) => { setSelected(r); setAdminNote(r.adminNote ?? "") }

  const handleReportAction = async (id: string, status: ReportStatus) => {
    setSaving(true)
    await updateDoc(doc(db, "question_reports", id), { status, adminNote })
    await deleteDoc(doc(db, "question_reports", id))
    setSaving(false)
    setSelected(null)
  }

  const handleReportDelete = async (id: string) => {
    await deleteDoc(doc(db, "question_reports", id))
    setDeleteConfirm(null)
    setSelected(null)
  }

  // ── Deletions handlers ──
  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(""), 3500)
  }

  const handleDeleteAccount = async (email: string) => {
    setDeleting(true)
    try {
      const res  = await fetch("/api/delete-user", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(`✓ Deleted all data for ${email}`)
      setDeletions(prev => prev.filter(r => r.registeredEmail !== email && r.email !== email))
    } catch (e: unknown) {
      showToast(`⚠ ${e instanceof Error ? e.message : "Failed to delete"}`)
    } finally {
      setDeleting(false)
      setConfirmEmail(null)
    }
  }

  const filteredDeletions = deletions.filter(r =>
    r.email.toLowerCase().includes(search.toLowerCase()) ||
    r.registeredEmail.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #080b12; }

        .page { min-height: 100vh; background: #080b12; font-family: 'IBM Plex Sans', sans-serif; color: #c9d1e8; animation: fadeIn 0.4s ease; display: flex; flex-direction: column; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        /* Topbar */
        .topbar { display: flex; align-items: center; justify-content: space-between; padding: 18px 32px; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(8,11,18,0.95); position: sticky; top: 0; z-index: 10; backdrop-filter: blur(12px); flex-shrink: 0; }
        .topbar-left { display: flex; align-items: center; gap: 12px; }
        .topbar-icon { width: 32px; height: 32px; border-radius: 8px; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.25); display: flex; align-items: center; justify-content: center; font-size: 15px; }
        .topbar-title { font-size: 15px; font-weight: 600; color: #e2e8f8; letter-spacing: -0.01em; }
        .topbar-sub { font-size: 11px; color: rgba(140,155,200,0.5); font-family: 'IBM Plex Mono', monospace; letter-spacing: 0.05em; }
        .topbar-badges { display: flex; align-items: center; gap: 8px; }
        .badge { padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; }
        .badge-red   { background: rgba(239,68,68,0.12);  border: 1px solid rgba(239,68,68,0.2);  color: #ef4444; }
        .badge-amber { background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.2); color: #f59e0b; }

        /* Layout */
        .layout { display: flex; flex: 1; min-height: 0; }

        /* Sidebar */
        .sidebar { width: 220px; flex-shrink: 0; border-right: 1px solid rgba(255,255,255,0.04); padding: 24px 16px; display: flex; flex-direction: column; gap: 4px; }
        .sidebar-label { font-size: 9px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(140,155,200,0.35); padding: 0 8px; margin-bottom: 8px; margin-top: 4px; }

        .nav-btn { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; border: none; background: transparent; cursor: pointer; width: 100%; transition: background 0.15s ease; font-family: 'IBM Plex Sans', sans-serif; text-align: left; }
        .nav-btn:hover { background: rgba(255,255,255,0.04); }
        .nav-btn.active { background: rgba(255,255,255,0.07); }
        .nav-btn-icon { font-size: 14px; width: 20px; text-align: center; }
        .nav-btn-text { font-size: 13px; font-weight: 400; flex: 1; }
        .nav-btn.active .nav-btn-text { font-weight: 500; color: #e2e8f8; }
        .nav-btn:not(.active) .nav-btn-text { color: rgba(140,155,200,0.6); }
        .nav-badge { font-size: 10px; font-family: 'IBM Plex Mono', monospace; padding: 1px 7px; border-radius: 10px; }

        .sidebar-divider { height: 1px; background: rgba(255,255,255,0.04); margin: 8px 0; }

        /* Sub-filters (inside reports section) */
        .filter-btn { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px 8px 32px; border-radius: 8px; border: none; background: transparent; cursor: pointer; width: 100%; transition: background 0.15s ease; font-family: 'IBM Plex Sans', sans-serif; }
        .filter-btn:hover { background: rgba(255,255,255,0.03); }
        .filter-btn.active { background: rgba(255,255,255,0.05); }
        .filter-btn-label { font-size: 12px; }
        .filter-btn.active .filter-btn-label { color: #e2e8f8; font-weight: 500; }
        .filter-btn:not(.active) .filter-btn-label { color: rgba(140,155,200,0.5); }
        .filter-num { font-size: 10px; font-family: 'IBM Plex Mono', monospace; padding: 1px 6px; border-radius: 8px; }

        /* Main content */
        .main { flex: 1; padding: 24px 28px; overflow-y: auto; }

        /* Search bar */
        .search-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; gap: 12px; }
        .search-input { padding: 8px 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #c9d1e8; font-family: 'IBM Plex Sans', sans-serif; font-size: 12px; outline: none; width: 240px; transition: border-color 0.2s; }
        .search-input:focus { border-color: rgba(99,102,241,0.4); }
        .search-input::placeholder { color: rgba(140,155,200,0.3); }
        .refresh-btn { padding: 8px 14px; border-radius: 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: rgba(140,155,200,0.7); font-family: 'IBM Plex Sans', sans-serif; font-size: 12px; cursor: pointer; transition: all 0.2s ease; }
        .refresh-btn:hover { background: rgba(255,255,255,0.08); color: #e2e8f8; }

        /* Table */
        .table-wrap { border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; overflow: hidden; background: rgba(255,255,255,0.015); }
        .table { width: 100%; border-collapse: collapse; }
        .table thead tr { border-bottom: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); }
        .table th { padding: 12px 16px; text-align: left; font-size: 9px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(140,155,200,0.4); font-family: 'IBM Plex Mono', monospace; }
        .table tbody tr { border-bottom: 1px solid rgba(255,255,255,0.03); cursor: pointer; transition: background 0.15s ease; }
        .table tbody tr:last-child { border-bottom: none; }
        .table tbody tr:hover { background: rgba(255,255,255,0.03); }
        .table td { padding: 14px 16px; font-size: 13px; vertical-align: middle; }

        .question-preview { max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #c9d1e8; }
        .exam-tag { display: inline-block; padding: 2px 8px; background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2); border-radius: 4px; font-size: 10px; color: rgba(129,140,248,0.8); font-family: 'IBM Plex Mono', monospace; }
        .status-pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; }
        .status-dot { width: 5px; height: 5px; border-radius: 50%; }
        .email-cell { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: rgba(140,155,200,0.8); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .date-cell { font-size: 11px; color: rgba(140,155,200,0.4); font-family: 'IBM Plex Mono', monospace; white-space: nowrap; }
        .confirm-cell { font-size: 11px; color: rgba(140,155,200,0.5); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .delete-type-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 600; font-family: 'IBM Plex Mono', monospace; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: #ef4444; }

        .btn-action { padding: 7px 14px; border-radius: 7px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); color: #f87171; cursor: pointer; font-family: 'IBM Plex Sans', sans-serif; font-size: 11px; font-weight: 500; transition: all 0.2s ease; white-space: nowrap; }
        .btn-action:hover { background: rgba(239,68,68,0.18); border-color: rgba(239,68,68,0.4); }

        .empty { padding: 80px 20px; text-align: center; color: rgba(140,155,200,0.3); font-size: 13px; }
        .error-box { padding: 16px 20px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); border-radius: 10px; color: #f87171; font-size: 13px; margin-bottom: 20px; }

        /* Detail panel */
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 40; display: flex; align-items: flex-end; justify-content: flex-end; }
        .detail-panel { width: 480px; height: 100vh; background: #0d1120; border-left: 1px solid rgba(255,255,255,0.07); display: flex; flex-direction: column; animation: slideIn 0.25s ease; }
        @keyframes slideIn { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .panel-header { padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
        .panel-title { font-size: 14px; font-weight: 600; color: #e2e8f8; }
        .panel-close { width: 28px; height: 28px; border-radius: 7px; background: rgba(255,255,255,0.06); border: none; color: rgba(140,155,200,0.6); cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; transition: background 0.15s; flex-shrink: 0; }
        .panel-close:hover { background: rgba(255,255,255,0.1); color: #e2e8f8; }
        .panel-body { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 20px; }
        .detail-section { display: flex; flex-direction: column; gap: 8px; }
        .detail-label { font-size: 9px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(140,155,200,0.35); font-family: 'IBM Plex Mono', monospace; }
        .detail-box { padding: 12px 14px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); font-size: 13px; color: #c9d1e8; line-height: 1.6; }
        .detail-meta { font-size: 12px; color: rgba(140,155,200,0.55); font-family: 'IBM Plex Mono', monospace; }
        .note-input { width: 100%; padding: 12px 14px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: #c9d1e8; font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; line-height: 1.6; resize: vertical; min-height: 90px; outline: none; transition: border-color 0.2s ease; }
        .note-input:focus { border-color: rgba(99,102,241,0.4); }
        .note-input::placeholder { color: rgba(140,155,200,0.2); }
        .panel-actions { padding: 20px 24px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; gap: 10px; flex-shrink: 0; }
        .action-row { display: flex; gap: 8px; }
        .action-btn { flex: 1; padding: 12px; border-radius: 8px; border: 1px solid; cursor: pointer; font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .action-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .btn-fix { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.35); color: #10b981; }
        .btn-fix:hover:not(:disabled) { background: rgba(16,185,129,0.2); }
        .btn-reject { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.35); color: #ef4444; }
        .btn-reject:hover:not(:disabled) { background: rgba(239,68,68,0.2); }
        .btn-delete-report { width: 100%; padding: 10px; border-radius: 8px; background: rgba(107,114,128,0.06); border: 1px solid rgba(107,114,128,0.18); color: rgba(140,155,200,0.45); cursor: pointer; font-family: 'IBM Plex Sans', sans-serif; font-size: 11px; font-weight: 500; transition: all 0.2s ease; }
        .btn-delete-report:hover { background: rgba(107,114,128,0.12); color: rgba(140,155,200,0.7); }

        /* Confirm modal */
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

        /* Toast */
        .toast { position: fixed; bottom: 24px; right: 24px; z-index: 100; padding: 12px 20px; background: #0d1120; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; font-size: 13px; color: #c9d1e8; box-shadow: 0 8px 32px rgba(0,0,0,0.4); animation: slideUp 0.3s ease; }
        @keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .spinner { width: 12px; height: 12px; border: 2px solid rgba(248,113,113,0.3); border-top-color: #f87171; border-radius: 50%; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="page">

        {/* ── Topbar ── */}
        <div className="topbar">
          <div className="topbar-left">
            <div className="topbar-icon">⚙️</div>
            <div>
              <div className="topbar-title">Admin Dashboard</div>
              <div className="topbar-sub">quiz app panel</div>
            </div>
          </div>
          <div className="topbar-badges">
            {reportCounts.pending > 0 && (
              <div className="badge badge-amber">{reportCounts.pending} pending reports</div>
            )}
            {deletions.length > 0 && (
              <div className="badge badge-red">{deletions.length} deletion requests</div>
            )}
          </div>
        </div>

        <div className="layout">

          {/* ── Sidebar ── */}
          <div className="sidebar">
            <div className="sidebar-label">Sections</div>

            {/* Question Reports nav */}
            <button
              className={`nav-btn ${activeSection === "reports" ? "active" : ""}`}
              onClick={() => setActiveSection("reports")}
            >
              <span className="nav-btn-icon">🐛</span>
              <span className="nav-btn-text">Question Reports</span>
              {reportCounts.pending > 0 && (
                <span className="nav-badge" style={{ color: "#f59e0b", background: "rgba(245,158,11,0.1)" }}>
                  {reportCounts.pending}
                </span>
              )}
            </button>

            {/* Sub-filters only when reports active */}
            {activeSection === "reports" && (
              <>
                {(["all", "pending", "reviewed", "dismissed"] as const).map((f) => {
                  const meta = f === "all" ? null : STATUS_META[f]
                  return (
                    <button
                      key={f}
                      className={`filter-btn ${filter === f ? "active" : ""}`}
                      onClick={() => setFilter(f)}
                    >
                      <span className="filter-btn-label">{FILTER_LABEL[f]}</span>
                      <span className="filter-num" style={{ color: meta?.color ?? "#c9d1e8", background: meta?.bg ?? "rgba(255,255,255,0.06)" }}>
                        {reportCounts[f]}
                      </span>
                    </button>
                  )
                })}
              </>
            )}

            <div className="sidebar-divider" />

            {/* Account Deletions nav */}
            <button
              className={`nav-btn ${activeSection === "deletions" ? "active" : ""}`}
              onClick={() => setActiveSection("deletions")}
            >
              <span className="nav-btn-icon">🗑</span>
              <span className="nav-btn-text">Account Deletions</span>
              {deletions.length > 0 && (
                <span className="nav-badge" style={{ color: "#ef4444", background: "rgba(239,68,68,0.1)" }}>
                  {deletions.length}
                </span>
              )}
            </button>
          </div>

          {/* ── Main Content ── */}
          <div className="main">

            {/* ═══ REPORTS SECTION ═══ */}
            {activeSection === "reports" && (
              <>
                {reportsLoading ? (
                  <div className="empty">Loading reports...</div>
                ) : filteredReports.length === 0 ? (
                  <div className="empty">No {FILTER_LABEL[filter].toLowerCase()} reports found.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Question</th>
                          <th>Exam</th>
                          <th>Reporter</th>
                          <th>Status</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredReports.map((r) => {
                          const meta = STATUS_META[r.status]
                          return (
                            <tr key={r.id} onClick={() => openDetail(r)}>
                              <td><div className="question-preview">{r.questionText}</div></td>
                              <td>
                                {r.examName
                                  ? <span className="exam-tag">{r.examName}</span>
                                  : <span style={{ color: "rgba(140,155,200,0.2)", fontSize: 12 }}>—</span>}
                              </td>
                              <td><div className="email-cell">{r.reporterEmail}</div></td>
                              <td>
                                <span className="status-pill" style={{ color: meta.color, background: meta.bg }}>
                                  <span className="status-dot" style={{ background: meta.color }} />
                                  {meta.label}
                                </span>
                              </td>
                              <td><div className="date-cell">{formatDate(r.createdAt)}</div></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* ═══ DELETIONS SECTION ═══ */}
            {activeSection === "deletions" && (
              <>
                <div className="search-row">
                  <input
                    className="search-input"
                    placeholder="Search by email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <button className="refresh-btn" onClick={fetchDeletions}>↻ Refresh</button>
                </div>

                {deletionsError && <div className="error-box">⚠ {deletionsError}</div>}

                {deletionsLoading ? (
                  <div className="empty">Loading deletion requests...</div>
                ) : filteredDeletions.length === 0 ? (
                  <div className="empty">{search ? "No results found." : "No deletion requests yet."}</div>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Timestamp</th>
                          <th>Email</th>
                          <th>Registered Email</th>
                          <th>Type</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDeletions.map((r, i) => (
                          <tr key={i} onClick={() => {}}>
                            <td><div className="date-cell">{r.timestamp}</div></td>
                            <td><div className="email-cell">{r.email}</div></td>
                            <td><div className="email-cell">{r.registeredEmail}</div></td>
                            <td><span className="delete-type-badge">🗑 Delete</span></td>
                            <td>
                              <button
                                className="btn-action"
                                onClick={(e) => { e.stopPropagation(); setConfirmEmail(r.registeredEmail) }}
                              >
                                Delete Account
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Report Detail Panel ── */}
      {selected && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
          <div className="detail-panel">
            <div className="panel-header">
              <div className="panel-title">Report Detail</div>
              <button className="panel-close" onClick={() => setSelected(null)}>×</button>
            </div>
            <div className="panel-body">
              <div className="detail-section">
                <div className="detail-label">Question</div>
                <div className="detail-box">{selected.questionText}</div>
              </div>
              {selected.examName && (
                <div className="detail-section">
                  <div className="detail-label">Exam</div>
                  <div className="detail-meta">{selected.examName}</div>
                </div>
              )}
              <div className="detail-section">
                <div className="detail-label">Reporter</div>
                <div className="detail-meta">{selected.reporterEmail}</div>
              </div>
              <div className="detail-section">
                <div className="detail-label">Message</div>
                <div className="detail-box">{selected.message}</div>
              </div>
              <div className="detail-section">
                <div className="detail-label">Reported At</div>
                <div className="detail-meta">{formatDate(selected.createdAt)}</div>
              </div>
              <div className="detail-section">
                <div className="detail-label">Current Status</div>
                <span className="status-pill" style={{ color: STATUS_META[selected.status].color, background: STATUS_META[selected.status].bg, display: "inline-flex" }}>
                  <span className="status-dot" style={{ background: STATUS_META[selected.status].color }} />
                  {STATUS_META[selected.status].label}
                </span>
              </div>
              <div className="detail-section">
                <div className="detail-label">Admin Note (optional)</div>
                <textarea
                  className="note-input"
                  placeholder="Add an internal note..."
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                />
              </div>
            </div>
            <div className="panel-actions">
              <div className="action-row">
                <button className="action-btn btn-fix" disabled={saving || selected.status === "reviewed"} onClick={() => handleReportAction(selected.id, "reviewed")}>
                  ✓ Fix
                </button>
                <button className="action-btn btn-reject" disabled={saving || selected.status === "dismissed"} onClick={() => handleReportAction(selected.id, "dismissed")}>
                  ✕ Reject
                </button>
              </div>
              <button className="btn-delete-report" onClick={() => setDeleteConfirm(selected.id)}>
                🗑 Delete Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Report Confirm ── */}
      {deleteConfirm && (
        <div className="confirm-overlay">
          <div className="confirm-box">
            <div className="confirm-title">Delete Report?</div>
            <div className="confirm-body">This will permanently delete this report from Firestore.</div>
            <div className="confirm-btns" style={{ marginTop: 24 }}>
              <button className="confirm-cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="confirm-delete" onClick={() => handleReportDelete(deleteConfirm)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Account Confirm ── */}
      {confirmEmail && (
        <div className="confirm-overlay">
          <div className="confirm-box">
            <div className="confirm-title">Delete Account?</div>
            <div className="confirm-body">You are about to permanently delete all data for:</div>
            <div className="confirm-email">{confirmEmail}</div>
            <div className="confirm-warning">⚠ This will delete the user from Firebase Auth and remove all their scores, reports, and user data from Firestore. This cannot be undone.</div>
            <div className="confirm-btns">
              <button className="confirm-cancel" onClick={() => setConfirmEmail(null)} disabled={deleting}>Cancel</button>
              <button className="confirm-delete" disabled={deleting} onClick={() => handleDeleteAccount(confirmEmail)}>
                {deleting ? <><div className="spinner" /> Deleting...</> : "🗑 Delete Everything"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  )
}