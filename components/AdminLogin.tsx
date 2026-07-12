"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole, Trophy } from "lucide-react";

export default function AdminLogin() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, password }),
    });
    setLoading(false);
    if (!response.ok) {
      setError("Неверный логин или пароль");
      return;
    }
    window.location.href = "/admin";
  }

  return (
    <main className="login-page">
      <a className="brand login-brand" href="/">
        <span className="brand-mark"><Trophy size={18} /></span> Air Arena
      </a>
      <form className="login-card" onSubmit={submit}>
        <div className="login-icon"><LockKeyhole size={23} /></div>
        <div className="section-kicker">Панель управления</div>
        <h1>Вход для администратора</h1>
        <p>Введите данные доступа, чтобы управлять заявками и бронями.</p>
        <div className="form-field">
          <label htmlFor="login">Логин</label>
          <input id="login" value={login} onChange={(event) => setLogin(event.target.value)} autoComplete="username" />
        </div>
        <div className="form-field">
          <label htmlFor="password">Пароль</label>
          <input id="password" value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" />
        </div>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button" disabled={loading} type="submit">
          {loading ? "Проверяем..." : "Войти"} <ArrowRight size={16} />
        </button>
      </form>
    </main>
  );
}
