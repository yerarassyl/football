"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole, Trophy } from "lucide-react";
import Link from "next/link";

export default function AdminLogin() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error || "Не удалось войти. Проверьте данные и повторите попытку");
        return;
      }
      window.location.href = "/admin";
    } catch {
      setError("Нет связи с сервером. Проверьте подключение и повторите попытку");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <Link className="brand login-brand" href="/">
        <span className="brand-mark"><Trophy size={18} /></span> Air Arena
      </Link>
      <form className="login-card" onSubmit={submit}>
        <div className="login-icon"><LockKeyhole size={23} /></div>
        <div className="section-kicker">Панель управления</div>
        <h1>Вход для администратора</h1>
        <p>Введите данные доступа, чтобы управлять заявками и бронями.</p>
        <div className="form-field">
          <label htmlFor="login">Логин</label>
          <input id="login" value={login} onChange={(event) => setLogin(event.target.value)} autoComplete="username" required />
        </div>
        <div className="form-field">
          <label htmlFor="password">Пароль</label>
          <input id="password" value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
        </div>
        {error && <div className="form-error" role="alert" aria-live="polite">{error}</div>}
        <button className="primary-button" disabled={loading} type="submit">
          {loading ? "Проверяем..." : "Войти"} <ArrowRight size={16} />
        </button>
      </form>
    </main>
  );
}
