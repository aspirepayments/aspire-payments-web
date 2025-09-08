'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { apiGet } from '@/lib/api';
import { Card, SectionTitle } from '@/components/Ui';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts';

export default function MerchantDashboardPage() {
  const [range, setRange] = useState<7|30|90>(30);
  const [mode, setMode] = useState<'revenue'|'count'>('revenue');

  const { data: rev }  = useSWR<{series:{date:string, amount:number}[]}>(mode==='revenue' ? `/reports/revenue?days=${range}` : null, apiGet);
  const { data: cnt }  = useSWR<{series:{date:string, count:number}[]}>(mode==='count' ? `/reports/txnCount?days=${range}` : null, apiGet);
  const { data: aging } = useSWR<{buckets:Record<string,number>}>('/reports/aging', apiGet);

  const series = (mode==='revenue'
    ? (rev?.series ?? []).map(d => ({ ...d, y: d.amount/100 }))
    : (cnt?.series ?? []).map(d => ({ date: d.date, y: d.count })));

  const totalRevenue = ((rev?.series?.reduce((a,b)=>a+b.amount,0) ?? 0) / 100);
  const txnCount = (cnt?.series?.reduce((a,b)=>a+b.count,0) ?? 0);
  const outstanding = (((aging?.buckets['0-30']??0)+(aging?.buckets['31-60']??0)+(aging?.buckets['61-90']??0)+(aging?.buckets['90+']??0))/100);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="hint">Total Revenue ({range}d)</div>
          <div className="text-2xl font-semibold">${totalRevenue.toLocaleString(undefined,{minimumFractionDigits:2})}</div>
        </Card>
        <Card className="p-4">
          <div className="hint">Transactions ({range}d)</div>
          <div className="text-2xl font-semibold">{txnCount.toLocaleString()}</div>
        </Card>
        <Card className="p-4">
          <div className="hint">Outstanding A/R</div>
          <div className="text-2xl font-semibold">${outstanding.toLocaleString(undefined,{minimumFractionDigits:2})}</div>
        </Card>
      </div>

      {/* Revenue / Count */}
      <Card className="p-0">
        <div className="sticky-head px-4 pt-3 pb-2 border-b flex items-center justify-between">
          <SectionTitle>{mode==='revenue' ? 'Revenue' : 'Transaction Count'}</SectionTitle>
          <div className="actions">
            <select className="select control w-32" value={range} onChange={e=>setRange(Number(e.target.value) as any)}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <select className="select control w-40" value={mode} onChange={e=>setMode(e.target.value as any)}>
              <option value="revenue">Revenue</option>
              <option value="count">Transactions</option>
            </select>
          </div>
        </div>
        <div className="p-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopOpacity={0.28}/><stop offset="100%" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" /><YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="y" fill="url(#g)" strokeOpacity={1} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Aging */}
      <Card className="p-4">
        <SectionTitle>A/R Aging (open & overdue)</SectionTitle>
        <div className="h-56 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[
              { bucket: '0-30', value: (aging?.buckets['0-30']??0)/100 },
              { bucket: '31-60', value: (aging?.buckets['31-60']??0)/100 },
              { bucket: '61-90', value: (aging?.buckets['61-90']??0)/100 },
              { bucket: '90+', value: (aging?.buckets['90+']??0)/100 }
            ]} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" /><YAxis type="category" dataKey="bucket" />
              <Tooltip /><Bar dataKey="value" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
