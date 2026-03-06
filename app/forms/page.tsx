"use client"

import { useState, useEffect } from "react"

interface DeletionRequest {
  timestamp: string
  email: string
  registeredEmail: string
  confirmation: string
}

const SHEET_ID = "1PBIRKOFzfsLbmMBen4OaPuN3-juh9PeLfcixLiWTzk4"
const SHEET_NAME = "Form responses 1"

export default function FormsPage() {
  const [requests, setRequests] = useState<DeletionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")

  const fetchData = async () => {
    setLoading(true)
    setError("")
    try {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_SHEETS_API_KEY
      const range = encodeURIComponent(`${SHEET_NAME}!A2:D1000`)
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${apiKey}`

      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)

      const data = await res.json()
      const rows = data.values ?? []

      const parsed: DeletionRequest[] = rows.map((row: string[]) => ({
        timestamp:       row[0] ?? "—",
        email:           row[1] ?? "—",
        registeredEmail: row[2] ?? "—",
        confirmation:    row[3] ?? "—",
      }))

      setRequests(parsed)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const filtered = requests.filter(r =>
    r.email.toLowerCase().includes(search.toLowerCase()) ||
    r.registeredEmail.toLowerCase().includes(search.toLowerCase())
  )

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
          background: rgba(239,68,68,0.15);
          border: 1px solid rgba(239,68,68,0.25);
          display: flex; align-items: center; justify-content: center;
          font-size: 15px;
        }

        .topbar-title { font-size: 15px; font-weight: 600; color: #e2e8f8; letter-spacing: -0.01em; }
        .topbar-sub { font-size: 11px; color: rgba(140,155,200,0.5); font-family: 'IBM Plex Mono', monospace; letter-spacing: 0.05em; }

        .badge-count {
          padding: 3px 10px;
          background: rgba(239,68,68,0.12);
          border: 1px solid rgba(239,68,68,0.2);
          border-radius: 20px;
          font-size: 11px; font-weight: 500; color: #ef4444;
          font-family: 'IBM Plex Mono', monospace;
        }

        .topbar-right { display: flex; align-items: center; gap: 10px; }

        .search-input {
          padding: 8px 14px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          color: #c9d1e8;
          font-family: 'IBM Plex Sans', sans-serif;
          font-size: 12px;
          outline: none;
          width: 220px;
          transition: border-color 0.2s;
        }
        .search-input:focus { border-color: rgba(99,102,241,0.4); }
        .search-input::placeholder { color: rgba(140,155,200,0.3); }

        .refresh-btn {
          padding: 8px 14px; border-radius: 8px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          color: rgba(140,155,200,0.7);
          font-family: 'IBM Plex Sans', sans-serif;
          font-size: 12px; cursor: pointer;
          transition: all 0.2s ease;
        }
        .refresh-btn:hover { background: rgba(255,255,255,0.08); color: #e2e8f8; }

        .main { padding: 28px 32px; }

        .table-wrap {
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px; overflow: hidden;
          background: rgba(255,255,255,0.015);
        }

        .table { width: 100%; border-collapse: collapse; }
        .table thead tr { border-bottom: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); }
        .table th { padding: 12px 16px; text-align: left; font-size: 9px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(140,155,200,0.4); font-family: 'IBM Plex Mono', monospace; }
        .table tbody tr { border-bottom: 1px solid rgba(255,255,255,0.03); transition: background 0.15s ease; }
        .table tbody tr:last-child { border-bottom: none; }
        .table tbody tr:hover { background: rgba(255,255,255,0.03); }
        .table td { padding: 14px 16px; font-size: 13px; vertical-align: middle; }

        .email-cell { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: rgba(140,155,200,0.8); }
        .date-cell { font-size: 11px; color: rgba(140,155,200,0.4); font-family: 'IBM Plex Mono', monospace; white-space: nowrap; }
        .confirm-cell { font-size: 11px; color: rgba(140,155,200,0.5); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .delete-badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 10px; border-radius: 20px;
          font-size: 10px; font-weight: 600;
          font-family: 'IBM Plex Mono', monospace;
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.2);
          color: #ef4444;
        }

        .empty { padding: 80px 20px; text-align: center; color: rgba(140,155,200,0.3); font-size: 13px; }

        .error-box {
          margin: 28px 32px; padding: 16px 20px;
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.2);
          border-radius: 10px;
          color: #f87171; font-size: 13px;
        }
      `}</style>

      <div className="page">
        <div className="topbar">
          <div className="topbar-left">
            <div className="topbar-icon">🗑</div>
            <div>
              <div className="topbar-title">Account Deletion Requests</div>
              <div className="topbar-sub">google form responses</div>
            </div>
          </div>
          <div className="topbar-right">
            {!loading && requests.length > 0 && (
              <div className="badge-count">{requests.length} requests</div>
            )}
            <input
              className="search-input"
              placeholder="Search by email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="refresh-btn" onClick={fetchData}>↻ Refresh</button>
          </div>
        </div>

        {error ? (
          <div className="error-box">⚠ {error} — Make sure the Google Sheet is set to public and the API key is correct.</div>
        ) : (
          <div className="main">
            {loading ? (
              <div className="empty">Loading requests...</div>
            ) : filtered.length === 0 ? (
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
                      <th>Confirmation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, i) => (
                      <tr key={i}>
                        <td><div className="date-cell">{r.timestamp}</div></td>
                        <td><div className="email-cell">{r.email}</div></td>
                        <td><div className="email-cell">{r.registeredEmail}</div></td>
                        <td>
                          <span className="delete-badge">🗑 Delete</span>
                        </td>
                        <td><div className="confirm-cell" title={r.confirmation}>{r.confirmation}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}