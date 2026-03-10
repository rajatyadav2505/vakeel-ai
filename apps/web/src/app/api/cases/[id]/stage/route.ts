import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAppUser } from '@/lib/auth';
import { createSupabaseUserClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/rate-limit';

const schema = z.object({
  stage: z.enum(['intake', 'analysis', 'filing', 'hearing', 'closed']),
});
const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAppUser();
    await enforceRateLimit(`case-stage:${user.userId}`, 180);

    const params = paramsSchema.parse(await props.params);
    const payload = schema.parse(await request.json());
    const supabase = createSupabaseUserClient(user.supabaseAccessToken);

    const { data, error } = await supabase
      .from('cases')
      .update({
        stage: payload.stage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('owner_user_id', user.userId)
      .select('id, stage, updated_at')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Case not found or update failed.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, case: data });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
