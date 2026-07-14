import Link from "next/link";

export default function NotFound() {
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="section-kicker">Ошибка 404</div>
        <h1>Страница не найдена</h1>
        <p>Адрес мог измениться или страница больше не существует.</p>
        <Link className="primary-button" href="/">Вернуться на главную</Link>
      </section>
    </main>
  );
}
