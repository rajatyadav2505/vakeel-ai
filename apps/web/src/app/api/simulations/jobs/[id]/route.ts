import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAppUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/rate-limit';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAppUser();
    await enforceRateLimit(`simulation-job:${user.userId}`, 300);
    const params = paramsSchema.parse(await context.params);
    const supabase = createSupabaseServerClient();

    const res = await supabase
      .from('simulation_jobs')
      .select(
        'id,status,mode,objective,depth,attempts,last_error,result_simulation_id,queued_at,started_at,finished_at,updated_at'
      )
      .eq('id', params.id)
      .eq('owner_user_id', user.userId)
      .single();

    if (res.error || !res.data) {
      return NextResponse.json({ error: 'Simulation job not found.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, job: res.data });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
