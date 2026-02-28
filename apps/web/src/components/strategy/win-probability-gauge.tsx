'use client';

import { Pie, PieChart, Cell, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/card';
import { toOutcomeBand } from '@/lib/utils';

export function WinProbabilityGauge(props: { value: number; band?: 'low' | 'medium' | 'high' }) {
  const safe = Math.max(0, Math.min(1, props.value));
  const band =
    props.band === 'low' || props.band === 'medium' || props.band === 'high'
      ? props.band
      : toOutcomeBand(safe).toLowerCase();
  const data = [
    { name: 'win', value: safe },
    { name: 'rest', value: 1 - safe },
  ];

  return (
    <Card className="flex flex-col items-center justify-center">
      <p className="text-sm font-semibold">Outcome probability band</p>
      <div className="relative h-[140px] w-full max-w-[220px]">
        <ResponsiveContainer width="100%" height={140}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              startAngle={180}
              endAngle={0}
              cx="50%"
              cy="95%"
              innerRadius={50}
              outerRadius={70}
              paddingAngle={0}
            >
              <Cell
                fill={
                  band === 'high'
                    ? 'rgb(16 185 129)'
                    : band === 'medium'
                      ? 'rgb(234 179 8)'
                      : 'rgb(239 68 68)'
                }
              />
              <Cell fill="var(--muted)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-2xl font-bold text-primary">
          {band.toUpperCase()}
        </p>
        <p className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">
          calibration pending
        </p>
      </div>
    </Card>
  );
}
