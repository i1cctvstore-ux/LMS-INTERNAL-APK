'use client';

import { useSearchParams } from 'next/navigation';

export default function CallbackPage() {
  const searchParams = useSearchParams();
  const authCode = searchParams.get('code');

  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h2>Otorisasi Accurate Berhasil!</h2>
      <p>Berikut adalah <strong>Authorization Code</strong> Anda. Salin kode di bawah ini untuk diproses di Postman:</p>
      
      {authCode ? (
        <div style={{ background: '#f4f4f4', padding: '15px', borderRadius: '5px', wordBreak: 'break-all', marginTop: '15px' }}>
          <code>{authCode}</code>
        </div>
      ) : (
        <p style={{ color: 'red' }}>Parameter code tidak ditemukan di URL. Pastikan Anda masuk lewat link otorisasi Accurate.</p>
      )}
    </main>
  );
}
