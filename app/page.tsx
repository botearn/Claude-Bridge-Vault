"use client";
import React, { useState } from 'react';
import { Shield, Share2, Zap, Database } from 'lucide-react';

export default function VaultAdmin() {
  const [track, setTrack] = useState('private');
  const [result, setResult] = useState<{key:string, url: string} | null>(null);

  const generate = () => {
    const mockKey = `sk-vault-${track}-${Math.random().toString(36).substring(7)}`;
    const mockUrl = `${window.location.origin}/api/v1/${track}`;
    setResult({ key: mockKey, url: mockUrl });
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center gap-3 mb-12">
          <div className="p-2 bg-cyan-500 rounded-lg"><Shield className="text-white" size={24}/></div>
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">Claude Bridge Vault 💎</h1>
            <p className="text-slate-500 text-sm">Nicole API Refinery & Bank</p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 shadow-2xl">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2"><Zap className="text-yellow-400" size={18}/> 炼制新密钥</h2>
            <div className="space-y-6">
              <div>
                <label className="text-xs uppercase text-slate-500 font-bold mb-2 block">选择分发轨道</label>
                <div className="flex gap-2">
                  {['botearn', 'private'].map(t => (
                    <button 
                      key={t}
                      onClick={() => setTrack(t)}
                      className={`flex-1 py-3 px-4 rounded-xl border transition-all ${track === t ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.15)]' : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                    >
                      {t === 'botearn' ? 'Track A: BotEarn' : 'Track B: Private'}
                    </button>
                  ))}
                </div>
              </div>
              <button 
                onClick={generate}
                className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-[0.98]"
              >
                生成分发凭证
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 flex-1">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Database className="text-blue-400" size={18}/> 资产状态</h2>
              <div className="space-y-3">
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex justify-between items-center text-sm">
                  <span className="text-slate-500">Master Claude Key</span>
                  <span className="text-green-500 font-mono">● Active</span>
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex justify-between items-center text-sm">
                  <span className="text-slate-500">BotEarn Keys</span>
                  <span className="text-slate-300">0 Issued</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {result && (
          <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-gradient-to-b from-slate-800 to-slate-900 p-1 rounded-2xl">
              <div className="bg-[#020617] p-6 rounded-[14px]">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">分发就绪</span>
                  <Share2 className="text-slate-500" size={16}/>
                </div>
                <div className="grid gap-4">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Sub-Key</p>
                    <code className="block bg-slate-950 p-3 rounded-lg border border-slate-800 text-cyan-300 font-mono text-sm break-all select-all hover:bg-slate-900 transition-colors cursor-pointer">{result.key}</code>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Base URL (API Endpoint)</p>
                    <code className="block bg-slate-950 p-3 rounded-lg border border-slate-800 text-blue-300 font-mono text-sm break-all select-all hover:bg-slate-900 transition-colors cursor-pointer">{result.url}</code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
