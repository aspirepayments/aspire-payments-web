'use client';
import { useState } from 'react';

export default function SignInPage() {
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const next = new URLSearchParams(window.location.search).get('next') || '/';
    const res = await fetch('/api/auth/staging', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      window.location.href = next;
    } else {
      const t = await res.text().catch(()=>'');
      setMsg(t || 'Invalid password');
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-[#F7F9FC]">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold mb-3">Staging sign-in</h1>
        <label className="block text-sm">
          <span className="text-neutral-600">Password</span>
          <input
            type="password"
            className="input mt-1"
            autoFocus
            value={password}
            onChange={(e)=>setPassword(e.target.value)}
            placeholder="Enter staging password"
          />
        </label>
        {msg && <div className="mt-2 text-sm text-red-600">{msg}</div>}
        <div className="mt-4 flex justify-end">
          <button className="btn btn-primary" type="submit">Enter</button>
        </div>
      </form>
    </div>
  );
}