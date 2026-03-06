"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { signInWithEmailAndPassword } from "firebase/auth"
import { auth, ADMIN_EMAILS } from "@/lib/auth"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleLogin = async () => {
    setError("")
    setLoading(true)

    try {
      const result = await signInWithEmailAndPassword(auth, email.trim(), password)
      const userEmail = result.user.email ?? ""

      if (!ADMIN_EMAILS.includes(userEmail)) {
        setError("You are not authorized as admin")
        setLoading(false)
        return
      }

      router.push("/forms")
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("Login failed")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleLogin()
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Montserrat:wght@300;400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #0a0a0a;
        }

        .login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0a0a0a;
          background-image:
            radial-gradient(ellipse 80% 60% at 50% -10%, rgba(180,150,90,0.08) 0%, transparent 70%),
            radial-gradient(ellipse 40% 40% at 80% 80%, rgba(120,100,60,0.05) 0%, transparent 60%);
          font-family: 'Montserrat', sans-serif;
          overflow: hidden;
          position: relative;
        }

        .grid-overlay {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(180,150,90,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(180,150,90,0.04) 1px, transparent 1px);
          background-size: 60px 60px;
          pointer-events: none;
        }

        .card {
          position: relative;
          width: 420px;
          padding: 56px 48px 48px;
          background: rgba(14, 14, 14, 0.95);
          border: 1px solid rgba(180, 150, 90, 0.18);
          border-top: 1px solid rgba(180, 150, 90, 0.35);
          box-shadow:
            0 0 0 1px rgba(0,0,0,0.5),
            0 32px 80px rgba(0,0,0,0.7),
            0 0 60px rgba(180,150,90,0.04) inset;
          opacity: ${mounted ? 1 : 0};
          transform: ${mounted ? "translateY(0)" : "translateY(16px)"};
          transition: opacity 0.7s ease, transform 0.7s ease;
        }

        .card::before {
          content: '';
          position: absolute;
          top: 0; left: 48px; right: 48px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(200,170,100,0.6), transparent);
        }

        .eyebrow {
          font-family: 'Montserrat', sans-serif;
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: rgba(180,150,90,0.6);
          margin-bottom: 12px;
        }

        .title {
          font-family: 'Cormorant Garamond', serif;
          font-size: 38px;
          font-weight: 300;
          color: #e8dcc8;
          letter-spacing: 0.02em;
          line-height: 1.1;
          margin-bottom: 40px;
        }

        .title em {
          font-style: italic;
          color: rgba(200,170,100,0.85);
        }

        .field {
          position: relative;
          margin-bottom: 20px;
        }

        .field label {
          display: block;
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: rgba(180,150,90,0.5);
          margin-bottom: 8px;
        }

        .field input {
          width: 100%;
          padding: 14px 16px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(180,150,90,0.12);
          border-bottom-color: rgba(180,150,90,0.25);
          border-radius: 2px;
          color: #e8dcc8;
          font-family: 'Montserrat', sans-serif;
          font-size: 13px;
          font-weight: 300;
          letter-spacing: 0.05em;
          outline: none;
          transition: border-color 0.25s ease, background 0.25s ease, box-shadow 0.25s ease;
        }

        .field input::placeholder {
          color: rgba(180,150,90,0.2);
        }

        .field input:focus {
          border-color: rgba(180,150,90,0.45);
          background: rgba(255,255,255,0.05);
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }

        .error-msg {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 16px 0;
          padding: 12px 14px;
          background: rgba(180,50,50,0.08);
          border: 1px solid rgba(180,50,50,0.2);
          border-radius: 2px;
          color: rgba(220,130,120,0.9);
          font-size: 11px;
          font-weight: 400;
          letter-spacing: 0.03em;
          line-height: 1.5;
        }

        .error-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: rgba(220,130,120,0.8);
          flex-shrink: 0;
        }

        .submit-btn {
          position: relative;
          width: 100%;
          margin-top: 28px;
          padding: 15px 24px;
          background: transparent;
          border: 1px solid rgba(180,150,90,0.4);
          border-radius: 2px;
          color: #c8a96e;
          font-family: 'Montserrat', sans-serif;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          cursor: pointer;
          overflow: hidden;
          transition: color 0.3s ease, border-color 0.3s ease;
        }

        .submit-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(180,150,90,0.12), rgba(200,170,100,0.06));
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .submit-btn:hover:not(:disabled)::before {
          opacity: 1;
        }

        .submit-btn:hover:not(:disabled) {
          color: #e8d4a0;
          border-color: rgba(200,170,100,0.7);
        }

        .submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-inner {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .spinner {
          width: 12px;
          height: 12px;
          border: 1px solid rgba(200,170,100,0.3);
          border-top-color: rgba(200,170,100,0.8);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .divider {
          display: flex;
          align-items: center;
          gap: 16px;
          margin: 36px 0 0;
        }

        .divider-line {
          flex: 1;
          height: 1px;
          background: rgba(180,150,90,0.1);
        }

        .divider-mark {
          font-size: 8px;
          letter-spacing: 0.2em;
          color: rgba(180,150,90,0.25);
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
        }
      `}</style>

      <div className="login-root">
        <div className="grid-overlay" />

        <div className="card">
          <p className="eyebrow">Restricted Access</p>
          <h1 className="title">
            Admin<br /><em>Portal</em>
          </h1>

          <div className="field">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="email"
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="error-msg" role="alert">
              <div className="error-dot" />
              {error}
            </div>
          )}

          <button
            className="submit-btn"
            onClick={handleLogin}
            disabled={loading}
          >
            <span className="btn-inner">
              {loading && <span className="spinner" />}
              {loading ? "Authenticating" : "Sign In"}
            </span>
          </button>

          <div className="divider">
            <div className="divider-line" />
            <span className="divider-mark">secured</span>
            <div className="divider-line" />
          </div>
        </div>
      </div>
    </>
  )
}