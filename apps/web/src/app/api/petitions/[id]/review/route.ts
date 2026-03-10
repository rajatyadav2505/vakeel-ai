import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAppUser } from '@/lib/auth';
import { createSupabaseUserClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { sanitizePlainText } from '@/lib/utils';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const reviewSchema = z.object({
  action: z.enum(['save_revision', 'request_changes', 'approve']),
  body: z.string().min(20).max(120000).optional(),
  notes: z.string().max(2000).optional(),
  lawyerVerified: z.boolean().optional(),
});

type PetitionRow = {
  id: string;
  owner_user_id: string;
  case_id: string;
  body: string;
  current_version?: number | null;
};

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAppUser();
    await enforceRateLimit(`petition-review:${user.userId}`, 120);

    const params = paramsSchema.parse(await context.params);
    const payload = reviewSchema.parse(await request.json());
    const supabase = createSupabaseUserClient(user.supabaseAccessToken);

    const petitionRes = await supabase
      .from('petitions')
      .select('id,owner_user_id,case_id,body,current_version')
      .eq('id', params.id)
      .eq('owner_user_id', user.userId)
      .single();
    const petition = petitionRes.data as PetitionRow | null;

    if (petitionRes.error || !petition) {
      return NextResponse.json({ error: 'Petition not found.' }, { status: 404 });
    }

    const notes = payload.notes ? sanitizePlainText(payload.notes) : null;
    const nextBody = payload.body ? payload.body : petition.body;
    const currentVersion = Math.max(1, petition.current_version ?? 1);
    const nextVersion = currentVersion + 1;
    const nowIso = new Date().toISOString();

    if (payload.action === 'approve' && !payload.lawyerVerified) {
      return NextResponse.json(
        { error: 'lawyerVerified=true is required to approve a petition.' },
        { status: 400 },
      );
    }

    const reviewStatus =
      payload.action === 'approve'
        ? 'approved'
        : payload.action === 'request_changes'
          ? 'changes_requested'
          : 'draft';
    const reviewAction =
      payload.action === 'approve'
        ? 'approved'
        : payload.action === 'request_changes'
          ? 'changes_requested'
          : 'revision_saved';

    const petitionUpdate = await supabase
      .from('petitions')
      .update({
        body: nextBody,
        current_version: nextVersion,
        review_status: reviewStatus,
        review_notes: notes,
        lawyer_verified: payload.action === 'approve',
        last_reviewed_by: user.userId,
        last_reviewed_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', petition.id)
      .eq('owner_user_id', user.userId)
      .select('id,current_version,review_status,lawyer_verified,last_reviewed_at')
      .single();

    if (petitionUpdate.error || !petitionUpdate.data) {
      return NextResponse.json(
        { error: 'Failed to update petition review state. Run latest migrations and retry.' },
        { status: 500 },
      );
    }

    const versionInsert = await supabase.from('petition_versions').insert({
      petition_id: petition.id,
      owner_user_id: user.userId,
      version: nextVersion,
      body: nextBody,
      change_summary:
        notes ??
        (payload.action === 'approve'
          ? 'Approved by advocate'
          : payload.action === 'request_changes'
            ? 'Changes requested by advocate'
            : 'Manual revision saved'),
      review_action: reviewAction,
      created_by: user.userId,
    });

    if (versionInsert.error) {
      return NextResponse.json(
        { error: 'Petition updated but failed to persist version history.' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      petition: petitionUpdate.data,
      version: nextVersion,
      reviewAction,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
