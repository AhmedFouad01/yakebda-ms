import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <section dir="rtl" aria-labelledby="not-found-title">
      <div className="page-head">
        <h1 id="not-found-title">الصفحة غير موجودة</h1>
      </div>
      <div className="panel">
        <div className="empty">
          <p>الرابط الذي فتحته غير صالح أو تم نقل الصفحة.</p>
          <Link className="btn" to="/">العودة إلى لوحة التحكم</Link>
        </div>
      </div>
    </section>
  );
}
