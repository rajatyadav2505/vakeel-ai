'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';

export function PayoffMatrixChart(props: { matrix: number[][] }) {
  const [row1 = [0, 0], row2 = [0, 0]] = props.matrix;
  const data = [
    { branch: 'Co-Co', score: row1[0] },
    { branch: 'Co-Def', score: row1[1] },
    { branch: 'Def-Co', score: row2[0] },
    { branch: 'Def-Def', score: row2[1] },
  ];

  return (
    <Card>
      <p className="mb-2 text-sm font-semibold">Payoff matrix</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="branch" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '0.75rem',
              fontSize: 12,
            }}
          />
          <Bar dataKey="score" fill="var(--primary)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
