import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseUserClient } from '@/lib/supabase/server';
import { requireLawyerVerification } from '@nyaya/shared';
import { requireAppUser } from '@/lib/auth';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await requireAppUser();
  const supabase = createSupabaseUserClient(user.supabaseAccessToken);

  const { data: petition } = await supabase
    .from('petitions')
    .select('*')
    .eq('id', id)
    .eq('owner_user_id', user.userId)
    .single();
  if (!petition) {
    return NextResponse.json({ error: 'Petition not found' }, { status: 404 });
  }

  try {
    requireLawyerVerification(Boolean(petition.lawyer_verified));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }

  return new NextResponse(petition.body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="petition-${id}.txt"`,
    },
  });
}
