import React, { useState } from 'react';

export const AdminConsole = () => {
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [feedbackEntries, setFeedbackEntries] = useState([]);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [status, setStatus] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [adminStats, setAdminStats] = useState(null);
  const [isAdminStatsLoading, setIsAdminStatsLoading] = useState(false);

  const loadAdminStats = async (adminToken) => {
    setIsAdminStatsLoading(true);
    try {
      const response = await fetch('/api/admin/stats', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const result = await response.json();
      if (response.status === 401) setToken('');
      if (!response.ok) return;
      setAdminStats(result);
    } catch {
      // ignore
    } finally {
      setIsAdminStatsLoading(false);
    }
  };

  const loadFeedback = async (adminToken) => {
    setIsFeedbackLoading(true);
    setFeedbackError('');
    try {
      const response = await fetch('/api/admin/feedback', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const result = await response.json();
      if (response.status === 401) setToken('');
      if (!response.ok) throw new Error(result.error || 'Không thể tải góp ý.');
      setFeedbackEntries(result.feedback);
    } catch (error) {
      setFeedbackError(error.message || 'Không thể kết nối tới server.');
    } finally {
      setIsFeedbackLoading(false);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Không thể đăng nhập admin.');

      setToken(result.token);
      setPassword('');
      setStatus({ type: 'success', message: 'Đã đăng nhập. Phiên admin hết hạn sau 8 giờ.' });
      await Promise.all([loadFeedback(result.token), loadAdminStats(result.token)]);
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Không thể kết nối tới server.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendAnnouncement = async (event) => {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage || !token) return;

    setIsSubmitting(true);
    setStatus(null);
    try {
      const response = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ message: trimmedMessage })
      });
      const result = await response.json();
      if (response.status === 401) setToken('');
      if (!response.ok) throw new Error(result.error || 'Không thể gửi thông báo.');

      setMessage('');
      setStatus({
        type: 'success',
        message: `Đã gửi thông báo tới ${result.recipientCount} người đang online.`
      });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Không thể kết nối tới server.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/admin/session', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok && response.status !== 401) {
        const result = await response.json();
        throw new Error(result.error || 'Không thể thu hồi phiên admin.');
      }
      setToken('');
      setStatus({ type: 'success', message: 'Đã đăng xuất admin.' });
    } catch (error) {
      setToken('');
      setStatus({
        type: 'error',
        message: `Đã xóa phiên trên trình duyệt nhưng chưa xác nhận thu hồi trên server: ${
          error.message || 'Lỗi kết nối.'
        }`
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-[#08090b] px-4 py-8 text-zinc-100">
      <section className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#111216] p-5 sm:p-7 shadow-2xl">
        <a href="/" className="text-xs text-zinc-400 transition-colors hover:text-zinc-100">
          ← Quay lại phòng chat
        </a>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-zinc-100">Admin Console</h1>
        <p className="mt-2 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3.5 py-2.5 text-xs leading-relaxed text-amber-200/90">
          Admin chỉ có thể gửi thông báo hệ thống và xem các góp ý người dùng chủ động gửi. Admin không thể xem nội dung cuộc trò chuyện riêng tư.
        </p>

        {!token ? (
          <form onSubmit={handleLogin} className="mt-6 space-y-3.5">
            <label htmlFor="admin-password" className="block text-xs font-medium text-zinc-400">
              Mật khẩu quản trị
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              disabled={isSubmitting}
              className="w-full rounded-xl border border-zinc-700/80 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-zinc-500 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!password || isSubmitting}
              className="w-full rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSubmitting ? 'Đang xác thực…' : 'Đăng nhập'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSendAnnouncement} className="mt-6 space-y-3.5">
            <label htmlFor="admin-announcement" className="block text-xs font-medium text-zinc-400">
              Phát thông báo hệ thống
            </label>
            <textarea
              id="admin-announcement"
              value={message}
              onChange={(event) => setMessage(event.target.value.slice(0, 1000))}
              maxLength={1000}
              rows={5}
              required
              disabled={isSubmitting}
              placeholder="Nhập thông báo sẽ gửi tới toàn bộ người dùng đang online…"
              className="w-full resize-y rounded-xl border border-zinc-700/80 bg-zinc-950 px-3.5 py-2.5 text-sm leading-relaxed text-zinc-100 outline-none transition-colors focus:border-zinc-500 disabled:opacity-60"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-500">{message.length}/1000 ký tự</p>
              <button
                type="submit"
                disabled={!message.trim() || isSubmitting}
                className="rounded-xl bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSubmitting ? 'Đang gửi…' : 'Gửi thông báo'}
              </button>
            </div>
          </form>
        )}

        {token && (
          <section className="mt-8 border-t border-zinc-800 pt-6" aria-labelledby="admin-stats-title">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="admin-stats-title" className="text-sm font-medium text-zinc-100">
                  Thống kê hệ thống
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">Chỉ hiển thị với phiên quản trị hợp lệ</p>
              </div>
              <button
                type="button"
                onClick={() => loadAdminStats(token)}
                disabled={isAdminStatsLoading}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
              >
                {isAdminStatsLoading ? 'Đang tải…' : 'Làm mới'}
              </button>
            </div>
            {adminStats && (
              <div className="mt-4 grid grid-cols-3 gap-2.5">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">Trực tuyến</p>
                  <p className="mt-1 text-xl font-semibold text-emerald-400">{adminStats.onlineCount ?? 0}</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">Phiên chat</p>
                  <p className="mt-1 text-xl font-semibold text-sky-400">{adminStats.activePairs ?? 0}</p>
                  <p className="mt-0.5 text-[9px] text-zinc-500">{(adminStats.activePairs ?? 0) * 2} người</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">Hàng đợi</p>
                  <p className="mt-1 text-xl font-semibold text-amber-400">{adminStats.waitingUsers ?? 0}</p>
                  <p className="mt-0.5 text-[9px] text-zinc-500">đang chờ ghép</p>
                </div>
              </div>
            )}
          </section>
        )}

        {token && (
          <section className="mt-8 border-t border-zinc-800 pt-6" aria-labelledby="admin-feedback-title">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="admin-feedback-title" className="text-sm font-medium text-zinc-100">
                  Góp ý từ người dùng
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">Tối đa 100 góp ý gần nhất</p>
              </div>
              <button
                type="button"
                onClick={() => loadFeedback(token)}
                disabled={isFeedbackLoading}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
              >
                {isFeedbackLoading ? 'Đang tải…' : 'Làm mới'}
              </button>
            </div>
            {feedbackError && (
              <p className="mt-3 text-xs text-rose-300" role="alert">{feedbackError}</p>
            )}
            {!feedbackError && !isFeedbackLoading && feedbackEntries.length === 0 && (
              <p className="mt-4 text-xs text-zinc-500">Chưa có góp ý nào.</p>
            )}
            {feedbackEntries.length > 0 && (
              <ol className="mt-4 max-h-96 space-y-3 overflow-y-auto pr-1">
                {feedbackEntries.map((entry, index) => (
                  <li
                    key={`${entry.timestamp}-${index}`}
                    className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium text-zinc-200">
                        {entry.username || 'Ẩn danh'}
                      </p>
                      <time className="text-[10px] text-zinc-500" dateTime={entry.timestamp}>
                        {new Date(entry.timestamp).toLocaleString()}
                      </time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-400">
                      {entry.feedback}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {status && (
          <p
            className={`mt-4 text-xs ${status.type === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}
            role={status.type === 'error' ? 'alert' : 'status'}
          >
            {status.message}
          </p>
        )}

        {token && (
          <button
            type="button"
            onClick={handleLogout}
            disabled={isSubmitting}
            className="mt-6 text-xs text-zinc-500 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-300 disabled:opacity-50"
          >
            Đăng xuất admin
          </button>
        )}
      </section>
    </main>
  );
};

export default AdminConsole;
