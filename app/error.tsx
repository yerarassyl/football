"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <main className="login-page">
      <section className="login-card" role="alert">
        <div className="section-kicker">Ошибка</div>
        <h1>Не удалось загрузить страницу</h1>
        <p>Повторите запрос. Если ошибка сохраняется, вернитесь позже.</p>
        <button className="primary-button" onClick={reset} type="button">Повторить</button>
      </section>
    </main>
  );
}
