"use client"

import { db } from "@/lib/auth"
import { useState, useEffect } from "react"
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore"

type ReportStatus = "pending" | "reviewed" | "dismissed"

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

const STATUS_META: Record<ReportStatus, { label: string; color: string; bg: string }> = {
  pending:   { label: "Pending",  color: "#f59e0b", bg: "rgba(245,158,11,0.1)"  },
  reviewed:  { label: "Fixed",    color: "#10b981", bg: "rgba(16,185,129,0.1)"  },
  dismissed: { label: "Rejected", color: "#ef4444", bg: "rgba(239,68,68,0.1)"   },
}

const FILTER_LABEL: Record<ReportStatus | "all", string> = {
  all:       "All",
  pending:   "Pending",
  reviewed:  "Fixed",
  dismissed: "Rejected",
}

function formatDate(ts: Timestamp) {
  return ts?.toDate().toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }) ?? "—"
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ReportStatus | "all">("all")
  const [selected, setSelected] = useState<Report | null>(null)
  const [adminNote, setAdminNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  useEffect(() => {
    const q = query(collection(db, "question_reports"), orderBy("createdAt", "desc"))
    const unsub = onSnapshot(q, (snap) => {
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as Report)))
      setLoading(false)
    })
    return unsub
  }, [])

  const filtered = filter === "all" ? reports : reports.filter(r => r.status === filter)

  const counts = {
    all:       reports.length,
    pending:   reports.filter(r => r.status === "pending").length,
    reviewed:  reports.filter(r => r.status === "reviewed").length,
    dismissed: reports.filter(r => r.status === "dismissed").length,
  }

  const openDetail = (r: Report) => {
    setSelected(r)
    setAdminNote(r.adminNote ?? "")
  }

  // Auto-deletes report from Firestore after Fix or Reject
  const handleAction = async (id: string, status: ReportStatus) => {
    setSaving(true)
    await updateDoc(doc(db, "question_reports", id), { status, adminNote })
    await deleteDoc(doc(db, "question_reports", id))
    setSaving(false)
    setSelected(null)
  }

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, "question_reports", id))
    setDeleteConfirm(null)
    setSelected(null)
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body { background: #080b12; }

        .page {
          min-height: 100vh;
          background: #080b12;
          font-family: 'IBM Plex Sans', sans-serif;
          color: #c9d1e8;
          animation: fadeIn 0.4s ease;
        }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 32px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          background: rgba(8,11,18,0.95);
          position: sticky; top: 0; z-index: 10;
          backdrop-filter: blur(12px);
        }

        .topbar-left { display: flex; align-items: center; gap: 12px; }

        .topbar-icon {
          width: 32px; height: 32px; border-radius: 8px;
          background: rgba(239,83,80,0.15);
          border: 1px solid rgba(239,83,80,0.25);
          display: flex; align-items: center; justify-content: center;
          font-size: 15px;
        }

        .topbar-title { font-size: 15px; font-weight: 600; color: #e2e8f8; letter-spacing: -0.01em; }
        .topbar-sub { font-size: 11px; color: rgba(140,155,200,0.5); font-family: 'IBM Plex Mono', monospace; letter-spacing: 0.05em; }

        .badge-count {
          padding: 3px 10px;
          background: rgba(239,83,80,0.12);
          border: 1px solid rgba(239,83,80,0.2);
          border-radius: 20px;
          font-size: 11px; font-weight: 500; color: #ef5350;
          font-family: 'IBM Plex Mono', monospace;
        }

        .layout { display: flex; min-height: calc(100vh - 61px); }

        .sidebar {
          width: 200px; flex-shrink: 0;
          border-right: 1px solid rgba(255,255,255,0.04);
          padding: 24px 16px;
          display: flex; flex-direction: column; gap: 4px;
        }

        .sidebar-label {
          font-size: 9px; font-weight: 500; letter-spacing: 0.2em;
          text-transform: uppercase; color: rgba(140,155,200,0.35);
          padding: 0 8px; margin-bottom: 8px; margin-top: 4px;
        }

        .filter-btn {
          display: flex; align-items: center; justify-content: space-between;
          padding: 9px 12px; border-radius: 8px; border: none;
          background: transparent; cursor: pointer; width: 100%;
          transition: background 0.15s ease;
          font-family: 'IBM Plex Sans', sans-serif;
        }

        .filter-btn:hover { background: rgba(255,255,255,0.04); }
        .filter-btn.active { background: rgba(255,255,255,0.07); }
        .filter-btn-label { font-size: 13px; font-weight: 400; }
        .filter-btn.active .filter-btn-label { font-weight: 500; color: #e2e8f8; }
        .filter-btn:not(.active) .filter-btn-label { color: rgba(140,155,200,0.6); }
        .filter-num { font-size: 11px; font-family: 'IBM Plex Mono', monospace; padding: 1px 7px; border-radius: 10px; }

        .main { flex: 1; padding: 24px 28px; overflow-y: auto; }

        .table-wrap {
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px; overflow: hidden;
          background: rgba(255,255,255,0.015);
        }

        .table { width: 100%; border-collapse: collapse; }
        .table thead tr { border-bottom: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); }
        .table th { padding: 12px 16px; text-align: left; font-size: 9px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(140,155,200,0.4); font-family: 'IBM Plex Mono', monospace; }
        .table tbody tr { border-bottom: 1px solid rgba(255,255,255,0.03); cursor: pointer; transition: background 0.15s ease; }
        .table tbody tr:last-child { border-bottom: none; }
        .table tbody tr:hover { background: rgba(255,255,255,0.03); }
        .table td { padding: 14px 16px; font-size: 13px; vertical-align: middle; }

        .question-preview { max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #c9d1e8; }
        .exam-tag { display: inline-block; padding: 2px 8px; background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2); border-radius: 4px; font-size: 10px; color: rgba(129,140,248,0.8); font-family: 'IBM Plex Mono', monospace; }
        .status-pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; }
        .status-dot { width: 5px; height: 5px; border-radius: 50%; }
        .reporter-email { font-size: 12px; color: rgba(140,155,200,0.55); font-family: 'IBM Plex Mono', monospace; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .date-cell { font-size: 11px; color: rgba(140,155,200,0.4); font-family: 'IBM Plex Mono', monospace; white-space: nowrap; }
        .empty { padding: 80px 20px; text-align: center; color: rgba(140,155,200,0.3); font-size: 13px; }

        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 40; display: flex; align-items: flex-end; justify-content: flex-end; }

        .detail-panel {
          width: 480px; height: 100vh;
          background: #0d1120;
          border-left: 1px solid rgba(255,255,255,0.07);
          display: flex; flex-direction: column;
          animation: slideIn 0.25s ease;
        }

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
        .btn-fix:hover:not(:disabled) { background: rgba(16,185,129,0.2); border-color: rgba(16,185,129,0.6); box-shadow: 0 0 12px rgba(16,185,129,0.15); }

        .btn-reject { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.35); color: #ef4444; }
        .btn-reject:hover:not(:disabled) { background: rgba(239,68,68,0.2); border-color: rgba(239,68,68,0.6); box-shadow: 0 0 12px rgba(239,68,68,0.15); }

        .btn-delete { width: 100%; padding: 10px; border-radius: 8px; background: rgba(107,114,128,0.06); border: 1px solid rgba(107,114,128,0.18); color: rgba(140,155,200,0.45); cursor: pointer; font-family: 'IBM Plex Sans', sans-serif; font-size: 11px; font-weight: 500; transition: all 0.2s ease; }
        .btn-delete:hover { background: rgba(107,114,128,0.12); color: rgba(140,155,200,0.7); }

        .confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 60; display: flex; align-items: center; justify-content: center; }
        .confirm-box { background: #0d1120; border: 1px solid rgba(239,68,68,0.25); border-radius: 14px; padding: 28px; max-width: 360px; width: 90%; }
        .confirm-title { font-size: 15px; font-weight: 600; color: #f87171; margin-bottom: 10px; }
        .confirm-body { font-size: 13px; color: rgba(140,155,200,0.6); line-height: 1.6; margin-bottom: 24px; }
        .confirm-btns { display: flex; gap: 10px; }
        .confirm-cancel { flex: 1; padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); color: rgba(140,155,200,0.7); cursor: pointer; font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; }
        .confirm-delete { flex: 1; padding: 10px; border-radius: 8px; background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); color: #f87171; cursor: pointer; font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; font-weight: 500; }
      `}</style>

      <div className="page">
        <div className="topbar">
          <div className="topbar-left">
            <div className="topbar-icon">🐛</div>
            <div>
              <div className="topbar-title">Question Reports</div>
              <div className="topbar-sub">admin panel</div>
            </div>
          </div>
          {counts.pending > 0 && (
            <div className="badge-count">{counts.pending} pending</div>
          )}
        </div>

        <div className="layout">
          <div className="sidebar">
            <div className="sidebar-label">Filter</div>
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
                    {counts[f]}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="main">
            {loading ? (
              <div className="empty">Loading reports...</div>
            ) : filtered.length === 0 ? (
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
                    {filtered.map((r) => {
                      const meta = STATUS_META[r.status]
                      return (
                        <tr key={r.id} onClick={() => openDetail(r)}>
                          <td><div className="question-preview">{r.questionText}</div></td>
                          <td>
                            {r.examName
                              ? <span className="exam-tag">{r.examName}</span>
                              : <span style={{ color: "rgba(140,155,200,0.2)", fontSize: 12 }}>—</span>}
                          </td>
                          <td><div className="reporter-email">{r.reporterEmail}</div></td>
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
          </div>
        </div>

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
                    placeholder="Add an internal note about this report..."
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                  />
                </div>
              </div>
              <div className="panel-actions">
                <div className="action-row">
                  <button
                    className="action-btn btn-fix"
                    disabled={saving || selected.status === "reviewed"}
                    onClick={() => handleAction(selected.id, "reviewed")}
                  >
                    ✓ Fix
                  </button>
                  <button
                    className="action-btn btn-reject"
                    disabled={saving || selected.status === "dismissed"}
                    onClick={() => handleAction(selected.id, "dismissed")}
                  >
                    ✕ Reject
                  </button>
                </div>
                <button className="btn-delete" onClick={() => setDeleteConfirm(selected.id)}>
                  🗑 Delete Report
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteConfirm && (
          <div className="confirm-overlay">
            <div className="confirm-box">
              <div className="confirm-title">Delete Report?</div>
              <div className="confirm-body">
                This will permanently delete this report from Firestore. This action cannot be undone.
              </div>
              <div className="confirm-btns">
                <button className="confirm-cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                <button className="confirm-delete" onClick={() => handleDelete(deleteConfirm)}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}